-- FORMA · Perfil de demostracion con seis meses de historial.
--
-- Crea un usuario real en `auth.users` para que se dispare el trigger de alta
-- y queden perfil y preferencias, y luego le llena seis meses de actividad:
-- medidas semanales, check-ins, comidas, agua y sesiones de entrenamiento.
--
-- Sirve para abrir la app y ver datos en vez de un panel vacio, y para que las
-- graficas de progreso, la racha y los totales tengan algo que dibujar.
--
-- Las credenciales son `demo@forma.test` / `forma2026`. Es una cuenta local de
-- desarrollo: en un entorno real no debe existir.

begin;

-- ---------------------------------------------------------------------------
-- El usuario
--
-- Se inserta en `auth.users` y no en `perfiles` a proposito, para que el perfil
-- lo cree `crear_perfil_al_registrarse()` igual que en un registro de verdad.
--
-- `extensions.` es explicito porque el `search_path` de esta sesion no incluye
-- `extensions`, y `auth.users.id` no tiene valor por defecto.
--
-- El `on conflict (id) do nothing` de mas abajo no es solo por seguridad: sin
-- esta limpieza, una segunda ejecucion fallaria con «El usuario no tiene
-- perfil». El motivo es que `auth.users` sobrevive a un borrado del esquema
-- `public` (que es lo que hace `aplicar-remoto.sh`), y el trigger
-- `auth_crear_perfil` solo dispara en un `insert`. Con el usuario ya creado,
-- el `insert` no insertaba nada, el trigger no corria, `perfiles` se quedaba
-- vacia y `recalcular_perfil()` abortaba el seed entero.
-- ---------------------------------------------------------------------------
delete from auth.users
where id = '11111111-1111-4111-8111-111111111111';
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, email, encrypted_password, email_confirmed_at,
  aud, role, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'demo@forma.test',
  -- `gen_salt('bf', 10)`: el 10 no es opcional. GoTrue rechaza el login si el
  -- hash sale con un coste menor, y el valor por defecto de `gen_salt('bf')` es
  -- 6, no 10.
  extensions.crypt('forma2026', extensions.gen_salt('bf', 10)),
  now(),
  -- `aud` y `role` no tienen valor por defecto en `auth.users`, y GoTrue busca
  -- el usuario por email filtrando por `aud = 'authenticated'`. Sin estas dos
  -- columnas la fila existe, el trigger crea el perfil y todo parece bien, pero
  -- el login responde "Invalid login credentials".
  'authenticated',
  'authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Lucia Serrano","consentimiento_aviso":"2026-04-01T09:00:00Z"}'::jsonb,
  -- Los tokens de un alta real llegan como cadenas vacias, nunca como NULL:
  -- GoTrue los escanea a `string` de Go, y un NULL ahi aborta la busqueda con
  -- "converting NULL to string is unsupported", un 500 en lugar del 400 que
  -- merece una contraseña mal escrita. Las columnas admiten NULL porque las
  -- escribe la propia API, que siempre pone ''.
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  now() - interval '180 days',
  now()
)
on conflict (id) do nothing;

-- `auth.identities` es la tabla que GoTrue consulta al hacer login: el usuario
-- se localiza por la identidad, no por `auth.users`. Sin esta fila el usuario
-- existe pero no se puede autenticar. `provider_id` lleva el `id` del usuario,
-- como hace GoTrue en un alta normal, y `identity_data` el `sub` que acaba
-- dentro del JWT.
-- `email` no se escribe: es una columna generada a partir de `identity_data`, y
-- Postgres rechaza un valor explicito en una generated column.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@forma.test",
    "email_verified":true,"phone_verified":false}'::jsonb,
  'email',
  now() - interval '1 day',
  now() - interval '180 days',
  now()
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- El perfil, ya con la biometria del onboarding
--
-- Los defaults de `perfiles` son los mismos que pone el cliente Flutter antes
-- del primer guardado. La demo parte de una biometria realista: 168 cm, 63,2 kg,
-- 29 anos, objetivo recomposicion.
-- ---------------------------------------------------------------------------
update public.perfiles
set nombre_completo = 'Lucía Serrano',
    nombre_usuario = 'lucia',
    sexo = 'femenino',
    edad = 29,
    altura_cm = 168,
    peso_kg = 63.20,
    peso_inicial_kg = 64.00,
    peso_objetivo_kg = 60.00,
    cuello_cm = 30.50,
    cintura_cm = 70.80,
    cadera_cm = 90.00,
    nivel_experiencia = 'intermediate',
    deporte_principal = 'strength',
    disponibilidad = '4 días',
    objetivo = 'recomposition',
    consentimiento_aviso = now() - interval '180 days',
    onboarding_completado = true,
    miembro_desde = now() - interval '180 days'
where auth_id = '11111111-1111-4111-8111-111111111111';

-- Las calorías y la grasa las calcula el servidor, no se escriben a mano.
--
-- `recalcular_perfil()` lee el usuario de `auth.uid()`, que sale del JWT de la
-- sesion. El seed corre como `postgres` sin sesion, asi que se le da una con
-- `set_config`. Es el mismo truco que usan los tests.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111')::text,
  true
);

select public.recalcular_perfil();

update public.preferencias_usuario
set tema = 'dark',
    notificaciones = true,
    notificar_rutinas = true,
    checkin_semanal = true,
    ultimo_checkin = now() - interval '7 days'
where usuario_id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- Serie de progreso: doce semanas de medidas
--
-- Bajada suave y realista, no una recta: hay semanas de estancamiento porque el
-- peso fluctua. La cintura cae un poco mas rapido que el peso, que es lo que
-- suele ocurrir al recomponer.
-- ---------------------------------------------------------------------------
insert into public.mediciones_progreso (
  usuario_id, fecha, peso_kg, grasa_corporal_pct, cintura_cm, pesado, origen, nota
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  current_date - v.dias::int,
  v.peso,
  public.estimar_grasa_corporal(
    v.peso::numeric, 168::numeric, 29::numeric, 'femenino'::public.sexo, v.cintura
  ),
  v.cintura,
  1,
  'check_in'::public.origen_medicion,
  v.nota
from (values
  (168, 64.00, 74.2, 'Punto de partida'),
  (154, 63.80, 73.9, NULL),
  (140, 63.55, 73.5, 'Semana tranquila'),
  (126, 63.60, 73.6, 'Sin cambios, misma comida'),
  (112, 63.10, 72.8, 'Vuelta al ritmo'),
  (98,  62.80, 72.3, NULL),
  (84,  62.90, 72.4, 'Viaje, un poco de runway'),
  (70,  62.45, 71.7, NULL),
  (56,  62.10, 71.2, 'Mejor semana del bloque'),
  (42,  62.20, 71.3, NULL),
  (28,  61.80, 70.6, NULL),
  (14,  61.55, 70.2, NULL),
  (7,   61.40, 69.9, NULL),
  (0,   61.30, 69.7, 'Seis meses')
) as v(dias, peso, cintura, nota)
on conflict (usuario_id, fecha) do nothing;

-- ---------------------------------------------------------------------------
-- Check-ins semanales
--
-- Uno por semana, con las cuatro medidas que el web app descartaba. `peso_dia1`
-- se congela el primer dia de cada semana para poder comparar la evolution
-- dentro de la semana sin el ruido del agua y la sal.
-- ---------------------------------------------------------------------------
insert into public.check_ins (
  usuario_id, semana, fecha, peso_kg, cintura_cm, cadera_cm, cuello_cm,
  peso_dia1_kg, fotos_completas, obligatorio
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  v.semana::smallint,
  current_date - (v.semana * 7)::int,
  v.peso,
  v.cintura,
  v.cadera,
  v.cuello,
  v.peso + 0.4,
  case when v.semana % 4 = 0 then 3 else 0 end::smallint,
  false
from (values
  (25, 64.00, 74.2, 91.0, 30.5),
  (24, 63.55, 73.5, 90.5, 30.5),
  (23, 63.10, 72.8, 90.2, 30.4),
  (22, 62.80, 72.3, 90.0, 30.4),
  (21, 62.45, 71.7, 89.8, 30.3),
  (20, 62.10, 71.2, 89.5, 30.3),
  (19, 61.80, 70.6, 89.3, 30.2),
  (18, 61.55, 70.2, 89.0, 30.2),
  (17, 61.40, 69.9, 88.8, 30.1),
  (16, 61.35, 69.8, 88.7, 30.1),
  (15, 61.30, 69.7, 88.5, 30.1)
) as v(semana, peso, cintura, cadera, cuello)
on conflict (usuario_id, semana) do nothing;

-- ---------------------------------------------------------------------------
-- Comidas de las dos ultimas semanas
--
-- Se anaden con `anadir_alimento`, el mismo camino que usara el cliente, para
-- que los totales de `diario_comidas` los ponga el trigger y no a mano. Los
-- alimentos salen del catalogo del seed 01.
--
-- Solo se cubren los ultimos 13 dias porque el diario es de uso reciente; el
-- historial largo lo dan las medidas y las sesiones.
-- ---------------------------------------------------------------------------
insert into public.diario_comidas (usuario_id, fecha, tipo_comida, titulo, icono, hora, completada)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  current_date - v.dias::int,
  v.tipo::public.tipo_comida,
  v.titulo,
  v.icono,
  v.hora::time,
  true
from (values
  -- Desayunos.
  ( 0, 'breakfast', 'Desayuno',        'coffee',      '07:30'),
  ( 1, 'breakfast', 'Avena con cafe',  'coffee',      '07:15'),
  ( 2, 'breakfast', 'Huevos y pan',    'coffee',      '08:00'),
  ( 3, 'breakfast', 'Desayuno',        'coffee',      '07:20'),
  ( 4, 'breakfast', 'Avena con cafe',  'coffee',      '07:30'),
  ( 5, 'breakfast', 'Huevos y fruta',  'coffee',      '08:10'),
  ( 6, 'breakfast', 'Desayuno',        'coffee',      '07:25'),
  ( 7, 'breakfast', 'Tostada con aguacate', 'coffee', '07:40'),
  ( 8, 'breakfast', 'Avena con cafe',  'coffee',      '07:15'),
  ( 9, 'breakfast', 'Huevos y pan',    'coffee',      '07:50'),
  (10, 'breakfast', 'Desayuno',        'coffee',      '07:30'),
  (11, 'breakfast', 'Avena con cafe',  'coffee',      '07:20'),
  (12, 'breakfast', 'Huevos y fruta',  'coffee',      '08:00'),

  -- Comidas.
  ( 0, 'lunch', 'Pechuga y arroz',    'salad',       '14:00'),
  ( 1, 'lunch', 'Pasta con atun',     'pasta',       '13:45'),
  ( 2, 'lunch', 'Ensalada de salmon', 'salad',       '14:15'),
  ( 3, 'lunch', 'Pollo con verduras', 'meal',        '13:30'),
  ( 4, 'lunch', 'Arroz con pollo',    'meal',        '14:00'),
  ( 5, 'lunch', 'Salmada y quinoa',   'salad',       '14:20'),
  ( 6, 'lunch', 'Pasta con tomate',   'pasta',       '13:50'),
  ( 7, 'lunch', 'Pollo a la plancha', 'meal',        '14:10'),
  ( 8, 'lunch', 'Ensalada de atun',   'salad',       '13:40'),
  ( 9, 'lunch', 'Arroz con verduras', 'meal',        '14:05'),
  (10, 'lunch', 'Salmada y arroz',    'salad',       '14:15'),
  (11, 'lunch', 'Pasta con pollo',    'pasta',       '13:45'),
  (12, 'lunch', 'Pollo con arroz',    'meal',        '14:00'),

  -- Cenas.
  ( 0, 'dinner', 'Salmada con verduras', 'salad',    '20:30'),
  ( 1, 'dinner', 'Tortilla y ensalada', 'meal',      '20:15'),
  ( 2, 'dinner', 'Pollo y verduras',    'meal',      '20:40'),
  ( 3, 'dinner', 'Sopa de verduras',    'soup',       '20:20'),
  ( 4, 'dinner', 'Atun con ensalada',   'salad',      '20:35'),
  ( 5, 'dinner', 'Crema de verduras',   'soup',       '20:10'),
  ( 6, 'dinner', 'Salmada con ensalada','salad',      '20:45'),
  ( 7, 'dinner', 'Pollo a la plancha',  'meal',       '20:25'),
  ( 8, 'dinner', 'Tortilla de atun',    'meal',       '20:30'),
  ( 9, 'dinner', 'Verduras a la plancha','meal',      '20:15'),
  (10, 'dinner', 'Sopa de pollo',       'soup',       '20:40'),
  (11, 'dinner', 'Ensalada de salmon',  'salad',      '20:30'),
  (12, 'dinner', 'Pollo con verduras',  'meal',       '20:20'),

  -- Tentemonees, solo algunos dias: el diario tiene que reflejar que no todos
  -- los dias se completa igual.
  ( 0, 'snack', 'Yogur con frutos secos', 'apple',     '17:00'),
  ( 2, 'snack', 'Fruta',                   'apple',     '17:30'),
  ( 3, 'snack', 'Batido de proteina',      'zap',       '11:30'),
  ( 5, 'snack', 'Frutos secos',            'apple',     '18:00'),
  ( 6, 'snack', 'Batido de proteina',      'zap',       '11:30'),
  ( 8, 'snack', 'Yogur',                   'apple',     '17:15'),
  (10, 'snack', 'Fruta y cafe',            'coffee',    '17:00'),
  (12, 'snack', 'Batido de proteina',      'zap',       '11:30')
) as v(dias, tipo, titulo, icono, hora)
on conflict (usuario_id, fecha, tipo_comida) do nothing;

-- Las lineas de cada comida. El nombre se resuelve contra el catalogo: si un
-- alimento no existe, la linea se cae en lugar de dejar el diario a medias.
insert into public.diario_alimentos (
  comida_id, alimento_id, nombre, cantidad_texto, gramos,
  kcal, proteinas_g, carbohidratos_g, grasas_g, orden
)
select
  c.id,
  a.id,
  a.nombre,
  -- La cantidad legible la calcula `anadir_alimento`; aqui se pone la misma
  -- regla para que las lineasseed se vean igual que las del cliente.
  round(v.gramos)::text || ' g',
  v.gramos,
  round(a.kcal_100g * v.gramos / 100)::smallint,
  round(a.proteinas_100g * v.gramos / 100, 1),
  round(a.carbohidratos_100g * v.gramos / 100, 1),
  round(a.grasas_100g * v.gramos / 100, 1),
  v.orden
from public.diario_comidas c
join (values
  -- Desayunos.
  ( 0, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 0, 'breakfast', 'Banana',             100.0, 2),
  ( 1, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 1, 'breakfast', 'Banana',             100.0, 2),
  ( 2, 'breakfast', 'Huevos camperos',    120.0, 1),
  ( 2, 'breakfast', 'Pan integral de masa madre', 60.0, 2),
  ( 3, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 3, 'breakfast', 'Batido de proteína', 300.0, 2),
  ( 4, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 4, 'breakfast', 'Banana',             100.0, 2),
  ( 5, 'breakfast', 'Huevos camperos',    120.0, 1),
  ( 5, 'breakfast', 'Manzana',            150.0, 2),
  ( 6, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 6, 'breakfast', 'Banana',             100.0, 2),
  ( 7, 'breakfast', 'Pan integral de masa madre', 70.0, 1),
  ( 7, 'breakfast', 'Aguacate',           70.0,  2),
  ( 8, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  ( 8, 'breakfast', 'Banana',             100.0, 2),
  ( 9, 'breakfast', 'Huevos camperos',    120.0, 1),
  ( 9, 'breakfast', 'Pan integral de masa madre', 60.0, 2),
  (10, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  (10, 'breakfast', 'Batido de proteína', 300.0, 2),
  (11, 'breakfast', 'Avena en hojuelas',  60.0,  1),
  (11, 'breakfast', 'Banana',             100.0, 2),
  (12, 'breakfast', 'Huevos camperos',    120.0, 1),
  (12, 'breakfast', 'Manzana',            150.0, 2),

  -- Comidas.
  ( 0, 'lunch', 'Pechuga de pollo a la plancha', 180.0, 1),
  ( 0, 'lunch', 'Arroz blanco cocido',           200.0, 2),
  ( 0, 'lunch', 'Aguacate',                       50.0, 3),
  ( 1, 'lunch', 'Pasta cocida',                          220.0, 1),
  ( 1, 'lunch', 'Atún al natural',                           120.0, 2),
  ( 1, 'lunch', 'Tomate',                         120.0, 3),
  ( 2, 'lunch', 'Salmón al horno',               160.0, 1),
  ( 2, 'lunch', 'Quinoa cocida',                         180.0, 2),
  ( 2, 'lunch', 'Aguacate',                       60.0,  3),
  ( 3, 'lunch', 'Pechuga de pollo a la plancha', 170.0, 1),
  ( 3, 'lunch', 'Patata cocida',                         250.0, 2),
  ( 3, 'lunch', 'Brocoli',                        150.0, 3),
  ( 4, 'lunch', 'Pechuga de pollo a la plancha', 190.0, 1),
  ( 4, 'lunch', 'Arroz blanco cocido',           200.0, 2),
  ( 4, 'lunch', 'Pepino',                         150.0, 3),
  ( 5, 'lunch', 'Salmón al horno',               150.0, 1),
  ( 5, 'lunch', 'Quinoa cocida',                         200.0, 2),
  ( 5, 'lunch', 'Aguacate',                       50.0,  3),
  ( 6, 'lunch', 'Pasta cocida',                          220.0, 1),
  ( 6, 'lunch', 'Tomate',                         150.0, 2),
  ( 6, 'lunch', 'Queso fresco (requeson)',                   60.0,  3),
  ( 7, 'lunch', 'Pechuga de pollo a la plancha', 180.0, 1),
  ( 7, 'lunch', 'Arroz blanco cocido',           220.0, 2),
  ( 7, 'lunch', 'Brocoli',                        150.0, 3),
  ( 8, 'lunch', 'Atún al natural',                           150.0, 1),
  ( 8, 'lunch', 'Patata cocida',                         200.0, 2),
  ( 8, 'lunch', 'Pepino',                         150.0, 3),
  ( 9, 'lunch', 'Pechuga de pollo a la plancha', 175.0, 1),
  ( 9, 'lunch', 'Arroz blanco cocido',           210.0, 2),
  ( 9, 'lunch', 'Zanahoria',                      120.0, 3),
  (10, 'lunch', 'Salmón al horno',               160.0, 1),
  (10, 'lunch', 'Arroz blanco cocido',           190.0, 2),
  (10, 'lunch', 'Aguacate',                       60.0,  3),
  (11, 'lunch', 'Pasta cocida',                          210.0, 1),
  (11, 'lunch', 'Pechuga de pollo a la plancha', 150.0, 2),
  (11, 'lunch', 'Tomate',                         150.0, 3),
  (12, 'lunch', 'Pechuga de pollo a la plancha', 180.0, 1),
  (12, 'lunch', 'Arroz blanco cocido',           200.0, 2),
  (12, 'lunch', 'Brocoli',                        150.0, 3),

  -- Cenas.
  ( 0, 'dinner', 'Salmón al horno',               140.0, 1),
  ( 0, 'dinner', 'Ensalada verde',                200.0, 2),
  ( 1, 'dinner', 'Huevos camperos',               110.0, 1),
  ( 1, 'dinner', 'Pan integral de masa madre',     50.0, 2),
  ( 1, 'dinner', 'Tomate',                        150.0, 3),
  ( 2, 'dinner', 'Pechuga de pollo a la plancha', 150.0, 1),
  ( 2, 'dinner', 'Calabacin',                     200.0, 2),
  ( 3, 'dinner', 'Crema de verduras',             300.0, 1),
  ( 3, 'dinner', 'Pan integral de masa madre',     40.0, 2),
  ( 4, 'dinner', 'Atún al natural',                          130.0, 1),
  ( 4, 'dinner', 'Ensalada verde',               200.0, 2),
  ( 5, 'dinner', 'Crema de verduras',             300.0, 1),
  ( 5, 'dinner', 'Pan integral de masa madre',     40.0, 2),
  ( 6, 'dinner', 'Salmón al horno',               140.0, 1),
  ( 6, 'dinner', 'Ensalada verde',               200.0, 2),
  ( 7, 'dinner', 'Pechuga de pollo a la plancha', 150.0, 1),
  ( 7, 'dinner', 'Calabacin',                    200.0, 2),
  ( 8, 'dinner', 'Atún al natural',                          120.0, 1),
  ( 8, 'dinner', 'Patata cocida',                        200.0, 2),
  ( 8, 'dinner', 'Pepino',                        150.0, 3),
  ( 9, 'dinner', 'Calabacin',                     250.0, 1),
  ( 9, 'dinner', 'Huevos camperos',              100.0, 2),
  (10, 'dinner', 'Crema de verduras',             300.0, 1),
  (10, 'dinner', 'Pechuga de pollo a la plancha', 120.0, 2),
  (11, 'dinner', 'Salmón al horno',              130.0, 1),
  (11, 'dinner', 'Ensalada verde',               200.0, 2),
  (12, 'dinner', 'Pechuga de pollo a la plancha', 150.0, 1),
  (12, 'dinner', 'Calabacin',                    200.0, 2),

  -- Tentemonees.
  ( 0, 'snack', 'Yogur griego natural',                  170.0, 1),
  ( 0, 'snack', 'Nueces',                         30.0,  2),
  ( 2, 'snack', 'Manzana',                        180.0, 1),
  ( 3, 'snack', 'Batido de proteína',             300.0, 1),
  ( 3, 'snack', 'Plátano',                        120.0, 2),
  ( 5, 'snack', 'Nueces',                          35.0, 1),
  ( 6, 'snack', 'Batido de proteína',             300.0, 1),
  ( 8, 'snack', 'Yogur griego natural',                  170.0, 1),
  (10, 'snack', 'Naranja',                        150.0, 1),
  (12, 'snack', 'Batido de proteína',             300.0, 1)
) as v(dias, tipo, alimento, gramos, orden)
  on c.tipo_comida = v.tipo::public.tipo_comida
 and c.fecha = current_date - v.dias::int
join public.alimentos a on a.nombre = v.alimento
on conflict (comida_id, orden) do nothing;

-- ---------------------------------------------------------------------------
-- Agua de los ultimos trece dias
-- ---------------------------------------------------------------------------
insert into public.registro_agua (usuario_id, fecha, ml, objetivo_ml)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  current_date - v.dias::int,
  v.ml,
  2000
from (values
  ( 0, 2450),
  ( 1, 2000),
  ( 2, 1750),
  ( 3, 2300),
  ( 4, 2000),
  ( 5, 1500),
  ( 6, 2150),
  ( 7, 2000),
  ( 8, 2400),
  ( 9, 1950),
  (10, 2000),
  (11, 1700),
  (12, 2250)
) as v(dias, ml)
on conflict (usuario_id, fecha) do nothing;

-- ---------------------------------------------------------------------------
-- Sesiones de las ultimas diez semanas
--
-- Se insertan ya cerradas con su resumen, en vez de pasar por `iniciar_sesion`:
-- la sesion y sus 19 filas de serie por ejercicio darian un seed de miles de
-- lineas sin ganar nada, porque lo que leen las pantallas son los totales.
--
-- El progreso no es perfecto a proposito: hay un par de semanas con menos
-- sesiones, porque un historial sin fallos tampoco parece real.
--
-- Los totales van escritos a mano y por eso el bloque de abajo rellena despues
-- el detalle (`sesiones_ejercicios` y `sesiones_series`) de la sesion de hoy,
-- que es la unica que el cliente abre y necesita series contra las que marcar.
-- ---------------------------------------------------------------------------
insert into public.sesiones_entrenamiento (
  usuario_id, rutina_id, nombre, fecha, iniciada_at, finalizada_at,
  duracion_seg, series_totales, series_completadas, volumen_total_kg,
  nuevos_records, kcal_estimadas, estado
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  r.id,
  r.titulo,
  current_date - v.dias::int,
  (current_date - v.dias::int)::timestamp + v.hora::time,
  (current_date - v.dias::int)::timestamp + v.hora::time
    + make_interval(secs => v.duracion::int),
  v.duracion,
  v.series,
  v.series,
  v.volumen,
  v.records,
  round(v.duracion / 60.0 * 7.4)::smallint,
  'completada'::public.estado_sesion
from (values
  -- Ultimas cuatro semanas, la parte que se ve al entrar en la app.
  ( 1, '07:10', 3120, 19, 4180, 2),
  ( 3, '07:05', 3300, 21, 5240, 3),
  ( 5, '07:20', 3240, 18, 5620, 1),
  ( 6, '10:00', 3000, 18, 4860, 2),
  ( 8, '07:10', 3060, 19, 4290, 0),
  (10, '07:05', 3180, 20, 5310, 1),
  (12, '07:20', 3120, 18, 5740, 3),
  (13, '10:00', 2880, 18, 4950, 0),
  (15, '07:10', 3240, 19, 4410, 2),
  (17, '07:05', 3360, 21, 5480, 1),
  (19, '07:20', 3060, 18, 5890, 2),
  (20, '10:00', 2940, 18, 5010, 1),
  (22, '07:10', 3180, 19, 4520, 3),
  (24, '07:05', 3240, 20, 5560, 1),
  (26, '07:20', 3000, 18, 6020, 0),
  (27, '10:00', 2820, 18, 5120, 2),
  -- Hace un mes, menos denso: se ve la mejora de volumen.
  (33, '07:10', 3060, 19, 3950, 1),
  (35, '07:05', 3120, 20, 4880, 2),
  (37, '07:20', 3000, 18, 5210, 0),
  (38, '10:00', 2760, 18, 4620, 1),
  (40, '07:10', 2940, 19, 4020, 0),
  -- Hace dos meses, la semana mas floja: solo dos sesiones.
  (47, '07:10', 2880, 19, 3760, 1),
  (49, '07:20', 2760, 18, 4880, 0),
  -- Hace tres meses, el arranque.
  (54, '07:10', 2820, 19, 3410, 0),
  (56, '07:05', 2880, 20, 4210, 1),
  (58, '07:20', 2700, 18, 4520, 0),
  (60, '10:00', 2580, 18, 4080, 0)
) as v(dias, hora, duracion, series, volumen, records)
join public.rutinas r on r.titulo = case v.dias % 3
  when 0 then 'Tren inferior · Empuje'
  when 1 then 'Empuje de fuerza'
  else 'Tirón y espalda'
end
on conflict do nothing;

-- El avance de cada rutina del dia, que es lo que pinta la rejilla de la semana.
insert into public.registro_rutinas_diarias (
  usuario_id, rutina_id, fecha, estado, porcentaje_completado, completada_at
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  r.id,
  current_date - v.dias::int,
  'completada'::public.estado_rutina,
  100::smallint,
  (current_date - v.dias::int)::timestamp + interval '9 hours'
from (values
  ( 1), ( 3), ( 5), ( 6), ( 8), (10), (12), (13), (15), (17),
  (19), (20), (22), (24), (26), (27), (33), (35), (37), (38), (40),
  (47), (49), (54), (56), (58), (60)
) as v(dias)
join public.rutinas r on r.titulo = case v.dias % 3
  when 0 then 'Tren inferior · Empuje'
  when 1 then 'Empuje de fuerza'
  else 'Tirón y espalda'
end
on conflict (usuario_id, rutina_id, fecha) do nothing;

-- Una sesion a medias, para que la app tenga algo que recuperar al entrar.
--
-- Esta si pasa por `iniciar_sesion`, a diferencia de las cerradas de arriba, y
-- por dos razones:
--
--   1. Es la sesion que el cliente recupera al entrar, asi que necesita sus
--      ejercicios y sus series para poder pintar la pantalla y contra las que
--      marcar. Con cero filas, `WorkoutSession.tsx` abriria en blanco.
--   2. `iniciar_sesion` es el unico sitio que sabe volcar una prescripcion a
--      `sesiones_ejercicios` y `sesiones_series`. Reimplementarlo aqui seria
--      una copia que se desincroniza en cuanto cambie el RPC.
--
-- Se marca la primera serie de cada ejercicio como completada: una sesion a
-- medias con las tres cuartas partes de las series sin marcar tambien parecia
-- un fallo del seed.
select public.iniciar_sesion(r.id)
from public.rutinas r
where r.titulo = 'Empuje de fuerza'
limit 1;

-- `iniciar_sesion` deja la sesion en `current_date` y con la hora de ahora, que
-- es justo lo que quiere una sesion a medias. Lo que no cuadra es que el
-- historial de este usuario lleva seis meses de stack: sin este recorte, el
-- "lleva 35 minutos entrenando" de la app seria falso.
update public.sesiones_entrenamiento
set iniciada_at = now() - interval '35 minutes'
where usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
  and estado = 'en_curso'::public.estado_sesion;

-- Las primeras series completadas, con la hora de hace 33 minutos para que no
-- todas digan el mismo minuto.
update public.sesiones_series s
set completada = true,
    completada_at = now() - interval '33 minutes'
where s.sesion_ejercicio_id in (
  select e.id
  from public.sesiones_ejercicios e
  join public.sesiones_entrenamiento t on t.id = e.sesion_id
  where t.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
    and t.estado = 'en_curso'::public.estado_sesion
)
and s.numero_serie = 1;

-- El avance de la sesion a medias en la rutina del dia.
--
-- `iniciar_sesion` no escribe en `registro_rutinas_diarias`: lo hace
-- `finalizar_sesion`, al cerrar. Asi que sin esto la rejilla de la semana
-- pondria 0 % mientras la sesion lleva seis series marcadas, que es justo la
-- situacion que `Workouts.tsx` dibuja con el anillo de progreso.
--
-- El `estado` se queda en `programada` a proposito: `finalizar_sesion` solo pasa
-- la rutina a `completada` al 100 %, y esta sesion no lo esta.
insert into public.registro_rutinas_diarias (
  usuario_id, rutina_id, fecha, estado, porcentaje_completado
)
select
  s.usuario_id,
  s.rutina_id,
  s.fecha,
  'programada'::public.estado_rutina,
  (
    select case
      when count(*) = 0 then 0::smallint
      else round(100.0 * count(*) filter (where se.completada) / count(*))::smallint
    end
    from public.sesiones_series se
    join public.sesiones_ejercicios e on e.id = se.sesion_ejercicio_id
    where e.sesion_id = s.id
  )
from public.sesiones_entrenamiento s
where s.usuario_id = '11111111-1111-4111-8111-111111111111'::uuid
  and s.estado = 'en_curso'::public.estado_sesion
  and s.rutina_id is not null
on conflict (usuario_id, rutina_id, fecha)
do update set porcentaje_completado = excluded.porcentaje_completado,
              estado = excluded.estado,
              updated_at = now();

-- Un plan de fase 2, para que `semana_entrenamiento` tenga por donde elegir y el
-- cliente vea que la semana distingue fases. Se deja inactivo salvo el lunes,
-- que es el dia que toca.
insert into public.planes_entrenamiento (titulo, titulo_corto, dia_semana, fase, activo)
select 'Empuje de fuerza', 'Tren superior · Empuje', 1, 2, false
on conflict do nothing;

update public.planes_entrenamiento
set titulo = 'Empuje de fuerza · Fase 2',
    titulo_corto = 'Tren superior · Empuje',
    fase = 2
where dia_semana = 1 and fase = 2 and usuario_id is null;

-- La fase 2 necesita sus propias rutinas: `rutinas` cuelga del plan, no del
-- dia. Se copian las del lunes cambiando el titulo, para que al activar la fase
-- no se quede un dia vacio.
insert into public.rutinas (
  plan_id, titulo, subtitulo, enfoque, musculos, duracion_min,
  intensidad, kcal_estimadas, hora_programada, es_descanso, orden
)
select
  p2.id,
  r.titulo || ' · Fase 2',
  r.subtitulo,
  r.enfoque,
  r.musculos,
  r.duracion_min,
  r.intensidad,
  r.kcal_estimadas,
  r.hora_programada,
  r.es_descanso,
  r.orden
from public.rutinas r
join public.planes_entrenamiento p1 on p1.id = r.plan_id and p1.fase = 1
join public.planes_entrenamiento p2 on p2.dia_semana = p1.dia_semana and p2.fase = 2
where p2.activo = false;

insert into public.rutina_ejercicios (
  rutina_id, ejercicio_id, orden, series, reps, carga_sugerida_kg,
  descanso_seg, record_previo_kg, consejo
)
select
  r2.id,
  re.ejercicio_id,
  re.orden,
  re.series,
  re.reps,
  -- La fase 2 pide un 5 % mas de carga, que es como progresa un plan.
  round(re.carga_sugerida_kg * 1.05, 1),
  re.descanso_seg,
  re.record_previo_kg,
  re.consejo
from public.rutina_ejercicios re
join public.rutinas r1 on r1.id = re.rutina_id
join public.planes_entrenamiento p1 on p1.id = r1.plan_id and p1.fase = 1
join public.rutinas r2 on r2.plan_id = (
  select id from public.planes_entrenamiento
  where dia_semana = p1.dia_semana and fase = 2 and usuario_id is null
) and r2.orden = r1.orden
where p1.dia_semana = 1;

-- ---------------------------------------------------------------------------
-- Escaneo de ejemplo
--
-- `escaneos_ocr` guarda una fila por alimento detectado, no una fila por
-- escaneo: la pantalla de revision lista los candidatos y el usuario confirma
-- uno a uno. `confianza` va de 0 a 100 y `nivel` se deriva sola en tres tramos.
--
-- Se dejan sin confirmar a proposito, que es el estado en el que el escaner
-- normalmente espera al usuario.
-- ---------------------------------------------------------------------------
insert into public.escaneos_ocr (
  usuario_id, alimento_id, nombre_detectado,
  kcal_100g, proteinas_100g, carbohidratos_100g, grasas_100g,
  confianza, imagen_path, confirmado
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  a.id,
  v.detectado,
  v.kcal,
  v.proteinas,
  v.carbohidratos,
  v.grasas,
  v.confianza::smallint,
  'demo/escaneo-' || v.confianza::text || '.jpg',
  false
from (values
  -- Confianza alta: la pantalla la propone directamente.
  ('Pechuga de pollo a la plancha', 165.0, 31.0,  0.0, 3.6, 94),
  ('Arroz blanco cocido',           130.0,  2.7, 28.0, 0.3, 81),
  -- Confianza media: el usuario tiene que elegir cual es.
  ('Ensalada verde',                 20.0,  1.4,  3.6, 0.3, 62),
  ('Quinoa cocida',                 120.0,  4.4, 21.3, 1.9, 55),
  ('Yogur griego natural',           59.0, 10.0,  3.6, 0.4, 44)
) as v(detectado, kcal, proteinas, carbohidratos, grasas, confianza)
-- `nombre_detectado` es lo que devuelve el OCR, que no conoce el catalogo: por
-- eso el emparejamiento con `alimentos.nombre` es por igualdad exacta.
join public.alimentos a on a.nombre = v.detectado;

commit;

analyze public.mediciones_progreso;
analyze public.diario_comidas;
analyze public.diario_alimentos;
analyze public.sesiones_entrenamiento;