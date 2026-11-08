-- FORMA · Comprobacion del pipeline de sesiones y de los agregados.
--
-- Cubre el recorrido completo de una sesion: `iniciar_sesion` abre la fila y
-- vuelca la prescripcion de la rutina a ejercicios y series, el cliente marca
-- las series como completadas, y `finalizar_sesion` sella los totales que
-- despues leen `semana_entrenamiento` y `progreso_fuerza`. Tambien comprueba
-- `anadir_alimento`, que es el camino que usa el cliente para el diario.
--
-- Nota sobre los nombres: `ejercicios.id` es `text` (el slug) y
-- `sesiones_series` usa `sesion_ejercicio_id`, `numero_serie`, `kg` y
-- `completada`. Los tests se ajustan a esa nomenclatura.

begin;

-- pgTAP hace falta para que `pg_prove` cuente las comprobaciones. Vive en el
-- esquema `extensions` porque ahi es donde se instalan las extensiones.
create extension if not exists pgtap with schema extensions;

-- El numero de comprobaciones depende de como se rellene el catalogo, asi que
-- se usa `no_plan()` en lugar de un `plan()` fijo.
select no_plan();

create or replace function test_crear_usuario(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into auth.users (
    instance_id, id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    p_email,
    extensions.crypt('forma2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- `ok()` de pgTAP: cada comprobacion cuenta como un test, y un `false` aborta
-- el fichero con el motivo. `no_plan()` evita tener que contar de antemano las
-- comprobaciones de un bloque que depende del estado.
-- pgTAP devuelve la linea TAP como valor de retorno. Aqui las comprobaciones
-- viven dentro de bloques `do`, donde el valor se pierde, asi que se guarda
-- cada linea en una tabla temporal y `test_tap_salida` la imprime al final.
-- Un `false` aborta el fichero con el motivo, en vez de acumular el fallo.
create temporary table _tap (
  n serial primary key,
  linea text not null
) on commit drop;

-- `SECURITY DEFINER` porque los bloques `do` corren con `set local role
-- authenticated`, que no tiene permiso sobre la tabla temporal.
create or replace function test_assert(p_condicion boolean, p_mensaje text)
returns void
language plpgsql
security definer
as $$
begin
  -- `pg_temp.` es explicito porque el nombre temporal depende de la sesion.
  -- El `search_path` se deja por defecto a proposito: pgTAP se llama a si
  -- misma con nombres sin calificar (`_todo`, `_get`) y un `search_path` vacio
  -- las haria irresolubles.
  insert into pg_temp._tap (linea)
  values (extensions.ok(coalesce(p_condicion, false), p_mensaje));

  if p_condicion is not true then
    raise exception 'FALLO: %', p_mensaje;
  end if;
end;
$$;

-- El plan TAP va al final del fichero, despues de todos los `ok`, y la
-- numeracion sale de `_tap` en vez de la de pgTAP.
--
-- Motivo: `pg_prove` ejecuta los tres ficheros en la misma sesion de psql, y el
-- contador de pgTAP vive en tablas temporales que sobreviven entre ficheros. Si
-- se usara el suyo, el segundo fichero empezaria en 32 y `pg_prove` lo
-- detectaria como "tests out of sequence". Renumerando aqui, cada fichero
-- empieza en 1.
create or replace function test_tap_salida()
returns setof text
language plpgsql
as $$
declare
  v_total integer;
begin
  select count(*) into v_total from pg_temp._tap;

  -- pgTAP devuelve lineas `ok N - descripcion`, y sus comentarios de diagnostico
  -- empiezan por `# `. Se reescribe solo el numero de la primera linea, que es
  -- el que `pg_prove` lee como secuencia.
  return query
    select regexp_replace(
      replace(linea, chr(10), ' ' || chr(10)),
      '^ok [0-9]+',
      'ok ' || n
    )
    from pg_temp._tap
    order by n;

  return next '1..' || v_total;
end;
$$;

create or replace function test_como(p_usuario uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
  execute 'set local role authenticated';
end;
$$;

do $$
declare
  v_usuario  uuid;
  v_rutina   uuid;
  v_sesion   public.sesiones_entrenamiento;
  v_totales integer;
  v_volumen  numeric;
  v_agregado jsonb;
  v_linea    public.diario_alimentos;
  v_comida   uuid;
  v_alimento uuid;
  v_dias     jsonb;
  v_hoy      jsonb;
  v_rutina_hoy jsonb;
  v_completadas integer;
  v_bloqueado   boolean;
  v_macros record;
begin
  v_usuario := test_crear_usuario('marco@forma.test');
  perform test_como(v_usuario);

  -- ---------------------------------------------------------------------
  -- El catalogo de rutinas llega al cliente con sus ejercicios.
  -- ---------------------------------------------------------------------
  select r.id into v_rutina
  from public.rutinas r
  where r.titulo = 'Empuje de fuerza'
  limit 1;

  perform test_assert(v_rutina is not null, 'el seed deja la rutina de empuje disponible');

  select count(*) into v_totales
  from public.rutina_ejercicios re
  where re.rutina_id = v_rutina;
  perform test_assert(v_totales = 6, 'la rutina de empuje trae los seis ejercicios prescritos');

  -- ---------------------------------------------------------------------
  -- `iniciar_sesion` crea la sesion ya poblada.
  -- ---------------------------------------------------------------------
  v_sesion := public.iniciar_sesion(v_rutina);
  perform test_assert(v_sesion.id is not null, 'iniciar_sesion devuelve la sesion creada');
  perform test_assert(v_sesion.estado = 'en_curso', 'la sesion nace en curso');
  perform test_assert(v_sesion.rutina_id = v_rutina, 'la sesion queda enlazada a su rutina');

  select count(*) into v_totales
  from public.sesiones_ejercicios e
  where e.sesion_id = v_sesion.id;
  perform test_assert(v_totales = 6, 'la sesion copia los seis ejercicios de la rutina');

  -- 4 series de press banca + 3 de press inclinado + 3 de aperturas
  -- + 3 de fondos + 3 de remo + 3 de press militar = 19.
  select count(*) into v_totales
  from public.sesiones_series s
  join public.sesiones_ejercicios e on e.id = s.sesion_ejercicio_id
  where e.sesion_id = v_sesion.id;
  perform test_assert(v_totales = 19, 'las series se precrean, una por posicion planificada');

  -- Una segunda sesion abierta a la vez no puede existir: hay indice unico
  -- parcial sobre `estado = 'en_curso'`. La comprobacion va fuera del bloque
  -- `exception` por el mismo motivo que en rls.test.sql: dentro se perderia.
  v_bloqueado := false;
  begin
    perform public.iniciar_sesion(v_rutina);
  exception
    when unique_violation then
      v_bloqueado := true;
  end;
  perform test_assert(v_bloqueado, 'no se puede abrir una segunda sesion en curso');

  -- ---------------------------------------------------------------------
  -- El cliente marca series como completadas, ajustando carga y reps.
  -- ---------------------------------------------------------------------
  update public.sesiones_series s
  set kg = v.kilo, reps = v.reps, completada = true
  from (
    select e.id, v.n, v.kilo, v.reps
    from public.sesiones_ejercicios e
    -- (numero de serie, kg, reps). Las cuatro series del press banca suben de
    -- 45 a 47,5 kg en la tercera, que es lo que supera el record de 47,5.
    cross join (values
      (1::smallint, 45.0::numeric, 8::smallint),
      (2, 45.0, 8),
      (3, 47.5, 7),
      (4, 47.5, 6)
    ) as v(n, kilo, reps)
    where e.sesion_id = v_sesion.id and e.ejercicio_id = 'press-banca'
  ) v
  where s.sesion_ejercicio_id = v.id and s.numero_serie = v.n;

  -- El trigger `sellar_serie` estampa la hora al completar y la borra al
  -- descompletar.
  perform test_assert(
    (select count(*) from public.sesiones_series s
     join public.sesiones_ejercicios e on e.id = s.sesion_ejercicio_id
     where e.sesion_id = v_sesion.id and s.completada and s.completada_at is null) = 0,
    'el trigger sella la hora de las series completadas'
  );

  -- ---------------------------------------------------------------------
  -- `finalizar_sesion` agrega sobre toda la sesion, no sobre lo ultimo tocado.
  -- ---------------------------------------------------------------------
  v_sesion := public.finalizar_sesion(v_sesion.id, 3120);
  perform test_assert(v_sesion.estado = 'completada', 'la sesion queda completada');
  perform test_assert(v_sesion.duracion_seg = 3120, 'la duracion se guarda');
  perform test_assert(v_sesion.series_totales = 19,
    'las series totales abarcan la sesion entera');
  perform test_assert(v_sesion.series_completadas = 4,
    'solo cuentan las series marcadas como completadas');
  perform test_assert(v_sesion.volumen_total_kg = 45*8 + 45*8 + 47.5*7 + 47.5*6,
    'el volumen solo suma las series completadas');
  -- 3120 s / 60 * 7,4 = 384,8 kcal -> 385.
  perform test_assert(v_sesion.kcal_estimadas = 385,
    'las kcal se estiman a 7,4 kcal por minuto');

  -- La rutina del dia queda reflejada en el registro diario.
  select count(*) into v_totales
  from public.registro_rutinas_diarias rr
  where rr.usuario_id = v_usuario
    and rr.rutina_id = v_rutina
    and rr.fecha = current_date;
  perform test_assert(v_totales = 1, 'finalizar deja constancia en el registro diario');
  perform test_assert(v_sesion.rutina_id is not distinct from v_rutina,
    'la sesion conserva el enlace a la rutina');

  -- ---------------------------------------------------------------------
  -- Los agregados de la semana reflejan la sesion.
  -- ---------------------------------------------------------------------
  v_agregado := public.semana_entrenamiento(current_date);
  v_dias := v_agregado -> 'dias';
  perform test_assert(jsonb_array_length(v_dias) = 7,
    'semana_entrenamiento devuelve los siete dias');

  -- El dia de hoy es el que coincide con `es_hoy`.
  select d into v_hoy
  from jsonb_array_elements(v_dias) d
  where (d ->> 'es_hoy')::boolean;

  perform test_assert(v_hoy is not null, 'la rejilla marca el dia de hoy');
  perform test_assert(v_hoy ->> 'dia_semana' = extract(isodow from current_date)::int::text,
    'el dia marcado coincide con el isodow de hoy');

  v_rutina_hoy := v_hoy -> 'rutinas';
  perform test_assert(jsonb_array_length(v_rutina_hoy) > 0,
    'el dia de hoy trae sus rutinas');

  select count(*) into v_completadas
  from jsonb_array_elements(v_rutina_hoy) r
  where r ->> 'estado' = 'completada';
  perform test_assert(v_completadas = 0,
    'una sesion parcial no marca la rutina como completada');

  -- Sin sesion en curso, el agregado no debe colgar una sesion ajena.
  perform test_assert(v_agregado -> 'sesion_en_curso' = 'null'::jsonb,
    'al terminar no queda ninguna sesion en curso');

  -- ---------------------------------------------------------------------
  -- `progreso_fuerza` agrega el volumen de las sesiones completadas.
  -- ---------------------------------------------------------------------
  v_agregado := public.progreso_fuerza(current_date - 30, current_date);
  perform test_assert((v_agregado ->> 'sesiones')::int = 1,
    'progreso_fuerza cuenta la sesion completada');
  perform test_assert((v_agregado ->> 'volumen_kg')::numeric > 0,
    'progreso_fuerza suma el volumen');
  -- Sin periodo anterior con el que comparar, la variacion es nula y no 0.
  perform test_assert(v_agregado -> 'variacion_pct' = 'null'::jsonb,
    'sin periodo anterior la variacion es nula, no cero');

  -- ---------------------------------------------------------------------
  -- `anadir_alimento`: el camino que usa el cliente para el diario.
  -- ---------------------------------------------------------------------
  -- El nombre es el que usa `OCR_NAME` en FoodDetail.tsx, que es la fila que el
  -- cliente busca cuando el escaner propone un alimento.
  select id into v_alimento from public.alimentos where nombre = 'Pechuga de pollo a la plancha';
  perform test_assert(v_alimento is not null,
    'el catalogo tiene el alimento que propone el escaner');

  insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo)
  values (v_usuario, current_date, 'lunch', 'Comida del dia')
  returning id into v_comida;

  v_linea := public.anadir_alimento(v_comida, v_alimento, 200);

  -- 165 kcal/100 g -> 330 kcal en 200 g; 31 g de proteina -> 62 g.
  perform test_assert(v_linea.kcal = 330, 'anadir_alimento escala las kcal por los gramos');
  perform test_assert(v_linea.proteinas_g = 62, 'anadir_alimento escala las proteinas');
  -- El orden arranca en 0: la comida vacia no tiene ninguna linea y el indice
  -- unico es (comida_id, orden).
  perform test_assert(v_linea.orden = 0, 'la primera linea entra con orden 0');

  perform test_assert(
    (select kcal from public.diario_comidas where id = v_comida) = 330,
    'el trigger totaliza la comida despues de anadir el alimento'
  );

  -- Reenviar el mismo tipo de comida no crea un segundo registro: hay indice
  -- unico sobre (usuario_id, fecha, tipo_comida).
  v_bloqueado := false;
  begin
    insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo)
    values (v_usuario, current_date, 'lunch', 'Duplicada');
  exception
    when unique_violation then
      v_bloqueado := true;
  end;
  perform test_assert(v_bloqueado, 'no se puede repetir el tipo de comida del mismo dia');

  -- `resumen_nutricion` cuadra con lo escrito.
  v_agregado := public.resumen_nutricion(current_date);
  perform test_assert((v_agregado ->> 'kcal')::int = 330,
    'resumen_nutricion suma las comidas del dia');
  perform test_assert((v_agregado ->> 'comidas_totales')::int = 1,
    'resumen_nutricion cuenta las comidas del dia');
  perform test_assert((v_agregado ->> 'agua_ml')::int = 0,
    'sin registrar agua el resumen da cero');

  -- Los objetivos de macros salen del objetivo de kcal del perfil, no de una
  -- cifra fija: el perfil por defecto son 2.320 kcal.
  perform test_assert((v_agregado ->> 'proteinas_objetivo_g')::int > 0,
    'el resumen trae el objetivo de proteinas');
  perform test_assert(
    (v_agregado ->> 'proteinas_objetivo_g')::int
      + (v_agregado ->> 'carbohidratos_objetivo_g')::int
      + (v_agregado ->> 'grasas_objetivo_g')::int > 0,
    'el resumen trae los tres objetivos de macro');

  -- ---------------------------------------------------------------------
  -- `objetivos_macros` reparte las kcal del objetivo.
  --
  -- Con 2.000 kcal: 30 % / 4 = 150 g de proteina, 40 % / 4 = 200 g de
  -- carbohidratos, 30 % / 9 = 67 g de grasa.
  -- ---------------------------------------------------------------------
  select * into v_macros from public.objetivos_macros(2000);
  perform test_assert(v_macros.proteinas_g = 150,
    'el 30 % de las kcal dividedas entre 4 son los gramos de proteina');
  perform test_assert(v_macros.carbohidratos_g = 200,
    'el 40 % de las kcal dividedas entre 4 son los gramos de carbohidratos');
  perform test_assert(v_macros.grasas_g = 67,
    'el 30 % de las kcal divididas entre 9 son los gramos de grasa');

  -- Un objetivo bajo el minimo se sube al suelo en vez de dar negativo.
  select * into v_macros from public.objetivos_macros(0);
  perform test_assert(
    v_macros.proteinas_g > 0 and v_macros.carbohidratos_g > 0
      and v_macros.grasas_g > 0,
    'un objetivo de kcal ridiculo no produce macros negativos');

  -- ---------------------------------------------------------------------
  -- `racha_nutricion` cuenta dias con comida completada.
  -- ---------------------------------------------------------------------
  update public.diario_comidas set completada = true where id = v_comida;

  perform test_assert(public.racha_nutricion() = 1,
    'una comida completada hoy da una racha de 1');

  -- La comida de ayer continua la racha.
  insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo, completada)
  values (v_usuario, current_date - 1, 'lunch', 'Ayer', true);

  perform test_assert(public.racha_nutricion() = 2,
    'registrar ayer y hoy une los dos dias en una sola racha');

  -- Un hueco de tres dias parte la racha.
  insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo, completada)
  values (v_usuario, current_date - 5, 'lunch', 'Hace cinco dias', true);

  perform test_assert(public.racha_nutricion() = 2,
    'un hueco parte la racha y solo cuenta la reciente');

  -- Adherencia: 3 o mas comidas al dia cuenta como dia cumplido.
  perform test_assert(public.adherencia_nutricion(current_date, current_date) = 0,
    'un dia con una sola comida no cumple la adherencia');

  insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo, completada)
  values (v_usuario, current_date, 'breakfast', 'Desayuno', true),
         (v_usuario, current_date, 'dinner',   'Cena',     true);

  perform test_assert(public.adherencia_nutricion(current_date, current_date) = 100,
    'un dia con tres comidas cumple la adherencia');

  -- ---------------------------------------------------------------------
  -- `serie_peso` devuelve la serie del grafico de progreso.
  -- ---------------------------------------------------------------------
  perform test_assert(jsonb_typeof(public.serie_peso('3M')) = 'array',
    'serie_peso devuelve una lista aunque este vacia');
  perform test_assert(jsonb_array_length(public.serie_peso('3M')) = 0,
    'sin mediciones, la serie viene vacia');

  -- 3M son 91 dias, asi que el punto de hace 100 queda fuera y el de hace 60
  -- entra. 6M son 183 dias, que si alcanzan los cuatro.
  insert into public.mediciones_progreso (usuario_id, fecha, peso_kg)
  values (v_usuario, current_date - 100, 65.0),
         (v_usuario, current_date - 60,  64.0),
         (v_usuario, current_date - 30,  63.4),
         (v_usuario, current_date,       63.2);

  v_agregado := public.serie_peso('3M');
  perform test_assert(jsonb_array_length(v_agregado) = 3,
    'el rango de 3 meses excluye lo que es mas antiguo de 91 dias');
  -- `peso_kg` es `numeric(5,2)`, asi que sale como `64.00`. El cliente lo
  -- parsea como numero sin problema; aqui se compara en numerico.
  perform test_assert((v_agregado -> 0 ->> 'peso_kg')::numeric = 64.0,
    'la serie viene ordenada de mas antigua a mas reciente');
  perform test_assert((v_agregado -> 2 ->> 'peso_kg')::numeric = 63.2,
    'el ultimo punto de la serie es el mas reciente');

  perform test_assert(jsonb_array_length(public.serie_peso('6M')) = 4,
    'el rango de 6 meses alcanza todo el historial');
  -- El filtro es `fecha > current_date - v_dias`, estricto: el punto que cae
  -- justo en el limite queda fuera, asi que de 30 dias solo entra el de hoy.
  perform test_assert(jsonb_array_length(public.serie_peso('1M')) = 1,
    'el rango de 1 mes excluye el punto que cae justo en el limite');
  -- Un rango desconocido cae al de 3 meses, que es el que espera el cliente.
  perform test_assert(jsonb_array_length(public.serie_peso('inventado')) = 3,
    'un rango desconocido usa la ventana de 3 meses');
end;
$$;

-- Imprime las lineas TAP acumuladas y el plan. Va antes del `rollback` porque
-- `_tap` es `on commit drop`.
-- Los bloques `do` dejaron el rol cambiado a `authenticated`, que no puede
-- leer la tabla temporal. Se vuelve al rol propietario antes de imprimir.
reset role;
select * from test_tap_salida();

rollback;