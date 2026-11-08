-- FORMA · Seguridad de filas (RLS) y permisos.
--
-- Regla general:
--   · Cada tabla de datos del usuario lleva `usuario_id` y solo su dueño la ve.
--   · Las tablas hijas sin `usuario_id` (lineas de comida, ejercicios de
--     sesion y series) heredan el permiso por EXISTS sobre la tabla padre.
--   · El catalogo (alimentos, ejercicios, planes, rutinas) es de lectura para
--     cualquier usuario autenticado y de escritura solo para el service_role,
--     que es lo unico que ejecutan las migraciones y Studio.
--
-- `anon` no recibe ningun permiso: sin sesion no hay nada que ver.

-- ---------------------------------------------------------------------------
-- Permisos base
-- ---------------------------------------------------------------------------

-- Lo que se puede leer/consultar: solo `authenticated`.
grant usage on schema public to authenticated;

-- Funciones de lectura y escritura que el cliente invoca por RPC.
grant execute on all functions in schema public to authenticated;

-- El catalogo tambien lo consulta anon en la practica (pantalla de alta de
-- alimento), pero se mantiene cerrado: sin sesion no se registra nada.

-- ---------------------------------------------------------------------------
-- Catalogo: lectura para todos los autenticados
-- ---------------------------------------------------------------------------

alter table public.alimentos              enable row level security;
alter table public.ejercicios            enable row level security;
alter table public.planes_entrenamiento  enable row level security;
alter table public.rutinas               enable row level security;
alter table public.rutina_ejercicios     enable row level security;

grant select on public.alimentos to authenticated;
grant select on public.ejercicios to authenticated;
grant select on public.planes_entrenamiento to authenticated;
grant select on public.rutinas to authenticated;
grant select on public.rutina_ejercicios to authenticated;

comment on table public.alimentos is
  'Catalogo. Cualquier usuario autenticado lo lee; solo el service_role lo escribe.';
comment on table public.rutinas is
  'Catalogo de rutinas. El estado por usuario vive en registro_rutinas_diarias.';

-- El permiso y la politica son cosas distintas: con RLS activada, `granted` sin
-- politica no deja pasar ni una fila. Hace falta una politica de solo lectura;
-- el INSERT/UPDATE/DELETE sigue bloqueado porque ninguna politica lo permite.
create policy alimentos_lectura on public.alimentos
  for select using (true);

create policy ejercicios_lectura on public.ejercicios
  for select using (true);

create policy planes_lectura on public.planes_entrenamiento
  for select using (true);

create policy rutinas_lectura on public.rutinas
  for select using (true);

create policy rutina_ejercicios_lectura on public.rutina_ejercicios
  for select using (true);

-- La escritura queda para service_role, que la tiene por ser el propietario y
-- se salta el RLS. Ningun usuario autenticado puede tocar el catalogo.
grant all on public.alimentos             to service_role;
grant all on public.ejercicios           to service_role;
grant all on public.planes_entrenamiento to service_role;
grant all on public.rutinas              to service_role;
grant all on public.rutina_ejercicios    to service_role;

-- ---------------------------------------------------------------------------
-- Perfil y preferencias: solo la fila propia
-- ---------------------------------------------------------------------------

alter table public.perfiles             enable row level security;
alter table public.preferencias_usuario enable row level security;

grant select, insert, update, delete on public.perfiles to authenticated;
grant select, insert, update, delete on public.preferencias_usuario to authenticated;

create policy perfiles_solo_propio_select on public.perfiles
  for select using (auth_id = public.usuario_actual());

create policy perfiles_solo_propio_insert on public.perfiles
  for insert with check (auth_id = public.usuario_actual());

create policy perfiles_solo_propio_update on public.perfiles
  for update using (auth_id = public.usuario_actual())
  with check (auth_id = public.usuario_actual());

create policy perfiles_solo_propio_delete on public.perfiles
  for delete using (auth_id = public.usuario_actual());

create policy preferencias_solo_propia_select on public.preferencias_usuario
  for select using (usuario_id = public.usuario_actual());

create policy preferencias_solo_propia_insert on public.preferencias_usuario
  for insert with check (usuario_id = public.usuario_actual());

create policy preferencias_solo_propia_update on public.preferencias_usuario
  for update using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy preferencias_solo_propia_delete on public.preferencias_usuario
  for delete using (usuario_id = public.usuario_actual());

-- ---------------------------------------------------------------------------
-- Progreso
-- ---------------------------------------------------------------------------

alter table public.mediciones_progreso    enable row level security;
alter table public.check_ins             enable row level security;
alter table public.fotos_progreso        enable row level security;
alter table public.algoritmo_recalculos  enable row level security;

grant select, insert, update, delete on public.mediciones_progreso   to authenticated;
grant select, insert, update, delete on public.check_ins            to authenticated;
grant select, insert, update, delete on public.fotos_progreso       to authenticated;
grant select, insert, update, delete on public.algoritmo_recalculos to authenticated;

create policy mediciones_solo_propio on public.mediciones_progreso
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy check_ins_solo_propio on public.check_ins
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy fotos_solo_propias on public.fotos_progreso
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy recalculos_solo_propio on public.algoritmo_recalculos
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

-- ---------------------------------------------------------------------------
-- Nutricion
-- ---------------------------------------------------------------------------

alter table public.diario_comidas   enable row level security;
alter table public.diario_alimentos enable row level security;
alter table public.registro_agua    enable row level security;
alter table public.escaneos_ocr     enable row level security;

grant select, insert, update, delete on public.diario_comidas   to authenticated;
grant select, insert, update, delete on public.diario_alimentos to authenticated;
grant select, insert, update, delete on public.registro_agua    to authenticated;
grant select, insert, update, delete on public.escaneos_ocr     to authenticated;

create policy comidas_solo_propias on public.diario_comidas
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

-- Las lineas no llevan `usuario_id`: se heredan de la comida que las contiene.
-- El indice de `diario_comidas(usuario_id)` hace que el EXISTS sea barato.
create policy alimentos_solo_propios on public.diario_alimentos
  for all using (
    exists (
      select 1 from public.diario_comidas c
      where c.id = diario_alimentos.comida_id
        and c.usuario_id = public.usuario_actual()
    )
  )
  with check (
    exists (
      select 1 from public.diario_comidas c
      where c.id = diario_alimentos.comida_id
        and c.usuario_id = public.usuario_actual()
    )
  );

create policy agua_solo_propia on public.registro_agua
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy escaneos_solo_propios on public.escaneos_ocr
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

-- ---------------------------------------------------------------------------
-- Entrenamiento
-- ---------------------------------------------------------------------------

alter table public.registro_rutinas_diarias enable row level security;
alter table public.sesiones_entrenamiento  enable row level security;
alter table public.sesiones_ejercicios     enable row level security;
alter table public.sesiones_series         enable row level security;

grant select, insert, update, delete on public.registro_rutinas_diarias to authenticated;
grant select, insert, update, delete on public.sesiones_entrenamiento  to authenticated;
grant select, insert, update, delete on public.sesiones_ejercicios     to authenticated;
grant select, insert, update, delete on public.sesiones_series         to authenticated;

create policy registro_rutinas_solo_propio on public.registro_rutinas_diarias
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

create policy sesiones_solo_propias on public.sesiones_entrenamiento
  for all using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());

-- Los ejercicios de sesion heredan de la sesion; y sus series, de su ejercicio.
create policy sesiones_ejercicios_solo_propios on public.sesiones_ejercicios
  for all using (
    exists (
      select 1 from public.sesiones_entrenamiento s
      where s.id = sesion_id
        and s.usuario_id = public.usuario_actual()
    )
  )
  with check (
    exists (
      select 1 from public.sesiones_entrenamiento s
      where s.id = sesion_id
        and s.usuario_id = public.usuario_actual()
    )
  );

create policy sesiones_series_solo_propias on public.sesiones_series
  for all using (
    exists (
      select 1
      from public.sesiones_ejercicios e
      join public.sesiones_entrenamiento s on s.id = e.sesion_id
      where e.id = sesion_ejercicio_id
        and s.usuario_id = public.usuario_actual()
    )
  )
  with check (
    exists (
      select 1
      from public.sesiones_ejercicios e
      join public.sesiones_entrenamiento s on s.id = e.sesion_id
      where e.id = sesion_ejercicio_id
        and s.usuario_id = public.usuario_actual()
    )
  );

-- ---------------------------------------------------------------------------
-- Disponibilidad del nombre de usuario
--
-- `nombre_usuario` es unico en toda la tabla, pero las politivas de `perfiles`
-- impiden leer los perfiles ajenos, asi que un usuario no puede comprobar si un
-- alias esta libre: la comprobacion solo puede hacerse en servidor.
-- Esta funcion responde si/no sin revelar de quien es el alias.
-- ---------------------------------------------------------------------------
create or replace function public.nombre_usuario_disponible(p_nombre text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    return false;
  end if;

  return not exists (
    select 1 from public.perfiles p where p.nombre_usuario = lower(btrim(p_nombre))
  );
end;
$$;

comment on function public.nombre_usuario_disponible(text) is
  'true si el alias esta libre. SECURITY DEFINER porque el usuario no puede leer los perfiles ajenos para comprobarlo.';