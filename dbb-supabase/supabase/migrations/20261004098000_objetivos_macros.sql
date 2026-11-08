-- ---------------------------------------------------------------------------
-- Objetivos de macronutrientes
--
-- Faltaban. La pantalla de nutricion comparaba las macros del dia contra
-- 160 / 220 / 70 g fijos, escritos en el componente, mientras el servidor ya
-- hacia tiempo que calculaba `perfiles.calorias_objetivo` de verdad. Con un
-- objetivo de 2.320 kcal —el valor por defecto del perfil— esos 1.850 kcal de
-- macros no cuadran con nada, y con el de 2.150 kcal del mock salen bien solo
-- por casualidad.
--
-- Aqui se reparten las kcal del objetivo entre los tres macros con una regla
-- fija y se exponen en `resumen_nutricion`, que es de donde la pantalla ya
-- saca el resto del resumen. Los dos clientes pasan a leer el mismo sitio y no
-- a tener cada uno su copia.
--
-- La regla es el reparto habitual en fuerza: 30 % proteina, 40 %
-- carbohidratos y 30 % grasa. Se calcula en gramos dividiendo por 4, 4 y 9,
-- que son las kcal que aportan por gramo.
-- ---------------------------------------------------------------------------

create or replace function public.objetivos_macros(p_calorias_objetivo integer)
returns table (
  proteinas_g integer,
  carbohidratos_g integer,
  grasas_g integer
)
language sql
immutable
set search_path = ''
as $$
  -- `greatest(1200, ...)` para que un objetivo absurdo en el perfil no
  -- devuelva negativos. `calorias_objetivo` ya tiene un `check >= 1200`, pero la
  -- funcion es `immutable` y se puede llamar con lo que sea.
  select
    round(greatest(1200, coalesce(p_calorias_objetivo, 2000)) * 0.30 / 4)::integer,
    round(greatest(1200, coalesce(p_calorias_objetivo, 2000)) * 0.40 / 4)::integer,
    round(greatest(1200, coalesce(p_calorias_objetivo, 2000)) * 0.30 / 9)::integer;
$$;

comment on function public.objetivos_macros(integer) is
  'Reparte las calorias objetivo entre macros: 30 % proteina, 40 % carbohidratos, 30 % grasa.';

grant execute on function public.objetivos_macros(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- El resumen los lleva anadidos
-- ---------------------------------------------------------------------------

create or replace function public.resumen_nutricion(p_fecha date default current_date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_totales record;
  v_agua record;
  v_objetivo integer;
  v_objetivos record;
  v_comidas integer;
begin
  select
    coalesce(sum(c.kcal), 0)             as kcal,
    coalesce(sum(c.proteinas_g), 0)      as proteinas_g,
    coalesce(sum(c.carbohidratos_g), 0)   as carbohidratos_g,
    coalesce(sum(c.grasas_g), 0)         as grasas_g,
    count(*) filter (where c.completada) as comidas_registradas
  into v_totales
  from public.diario_comidas c
  where c.usuario_id = v_usuario and c.fecha = p_fecha;

  select coalesce(max(a.ml), 0) as ml, coalesce(max(a.objetivo_ml), 2000) as objetivo_ml
  into v_agua
  from public.registro_agua a
  where a.usuario_id = v_usuario and a.fecha = p_fecha;

  select coalesce(max(p.calorias_objetivo), 2000) into v_objetivo
  from public.perfiles p where p.auth_id = v_usuario;

  -- "3 de 4 registradas" del encabezado del diario.
  select count(*) into v_comidas
  from public.diario_comidas c
  where c.usuario_id = v_usuario and c.fecha = p_fecha;

  select * into v_objetivos
  from public.objetivos_macros(v_objetivo);

  return jsonb_build_object(
    'fecha', p_fecha,
    'kcal', v_totales.kcal,
    'proteinas_g', round(v_totales.proteinas_g, 1),
    'carbohidratos_g', round(v_totales.carbohidratos_g, 1),
    'grasas_g', round(v_totales.grasas_g, 1),
    'kcal_objetivo', v_objetivo,
    'kcal_restantes', greatest(0, v_objetivo - v_totales.kcal::integer),
    'proteinas_objetivo_g', v_objetivos.proteinas_g,
    'carbohidratos_objetivo_g', v_objetivos.carbohidratos_g,
    'grasas_objetivo_g', v_objetivos.grasas_g,
    'comidas_registradas', v_totales.comidas_registradas,
    'comidas_totales', v_comidas,
    'agua_ml', v_agua.ml,
    'agua_objetivo_ml', v_agua.objetivo_ml
  );
end;
$$;

comment on function public.resumen_nutricion(date) is
  'Totales y objetivos del dia, incluidos los gramos de macro objetivo.';