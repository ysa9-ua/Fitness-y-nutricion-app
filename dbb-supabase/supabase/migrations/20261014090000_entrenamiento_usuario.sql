-- FORMA · Rutinas y plan semanal del usuario.
--
-- El catalogo (`planes_entrenamiento`, `rutinas`, `rutina_ejercicios` y
-- `ejercicios`) nacio como contenido global de solo lectura: lo siembra una
-- migracion y ningun cliente lo escribe. Eso vale para el plan curado de FORMA,
-- pero el cliente de entrenamiento (FORMA) deja al usuario crear sus propias
-- rutinas y repartirlas por la semana.
--
-- Esta migracion anade una segunda capa sobre esas tablas: filas propiedad de un
-- usuario (`usuario_id`), para que sus rutinas viajen a Supabase y las vea
-- cualquier otro cliente (Flutter ya lee `semana_entrenamiento`).
--
--   · `usuario_id IS NULL`      = fila del catalogo, visible para todos.
--   · `usuario_id = usuario()`  = fila del usuario: solo la ve y la toca el.
--
-- `semana_entrenamiento` prefiere el plan propio; si el usuario no tiene ninguno,
-- devuelve el del catalogo. Asi un usuario que nunca ha tocado el plan sigue
-- viendo el curado.

-- ---------------------------------------------------------------------------
-- Propiedad
-- ---------------------------------------------------------------------------
alter table public.planes_entrenamiento
  add column usuario_id uuid references auth.users (id) on delete cascade;

comment on column public.planes_entrenamiento.usuario_id is
  'NULL en el plan del catalogo; el dueno cuando el plan lo creo un usuario.';

create index planes_usuario_idx
  on public.planes_entrenamiento (usuario_id, dia_semana)
  where usuario_id is not null;

-- La unicidad pasa a ser por ambito. Se parte en indices parciales porque en
-- Postgres los NULL no chocan entre si: con un unico `unique (usuario_id,
-- dia_semana, fase)` el catalogo admitiria planes duplicados para el mismo dia.
alter table public.planes_entrenamiento
  drop constraint planes_entrenamiento_dia_semana_fase_key;
drop index public.planes_dia_fase_activo_idx;

create unique index planes_catalogo_dia_fase_idx
  on public.planes_entrenamiento (dia_semana, fase)
  where usuario_id is null;
create unique index planes_catalogo_activo_idx
  on public.planes_entrenamiento (dia_semana, fase)
  where activo and usuario_id is null;
-- Solo se exige unicidad entre las filas activas: un dia sin rutina se marca
-- `activo = false` (soft-delete, para no arrastrar el historial), y al volver a
-- asignarlo se crea una fila nueva sin chocar con la inactiva. Si el indice
-- cubriera tambien las inactivas, reasignar un dia que se dejo atras fallaria.
create unique index planes_usuario_activo_idx
  on public.planes_entrenamiento (usuario_id, dia_semana, fase)
  where activo and usuario_id is not null;

comment on index public.planes_usuario_activo_idx is
  'Un solo plan activo por usuario y dia de la semana.';

-- ---------------------------------------------------------------------------
-- Permisos y RLS
--
-- Se dan los permisos de escritura, pero quien decide fila a fila es la
-- politica: un usuario solo escribe filas suyas. El catalogo sigue intocable
-- desde el cliente (sus filas no son suyas).
-- ---------------------------------------------------------------------------
grant insert, update, delete on public.planes_entrenamiento to authenticated;
grant insert, update, delete on public.rutinas              to authenticated;
grant insert, update, delete on public.rutina_ejercicios    to authenticated;

drop policy planes_lectura on public.planes_entrenamiento;
create policy planes_lectura on public.planes_entrenamiento
  for select using (
    usuario_id is null or usuario_id = public.usuario_actual()
  );
create policy planes_propios_insert on public.planes_entrenamiento
  for insert with check (usuario_id = public.usuario_actual());
create policy planes_propios_update on public.planes_entrenamiento
  for update using (usuario_id = public.usuario_actual())
  with check (usuario_id = public.usuario_actual());
create policy planes_propios_delete on public.planes_entrenamiento
  for delete using (usuario_id = public.usuario_actual());

-- Las rutinas no llevan `usuario_id`: su dueno es el del plan. La politica
-- hereda por `plan_id` para no duplicar la columna.
drop policy rutinas_lectura on public.rutinas;
create policy rutinas_lectura on public.rutinas
  for select using (
    exists (
      select 1 from public.planes_entrenamiento p
      where p.id = plan_id
        and (p.usuario_id is null or p.usuario_id = public.usuario_actual())
    )
  );
create policy rutinas_propias_insert on public.rutinas
  for insert with check (
    exists (
      select 1 from public.planes_entrenamiento p
      where p.id = plan_id and p.usuario_id = public.usuario_actual()
    )
  );
create policy rutinas_propias_update on public.rutinas
  for update using (
    exists (
      select 1 from public.planes_entrenamiento p
      where p.id = plan_id and p.usuario_id = public.usuario_actual()
    )
  ) with check (
    exists (
      select 1 from public.planes_entrenamiento p
      where p.id = plan_id and p.usuario_id = public.usuario_actual()
    )
  );
create policy rutinas_propias_delete on public.rutinas
  for delete using (
    exists (
      select 1 from public.planes_entrenamiento p
      where p.id = plan_id and p.usuario_id = public.usuario_actual()
    )
  );

-- La prescripcion hereda de la rutina, y esta del plan.
drop policy rutina_ejercicios_lectura on public.rutina_ejercicios;
create policy rutina_ejercicios_lectura on public.rutina_ejercicios
  for select using (
    exists (
      select 1
      from public.rutinas r
      join public.planes_entrenamiento p on p.id = r.plan_id
      where r.id = rutina_id
        and (p.usuario_id is null or p.usuario_id = public.usuario_actual())
    )
  );
create policy rutina_ejercicios_propios_insert on public.rutina_ejercicios
  for insert with check (
    exists (
      select 1
      from public.rutinas r
      join public.planes_entrenamiento p on p.id = r.plan_id
      where r.id = rutina_id and p.usuario_id = public.usuario_actual()
    )
  );
create policy rutina_ejercicios_propios_update on public.rutina_ejercicios
  for update using (
    exists (
      select 1
      from public.rutinas r
      join public.planes_entrenamiento p on p.id = r.plan_id
      where r.id = rutina_id and p.usuario_id = public.usuario_actual()
    )
  ) with check (
    exists (
      select 1
      from public.rutinas r
      join public.planes_entrenamiento p on p.id = r.plan_id
      where r.id = rutina_id and p.usuario_id = public.usuario_actual()
    )
  );
create policy rutina_ejercicios_propios_delete on public.rutina_ejercicios
  for delete using (
    exists (
      select 1
      from public.rutinas r
      join public.planes_entrenamiento p on p.id = r.plan_id
      where r.id = rutina_id and p.usuario_id = public.usuario_actual()
    )
  );

-- ---------------------------------------------------------------------------
-- Ejercicios a los que apunta una rutina
--
-- El catalogo de FORMA va sembrado, pero el usuario puede crear ejercicios
-- propios en su dispositivo. Esos no existen en `ejercicios` y `rutina_ejercicios`
-- los rechazaria por clave foranea. Este RPC los da de alta, y solo si faltan:
-- no puede modificar ni borrar el catalogo compartido. Definido por el dueno
-- para que el cliente no necesite permiso de escritura sobre `ejercicios`.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_catalogo_ejercicios(p_ejercicios jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insertados integer;
begin
  if public.usuario_actual() is null then
    raise exception 'Se requiere sesion iniciada'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.ejercicios (id, nombre, musculo, icono, grupo_muscular)
  select
    e->>'id',
    coalesce(nullif(btrim(e->>'nombre'), ''), e->>'id'),
    coalesce(btrim(e->>'musculo'), ''),
    coalesce(nullif(btrim(e->>'icono'), ''), 'dumbbell'),
    coalesce(nullif(btrim(e->>'grupo_muscular'), ''), 'full_body')
  from jsonb_array_elements(coalesce(p_ejercicios, '[]'::jsonb)) as e
  where e->>'id' ~ '^[a-z0-9-]{2,40}$'
  on conflict (id) do nothing;

  get diagnostics v_insertados = row_count;
  return v_insertados;
end;
$$;

comment on function public.upsert_catalogo_ejercicios(jsonb) is
  'Da de alta en `ejercicios` los ejercicios que falten (los propios del usuario). Solo inserta.';

-- ---------------------------------------------------------------------------
-- Semana de entrenamiento
--
-- Misma rejilla que antes, pero el plan del dia pasa a ser el del usuario si lo
-- tiene. Se decide una vez por usuario (`v_personal`): si ha definido cualquier
-- plan propio, se usa el suyo para toda la semana y los dias que no haya
-- definido salen como descanso, que es como los ve FORMA. Si no tiene ninguno,
-- se sirve el catalogo entero.
--
-- Cada rutina gana `plan_id` y `propio`, que es lo que el cliente necesita para
-- saber si lo que ve es suyo (y por tanto editable) o del catalogo.
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
  v_personal boolean;
begin
  -- Si hay una sesion a medias, se marca para que la app la pueda recuperar.
  select s.id into v_sesion
  from public.sesiones_entrenamiento s
  where s.usuario_id = v_usuario
    and s.estado = 'en_curso'
  order by s.iniciada_at desc
  limit 1;

  v_personal := exists (
    select 1 from public.planes_entrenamiento p
    where p.usuario_id = v_usuario and p.activo
  );

  return jsonb_build_object(
    'lunes', v_lunes,
    'domingo', v_lunes + 6,
    'sesion_en_curso', v_sesion,
    'personal', v_personal,
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
                'plan_id', r.plan_id,
                'propio', pl.usuario_id is not null,
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
      left join lateral (
        select p.id, p.titulo, p.titulo_corto, p.usuario_id
        from public.planes_entrenamiento p
        where p.dia_semana = extract(isodow from d.dia)::int
          and p.activo
          and (
            p.usuario_id = v_usuario
            or (not v_personal and p.usuario_id is null)
          )
        order by p.fase desc
        limit 1
      ) pl on true
    )
  );
end;
$$;

comment on function public.semana_entrenamiento(date) is
  'Rejilla de la semana con las rutinas y el estado de cada una. Usa el plan del usuario si lo tiene y, si no, el catalogo.';
