-- FORMA · Catalogos y datos de referencia.
--
-- Nada de lo que hay aqui pertenece a un usuario: se lee igual para todos y
-- se escribe solo desde el panel o desde una migracion. Por eso las politicas
-- RLS de este fichero son solo de lectura para `authenticated` (se añaden en
-- la migracion de RLS).

-- ---------------------------------------------------------------------------
-- Alimentos
--
-- Valores nutricionales por cada 100 g, que es como los expresa FoodDetail.tsx
-- (`type Nutrition` en ese fichero). La tabla guarda esas cifras y la app
-- multiplica por `gramos / 100`.
-- ---------------------------------------------------------------------------
create table public.alimentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) >= 2),
  marca text,
  categoria text not null default 'general',
  kcal_100g numeric(7,1) not null check (kcal_100g >= 0),
  proteinas_100g numeric(7,1) not null default 0 check (proteinas_100g >= 0),
  carbohidratos_100g numeric(7,1) not null default 0 check (carbohidratos_100g >= 0),
  grasas_100g numeric(7,1) not null default 0 check (grasas_100g >= 0),
  fibra_100g numeric(7,1) not null default 0 check (fibra_100g >= 0),
  fuente public.fuente_alimento not null default 'manual',
  -- Solo tiene sentido para filas traidas por el escaner.
  confianza smallint check (confianza between 0 and 100),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.alimentos is
  'Catalogo de alimentos con valores por 100 g. Fuente unica para el diario y el escaner.';
comment on column public.alimentos.kcal_100g is
  'Energia por 100 g. Los clientes multiplican por gramos/100 para obtener el total.';
comment on column public.alimentos.confianza is
  'Confianza del OCR en porcentaje (0-100). NULL cuando la fila es manual.';

-- FoodDetail.tsx busca por `name.toLowerCase().includes(term)`. Con trigram se
-- resuelve en base de datos en vez de traer el catalogo entero al movil.
create index alimentos_nombre_trgm_idx
  on public.alimentos using gin (nombre extensions.gin_trgm_ops);
create index alimentos_categoria_idx on public.alimentos (categoria)
  where activo;
create index alimentos_nombre_lower_idx on public.alimentos (lower(nombre));

-- ---------------------------------------------------------------------------
-- Ejercicios
--
-- La clave primaria es el slug textual que ya usan las pantallas
-- ('press-banca', 'remo-pendlay'...). Es un identificador estable escrito a
-- mano en WorkoutSession.tsx, asi que conservarlo como clave natural evita
-- traducirlo en cada cliente.
-- ---------------------------------------------------------------------------
create table public.ejercicios (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  nombre text not null,
  -- Etiqueta corta que la interfaz ya muestra: "Pecto mayor".
  musculo text not null,
  -- Uno de los nombres de `IconName` en Icon.tsx.
  icono text not null default 'dumbbell',
  grupo_muscular text not null default 'full_body',
  -- Permite meter ejercicios nuevos en el catalogo sin tocar el esquema.
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.ejercicios is
  'Catalogo de ejercicios. El `id` es el slug que las pantallas ya usan.';
comment on column public.ejercicios.grupo_muscular is
  'push | pull | legs | core | movilidad | cardio. Serve para agrupar y balancear el plan.';

create index ejercicios_grupo_idx on public.ejercicios (grupo_muscular)
  where activo;

-- ---------------------------------------------------------------------------
-- Plan semanal de entrenamiento
--
-- `dia_semana` va de 1 (lunes) a 7 (domingo) y es obligatorio: el web app
-- indexa el array de planes por posicion, asi que el orden tiene que existir
-- en la base de datos y no depender de como se insertaron las filas.
-- ---------------------------------------------------------------------------
create table public.planes_entrenamiento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  -- "Descanso" en las variantes de recuperacion; la tarjeta del dia lo usa.
  titulo_corto text not null,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  -- Numero de fase del plan. El perfil y el check-in hablan de 12 semanas,
  -- el dashboard de 3 fases: `fase` unifica ese recuento.
  fase smallint not null default 1 check (fase > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  -- Un solo plan por dia de la semana y fase. El indice parcial cubre ademas
  -- el caso de que coexistan fases distintas: solo uno puede estar activo.
  unique (dia_semana, fase)
);

create unique index planes_dia_fase_activo_idx
  on public.planes_entrenamiento (dia_semana, fase)
  where activo;

comment on table public.planes_entrenamiento is
  'Un plan por dia de la semana. El orden de la semana vive en `dia_semana`, no en la fila.';
comment on column public.planes_entrenamiento.dia_semana is
  '1 = lunes ... 7 = domingo. El web app accede por posicion al array, asi que debe ser explicito.';

-- ---------------------------------------------------------------------------
-- Rutinas
--
-- Una rutina es una sesion tipo dentro de un dia: "Tren inferior · Empuje" y
-- "Core y estabilidad" pueden convivir en el mismo viernes. Los dias de
-- descanso tambien se modelan aqui, con `es_descanso` a true, para que la
-- rejilla de la semana quede completa y no haya que inventarse filas.
-- ---------------------------------------------------------------------------
create table public.rutinas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes_entrenamiento (id) on delete cascade,
  titulo text not null,
  subtitulo text not null default '',
  -- "Pecho, hombros y triceps".
  enfoque text not null default '',
  -- Etiquetas libres tal cual las pinta el web app: "Trapecio", "Oblicuos".
  musculos text[] not null default '{}',
  duracion_min smallint not null default 0 check (duracion_min >= 0),
  intensidad public.intensidad not null default 'media',
  kcal_estimadas smallint not null default 0 check (kcal_estimadas >= 0),
  -- Hora prevista, "07:10" en el mock. NULL cuando la rutina no tiene hora fija.
  hora_programada time,
  -- Las de recuperacion y las de descanso se muestran pero no cuentan para el
  -- volumen de la semana (`r.status !== "rest"` en Workouts.tsx).
  es_descanso boolean not null default false,
  -- Orden dentro del dia.
  orden smallint not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, orden)
);

create index rutinas_plan_idx on public.rutinas (plan_id, orden) where activo;
create index rutinas_entrenamiento_idx on public.rutinas (plan_id)
  where activo and not es_descanso;

comment on table public.rutinas is
  'Rutinas dentro de un dia del plan. `es_descanso` las excluye de los totales semanales.';
comment on column public.rutinas.hora_programada is
  'NULL si la rutina no tiene hora fija. En el web se muestra "Pendiente".';

-- ---------------------------------------------------------------------------
-- Ejercicios de una rutina, con la prescripcion
--
-- Esta tabla es la que hoy falta: el web app pasa de una tarjeta de rutina a
-- la sesion activa sin ningun vinculo, asi que WorkoutSession.tsx tiene sus
-- propios 5 ejercicios quemados y `Routine.exercises` es solo un numero.
-- Con esta tabla, `num_ejercicios` de la rutina pasa a ser derivable.
-- ---------------------------------------------------------------------------
create table public.rutina_ejercicios (
  id uuid primary key default gen_random_uuid(),
  rutina_id uuid not null references public.rutinas (id) on delete cascade,
  ejercicio_id text not null references public.ejercicios (id) on delete restrict,
  orden smallint not null check (orden >= 0),
  series smallint not null default 3 check (series > 0),
  reps smallint not null default 10 check (reps > 0),
  -- 0 significa peso corporal; `fondos` llega con ese valor.
  carga_sugerida_kg numeric(5,1) not null default 0 check (carga_sugerida_kg >= 0),
  -- 75 / 90 / 120 segundos en los mocks.
  descanso_seg smallint not null default 90 check (descanso_seg >= 0),
  -- Marca previa mostrada en la sesion; se compara con el mejor series de la
  -- sesion para detectar records.
  record_previo_kg numeric(5,1) not null default 0 check (record_previo_kg >= 0),
  -- Texto de ejecucion que la sesion muestra bajo cada ejercicio.
  consejo text not null default '',
  unique (rutina_id, orden)
);

create index rutina_ejercicios_rutina_idx on public.rutina_ejercicios (rutina_id, orden);

comment on table public.rutina_ejercicios is
  'Prescripcion de cada ejercicio dentro de una rutina: series, reps, carga y descanso.';
comment on column public.rutina_ejercicios.record_previo_kg is
  'Marca previa mostrada al abrir la sesion. El record real vive en la sesion del usuario.';