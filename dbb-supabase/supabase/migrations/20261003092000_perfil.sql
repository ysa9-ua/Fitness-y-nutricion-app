-- FORMA · Perfil del usuario y sus preferencias.
--
-- `perfiles` es la tabla que el cliente Flutter ya upserta
-- (forma/lib/data/store.dart). Su columna `auth_id` es clave primaria y hace
-- falta que sea unica de forma explicita: el cliente la usa tanto en
-- `.single()` como en `onConflict: 'auth_id'`.

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------
create table public.perfiles (
  -- Clave primaria y a la vez clave foranea al usuario de Auth. Que sea la PK
  -- garantiza la unicidad que el cliente necesita para su upsert.
  auth_id uuid primary key references auth.users (id) on delete cascade,

  -- Identidad visible. El web app tiene "Lucía Martínez" y el alias "@lucia"
  -- hardcodeados en siete pantallas; en cuanto exista aqui, sale de la tabla.
  nombre_completo text,
  nombre_usuario text unique
    check (nombre_usuario is null or nombre_usuario = lower(btrim(nombre_usuario))
           and nombre_usuario ~ '^[a-z0-9_.]{3,30}$'),
  avatar_url text,

  -- Biometria del paso 1 del onboarding.
  --
  -- `sexo` no se guardaba en ningun sitio pese a que condiciona el calculo de
  -- calorias y la estimacion de grasa. `altura_cm`, `nivel_experiencia`,
  -- `deporte_principal` y `objetivo` son las cinco columnas que el cliente
  -- Flutter ya envia.
  sexo public.sexo not null default 'femenino',
  edad smallint not null default 29 check (edad between 16 and 90),
  altura_cm smallint not null default 168 check (altura_cm between 140 and 230),
  peso_kg numeric(5,2) not null default 63.20 check (peso_kg between 35 and 250),
  -- Peso con el que empezo el usuario; es la referencia del progreso y la del
  -- check-in del dia 1. Onboarding lo deja opcional y el resto de pantallas
  -- recurren a `peso_kg` cuando falta.
  peso_inicial_kg numeric(5,2) check (peso_inicial_kg between 35 and 250),
  peso_objetivo_kg numeric(5,2) check (peso_objetivo_kg between 35 and 250),
  grasa_corporal_pct numeric(4,1) check (grasa_corporal_pct between 3 and 70),

  -- Perimetros del paso 1. El web app los midia, los perdia al montar el
  -- objeto de perfil y luego fijaba a mano 72/92/31 como linea base del
  -- check-in. Aqui se guardan de verdad.
  cuello_cm numeric(5,2) check (cuello_cm between 20 and 70),
  cintura_cm numeric(5,2) check (cintura_cm between 40 and 180),
  cadera_cm numeric(5,2) check (cadera_cm between 50 and 180),

  -- Clasificacion elegida en el onboarding.
  nivel_experiencia public.nivel_experiencia not null default 'intermediate',
  deporte_principal public.deporte_principal not null default 'strength',
  disponibilidad public.disponibilidad not null default '4 días',
  objetivo public.objetivo not null default 'hypertrophy',

  -- Derivado de `disponibilidad` para que el calculo de calorias no tenga que
  -- interpretar texto. "6+ días" se guarda como 6, que es lo que usa el
  -- factor de actividad del web app.
  dias_semana smallint generated always as (
    case disponibilidad
      when '3 días' then 3
      when '4 días' then 4
      when '5 días' then 5
      when '6+ días' then 6
    end
  ) stored,

  -- Resultado de Mifflin-St Jeor mas el ajuste por objetivo. El cliente lo
  -- calcula en local; aqui queda el valor con el que se genero el plan, para
  -- poder auditarlo cuando el usuario pulse "Forzar recalculo".
  calorias_objetivo smallint not null default 2320 check (calorias_objetivo >= 1200),

  -- Momento en que se acepto el aviso legal. El checkbox del disclaimer no se
  -- guardaba en ningun sitio.
  consentimiento_aviso timestamptz,

  -- true cuando el onboarding llega a completarse. Hasta entonces el perfil
  -- existe pero incompleto.
  onboarding_completado boolean not null default false,

  -- Momento de alta. Lo muestra "Miembro desde marzo de 2026".
  miembro_desde timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- El peso objetivo no puede estar por encima del inicial si se pide
  -- perdida, pero el onboarding fija valores absolutos; se deja pasar y lo
  -- valida la RPC de recalculo.
  constraint perfiles_peso_objetivo_logico check (
    peso_objetivo_kg is null or peso_inicial_kg is null
    or peso_objetivo_kg <= peso_inicial_kg + 5
  )
);

create trigger perfiles_tocar_updated_at
  before update on public.perfiles
  for each row execute function public.tocar_updated_at();

-- El listado del perfil es por nombre.
create index perfiles_nombre_usuario_idx
  on public.perfiles (nombre_usuario)
  where nombre_usuario is not null;

comment on table public.perfiles is
  'Datos del usuario, uno por cuenta de Auth. Las columnas que envia store.dart son auth_id, altura_cm, deporte_principal, nivel_experiencia y objetivo.';
comment on column public.perfiles.dias_semana is
  'Numero de dias a la semana derivado de `disponibilidad`. Columna generada: no se escribe.';
comment on column public.perfiles.peso_inicial_kg is
  'Referencia del progreso. Si es NULL, el progreso usa `peso_kg` como dia 1.';
comment on column public.perfiles.calorias_objetivo is
  'Tdee del usuario al subir o bajar el peso. Se recalcula con la RPC de objetivo.';

-- ---------------------------------------------------------------------------
-- preferencias_usuario
--
-- Sustituye a las claves `forma:theme` y `forma:notifications` del
-- localStorage. El aviso local sigue haciendo falta para arrancar sin red, pero
-- el valor autoritativo vive aqui.
-- ---------------------------------------------------------------------------
create table public.preferencias_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,

  -- El sitio declara un conmutador de tema claro que en la practica no cambia
  -- ningun token; se guarda igualmente para no perder la preferencia.
  tema public.tema not null default 'dark',
  notificaciones boolean not null default true,
  -- "Recordatorios de entrenamiento": avisar 30 min antes de cada rutina.
  notificar_rutinas boolean not null default true,
  -- El badge "Todos los lunes a las 08:00" del menu de ajustes.
  checkin_semanal boolean not null default true,

  -- Sustituye a `forma:last-check-in`. Al ser timestamptz se compara en
  -- cualquier formato, en lugar de epoch en miliseganos como string.
  ultimo_checkin timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger preferencias_tocar_updated_at
  before update on public.preferencias_usuario
  for each row execute function public.tocar_updated_at();

comment on table public.preferencias_usuario is
  'Preferencias del cliente: tema, avisos y fecha del ultimo check-in.';

-- ---------------------------------------------------------------------------
-- Alta automatica de perfil y preferencias
--
-- El cliente Flutter inserta con upsert, pero la web hara inserts simples
-- segun donde se corte la sesion. Este trigger evita el fallo por tabla vacia y
-- ademas fija el nombre que el usuario escribio en el registro.
-- ---------------------------------------------------------------------------
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- El consentimiento viaja como texto en `raw_user_meta_data` porque el
  -- registro ocurre antes de que exista el perfil. Se convierte a timestamptz
  -- aqui; si viene vacio, el perfil nace sin consentimiento registrado.
  insert into public.perfiles (auth_id, nombre_completo, consentimiento_aviso)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'consentimiento_aviso', '')), '')::timestamptz
  )
  on conflict (auth_id) do nothing;

  insert into public.preferencias_usuario (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;

  return new;
end;
$$;

comment on function public.crear_perfil_al_registrarse() is
  'Crea perfiles y preferencias al registrarse. SECURITY DEFINER porque la insercion en auth no viene de un rol con permisos sobre public.';

create trigger auth_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();