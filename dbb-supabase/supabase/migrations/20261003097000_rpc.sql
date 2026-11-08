-- FORMA · Funciones de calculo y agregados.
--
-- Estas reglas vivian duplicadas en JavaScript y se perdian o se contradician
-- entre pantallas. Al trairlas aqui, el movil, la web y cualquier cliente
-- obtiene el mismo numero, y queda un solo sitio donde corregir la formula.
--
-- Todas las que leen datos del usuario filtran por `public.usuario_actual()`
-- y respetan RLS: un usuario no puede leer el progreso de otro.

-- ---------------------------------------------------------------------------
-- Metabolismo basal y objetivo calorico
--
-- Mifflin-St Jeor, tal cual esta en Onboarding.tsx: 10*peso + 6,25*altura
-- - 5*edad + offset, por factor de actividad y mas el ajuste del objetivo,
-- con suelo de 1200 kcal y redondeo a decenas.
-- ---------------------------------------------------------------------------
create or replace function public.tasa_metabolica_basal(
  p_peso_kg numeric,
  p_altura_cm numeric,
  p_edad numeric,
  p_sexo public.sexo
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select
    10 * p_peso_kg
    + 6.25 * p_altura_cm
    - 5 * p_edad
    + case p_sexo when 'masculino' then 5 else -161 end;
$$;

comment on function public.tasa_metabolica_basal(numeric, numeric, numeric, public.sexo) is
  'Mismo offset que el web app: +5 para masculino, -161 para femenino.';

-- Factor de actividad por dias de entrenamiento a la semana.
create or replace function public.factor_actividad(p_dias_semana smallint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_dias_semana <= 3 then 1.4
    when p_dias_semana = 4 then 1.5
    when p_dias_semana = 5 then 1.65
    else 1.75
  end;
$$;

-- Ajuste sobre el gasto total segun lo que el usuario busca.
create or replace function public.ajuste_por_objetivo(p_objetivo public.objetivo)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_objetivo
    when 'hypertrophy' then 300
    when 'fat-loss' then -400
    when 'recomposition' then -100
    else 0
  end;
$$;

-- Objetivo calorico completo.
create or replace function public.calorias_objetivo(
  p_peso_kg numeric,
  p_altura_cm numeric,
  p_edad numeric,
  p_sexo public.sexo,
  p_dias_semana smallint,
  p_objetivo public.objetivo
)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select greatest(1200, round((
      public.tasa_metabolica_basal(p_peso_kg, p_altura_cm, p_edad, p_sexo)
      * public.factor_actividad(p_dias_semana)
      + public.ajuste_por_objetivo(p_objetivo)
    ) / 10) * 10)::smallint;
$$;

comment on function public.calorias_objetivo(numeric, numeric, numeric, public.sexo, smallint, public.objetivo) is
  'Gasto total con ajuste por objetivo, suelo de 1200 kcal y redondeo a decenas.';

-- ---------------------------------------------------------------------------
-- Estimacion de grasa corporal
--
-- Reproduce Onboarding.tsx: IMC ponderado por edad, mas un ajuste por sexo y
-- otro por la cintura respecto a lo esperado para la altura, limitado a [-1,5;
-- +3]. El resultado se recorta al rango 8-48 %.
-- ---------------------------------------------------------------------------
create or replace function public.estimar_grasa_corporal(
  p_peso_kg numeric,
  p_altura_cm numeric,
  p_edad numeric,
  p_sexo public.sexo,
  p_cintura_cm numeric
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_imc numeric;
  v_sexo numeric;
  v_cintura numeric;
  v_total numeric;
begin
  v_imc := p_peso_kg / ((p_altura_cm / 100.0) ^ 2);
  v_sexo := case p_sexo when 'masculino' then -5.4 else -10.8 end;

  -- Si no hay cintura medida, se deja el termino a cero en vez de fallar.
  if p_cintura_cm is null then
    v_cintura := 0;
  else
    v_cintura := least(3, greatest(-1.5, (p_cintura_cm - p_altura_cm * 0.42) * 0.35));
  end if;

  v_total := 1.2 * v_imc + 0.23 * p_edad + v_sexo - 5.4 + v_cintura;

  return round(least(48, greatest(8, v_total))::numeric, 1);
end;
$$;

comment on function public.estimar_grasa_corporal(numeric, numeric, numeric, public.sexo, numeric) is
  'Porcentaje de grasa estimado a partir de IMC, edad, sexo y cintura. Se recorta a 8-48 %.';

-- ---------------------------------------------------------------------------
-- Recalcular el perfil
--
-- Recalcula calorias y grasa con los datos actuales, deja constancia en
-- `algoritmo_recalculos` y actualiza el perfil. Es lo que hay detras del boton
-- "Forzar recalculo" del perfil, que hasta ahora solo lanzaba un aviso.
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_perfil()
returns public.perfiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actual public.perfiles;
  v_resultado public.perfiles;
  v_kcal smallint;
  v_grasa numeric;
begin
  select * into v_actual
  from public.perfiles p
  where p.auth_id = public.usuario_actual()
  for update;

  if v_actual.auth_id is null then
    raise exception 'El usuario no tiene perfil'
      using errcode = 'no_data_found';
  end if;

  -- El resultado se calcula antes de tocar nada. `algoritmo_recalculos` exige
  -- `kcal_resultantes` en el propio INSERT, asi que la fila no puede grabarse
  -- antes de saber el numero.
  v_kcal := public.calorias_objetivo(
    v_actual.peso_kg, v_actual.altura_cm, v_actual.edad,
    v_actual.sexo, v_actual.dias_semana, v_actual.objetivo
  );
  v_grasa := public.estimar_grasa_corporal(
    v_actual.peso_kg, v_actual.altura_cm, v_actual.edad,
    v_actual.sexo, v_actual.cintura_cm
  );

  insert into public.algoritmo_recalculos (
    usuario_id, peso_kg, altura_cm, edad, sexo, dias_semana, objetivo,
    kcal_resultantes, aplicado
  )
  values (
    v_actual.auth_id, v_actual.peso_kg, v_actual.altura_cm, v_actual.edad,
    v_actual.sexo, v_actual.dias_semana, v_actual.objetivo,
    v_kcal, true
  );

  update public.perfiles p
  set calorias_objetivo = v_kcal,
      grasa_corporal_pct = v_grasa
  where p.auth_id = v_actual.auth_id
  returning * into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.recalcular_perfil() is
  'Recalcula calorías y grasa del usuario actual y registra el resultado.';

-- ---------------------------------------------------------------------------
-- Registrar un check-in semanal
--
-- El web app solo conservaba el peso: la cintura, la cadera y el cuello se
-- descartaban en el manejador, y las tres fotos nunca salian del estado local.
-- Aqui se escribe el check-in y, en la misma transaccion, la medida de la
-- serie de progreso y el peso actual del perfil.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_check_in(
  p_semana smallint,
  p_peso_kg numeric,
  p_fecha date default current_date,
  p_cintura_cm numeric default null,
  p_cadera_cm numeric default null,
  p_cuello_cm numeric default null,
  p_fotos smallint default 0,
  p_obligatorio boolean default false
)
returns public.check_ins
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_perfil public.perfiles;
  v_checkin public.check_ins;
  v_dia1 numeric;
begin
  if v_usuario is null then
    raise exception 'Se requiere sesion iniciada'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_perfil from public.perfiles p where p.auth_id = v_usuario;

  -- El dia 1 se congela en el primer registro; despues manda el perfil.
  v_dia1 := coalesce(v_perfil.peso_inicial_kg, v_perfil.peso_kg);

  insert into public.check_ins (
    usuario_id, semana, fecha, peso_kg, cintura_cm, cadera_cm, cuello_cm,
    peso_dia1_kg, fotos_completas, obligatorio
  )
  values (
    v_usuario, p_semana, p_fecha, p_peso_kg, p_cintura_cm, p_cadera_cm,
    p_cuello_cm, v_dia1, p_fotos, p_obligatorio
  )
  on conflict (usuario_id, semana) do update
  set fecha           = excluded.fecha,
      peso_kg         = excluded.peso_kg,
      cintura_cm      = excluded.cintura_cm,
      cadera_cm       = excluded.cadera_cm,
      cuello_cm       = excluded.cuello_cm,
      fotos_completas = greatest(public.check_ins.fotos_completas, excluded.fotos_completas),
      obligatorio     = excluded.obligatorio
  returning * into v_checkin;

  -- El peso tambien es un punto de la serie de progreso.
  insert into public.mediciones_progreso (
    usuario_id, fecha, peso_kg, grasa_corporal_pct, cintura_cm, origen
  )
  values (
    v_usuario, p_fecha, p_peso_kg, v_perfil.grasa_corporal_pct,
    p_cintura_cm, 'check_in'
  )
  on conflict (usuario_id, fecha) do update
  set peso_kg    = excluded.peso_kg,
      cintura_cm = coalesce(excluded.cintura_cm, public.mediciones_progreso.cintura_cm);

  -- El perfil refleja el peso actual y da por hecho el onboarding completo.
  update public.perfiles p
  set peso_kg = p_peso_kg,
      -- Solo se fija si venia vacio: en cuanto hay medida historica, manda.
      peso_inicial_kg = coalesce(p.peso_inicial_kg, p_peso_kg),
      onboarding_completado = true
  where p.auth_id = v_usuario;

  -- Las preferencias son la fuente de verdad para la regla de los 7 dias.
  insert into public.preferencias_usuario (usuario_id, ultimo_checkin)
  values (v_usuario, now())
  on conflict (usuario_id) do update set ultimo_checkin = now();

  return v_checkin;
end;
$$;

comment on function public.registrar_check_in(smallint, numeric, date, numeric, numeric, numeric, smallint, boolean) is
  'Registra el check-in semanal: check-in, serie de progreso, perfil y preferencias, todo en una transaccion.';

-- ---------------------------------------------------------------------------
-- Resumen de un dia de alimentacion
--
-- Devuelve lo que la cabecera del diario necesita de golpe: totales, mbito de
-- objetivo, agua y cuantas comidas hay registradas. El web app lo suma en el
-- navegador con `reduce`.
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

  return jsonb_build_object(
    'fecha', p_fecha,
    'kcal', v_totales.kcal,
    'proteinas_g', round(v_totales.proteinas_g, 1),
    'carbohidratos_g', round(v_totales.carbohidratos_g, 1),
    'grasas_g', round(v_totales.grasas_g, 1),
    'kcal_objetivo', v_objetivo,
    'kcal_restantes', greatest(0, v_objetivo - v_totales.kcal::integer),
    'comidas_registradas', v_totales.comidas_registradas,
    'comidas_totales', v_comidas,
    'agua_ml', v_agua.ml,
    'agua_objetivo_ml', v_agua.objetivo_ml
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Racha de alimentacion
--
-- Numero de dias consecutivos, cuenta hacia atras desde hoy, con al menos una
-- comida registrada. La pantalla muestra "12 dias" con un numero fijo.
-- ---------------------------------------------------------------------------
create or replace function public.racha_nutricion()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with dias as (
    select distinct c.fecha
    from public.diario_comidas c
    where c.usuario_id = public.usuario_actual()
      and c.completada
      and c.fecha <= current_date
  ),
  -- Truco de "gaps and islands": al restar el numero de fila a la fecha, todas
  -- las fechas de una racha consecutiva dan el mismo valor. Grouping por ese
  -- valor separa cada racha.
  islas as (
    select
      d.fecha,
      -- El cast a int es necesario: row_number() devuelve bigint y
      -- `date - bigint` no existe.
      d.fecha - (row_number() over (order by d.fecha))::int as clave
    from dias d
  ),
  rachas as (
    select clave, min(fecha) as inicio, max(fecha) as fin, count(*)::int as longitud
    from islas
    group by clave
  )
  -- La racha viva es la que llega hasta hoy o hasta ayer: que hoy falte todavia
  -- no significa que la racha este perdida.
  select coalesce((
    select r.longitud
    from rachas r
    where r.fin = current_date or r.fin = current_date - 1
    order by r.fin desc
    limit 1
  ), 0);
$$;

comment on function public.racha_nutricion() is
  'Dias consecutivos con al menos una comida registrada. Admite que hoy falte sin romper la racha.';

-- ---------------------------------------------------------------------------
-- Adherencia
--
-- Porcentaje de dias del rango con tres o mas comidas registradas. El perfil
-- muestra un 92 % fijo.
-- ---------------------------------------------------------------------------
create or replace function public.adherencia_nutricion(
  p_desde date,
  p_hasta date default current_date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_cumplidos integer;
begin
  v_total := (p_hasta - p_desde + 1);
  if v_total <= 0 then
    return 0;
  end if;

  select count(*) into v_cumplidos
  from (
    select c.fecha
    from public.diario_comidas c
    where c.usuario_id = public.usuario_actual()
      and c.fecha between p_desde and p_hasta
      and c.completada
    group by c.fecha
    having count(*) >= 3
  ) t;

  return round(100.0 * v_cumplidos / v_total, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Serie de peso para el grafico de progreso
--
-- Sustituye al literal `chartData` de Progress.tsx. Los rangos son los mismos
-- que los de los botones: 1M, 3M, 6M y 1A.
-- ---------------------------------------------------------------------------
create or replace function public.serie_peso(p_rango text default '3M')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_dias integer;
begin
  v_dias := case p_rango
    when '1M' then 30
    when '6M' then 183
    when '1A' then 365
    else 91
  end;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'fecha', m.fecha,
          'peso_kg', m.peso_kg,
          'grasa_corporal_pct', m.grasa_corporal_pct,
          'cintura_cm', m.cintura_cm
        ) order by m.fecha
      )
      from public.mediciones_progreso m
      where m.usuario_id = public.usuario_actual()
        and m.fecha > current_date - v_dias
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.serie_peso(text) is
  'Puntos de peso del grafico de progreso. Rangos: 1M, 3M (por defecto), 6M, 1A.';

-- ---------------------------------------------------------------------------
-- Progreso de fuerza
--
-- Variacion del volumen total entrenado entre dos periodos. Es el "+12% FUERZA"
-- de la tarjeta, que no tenia origen de datos.
-- ---------------------------------------------------------------------------
create or replace function public.progreso_fuerza(
  p_desde date,
  p_hasta date default current_date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_actual record;
  v_anterior record;
begin
  select
    coalesce(sum(s.volumen_total_kg), 0) as volumen,
    count(*)::int as sesiones
  into v_actual
  from public.sesiones_entrenamiento s
  where s.usuario_id = v_usuario
    and s.estado = 'completada'
    and s.fecha between p_desde and p_hasta;

  -- El periodo inmediatamente anterior, de la misma longitud.
  select
    coalesce(sum(s.volumen_total_kg), 0) as volumen,
    count(*)::int as sesiones
  into v_anterior
  from public.sesiones_entrenamiento s
  where s.usuario_id = v_usuario
    and s.estado = 'completada'
    and s.fecha between p_desde - (p_hasta - p_desde + 1)
                    and p_desde - 1;

  return jsonb_build_object(
    'volumen_kg', round(v_actual.volumen, 1),
    'sesiones', v_actual.sesiones,
    'volumen_anterior_kg', round(v_anterior.volumen, 1),
    'sesiones_anteriores', v_anterior.sesiones,
    'variacion_pct', case
      when v_anterior.volumen > 0
        then round(100.0 * (v_actual.volumen - v_anterior.volumen) / v_anterior.volumen, 1)
      else null
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Semana de entrenamiento
--
-- Rejilla de lunes a domingo con las rutinas de cada dia y el estado de cada
-- una para el usuario. Devuelve jsonb para que el movil lo pinten sin tener
-- que componer el objeto a mano.
-- ---------------------------------------------------------------------------
create or replace function public.semana_entrenamiento(p_fecha date default current_date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_lunes date := p_fecha - ((extract(isodow from p_fecha)::int - 1));
  v_sesion uuid;
begin
  -- Si hay una sesion a medias, se marca para que la app la pueda recuperar.
  select s.id into v_sesion
  from public.sesiones_entrenamiento s
  where s.usuario_id = v_usuario
    and s.estado = 'en_curso'
  order by s.iniciada_at desc
  limit 1;

  return jsonb_build_object(
    'lunes', v_lunes,
    'domingo', v_lunes + 6,
    'sesion_en_curso', v_sesion,
    'dias', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'dia_semana', extract(isodow from d.dia)::int,
          'fecha', d.dia,
          'es_hoy', d.dia = current_date,
          'titulo', pl.titulo,
          'titulo_corto', pl.titulo_corto,
          'rutinas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'titulo', r.titulo,
                'subtitulo', r.subtitulo,
                'enfoque', r.enfoque,
                'musculos', r.musculos,
                'duracion_min', r.duracion_min,
                'intensidad', r.intensidad,
                'kcal_estimadas', r.kcal_estimadas,
                'hora_programada', r.hora_programada,
                'es_descanso', r.es_descanso,
                'orden', r.orden,
                'estado', coalesce(
                  rr.estado,
                  case when r.es_descanso then 'descanso' else 'programada' end::public.estado_rutina
                ),
                'porcentaje_completado', coalesce(rr.porcentaje_completado, 0)
              ) order by r.orden
            )
            from public.rutinas r
            left join public.registro_rutinas_diarias rr
              on rr.rutina_id = r.id
             and rr.usuario_id = v_usuario
             and rr.fecha = d.dia
            where r.plan_id = pl.id
              and r.activo
          ), '[]'::jsonb)
        ) order by d.dia
      ), '[]'::jsonb)
      from generate_series(v_lunes, v_lunes + 6, '1 day') as d(dia)
      -- Un plan por dia: el de la fase mas avanzada que este activa.
      left join lateral (
        select p.id, p.titulo, p.titulo_corto
        from public.planes_entrenamiento p
        where p.dia_semana = extract(isodow from d.dia)::int
          and p.activo
        order by p.fase desc
        limit 1
      ) pl on true
    )
  );
end;
$$;

comment on function public.semana_entrenamiento(date) is
  'Rejilla de la semana con las rutinas y el estado de cada una para el usuario.';

-- ---------------------------------------------------------------------------
-- Abrir una sesion de entrenamiento
--
-- Crea la sesion y la puebla con la prescripcion de la rutina: un ejercicio
-- por fila y una serie por posicion, yaorrentenada con la carga sugerida.
-- WorkoutSession.tsx hacia esto en memoria con `createLogs`, que se perdia al
-- cerrar la app.
-- ---------------------------------------------------------------------------
create or replace function public.iniciar_sesion(
  p_rutina_id uuid,
  p_nombre text default null
)
returns public.sesiones_entrenamiento
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_rutina public.rutinas;
  v_sesion public.sesiones_entrenamiento;
  v_ejercicio uuid;
begin
  select * into v_rutina from public.rutinas r where r.id = p_rutina_id;

  if v_rutina.id is null then
    raise exception 'Rutina % no encontrada', p_rutina_id
      using errcode = 'no_data_found';
  end if;

  insert into public.sesiones_entrenamiento (
    usuario_id, rutina_id, nombre, fecha, estado
  )
  values (
    v_usuario,
    p_rutina_id,
    coalesce(p_nombre, v_rutina.titulo),
    current_date,
    'en_curso'
  )
  returning * into v_sesion;

  insert into public.sesiones_ejercicios (
    sesion_id, ejercicio_id, nombre, musculo, icono,
    series_planificadas, reps_planificadas, carga_sugerida_kg,
    descanso_seg, record_previo_kg, consejo, orden
  )
  select
    v_sesion.id,
    re.ejercicio_id,
    e.nombre,
    e.musculo,
    e.icono,
    re.series,
    re.reps,
    re.carga_sugerida_kg,
    re.descanso_seg,
    re.record_previo_kg,
    re.consejo,
    re.orden
  from public.rutina_ejercicios re
  join public.ejercicios e on e.id = re.ejercicio_id
  where re.rutina_id = p_rutina_id
  order by re.orden;

  -- Una fila por serie planificada, con los valores sugeridos puestos.
  insert into public.sesiones_series (
    sesion_ejercicio_id, numero_serie, kg, reps, completada
  )
  select
    se.id,
    s.n,
    se.carga_sugerida_kg,
    se.reps_planificadas,
    false
  from public.sesiones_ejercicios se
  cross join lateral generate_series(1, se.series_planificadas) as s(n)
  where se.sesion_id = v_sesion.id;

  return v_sesion;
end;
$$;

comment on function public.iniciar_sesion(uuid, text) is
  'Crea una sesion en curso con la prescripcion de la rutina ya volcada a ejercicios y series.';