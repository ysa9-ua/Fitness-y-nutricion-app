-- FORMA · Comprobacion de las funciones de calculo y del pipeline de check-in.
--
-- Detalle importante: `pg_prove` conecta como `postgres`, que es superusuario y
-- por tanto se salta el RLS y ve `auth.uid()` como NULL. La parte del test que
-- necesita actuar como un usuario concreto se ejecuta con `set local role
-- authenticated`.

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

-- Casting explicito a los tipos de las funciones. Los literales enteros que
-- salen de `values` o de una division se resuelven como `integer`, y la funcion
-- espera `numeric` y `smallint`, asi que la llamada no casaria.
create or replace function test_kcal(
  p_peso numeric, p_altura numeric, p_edad numeric,
  p_sexo public.sexo, p_dias smallint, p_objetivo public.objetivo
)
returns smallint
language sql
immutable
as $$
  select public.calorias_objetivo(p_peso, p_altura, p_edad, p_sexo, p_dias, p_objetivo);
$$;

create or replace function test_grasa(
  p_peso numeric, p_altura numeric, p_edad numeric,
  p_sexo public.sexo, p_cintura numeric
)
returns numeric
language sql
immutable
as $$
  select public.estimar_grasa_corporal(p_peso, p_altura, p_edad, p_sexo, p_cintura);
$$;

-- ---------------------------------------------------------------------------
-- Las formulas puras se pueden comprobar sin sesion.
--
-- Los valores esperados salen de Onboarding.tsx: son los mismos numeros que
-- produce el codigo del cliente, para que servidor y web no se separen.
-- ---------------------------------------------------------------------------
do $$
declare
  v integer;
  v_num numeric;
begin
  -- Mifflin-St Jeor: 10*63,2 + 6,25*168 - 5*29 + (-161) = 1376 kcal basales.
  v_num := public.tasa_metabolica_basal(63.2, 168, 29, 'femenino');
  perform test_assert(abs(v_num - 1376) < 0.01, 'la tasa metabolica basal reproduce el valor del web app');

  -- Los literales se castean en la llamada: Postgres no resuelve `integer` a
-- `numeric` ni `integer` a `smallint` al buscar la funcion.
--
-- Con 4 dias y objetivo hipertrofia: (1376 * 1,5 + 300) / 10 = 2364 -> 2360.
  v := test_kcal(63.2::numeric, 168::numeric, 29::numeric,
                 'femenino'::public.sexo, 4::smallint, 'hypertrophy'::public.objetivo);
  perform test_assert(v = 2360, 'las calorias objetivo redondean a decenas como el cliente');

  -- Objetivo perdida de peso: (1376 * 1,5 - 400) / 10 = 1664 -> 1660.
  v := test_kcal(63.2::numeric, 168::numeric, 29::numeric,
                 'femenino'::public.sexo, 4::smallint, 'fat-loss'::public.objetivo);
  perform test_assert(v = 1660, 'la perdida de peso baja 400 kcal sobre el gasto');

  -- Con 3 dias y objetivo salud general: (1376 * 1,4 + 0) / 10 = 1926 -> 1930.
  v := test_kcal(63.2::numeric, 168::numeric, 29::numeric,
                 'femenino'::public.sexo, 3::smallint, 'health'::public.objetivo);
  perform test_assert(v = 1930, 'con 3 dias el factor de actividad es 1.4');

  -- El suelo de 1200 se comprueba con un perfil que de verdad lo alcance:
  -- 10*38 + 6,25*150 - 5*60 - 161 = 469 * 1,4 - 400 = 257 -> 1200.
  v := test_kcal(38::numeric, 150::numeric, 60::numeric,
                 'femenino'::public.sexo, 3::smallint, 'fat-loss'::public.objetivo);
  perform test_assert(v = 1200, 'el suelo de 1200 kcal se respeta en perdida de peso');

  -- Masculino: 10*80 + 6,25*180 - 5*30 + 5 = 1780.
  v_num := public.tasa_metabolica_basal(80::numeric, 180::numeric, 30::numeric,
                                        'masculino'::public.sexo);
  perform test_assert(abs(v_num - 1780) < 0.01, 'el offset masculino es +5');

  -- Factores de actividad por dias.
  perform test_assert(public.factor_actividad(3::smallint) = 1.4,  'con 3 dias el factor es 1.4');
  perform test_assert(public.factor_actividad(4::smallint) = 1.5,  'con 4 dias el factor es 1.5');
  perform test_assert(public.factor_actividad(5::smallint) = 1.65, 'con 5 dias el factor es 1.65');
  perform test_assert(public.factor_actividad(6::smallint) = 1.75, 'con 6+ dias el factor es 1.75');

  -- Ajustes por objetivo.
  perform test_assert(public.ajuste_por_objetivo('hypertrophy'::public.objetivo) = 300,    'hipertrofia suma 300');
  perform test_assert(public.ajuste_por_objetivo('fat-loss'::public.objetivo) = -400,      'perdida de peso resta 400');
  perform test_assert(public.ajuste_por_objetivo('recomposition'::public.objetivo) = -100, 'recomposicion resta 100');
  perform test_assert(public.ajuste_por_objetivo('health'::public.objetivo) = 0,           'salud general no ajusta');

  -- Grasa corporal: el valor cae dentro del rango util y respeta los limites.
  v_num := test_grasa(63.2::numeric, 168::numeric, 29::numeric,
                      'femenino'::public.sexo, 70::numeric);
  perform test_assert(v_num between 8 and 48, 'la grasa estimada cae en el rango 8-48');

  -- Un IMC absurdo no puede devolver menos del suelo. Con 40 kg, 220 cm y 20
  -- años laformula se va por debajo de 8 y tiene que recortarse.
  v_num := test_grasa(40::numeric, 220::numeric, 20::numeric,
                      'femenino'::public.sexo, 60::numeric);
  perform test_assert(v_num = 8, 'un IMC muy bajo se recorta al minimo de 8');

  v_num := test_grasa(250::numeric, 140::numeric, 16::numeric,
                      'masculino'::public.sexo, 180::numeric);
  perform test_assert(v_num = 48, 'un IMC muy alto se recorta al maximo de 48');

  -- Sin cintura medida el termino se anula en lugar de fallar.
  v_num := test_grasa(63.2::numeric, 168::numeric, 29::numeric,
                      'femenino'::public.sexo, null::numeric);
  perform test_assert(v_num is not null, 'se puede estimar la grasa sin medir la cintura');
end;
$$;

-- ---------------------------------------------------------------------------
-- El pipeline completo, ya como usuario autenticado.
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_perfil  public.perfiles;
  v_checkin public.check_ins;
  v_antes   numeric;
  v_despues numeric;
  v_dias    smallint;
  v_hecho   boolean;
begin
  v_usuario := test_crear_usuario('lucia@forma.test');

  -- El perfil nace con los valores por defecto del cliente Flutter.
  select * into v_perfil from public.perfiles where auth_id = v_usuario;
  perform test_assert(v_perfil.altura_cm = 168, 'el perfil hereda la altura por defecto');
  perform test_assert(v_perfil.objetivo = 'hypertrophy', 'el perfil hereda el objetivo por defecto');
  perform test_assert(v_perfil.dias_semana = 4, 'dias_semana se deriva de la disponibilidad');

  -- Rellenar la biometria del onboarding.
  update public.perfiles
  set sexo = 'femenino',
      edad = 29,
      altura_cm = 168,
      peso_kg = 63.2,
      peso_inicial_kg = 64,
      cintura_cm = 70.8,
      cuello_cm = 30.5,
      cadera_cm = 90,
      nivel_experiencia = 'intermediate',
      deporte_principal = 'strength',
      disponibilidad = '4 días',
      objetivo = 'recomposition'
  where auth_id = v_usuario;

  perform test_como(v_usuario);

  -- Recomposicion sobre 1376 * 1,5 - 100 = 1964 -> 1960 kcal.
  v_perfil := public.recalcular_perfil();
  perform test_assert(v_perfil.calorias_objetivo = 1960,
    'el recalculo aplica el objetivo de recomposicion (1960 kcal)');
  perform test_assert(v_perfil.grasa_corporal_pct between 8 and 48,
    'el recalculo estima la grasa corporal');

  select count(*) into v_dias from public.algoritmo_recalculos where usuario_id = v_usuario;
  perform test_assert(v_dias = 1, 'el recalculo queda registrado en el historial');

  -- El check-in semanal escribe a la vez el registro, la serie y el perfil.
  v_antes := v_perfil.peso_kg;

  -- Los literales se castean porque Postgres no resuelve `integer` a `smallint`
  -- ni a `numeric` al buscar la funcion.
  v_checkin := public.registrar_check_in(
    p_semana => 4::smallint,
    p_fecha => current_date,
    p_peso_kg => 63.2::numeric,
    p_cintura_cm => 69.5::numeric,
    p_cadera_cm => 90::numeric,
    p_cuello_cm => 30.5::numeric,
    p_fotos => 3::smallint,
    p_obligatorio => true
  );

  perform test_assert(v_checkin.peso_dia1_kg = 64, 'el check-in congela el peso del dia 1');
  perform test_assert(v_checkin.cintura_cm = 69.5, 'el check-in guarda la cintura, que el web app descartaba');
  perform test_assert(v_checkin.cadera_cm = 90, 'el check-in guarda la cadera');
  perform test_assert(v_checkin.cuello_cm = 30.5, 'el check-in guarda el cuello');
  perform test_assert(v_checkin.fotos_completas = 3, 'el check-in guarda las fotos');

  select peso_kg into v_despues from public.mediciones_progreso
  where usuario_id = v_usuario and fecha = current_date;
  perform test_assert(v_despues = 63.2, 'el check-in anade el punto a la serie de progreso');

  select peso_kg into v_despues from public.perfiles where auth_id = v_usuario;
  perform test_assert(v_despues = v_antes, 'el check-in actualiza el peso del perfil');

  select onboarding_completado into v_hecho from public.perfiles where auth_id = v_usuario;
  perform test_assert(v_hecho, 'el check-in marca el onboarding como completado');

  -- La preferencia de ultimo check-in es lo que gobierna la regla de los 7 dias.
  perform test_assert(
    not public.checkin_pendiente(v_usuario),
    'tras registrar, el check-in ya no está pendiente'
  );

  -- Reenviar la misma semana actualiza en lugar de duplicar.
  v_checkin := public.registrar_check_in(
    p_semana => 4::smallint,
    p_fecha => current_date,
    p_peso_kg => 62.8::numeric,
    p_cintura_cm => 69::numeric,
    p_cadera_cm => 89.5::numeric,
    p_cuello_cm => 30.5::numeric,
    p_fotos => 3::smallint
  );
  perform test_assert(v_checkin.peso_kg = 62.8, 'reenviar la semana actualiza la fila existente');
  select count(*) into v_dias from public.check_ins where usuario_id = v_usuario;
  perform test_assert(v_dias = 1, 'no se duplica el check-in de una misma semana');
end;
$$;

-- Imprime las lineas TAP acumuladas y el plan. Va antes del `rollback` porque
-- `_tap` es `on commit drop`.
-- Los bloques `do` dejaron el rol cambiado a `authenticated`, que no puede
-- leer la tabla temporal. Se vuelve al rol propietario antes de imprimir.
reset role;
select * from test_tap_salida();

rollback;