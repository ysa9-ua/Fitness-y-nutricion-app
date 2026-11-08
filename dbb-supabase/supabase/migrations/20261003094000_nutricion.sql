-- FORMA · Nutricion: diario de comidas, alimentos, agua y escaneos.

-- ---------------------------------------------------------------------------
-- diario_comidas
--
-- Una fila por comida y por dia. El web app tiene cuatro comidas fijas con ids
-- en ingles (`breakfast`, `lunch`, `dinner`, `snacks`) y una quinta pantalla
-- de detalle que manda etiquetas en castellano ("Desayuno", "Almuerzo",
-- "Cena", "Snack"). Aqui se fija `tipo_comida` como clave real y el titulo
-- queda como texto libre.
-- ---------------------------------------------------------------------------
create table public.diario_comidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  tipo_comida public.tipo_comida not null,

  -- Etiqueta visible: "Desayuno", "Comida", "Cena", "Snacks".
  titulo text not null,

  -- Nombre de icono de Icon.tsx. Se guarda porque cada comida del mock tiene
  -- uno propio (sun, leaf, moon, sparkles).
  icono text not null default 'sparkles',

  -- Hora en que se registro. NULL cuando la comida aun no se ha hecho: el web
  -- usa el texto "Pendiente", que no es una hora y no cabe en una columna
  -- `time`.
  hora time,

  -- Totales de la comida, ya agregados.
  kcal smallint not null default 0 check (kcal >= 0),
  proteinas_g numeric(6,1) not null default 0 check (proteinas_g >= 0),
  carbohidratos_g numeric(6,1) not null default 0 check (carbohidratos_g >= 0),
  grasas_g numeric(6,1) not null default 0 check (grasas_g >= 0),

  -- false mientras la comida esta vacia. Las cifras de arriba se recalculan
  -- desde `diario_alimentos` en el trigger de esta tabla.
  completada boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Las cuatro comidas de un dia. Es lo que impide duplicar el desayuno.
  unique (usuario_id, fecha, tipo_comida)
);

create index diario_comidas_usuario_fecha_idx
  on public.diario_comidas (usuario_id, fecha desc, tipo_comida);

create trigger diario_comidas_tocar_updated_at
  before update on public.diario_comidas
  for each row execute function public.tocar_updated_at();

comment on table public.diario_comidas is
  'Comidas de un dia. Los totales se derivan de diario_alimentos; no se escriben a mano.';
comment on column public.diario_comidas.hora is
  'NULL si la comida no se ha registrado. El web muestra "Pendiente" cuando lo es.';
comment on column public.diario_comidas.completada is
  'true cuando tiene al menos un alimento. Lo fija el trigger de totalizacion.';

-- ---------------------------------------------------------------------------
-- diario_alimentos
--
-- Cada linea de una comida. Lleva `gramos` en numero (que FoodEntry ya
-- calcula) ademas del texto de cantidad ("200 g · 1 Bol"), porque el texto no se
-- puede sumar y el texto se deriva.
-- ---------------------------------------------------------------------------
create table public.diario_alimentos (
  id uuid primary key default gen_random_uuid(),
  comida_id uuid not null references public.diario_comidas (id) on delete cascade,

  -- Vinculo opcional con el catalogo. Se deja nullable porque el escaner crea
  -- alimentos que todavia no estan en `alimentos`.
  alimento_id uuid references public.alimentos (id) on delete set null,

  -- Copia del nombre, para que el diario sobreviva a un borrado del catalogo.
  nombre text not null check (length(btrim(nombre)) >= 1),

  -- Como lo muestra el web app: "200 g · 1 Bol", "2 rebanadas".
  cantidad_texto text not null default '',

  -- Cantidad real en gramos, la que se usa para calcular. 0 significa que el
  -- usuario describio la racion en piezas ("2 huevos") y no aporto gramos.
  gramos numeric(6,1) not null default 0 check (gramos between 0 and 5000),

  -- Valores ya escalados a la racion consumida, no por 100 g.
  kcal smallint not null default 0 check (kcal >= 0),
  proteinas_g numeric(6,1) not null default 0 check (proteinas_g >= 0),
  carbohidratos_g numeric(6,1) not null default 0 check (carbohidratos_g >= 0),
  grasas_g numeric(6,1) not null default 0 check (grasas_g >= 0),

  -- Posicion dentro de la comida.
  orden smallint not null default 0,

  created_at timestamptz not null default now(),

  unique (comida_id, orden)
);

create index diario_alimentos_comida_idx on public.diario_alimentos (comida_id, orden);
create index diario_alimentos_alimento_idx on public.diario_alimentos (alimento_id)
  where alimento_id is not null;

comment on table public.diario_alimentos is
  'Lineas de una comida del diario. Los valores son por racion, no por 100 g.';

-- ---------------------------------------------------------------------------
-- Totalizacion de las comidas
--
-- Las cifras de `diario_comidas` se recalculan solas a partir de sus lineas.
-- Asi el cliente no puede dejar el padre desincronizado del hijo, que es lo
-- que pasa hoy: el total se pinta en la cabecera y el detalle se pinta aparte,
-- sin que nada obligue a que coincidan.
-- ---------------------------------------------------------------------------
create or replace function public.totalizar_comida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comida_id uuid := coalesce(new.comida_id, old.comida_id);
begin
  update public.diario_comidas c
  set kcal             = coalesce(t.kcal, 0)::smallint,
      proteinas_g      = coalesce(t.proteinas_g, 0),
      carbohidratos_g = coalesce(t.carbohidratos_g, 0),
      grasas_g         = coalesce(t.grasas_g, 0),
      completada       = coalesce(t.lineas, 0) > 0,
      updated_at       = now()
  from (
    select
      count(*)::int          as lineas,
      sum(a.kcal)             as kcal,
      sum(a.proteinas_g)      as proteinas_g,
      sum(a.carbohidratos_g)  as carbohidratos_g,
      sum(a.grasas_g)         as grasas_g
    from public.diario_alimentos a
    where a.comida_id = v_comida_id
  ) t
  where c.id = v_comida_id;

  return null;
end;
$$;

comment on function public.totalizar_comida() is
  'Recalcula los totales de la comida afectada tras insertar, editar o borrar una linea.';

create trigger diario_alimentos_totalizar
  after insert or update or delete on public.diario_alimentos
  for each row execute function public.totalizar_comida();

-- ---------------------------------------------------------------------------
-- registro_agua
--
-- El web lleva un contador con pasos de 250 ml y objetivo de 2000. Se guarda
-- por dia con clave compuesta en vez de un historico de eventos.
-- ---------------------------------------------------------------------------
create table public.registro_agua (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  ml integer not null default 0 check (ml >= 0),
  -- 2000 ml por defecto; el mismo objetivo de la pantalla.
  objetivo_ml integer not null default 2000 check (objetivo_ml > 0),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, fecha)
);

create trigger registro_agua_tocar_updated_at
  before update on public.registro_agua
  for each row execute function public.tocar_updated_at();

comment on table public.registro_agua is
  'Agua registrada por dia. Una fila por usuario y fecha.';

-- ---------------------------------------------------------------------------
-- escaneos_ocr
--
-- El escaner simula la deteccion con un temporizador y no devuelve nada a la
-- siguiente pantalla, que luego usa valores fijos. Esta tabla guarda cada
-- intento para que la confianza mostrada tenga respaldo.
-- ---------------------------------------------------------------------------
create table public.escaneos_ocr (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,

  --null cuando la deteccion no se guardo en el catalogo.
  alimento_id uuid references public.alimentos (id) on delete set null,

  -- Lo que el OCR leyo del cartel, antes de que el usuario lo corrigiera.
  nombre_detectado text not null,

  kcal_100g numeric(7,1) not null default 0 check (kcal_100g >= 0),
  proteinas_100g numeric(7,1) not null default 0 check (proteinas_100g >= 0),
  carbohidratos_100g numeric(7,1) not null default 0 check (carbohidratos_100g >= 0),
  grasas_100g numeric(7,1) not null default 0 check (grasas_100g >= 0),

  -- 0 a 100. Los umbrales de "alta"/"media"/"baja" son 90 y 70.
  confianza smallint not null default 0 check (confianza between 0 and 100),

  -- Traduccion de la confianza, para no repetir el CASE en cada cliente.
  nivel public.nivel_confianza generated always as (
    case
      when confianza >= 90 then 'alta'::public.nivel_confianza
      when confianza >= 70 then 'media'::public.nivel_confianza
      else 'baja'::public.nivel_confianza
    end
  ) stored,

  -- Ruta en el bucket `escaneos`.
  imagen_path text,

  -- true cuando el usuario confirmo la lectura y se guardo en el diario.
  confirmado boolean not null default false,

  created_at timestamptz not null default now()
);

create index escaneos_ocr_usuario_idx
  on public.escaneos_ocr (usuario_id, created_at desc);

comment on table public.escaneos_ocr is
  'Lecturas del escaner. `nivel` se deriva de `confianza` con los umbrales 90 y 70.';

-- ---------------------------------------------------------------------------
-- Anadir un alimento a una comida
--
-- FoodDetail.tsx construye el total multiplicando los valores por 100 g por
-- `gramos / 100`. Esa cuenta vive aqui para que el movil, la web y cualquier
-- otro cliente den el mismo numero.
--
-- Devuelve la fila creada en `diario_alimentos`.
-- ---------------------------------------------------------------------------
create or replace function public.anadir_alimento(
  p_comida_id uuid,
  p_alimento_id uuid,
  p_gramos numeric,
  p_cantidad_texto text default '',
  p_orden integer default null
)
returns public.diario_alimentos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alimento public.alimentos;
  v_orden integer;
  v_factor numeric;
  v_fila public.diario_alimentos;
begin
  select * into v_alimento from public.alimentos where id = p_alimento_id;

  if v_alimento.id is null then
    raise exception 'Alimento % no encontrado', p_alimento_id
      using errcode = 'no_data_found';
  end if;

  if p_gramos is null or p_gramos <= 0 then
    raise exception 'Los gramos deben ser mayores que cero'
      using errcode = 'check_violation';
  end if;

  -- Si no se indica posicion, la linea va al final de la comida.
  select coalesce(max(a.orden) + 1, 0) into v_orden
  from public.diario_alimentos a
  where a.comida_id = p_comida_id;

  v_factor := p_gramos / 100;

  insert into public.diario_alimentos (
    comida_id, alimento_id, nombre, cantidad_texto, gramos,
    kcal, proteinas_g, carbohidratos_g, grasas_g, orden
  )
  values (
    p_comida_id,
    p_alimento_id,
    v_alimento.nombre,
    coalesce(nullif(p_cantidad_texto, ''), round(p_gramos)::text || ' g'),
    p_gramos,
    round(v_alimento.kcal_100g * v_factor)::smallint,
    round(v_alimento.proteinas_100g * v_factor, 1),
    round(v_alimento.carbohidratos_100g * v_factor, 1),
    round(v_alimento.grasas_100g * v_factor, 1),
    coalesce(p_orden, v_orden)
  )
  returning * into v_fila;

  return v_fila;
end;
$$;