-- FORMA · Comprobacion del aislamiento entre usuarios.
--
-- Crea dos usuarios de prueba, escribe datos con el primero y verifica que el
-- segundo no ve nada. Es la garantia de que el RLS hace su trabajo.
--
-- Detalle importante: `pg_prove` conecta como `postgres`, que es superusuario
-- y por tanto se salta el RLS. Para que las politicas se apliquen de verdad, la
-- parte del test que consulta datos se ejecuta con `set local role
-- authenticated`. Sin eso, las comprobaciones darian verde sin comprobar nada.
--
-- Los usuarios se crean antes, como `postgres`, porque `auth.users` no es
-- accesible para el rol de la aplicacion.

begin;

-- pgTAP hace falta para que `pg_prove` cuente las comprobaciones. Vive en el
-- esquema `extensions` porque ahi es donde se instalan las extensiones.
create extension if not exists pgtap with schema extensions;

-- El numero de comprobaciones depende de como se rellene el catalogo, asi que
-- se usa `no_plan()` en lugar de un `plan()` fijo.
select no_plan();

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function test_crear_usuario(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- `extensions.` es explicito porque la funcion se declara con el
  -- `search_path` vacio, y ahi no se resuelve el nombre corto.
  -- `auth.users` tampoco tiene valor por defecto en `id`.
  insert into auth.users (
    instance_id, id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    p_email,
    extensions.crypt('forma2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- `ok()` de pgTAP: cada comprobacion cuenta como un test, y un `false` aborta
-- el fichero con el motivo. `no_plan()` evita tener que contar de antemano las
-- comprobaciones de un bloque que depende del estado.
-- pgTAP devuelve la linea TAP como valor de retorno. Aqui las comprobaciones
-- viven dentro de bloques `do`, donde el valor se pierde, asi que se guarda
-- cada linea en una tabla temporal y `test_tap_salida` la imprime al final.
-- Un `false` aborta el fichero con el motivo, en vez de acumular el fallo.
create temporary table _tap (
  n serial primary key,
  linea text not null
) on commit drop;

-- `SECURITY DEFINER` porque los bloques `do` corren con `set local role
-- authenticated`, que no tiene permiso sobre la tabla temporal.
create or replace function test_assert(p_condicion boolean, p_mensaje text)
returns void
language plpgsql
security definer
as $$
begin
  -- `pg_temp.` es explicito porque el nombre temporal depende de la sesion.
  -- El `search_path` se deja por defecto a proposito: pgTAP se llama a si
  -- misma con nombres sin calificar (`_todo`, `_get`) y un `search_path` vacio
  -- las haria irresolubles.
  insert into pg_temp._tap (linea)
  values (extensions.ok(coalesce(p_condicion, false), p_mensaje));

  if p_condicion is not true then
    raise exception 'FALLO: %', p_mensaje;
  end if;
end;
$$;

-- El plan TAP va al final del fichero, despues de todos los `ok`, y la
-- numeracion sale de `_tap` en vez de la de pgTAP.
--
-- Motivo: `pg_prove` ejecuta los tres ficheros en la misma sesion de psql, y el
-- contador de pgTAP vive en tablas temporales que sobreviven entre ficheros. Si
-- se usara el suyo, el segundo fichero empezaria en 32 y `pg_prove` lo
-- detectaria como "tests out of sequence". Renumerando aqui, cada fichero
-- empieza en 1.
create or replace function test_tap_salida()
returns setof text
language plpgsql
as $$
declare
  v_total integer;
begin
  select count(*) into v_total from pg_temp._tap;

  -- pgTAP devuelve lineas `ok N - descripcion`, y sus comentarios de diagnostico
  -- empiezan por `# `. Se reescribe solo el numero de la primera linea, que es
  -- el que `pg_prove` lee como secuencia.
  return query
    select regexp_replace(
      replace(linea, chr(10), ' ' || chr(10)),
      '^ok [0-9]+',
      'ok ' || n
    )
    from pg_temp._tap
    order by n;

  return next '1..' || v_total;
end;
$$;

-- El RLS se evalua contra `auth.uid()`, que lee de `request.jwt.claims`.
create or replace function test_como(p_usuario uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario)::text, true);
end;
$$;

-- Cambia al rol de la aplicacion para que el RLS entre en juego.
create or replace function test_como_app()
returns void
language plpgsql
as $$
begin
  execute 'set local role authenticated';
end;
$$;

create or replace function test_como_dios()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
end;
$$;

do $$
declare
  v_alice  uuid;
  v_bob    uuid;
  v_comida uuid;
  v_vistos    integer;
  v_filas     integer;
  v_kcal      integer;
  v_peso      numeric;
  v_bloqueado boolean;
begin
  -- --- Preparacion, como superusuario --------------------------------
  v_alice := test_crear_usuario('alice@forma.test');
  v_bob   := test_crear_usuario('bob@forma.test');

  perform test_assert(
    exists (select 1 from public.perfiles where auth_id = v_alice),
    'el trigger crea el perfil al registrarse'
  );
  perform test_assert(
    exists (select 1 from public.preferencias_usuario where usuario_id = v_alice),
    'el trigger crea las preferencias al registrarse'
  );

  -- --- Alice escribe una comida con una linea ------------------------
  perform test_como(v_alice);
  perform test_como_app();

  insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo)
  values (v_alice, current_date, 'lunch', 'Comida')
  returning id into v_comida;

  insert into public.diario_alimentos (comida_id, nombre, gramos, kcal, proteinas_g)
  values (v_comida, 'Pechuga de pollo a la plancha', 200, 330, 62);

  -- El trigger de totalizacion tiene que haber puesto las cifras del padre.
  select kcal into v_kcal from public.diario_comidas where id = v_comida;
  perform test_assert(v_kcal = 330, 'el trigger totaliza la comida al insertar una linea');

  -- Alice ve lo suyo.
  select count(*) into v_vistos from public.diario_comidas;
  perform test_assert(v_vistos = 1, 'el propietario ve sus propias comidas');

  -- --- Bob no debe ver nada de Alice --------------------------------
  perform test_como(v_bob);

  select count(*) into v_vistos
  from public.diario_comidas where usuario_id = v_alice;
  perform test_assert(v_vistos = 0, 'otro usuario no ve las comidas ajenas');

  -- Ni aunque la consulta no filtre por usuario_id.
  select count(*) into v_vistos from public.diario_comidas;
  perform test_assert(v_vistos = 0, 'RLS filtra aunque la consulta no filtre');

  -- Las lineas heredan el permiso de su comida.
  select count(*) into v_vistos from public.diario_alimentos;
  perform test_assert(v_vistos = 0, 'las lineas heredan el aislamiento de la comida');

  -- Bob no puede escribir sobre el perfil de Alice.
  --
  -- El UPDATE no falla: la politica `using` filtra la fila, asi que la sentencia
  -- afecta cero filas y no da error. Lo que hay que comprobar es el efecto, no
  -- la excepcion: el peso de Alice sigue siendo el que era.
  --
  -- La comprobacion va FUERA de cualquier bloque `exception`. Adentro,
  -- `test_assert(false)` corre en una subtransaccion que se deshace al saltar al
  -- manejador, y su linea se pierde de `_tap`, dejando un hueco en la
  -- numeracion TAP.
  update public.perfiles set peso_kg = 99 where auth_id = v_alice;
  get diagnostics v_filas = row_count;
  perform test_assert(v_filas = 0, 'el UPDATE sobre el perfil ajeno no toca ninguna fila');

  -- Alice tampoco puede ver el cambio, porque tampoco puede leer su perfil desde
  -- la sesion de Bob.
  select peso_kg into v_peso from public.perfiles p where p.auth_id = v_alice;
  perform test_assert(v_peso is null,
    'el perfil de Alice tampoco es legible desde la sesion de Bob');

  -- Bob no puede ni insertar filas a nombre de Alice. Aqui si hace falta
  -- capturar el error: la politica `with check` de `diario_comidas` lo rechaza.
  v_bloqueado := false;
  begin
    insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo)
    values (v_alice, current_date, 'dinner', 'Cena');
  exception
    when others then
      v_bloqueado := true;
  end;
  perform test_assert(v_bloqueado, 'insertar en nombre de otro esta bloqueado');

  -- --- El catalogo es legible por cualquiera ------------------------
  select count(*) into v_vistos from public.alimentos;
  perform test_assert(v_vistos > 100, 'el catalogo de alimentos es legible sin sesion de propietario');

  select count(*) into v_vistos from public.v_rutinas_completas;
  perform test_assert(v_vistos > 0, 'la vista de rutinas es legible sin sesion de propietario');
end;
$$;

-- Imprime las lineas TAP acumuladas y el plan. Va antes del `rollback` porque
-- `_tap` es `on commit drop`.
-- Los bloques `do` dejaron el rol cambiado a `authenticated`, que no puede
-- leer la tabla temporal. Se vuelve al rol propietario antes de imprimir.
reset role;
select * from test_tap_salida();

rollback;