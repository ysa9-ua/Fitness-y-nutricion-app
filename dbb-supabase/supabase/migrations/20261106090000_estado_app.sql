-- FORMA · Estado sincronizado del shell.
--
-- El diario, las comidas propias, los pesos, los favoritos y los alimentos
-- propios del usuario se guardan como un unico documento JSONB por cuenta. El
-- esquema normalizado sigue existiendo para los datos que ya consumen otras
-- pantallas (perfiles, mediciones, entrenamiento), pero este documento evita
-- una migracion por cada lista que el shell guarda en local.
--
-- El cliente escribe siempre la fila completa y lleva su propia copia en
-- localStorage como cache; al arrancar sin red sigue funcionando y empuja los
-- cambios pendientes cuando vuelve la conexion.

create table public.estado_app (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

comment on table public.estado_app is
  'Documento de estado del shell (diario, comidas, pesos, favoritos y alimentos propios) por usuario.';

alter table public.estado_app enable row level security;

grant select, insert, update, delete on public.estado_app to authenticated;

create policy estado_app_lectura on public.estado_app
  for select using (auth.uid() = usuario_id);

create policy estado_app_alta on public.estado_app
  for insert with check (auth.uid() = usuario_id);

create policy estado_app_actualizacion on public.estado_app
  for update using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

create policy estado_app_borrado on public.estado_app
  for delete using (auth.uid() = usuario_id);
