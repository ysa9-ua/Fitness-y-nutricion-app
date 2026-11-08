-- FORMA · Comprobacion del catalogo de entrenamiento.
--
-- El plan semanal y el catalogo de ejercicios son la replica de los datos que
-- tenia el web app en `Workouts.tsx` y `WorkoutSession.tsx`. Este fichero
-- congela esos valores: si alguien edita el seed y una rutina cambia de titulo,
-- de dia, de duracion o de numero de ejercicios, el test falla.
--
-- Sin esto, una rutina inventada o un `exercises: 6` que pasa a ser 3 se
-- colarian sin que nadie se entere, porque el catalogo no tiene otra fuente de
-- verdad que el propio seed.

begin;

-- pgTAP hace falta para que `pg_prove` cuente las comprobaciones. Vive en el
-- esquema `extensions` porque ahi es donde se instalan las extensiones.
create extension if not exists pgtap with schema extensions;

-- El numero de comprobaciones depende de como se rellene el catalogo, asi que
-- se usa `no_plan()` en lugar de un `plan()` fijo.
select no_plan();

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

-- Compara la tabla tempora `actual` con la lista esperada `esperada` en texto.
-- Se hace asi porque comparar fila a fila en plpgsql exigiria el mismo tipo de
-- fila en cada comprobacion.
create or replace function test_tabla(
  p_actual text,
  p_esperado text,
  p_mensaje text
)
returns void
language sql
as $$
  select test_assert(p_actual = p_esperado, p_mensaje);
$$;

do $$
declare
  v_actual text;
  v_total  integer;
  v_fases  integer;
  v_pct    smallint;
  -- Consulta de conteo, etiqueta y umbral minimo, para el bucle del historial.
  v_consulta text;
  v_etiqueta  text;
  v_minimo   integer;
begin
  -- ---------------------------------------------------------------------
  -- El catalogo de ejercicios cubre las cinco rutinas que el web app
  -- abria en `WorkoutSession.tsx`, con su musculo y su icono intactos.
  -- ---------------------------------------------------------------------
  select string_agg(id, ', ' order by id) into v_actual
  from (values
    ('press-banca'), ('press-inclinado'), ('aperturas'), ('press-military'),
    ('remo-pendlay')
  ) as e(id)
  where exists (select 1 from public.ejercicios x where x.id = e.id);

  perform test_tabla(
    v_actual,
    'aperturas, press-banca, press-inclinado, press-military, remo-pendlay',
    'los cinco ejercicios de la sesion web estan en el catalogo'
  );

  -- El mismo nombre no puede aparecer dos veces: el `id` es el slug y la
  -- tabla tiene que ver el nombre tambien.
  select count(*) into v_total
  from public.ejercicios
  where nombre ilike 'press banca%';

  perform test_assert(v_total = 1, 'no hay nombres de ejercicio duplicados');

  -- ---------------------------------------------------------------------
  -- Siete dias, uno por dia de la semana, con el `titulo_corto` del web app.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from public.planes_entrenamiento
  where fase = 1 and activo;

  perform test_assert(v_total = 7, 'hay un plan activo por cada dia de la semana');

  -- Un mismo `titulo_corto` puede repetirse (lunes y miercoles comparten
  -- "Tren superior"), pero cada dia tiene el suyo.
  select string_agg(
           coalesce(p.titulo_corto, '(null)') || '=' || p.dia_semana::text,
           ' | ' order by p.dia_semana
         )
  into v_actual
  from public.planes_entrenamiento p
  where p.fase = 1 and p.activo;

  perform test_tabla(
    v_actual,
    'Tren superior · Empuje=1'
    || ' | Descanso=2'
    || ' | Tren superior · Tirón=3'
    || ' | Descanso=4'
    || ' | Tren inferior + Core=5'
    || ' | Tren superior · Tirón=6'
    || ' | Descanso=7',
    'los siete dias llevan el titulo corto del web app'
  );

  -- ---------------------------------------------------------------------
  -- Las nueve rutinas, con su duracion, intensidad, kcal, hora y numero de
  -- ejercicios. Esta es la comprobacion que evita que el seed se desvíe.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from public.rutinas r
  join public.planes_entrenamiento p on p.id = r.plan_id
  where p.fase = 1;

  perform test_assert(v_total = 9, 'el plan tiene las nueve rutinas del web app');

  select string_agg(
           p.dia_semana::text || ':' || r.titulo
           || '/' || r.duracion_min || 'min'
           || '/' || r.intensidad::text
           || '/' || r.kcal_estimadas || 'kcal'
           || '/' || n.num::text || 'ej'
           || (case when r.es_descanso then '/descanso' else '' end),
           ' | ' order by p.dia_semana, r.orden
         )
  into v_actual
  from public.rutinas r
  join public.planes_entrenamiento p on p.id = r.plan_id
  join lateral (
    select count(*)::int as num from public.rutina_ejercicios re
    where re.rutina_id = r.id
  ) n on true
  where p.fase = 1;

  perform test_tabla(
    v_actual,
    '1:Empuje de fuerza/52min/alta/470kcal/6ej'
    || ' | 2:Movilidad y circulación/20min/baja/85kcal/5ej/descanso'
    || ' | 3:Tirón y espalda/55min/alta/520kcal/7ej'
    || ' | 4:Descanso y movilidad/15min/baja/60kcal/4ej/descanso'
    || ' | 5:Tren inferior · Empuje/54min/alta/500kcal/6ej'
    || ' | 5:Core y estabilidad/18min/baja/110kcal/8ej'
    || ' | 5:Recuperación de la tarde/20min/baja/75kcal/5ej/descanso'
    || ' | 6:Tirón de fuerza/50min/media/430kcal/6ej'
    || ' | 7:Caminata suave/25min/baja/140kcal/1ej/descanso',
    'las nueve rutinas conservan duracion, intensidad, kcal y ejercicios del web app'
  );

  -- ---------------------------------------------------------------------
  -- La semana que devuelve la vista trae el dia de cada rutina.
  --
  -- `Workouts.tsx` agrupa por dia en un `DayPlan`, asi que sin `dia_semana` en
  -- la vista habria que pedir los planes aparte y unir en el cliente.
  -- ---------------------------------------------------------------------
  select count(distinct dia_semana) into v_total
  from public.v_rutinas_completas;

  perform test_assert(v_total = 7, 'la vista expone el dia de las siete jornadas');

  -- ---------------------------------------------------------------------
  -- La fase 2 existe pero no compite con la fase 1.
  --
  -- El indice unico es parcial (`where activo`), asi que puede haber varias
  -- fases del mismo dia siempre que solo una este activa.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from public.planes_entrenamiento
  where fase = 2;

  perform test_assert(v_total > 0, 'existe una fase 2 para por lo menos un dia');

  select count(*) into v_total
  from public.planes_entrenamiento
  where fase > 1 and activo;

  perform test_assert(v_total = 0, 'ninguna fase posterior a la 1 queda activa a la vez');

  -- ---------------------------------------------------------------------
  -- Ninguna rutina prescribe un ejercicio que no este en el catalogo.
  --
  -- `rutina_ejercicios.ejercicio_id` no tiene clave foranea a proposito, para
  -- que el cliente pueda guardar ejercicios que aun no estan en el catalogo.
  -- En el seed, en cambio, todos deben existir.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from public.rutina_ejercicios re
  where not exists (select 1 from public.ejercicios e where e.id = re.ejercicio_id);

  perform test_assert(v_total = 0, 'ninguna rutina prescribe un ejercicio inexistente');

  -- Lo mismo con los alimentos que usa el diario de demostracion.
  select count(*) into v_total
  from public.diario_alimentos da
  where da.alimento_id is not null
    and not exists (select 1 from public.alimentos a where a.id = da.alimento_id);

  perform test_assert(v_total = 0, 'ninguna linea del diario apunta a un alimento inexistente');

  -- ---------------------------------------------------------------------
  -- El perfil de demostracion se creo entero y es coherente.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from auth.users u
  join public.perfiles p on p.auth_id = u.id
  where u.email = 'demo@forma.test';

  perform test_assert(v_total = 1, 'el seed de demostracion deja un usuario con perfil');

  -- `crear_perfil_al_registrarse()` es un trigger sobre `auth.users`: si el
  -- perfil no existiera, la fila de arriba seria cero y el test caeria antes.
  --
  -- La biometria viene del onboarding, no de valores inventados en el seed.
  select string_agg(
           p.nombre_usuario || '/' || p.sexo || '/' || p.edad || 'a'
           || '/' || p.altura_cm || 'cm/' || p.peso_kg || 'kg'
           || '/' || p.disponibilidad || '/' || p.objetivo
           || '/' || p.calorias_objetivo || 'kcal',
           ' | '
         )
  into v_actual
  from public.perfiles p
  where p.auth_id = '11111111-1111-4111-8111-111111111111'::uuid;

  perform test_tabla(
    v_actual,
    'lucia/femenino/29a/168cm/63.20kg/4 días/recomposition/1960kcal',
    'el perfil de demostracion tiene la biometria del onboarding y sus 1960 kcal'
  );

  -- La disponibilidad es un enum de texto ("4 días") y `dias_semana` la columna
  -- generada que el cliente lee con `parseInt`.
  perform test_assert(
    (select dias_semana from public.perfiles
      where auth_id = '11111111-1111-4111-8111-111111111111'::uuid) = 4,
    'dias_semana se deriva de la disponibilidad sin tocarlo a mano'
  );

  -- ---------------------------------------------------------------------
  -- La sesion a medias tiene el detalle que la pantalla necesita.
  --
  -- El seed inserta las sesiones cerradas solo con sus totales, que es lo que
  -- leen las graficas. La de hoy es la exception: el cliente la recupera al
  -- entrar y sin ejercicios ni series, `WorkoutSession.tsx` abriria en blanco.
  -- ---------------------------------------------------------------------
  select count(*) into v_total
  from public.sesiones_entrenamiento
  where usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and estado = 'en_curso';

  perform test_assert(v_total = 1, 'hay exactamente una sesion a medias que recuperar');

  -- El indice `sesiones_en_curso_idx` es unico por usuario con estado
  -- `en_curso`, asi que el `= 1` de arriba ya lo garantiza. Lo que no lo
  -- garantiza es que la sesion tenga ejercicios.
  select count(*) into v_total
  from public.sesiones_ejercicios e
  join public.sesiones_entrenamiento s on s.id = e.sesion_id
  where s.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and s.estado = 'en_curso';

  perform test_assert(v_total = 6, 'la sesion a medias trae los seis ejercicios del lunes');

  -- Una serie por cada serie planificada, ni una mas ni una menos: es la misma
  -- regla que aplica `iniciar_sesion`.
  select case
    when count(*) = 0 then 0
    else sum((select count(*)::int
                from public.sesiones_series s
                where s.sesion_ejercicio_id = e.id) - e.series_planificadas)
  end
  into v_total
  from public.sesiones_ejercicios e
  join public.sesiones_entrenamiento s on s.id = e.sesion_id
  where s.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and s.estado = 'en_curso';

  perform test_assert(v_total = 0, 'cada ejercicio tiene exactamente sus series planificadas');

  -- Alguien tiene que haber marcado algo, o la sesion a medias no esta a medias.
  select count(*) into v_total
  from public.sesiones_series s
  join public.sesiones_ejercicios e on e.id = s.sesion_ejercicio_id
  join public.sesiones_entrenamiento t on t.id = e.sesion_id
  where t.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and t.estado = 'en_curso'
    and s.completada;

  perform test_assert(v_total > 0, 'la sesion a medias tiene series ya completadas');

  -- La rutina del dia refleja ese avance. `iniciar_sesion` no escribe en
  -- `registro_rutinas_diarias` (solo lo hace `finalizar_sesion`), asi que sin la
  -- fila del seed la rejilla de la semana marcaria 0 %.
  select rr.porcentaje_completado into v_pct
  from public.registro_rutinas_diarias rr
  join public.sesiones_entrenamiento s
    on s.rutina_id = rr.rutina_id
   and s.estado = 'en_curso'::public.estado_sesion
  where rr.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and rr.fecha = current_date;

  perform test_assert(
    v_pct > 0 and v_pct < 100,
    'la rutina de hoy muestra el avance parcial de la sesion a medias'
  );

  -- ---------------------------------------------------------------------
  -- El diario y el progreso tienen historia para las graficas.
  --
  -- Se comprueba que cada tabla del historial tenga filas, porque una tabla
  -- vacia no da error en la API: la pantalla se dibuja y sale en blanco.
  --
  -- Cada tabla lleva su propio filtro de propietario. Casi todas tienen
  -- `usuario_id`, pero `diario_alimentos` cuelga de `diario_comidas`, asi que
  -- tiene que bajar por ahi: por eso la consulta viene en el `values` en vez de
  -- armarse con `format`.
  -- ---------------------------------------------------------------------
  for v_consulta, v_etiqueta, v_minimo in
    select *
    from (values
      -- Casi todas las tablas cuelgan de `usuario_id` directamente.
      ('mediciones_progreso', 'mediciones_progreso', 12),
      ('check_ins', 'check_ins', 8),
      ('diario_comidas', 'diario_comidas', 30),
      ('sesiones_entrenamiento', 'sesiones_entrenamiento', 20),
      ('registro_agua', 'registro_agua', 10),
      ('escaneos_ocr', 'escaneos_ocr', 1),
      ('registro_rutinas_diarias', 'registro_rutinas_diarias', 20)
    ) as t(v_consulta, v_etiqueta, v_minimo)
  loop
    execute format(
      'select count(*)::int from public.%I where usuario_id = $1',
      v_consulta
    )
    into v_total
    using '11111111-1111-4111-8111-111111111111'::uuid;

    perform test_assert(
      v_total >= v_minimo,
      format('el historial de %s tiene al menos %s filas', v_etiqueta, v_minimo)
    );
  end loop;

  -- `diario_alimentos` es la unica que no tiene `usuario_id`: cuelga de la
  -- comida, asi que el filtro del propietario tiene que bajar por `comida_id`.
  -- Fuera del bucle por eso, no por descuido.
  select count(*) into v_total
  from public.diario_alimentos da
  join public.diario_comidas dc on dc.id = da.comida_id
  where dc.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid;

  perform test_assert(
    v_total >= 30,
    format('el historial de diario_alimentos tiene al menos %s filas', 30)
  );
end;
$$;

-- Los bloques `do` dejaron el rol cambiado a `authenticated`, que no puede
-- leer la tabla temporal. Se vuelve al rol propietario antes de imprimir.
reset role;
select * from test_tap_salida();

rollback;
