-- FORMA · Base: extensiones, funciones auxiliares y tipos enumerados.
--
-- Convencion de nombres: todo en espanol snake_case. El cliente Flutter ya
-- consulta `perfiles` con las columnas `auth_id`, `altura_cm`,
-- `deporte_principal`, `nivel_experiencia` y `objetivo`, asi que el esquema
-- se escribe en esa lengua para no romperlo.

-- gen_random_uuid() y similiares viven en el esquema `extensions`.
create extension if not exists pgcrypto with schema extensions;
-- Busqueda difusa sobre el nombre de los alimentos.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

-- Trigger generico para mantener `updated_at`. Se aplica tabla por tabla.
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Identificador del usuario autenticado. Envolverlo permite no repetir
-- `auth.uid()` en cada politica y mantener el search_path vacio.
create or replace function public.usuario_actual()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid();
$$;

-- El nombre de la aplicacion va en la cabecera para que Studio lo muestre.
create or replace function public.saludar()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'FORMA'::text;
$$;

comment on function public.saludar() is 'Marca de agua del proyecto; no aporta datos.';

-- ---------------------------------------------------------------------------
-- Enumerados
--
-- `nivel_experiencia`, `deporte_principal` y `objetivo` conservan los valores
-- en ingles que los clientes ya envian ("intermediate", "strength",
-- "hypertrophy"). Renombrarlos obligaria a tocar ambos clientes a la vez, y
-- el coste de la incompatibilidad es mayor que el de la mezcla de idiomas.
-- Los enumerados nuevos usan castellano.
-- ---------------------------------------------------------------------------

-- Biometria y clasificacion del usuario.
create type public.sexo as enum ('femenino', 'masculino');

create type public.nivel_experiencia as enum (
  'beginner',
  'intermediate',
  'advanced'
);

create type public.deporte_principal as enum (
  'strength',
  'running',
  'crossfit',
  'other'
);

create type public.objetivo as enum (
  'hypertrophy',
  'fat-loss',
  'recomposition',
  'health'
);

-- El web app manda la disponibilidad como texto en castellano ("4 días") y
-- despues lo convierte con `Number.parseInt(availability, 10)`. Se guarda tal
-- cual para no romper ese parseo, pero como enumerado queda validado, y la
-- tabla perfil deriva de aqui el numero de dias.
create type public.disponibilidad as enum (
  '3 días',
  '4 días',
  '5 días',
  '6+ días'
);

-- Nutricion.
--
-- El web app usa los slugs ingleses `breakfast`/`lunch`/`dinner` y escribe
-- `snacks` en plural, mientras que FoodDetail manda etiquetas en castellano
-- ("Desayuno", "Almuerzo", "Cena", "Snack"). Aqui se fija el singular, que es
-- la forma que usan las demas tablas; el mapeo de etiquetas vive en el
-- cliente.
create type public.tipo_comida as enum (
  'breakfast',
  'lunch',
  'dinner',
  'snack'
);

-- Origen de una fila de catalogo: leida por el escaner o creada a mano.
create type public.fuente_alimento as enum ('ocr', 'manual');

-- Traduccion de la confianza del OCR a los tres textos que muestra la
-- pantalla de detalle de alimento.
create type public.nivel_confianza as enum ('alta', 'media', 'baja');

-- Entrenamiento.
--
-- `Web/Rutinas` guarda la intensidad como "Alta"/"Media"/"Baja" ya
-- capitalizadas. Se normaliza a minusculas aqui y las etiquetas se resuelven
-- en la interfaz.
create type public.intensidad as enum ('alta', 'media', 'baja');

-- Estado de una rutina para un usuario en una fecha concreta. No es propiedad
-- de la rutina: la misma rutina esta "programada" un dia y "completada" otro.
create type public.estado_rutina as enum ('completada', 'programada', 'descanso');

create type public.estado_sesion as enum (
  'en_curso',
  'pausada',
  'completada',
  'abandonada'
);

-- Progreso.
--
-- `onboarding` es la medida inicial que introduce el alta; `check_in` son las
-- semanales; `manual` las que corrige el usuario a mano.
create type public.origen_medicion as enum ('onboarding', 'check_in', 'manual');

-- Preferencias.
create type public.tema as enum ('dark', 'light');