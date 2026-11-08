-- FORMA · Progreso: serie de medidas, check-ins semanales y fotos.

-- ---------------------------------------------------------------------------
-- mediciones_progreso
--
-- Es la serie que dibuja la pantalla de Progreso. En el web hoy es un literal
-- (`chartData` en Progress.tsx) con cinco o seis puntos por rango; aqui se
-- guarda una fila por fecha y los rangos "1M", "3M", "6M" y "1A" salen de un
-- filtro por fechas.
-- ---------------------------------------------------------------------------
create table public.mediciones_progreso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  peso_kg numeric(5,2) not null check (peso_kg between 30 and 250),
  grasa_corporal_pct numeric(4,1) check (grasa_corporal_pct between 3 and 70),
  -- El web app enseña una tarjeta de Cintura en 70,8 cm que no venia de
  -- ninguna parte; el check-in semanal es lo que la alimenta.
  cintura_cm numeric(5,2) check (cintura_cm between 40 and 180),
  -- 0 = peso corporal, 1 = lastrado.
  pesado smallint check (pesado between 0 and 1),
  origen public.origen_medicion not null default 'manual',
  nota text,
  created_at timestamptz not null default now(),

  -- Una medida por dia. El upsert del check-in semanal depende de esto.
  unique (usuario_id, fecha)
);

create index mediciones_usuario_fecha_idx
  on public.mediciones_progreso (usuario_id, fecha desc);

comment on table public.mediciones_progreso is
  'Serie historica de peso y perimetros. Es la unica fuente de verdad de los graficos de progreso.';
comment on column public.mediciones_progreso.fecha is
  'Fecha de la medida, no de la insercion. Un dia puede reescribirse con un upsert.';

-- ---------------------------------------------------------------------------
-- check_ins
--
-- El check-in semanal recoge peso, cintura, cadera y cuello. El manejador del
-- web app solo conservaba el peso y tiraba el resto, y las tres fotos se
-- quedaban en estado local sin llegar a ninguna parte.
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  -- Numero de semana del plan, 1 a 12 segun `TOTAL_WEEKS` en el web.
  semana smallint not null check (semana between 1 and 52),
  fecha date not null,
  peso_kg numeric(5,2) not null check (peso_kg between 30 and 250),
  cintura_cm numeric(5,2) check (cintura_cm between 40 and 180),
  cadera_cm numeric(5,2) check (cadera_cm between 50 and 180),
  cuello_cm numeric(5,2) check (cuello_cm between 20 and 70),

  -- Copia del peso del dia 1 en el momento del check-in. Se desnormaliza a
  -- proposito: el delta que se muestra es siempre contra esa linea base, y si
  -- el usuario corrige despues su peso inicial no debe reescribir la
  -- historia.
  peso_dia1_kg numeric(5,2) not null check (peso_dia1_kg between 30 and 250),

  -- 0 a 3, una por ranura (frontal, lateral, trasera).
  fotos_completas smallint not null default 0 check (fotos_completas between 0 and 3),

  -- El modal se abre solo pasado el plazo; queda constancia de si el registro
  -- fue espontaneo o forzado por el aviso.
  obligatorio boolean not null default false,

  created_at timestamptz not null default now(),

  unique (usuario_id, semana)
);

create index check_ins_usuario_fecha_idx
  on public.check_ins (usuario_id, fecha desc);

comment on table public.check_ins is
  'Registro semanal de medidas. Una fila por semana del plan.';
comment on column public.check_ins.peso_dia1_kg is
  'Linea base congelada en el momento del registro; el delta se calcula contra este valor.';

-- ---------------------------------------------------------------------------
-- fotos_progreso
--
-- El onboarding y el check-in toman tres fotos en base64 y las meten en el
-- objeto de perfil, que al serializar las descarta. Una cadena base64 no cabe
-- en una columna sensata, asi que van a Supabase Storage y aqui solo queda la
-- ruta.
-- ---------------------------------------------------------------------------
create table public.fotos_progreso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,

  -- Foto de onboarding, de un check-in, o suelta.
  check_in_id uuid references public.check_ins (id) on delete cascade,
  -- Continuidad con la serie de medidas cuando la foto no viene de un
  -- check-in.
  fecha date not null,

  -- 0 = frontal, 1 = lateral, 2 = trasera.
  ranura smallint not null check (ranura between 0 and 2),

  -- Ruta dentro del bucket `fotos-progreso`. No una URL: el bucket es privado
  -- y las URLs firmadas caducan.
  storage_path text not null,

  created_at timestamptz not null default now(),

  -- Una foto por ranura y fecha. Rehacer la foto sobrescribe la anterior.
  unique (usuario_id, fecha, ranura)
);

create index fotos_progreso_usuario_fecha_idx
  on public.fotos_progreso (usuario_id, fecha desc);
create index fotos_progreso_check_in_idx
  on public.fotos_progreso (check_in_id)
  where check_in_id is not null;

comment on table public.fotos_progreso is
  'Fotos de progreso en el bucket privado `fotos-progreso`. Solo se guarda la ruta.';

-- ---------------------------------------------------------------------------
-- algoritmo_recalculos
--
-- El boton "Forzar recalculo" del perfil solo lanzaba un aviso. Con esta tabla
-- se puede auditar que resultado dio cada calculo de calorias.
-- ---------------------------------------------------------------------------
create table public.algoritmo_recalculos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  solicitado_en timestamptz not null default now(),
  -- Valores con los que se calculo, para reproducir el resultado.
  peso_kg numeric(5,2) not null,
  altura_cm smallint not null,
  edad smallint not null,
  sexo public.sexo not null,
  dias_semana smallint not null,
  objetivo public.objetivo not null,
  -- Tdee resultante, redondeado a decenas como hace el cliente.
  kcal_resultantes smallint not null,
  aplicado boolean not null default false
);

create index algoritmo_recalculos_usuario_idx
  on public.algoritmo_recalculos (usuario_id, solicitado_en desc);

comment on table public.algoritmo_recalculos is
  'Historial de recálculos de calorías. Permite reconstruir por qué el objetivo del usuario cambió.';

-- ---------------------------------------------------------------------------
-- Calculo de dias hasta el proximo check-in
--
-- El web app guardaba la fecha del ultimo check-in como epoch en milisegundos
-- en localStorage y comparaba contra 7 dias. Con la tabla de check_ins se
-- deriva del dato real.
-- ---------------------------------------------------------------------------
create or replace function public.checkin_pendiente(p_usuario uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select max(c.fecha) from public.check_ins c where c.usuario_id = p_usuario) is null
    or current_date - (
      select max(c.fecha) from public.check_ins c where c.usuario_id = p_usuario
    ) >= 7
  , true);
$$;

comment on function public.checkin_pendiente(uuid) is
  'true si no hay check-in o han pasado 7 dias desde el ultimo.';