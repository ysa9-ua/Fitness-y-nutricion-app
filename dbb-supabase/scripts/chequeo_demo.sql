-- Verificacion manual del perfil de demostracion.
--
-- No es un test: es una consulta de lectura para eyeballar lo que devuelven
-- los RPC sobre los datos del seed 04. Se ejecuta a mano con:
--
--   docker exec -i supabase_db_dbb-supabase psql -U postgres -d postgres \
--     -f - < scripts/chequeo_demo.sql

begin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111')::text,
  true
);

\echo '--- resumen_nutricion (hoy) ---'
select jsonb_pretty(public.resumen_nutricion(current_date));

\echo '--- resumen_nutricion (hace 6 dias) ---'
select jsonb_pretty(public.resumen_nutricion(current_date - 6));

\echo '--- racha_nutricion ---'
select public.racha_nutricion() as racha;

\echo '--- adherencia_nutricion (ultimos 30 dias) ---'
select public.adherencia_nutricion(current_date - 30, current_date) as adherencia;

\echo '--- serie_peso 3M (primeros y ultimos) ---'
select public.serie_peso('3M') -> 0 as primero,
       public.serie_peso('3M') -> -1 as ultimo;

\echo '--- semana_entrenamiento: el dia de hoy ---'
select jsonb_pretty(d) as hoy
from jsonb_array_elements(public.semana_entrenamiento(current_date) -> 'dias') d
where d ->> 'es_hoy' = 'true';

\echo '--- sesion en curso ---'
select jsonb_pretty(public.semana_entrenamiento(current_date) -> 'sesion_en_curso')
       as en_curso;

\echo '--- progreso_fuerza (30 dias) ---'
select jsonb_pretty(public.progreso_fuerza(current_date - 30, current_date));

\echo '--- la semana, agrupada como la pinta Workouts.tsx ---'
select
  v.dia_semana,
  to_char(v.dia_semana, 'FMDay') as dia,
  v.titulo_corto,
  v.titulo as rutina,
  v.duracion_min,
  v.intensidad,
  v.num_ejercicios,
  v.hora_programada,
  v.fase
from public.v_rutinas_completas v
where v.activo and not v.es_descanso
order by v.dia_semana, v.orden;

rollback;
