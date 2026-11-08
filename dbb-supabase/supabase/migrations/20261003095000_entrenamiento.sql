-- FORMA · Entrenamiento: estado por dia, sesiones y series registradas.

-- ---------------------------------------------------------------------------
-- registro_rutinas_diarias
--
-- El estado de una rutina ("Completado", "Programado", "Descanso") y su
-- porcentaje no son propiedades de la rutina: son de un usuario en una fecha.
-- El web app los lleva dentro del mismo objeto de rutina, mezclando el
-- catalogo con la sesion del usuario. Aqui se separan.
-- ---------------------------------------------------------------------------
create table public.registro_rutinas_diarias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rutina_id uuid not null references public.rutinas (id) on delete cascade,
  fecha date not null,

  estado public.estado_rutina not null default 'programada',
  -- 0 a 100. El web app lo pinta como `completion`.
  porcentaje_completado smallint not null default 0
    check (porcentaje_completado between 0 and 100),

  -- Cuando el usuario marco la rutina como hecha, para ordenar el historial.
  completada_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una entrada por rutina y dia. Al abrir la semana se inserta el estado
  -- programado de las rutinas activas.
  unique (usuario_id, rutina_id, fecha)
);

create index registro_rutinas_usuario_fecha_idx
  on public.registro_rutinas_diarias (usuario_id, fecha desc);
create index registro_rutinas_rutina_idx
  on public.registro_rutinas_diarias (rutina_id, fecha desc);

create trigger registro_rutinas_tocar_updated_at
  before update on public.registro_rutinas_diarias
  for each row execute function public.tocar_updated_at();

comment on table public.registro_rutinas_diarias is
  'Estado de cada rutina para un usuario en un dia. Separa el catalogo del progreso.';
comment on column registro_rutinas_diarias.completada_at is
  'Se rellena solo cuando el estado pasa a completada; permite ordenar sin mirar el porcentaje.';

-- ---------------------------------------------------------------------------
-- sesiones_entrenamiento
--
-- El resumen que hoy se descarta. WorkoutSession.tsx calcula `doneSets`,
-- `volume`, `records` y `calories`, y el manejador `onFinish` los recibe pero
-- no los guarda en ningun sitio: solo muestra un aviso.
-- ---------------------------------------------------------------------------
create table public.sesiones_entrenamiento (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,

  -- NULL si la sesion se empezo fuera del plan.
  rutina_id uuid references public.rutinas (id) on delete set null,

  -- "Tren superior A". Se guarda como texto porque el web app lo nombra aparte
  -- y no coincide con el titulo de la rutina.
  nombre text not null,

  fecha date not null,
  iniciada_at timestamptz not null default now(),
  finalizada_at timestamptz,

  -- Segundos transcurridos. El web app lleva `elapsed` en segundos.
  duracion_seg integer not null default 0 check (duracion_seg >= 0),

  series_totales smallint not null default 0 check (series_totales >= 0),
  series_completadas smallint not null default 0 check (series_completadas >= 0),
  -- Suma de kg x reps de las series completadas. De aqui sale el "+12% FUERZA".
  volumen_total_kg numeric(10,2) not null default 0 check (volumen_total_kg >= 0),
  -- Series que superaron el record previo del ejercicio.
  nuevos_records smallint not null default 0 check (nuevos_records >= 0),
  -- Aproximacion del web app: 7,4 kcal por minuto.
  kcal_estimadas smallint not null default 0 check (kcal_estimadas >= 0),

  estado public.estado_sesion not null default 'en_curso',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sesion en curso por usuario como mucho: evita duplicados al abrir la
-- pantalla dos veces.
create unique index sesiones_en_curso_idx
  on public.sesiones_entrenamiento (usuario_id)
  where estado = 'en_curso';

create index sesiones_usuario_fecha_idx
  on public.sesiones_entrenamiento (usuario_id, fecha desc);
create index sesiones_rutina_idx
  on public.sesiones_entrenamiento (rutina_id, fecha desc)
  where rutina_id is not null;

create trigger sesiones_tocar_updated_at
  before update on public.sesiones_entrenamiento
  for each row execute function public.tocar_updated_at();

comment on table public.sesiones_entrenamiento is
  'Sesiones de entrenamiento con su resumen. Es la tabla de la que sale el progreso de fuerza.';
comment on column public.sesiones_entrenamiento.volumen_total_kg is
  'Suma de kg x reps de las series completadas. Se recalcula al finalizar la sesion.';

-- ---------------------------------------------------------------------------
-- sesiones_ejercicios
--
-- Copia de la prescripcion en el momento de la sesion. Se duplica a proposito:
-- si manana se cambia la rutina, el historial de hoy tiene que seguir
-- diciendo lo que se hizo entonces.
-- ---------------------------------------------------------------------------
create table public.sesiones_ejercicios (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones_entrenamiento (id) on delete cascade,
  ejercicio_id text references public.ejercicios (id) on delete set null,

  -- Nombre, musculo e icono copiados de `ejercicios` y de `rutina_ejercicios`.
  nombre text not null,
  musculo text not null default '',
  icono text not null default 'dumbbell',

  series_planificadas smallint not null default 0 check (series_planificadas >= 0),
  reps_planificadas smallint not null default 0 check (reps_planificadas >= 0),
  carga_sugerida_kg numeric(5,1) not null default 0 check (carga_sugerida_kg >= 0),
  descanso_seg smallint not null default 0 check (descanso_seg >= 0),
  record_previo_kg numeric(5,1) not null default 0 check (record_previo_kg >= 0),
  consejo text not null default '',

  orden smallint not null default 0,
  created_at timestamptz not null default now(),

  unique (sesion_id, orden)
);

create index sesiones_ejercicios_sesion_idx on public.sesiones_ejercicios (sesion_id, orden);
create index sesiones_ejercicios_ejercicio_idx on public.sesiones_ejercicios (ejercicio_id, sesion_id)
  where ejercicio_id is not null;

comment on table public.sesiones_ejercicios is
  'Ejercicios de una sesion, con la prescripcion congelada en ese momento.';

-- ---------------------------------------------------------------------------
-- sesiones_series
--
-- El `SetEntry` de WorkoutSession.tsx: `{ kg, reps, done }`. Se guarda fila a
-- fila para poder detectar records por ejercicio y calcular volumen.
-- ---------------------------------------------------------------------------
create table public.sesiones_series (
  id uuid primary key default gen_random_uuid(),
  sesion_ejercicio_id uuid not null references public.sesiones_ejercicios (id) on delete cascade,

  -- Posicion dentro del ejercicio, empezando en 1.
  numero_serie smallint not null check (numero_serie >= 1),

  -- 0 en ejercicios a peso corporal, como `fondos`.
  kg numeric(5,1) not null default 0 check (kg >= 0),
  reps smallint not null default 0 check (reps >= 0),
  completada boolean not null default false,
  completada_at timestamptz,

  created_at timestamptz not null default now(),

  unique (sesion_ejercicio_id, numero_serie)
);

create index sesiones_series_ejercicio_idx
  on public.sesiones_series (sesion_ejercicio_id, numero_serie);

comment on table public.sesiones_series is
  'Series de cada ejercicio. El volumen y los records se derivan de aqui.';
comment on column public.sesiones_series.kg is
  '0 indica peso corporal, no que falte el dato.';

-- ---------------------------------------------------------------------------
-- Totalizacion de la sesion
--
-- Al cambiar una serie se recalculan los contadores de la sesion. Es el mismo
-- criterio que en la comida: los totales del padre nunca se escriben a mano.
--
-- `volumen` suma kg x reps solo de las series completadas; `records` cuenta las
-- series que superan el record previo del ejercicio. Ambas reglas son las del
-- web app.
-- ---------------------------------------------------------------------------
create or replace function public.totalizar_sesion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sesion_ejercicio_id uuid := coalesce(new.sesion_ejercicio_id, old.sesion_ejercicio_id);
  v_sesion_id uuid;
begin
  select e.sesion_id into v_sesion_id
  from public.sesiones_ejercicios e
  where e.id = v_sesion_ejercicio_id;

  -- Los contadores son de la sesion entera, no del ejercicio que ha cambiado:
  -- hay que volver a sumar todas las series de todos sus ejercicios.
  update public.sesiones_entrenamiento s
  set series_completadas = t.completadas,
      series_totales      = t.total,
      volumen_total_kg    = t.volumen,
      nuevos_records      = t.records,
      updated_at          = now()
  from (
    select
      count(*)::int as total,
      count(*) filter (where se.completada)::int as completadas,
      coalesce(sum(se.kg * se.reps) filter (where se.completada), 0) as volumen,
      count(*) filter (
        where se.completada and se.kg > 0 and se.kg > e.record_previo_kg
      )::int as records
    from public.sesiones_ejercicios e
    join public.sesiones_series se on se.sesion_ejercicio_id = e.id
    where e.sesion_id = v_sesion_id
  ) t
  where s.id = v_sesion_id;

  return null;
end;
$$;

comment on function public.totalizar_sesion() is
  'Recalcula los contadores de la sesion tras insertar, editar o borrar una serie.';

create trigger sesiones_series_totalizar
  after insert or update or delete on public.sesiones_series
  for each row execute function public.totalizar_sesion();

-- Cuando cambia una serie se sella su `completada_at`, para poder ordenar el
-- historial sin guardar el instante en el movil.
create or replace function public.sellar_serie()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.completada and new.completada_at is null then
    new.completada_at := now();
  elsif not new.completada then
    new.completada_at := null;
  end if;
  return new;
end;
$$;

create trigger sesiones_series_sellar
  before insert or update on public.sesiones_series
  for each row execute function public.sellar_serie();

-- ---------------------------------------------------------------------------
-- Finalizar una sesion
--
-- Cierra la sesion, recalcula el resumen y marca la rutina del dia como
-- completada. Es el equivalente de lo que hace el boton "Guardar sesion", que
-- hasta ahora solo muestra un aviso.
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_sesion(
  p_sesion_id uuid,
  p_duracion_seg integer default null
)
returns public.sesiones_entrenamiento
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sesion public.sesiones_entrenamiento;
  v_porcentaje smallint;
begin
  select * into v_sesion
  from public.sesiones_entrenamiento s
  where s.id = p_sesion_id
    and s.usuario_id = public.usuario_actual();

  if v_sesion.id is null then
    raise exception 'Sesion % no encontrada', p_sesion_id
      using errcode = 'no_data_found';
  end if;

  select
    case
      when count(*) = 0 then 0::smallint
      else round(100.0 * count(*) filter (where completada) / count(*))::smallint
    end
  into v_porcentaje
  from public.sesiones_series se
  join public.sesiones_ejercicios e on e.id = se.sesion_ejercicio_id
  where e.sesion_id = p_sesion_id;

  update public.sesiones_entrenamiento s
  set estado           = 'completada',
      finalizada_at    = coalesce(s.finalizada_at, now()),
      duracion_seg     = coalesce(p_duracion_seg, s.duracion_seg),
      series_totales   = t.total,
      series_completadas = t.completadas,
      volumen_total_kg = t.volumen,
      nuevos_records   = t.records,
      -- 7,4 kcal por minuto, el factor que usa el web app.
      kcal_estimadas   = round(coalesce(p_duracion_seg, s.duracion_seg) / 60.0 * 7.4)::smallint,
      updated_at       = now()
  from (
    select
      count(*)::int as total,
      count(*) filter (where se.completada)::int as completadas,
      coalesce(sum(se.kg * se.reps) filter (where se.completada), 0) as volumen,
      -- Un record es una serie completada que supera la marca que traia el
      -- ejercicio. Se cuenta por serie, no por ejercicio: superar el record en
      -- tres series son tres marcas, que es lo que hace el cliente.
      count(*) filter (
        where se.completada
          and e.record_previo_kg > 0
          and se.kg > e.record_previo_kg
      )::int as records
    from public.sesiones_series se
    join public.sesiones_ejercicios e on e.id = se.sesion_ejercicio_id
    where e.sesion_id = p_sesion_id
  ) t
  where s.id = p_sesion_id
  returning * into v_sesion;

  -- La rutina del dia queda completada en la medida de lo hecho.
  if v_sesion.rutina_id is not null then
    insert into public.registro_rutinas_diarias (
      usuario_id, rutina_id, fecha, estado, porcentaje_completado, completada_at
    )
    values (
      v_sesion.usuario_id,
      v_sesion.rutina_id,
      v_sesion.fecha,
      case when v_porcentaje >= 100 then 'completada'::public.estado_rutina
           else 'programada'::public.estado_rutina end,
      v_porcentaje,
      case when v_porcentaje >= 100 then now() else null end
    )
    on conflict (usuario_id, rutina_id, fecha) do update
    set estado = excluded.estado,
        porcentaje_completado = excluded.porcentaje_completado,
        completada_at = excluded.completada_at,
        updated_at = now();
  end if;

  return v_sesion;
end;
$$;

comment on function public.finalizar_sesion(uuid, integer) is
  'Cierra la sesion, guarda el resumen y refleja el avance en la rutina del dia.';