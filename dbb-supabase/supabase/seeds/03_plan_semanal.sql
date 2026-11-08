-- FORMA · Plan semanal de entrenamiento.
--
-- Replica los siete dias y las nueve rutinas de Workouts.tsx, con sus titulos,
-- duraciones, intensidad y musculos intactos. Lo que cambia es que ahora cada
-- rutina lleva sus ejercicios prescritos, cosa que el web app no tenia: solo
-- guardaba el numero (`exercises: 6`).
--
-- El fichero va dentro de una transaccion porque las tablas temporales son
-- `on commit drop`: fuera de una transaccion, cada sentencia seria la suya y
-- se perderian antes de usarlas.

begin;

-- Tabla temporal con la definicion literal de los siete dias. Los planes se
-- insertan despues: el id lo genera la base, asi que no puede estar aqui.
create temporary table _planes_def on commit drop as
select * from (values
  (1::smallint, 'Empuje de fuerza'::text,     'Tren superior · Empuje'::text),
  (2, 'Recuperación activa',  'Descanso'),
  (3, 'Tirón y espalda',      'Tren superior · Tirón'),
  (4, 'Descanso y movilidad', 'Descanso'),
  (5, 'Tren inferior y core', 'Tren inferior + Core'),
  (6, 'Tirón de fuerza',      'Tren superior · Tirón'),
  (7, 'Descanso completo',    'Descanso')
) as v(dia_semana, titulo, titulo_corto);

-- `usuario_id` queda NULL: es el plan del catalogo, no el de nadie. El `on
-- conflict do nothing` sin destino cubre los indices parciales del catalogo
-- (que la unicidad sea por ambito se resuelve en la migracion de usuario).
insert into public.planes_entrenamiento (titulo, titulo_corto, dia_semana, fase)
select p.titulo, p.titulo_corto, p.dia_semana, 1
from _planes_def p
on conflict do nothing;

-- Tabla temporal que traduce el dia de la semana al uuid del plan ya creado.
create temporary table _planes on commit drop as
select d.dia_semana, d.titulo, d.titulo_corto, p.id
from _planes_def d
join public.planes_entrenamiento p
  on p.dia_semana = d.dia_semana
 and p.activo
 and p.fase = 1
 and p.usuario_id is null;

-- ---------------------------------------------------------------------------
-- Rutinas
--
-- Las nueve del web app, una a una. Las de descanso llevan `es_descanso = true`
-- para que no cuenten en los totales semanales, igual que el filtro
-- `r.status !== "rest"` del cliente.
--
-- La clave natural es (dia, titulo): "Core y estabilidad" solo aparece el
-- viernes, pero el titulo sigue sin bastar como identificador global porque
-- `rutinas_plan_titulo_idx` es por plan, no por titulo a secas.
-- ---------------------------------------------------------------------------
create temporary table _rutinas_def on commit drop as
select
  v.dia_semana,
  v.titulo,
  v.subtitulo,
  v.enfoque,
  v.musculos,
  v.duracion_min,
  v.intensidad::public.intensidad as intensidad,
  v.kcal,
  v.hora::time as hora,
  v.es_descanso,
  v.orden
from (values
  -- Lunes: la sesion A, la que aparece abierta en WorkoutSession.tsx.
  (1, 'Empuje de fuerza',        'Sesión A · Tren superior',   'Pecho, hombros y tríceps',
      array['Pecho','Hombros','Tríceps'],                      52, 'alta',  470, '07:10', false, 1),

  -- Martes: descarga.
  (2, 'Movilidad y circulación', 'Sesión de descarga',         'Caderas, columna y hombros',
      array['Caderas','Espalda','Hombros'],                     20, 'baja',   85, '10:00', true,  1),

  -- Miercoles: sesion B, la de mas ejercicios.
  (3, 'Tirón y espalda',         'Sesión B · Tren superior',   'Espalda, bíceps y agarre',
      array['Espalda','Bíceps','Trapecio'],                     55, 'alta',  520, '07:05', false, 1),

  -- Jueves: descanso real.
  (4, 'Descanso y movilidad',    'Sesión opcional',            'Movilidad general y postura',
      array['Movilidad','Core','Hombros'],                     15, 'baja',   60, '09:30', true,  1),

  -- Viernes: tren inferior (sesion C), core y recuperacion.
  (5, 'Tren inferior · Empuje',  'Sesión C · Tren inferior',   'Cuádriceps, glúteos y isquios',
      array['Cuádriceps','Glúteos','Isquios'],                  54, 'alta',  500, '07:20', false, 1),
  (5, 'Core y estabilidad',      'Sesión complementaria',      'Abdomen, oblicuos y lumbar',
      array['Core','Oblicuos','Lumbar'],                        18, 'baja',  110, '18:30', false, 2),
  (5, 'Recuperación de la tarde','Sesión opcional',            'Piernas, caderas y espalda baja',
      array['Piernas','Caderas','Espalda baja'],               20, 'baja',   75, '20:30', true,  3),

  -- Sabado: sesion D, intensidad media.
  (6, 'Tirón de fuerza',         'Sesión D · Tren superior',   'Espalda, hombros y bíceps',
      array['Espalda','Bíceps','Hombros'],                     50, 'media', 430, '10:00', false, 1),

  -- Domingo: un unico paseo largo. El titulo del plan es "Descanso completo"
  -- pero el de la rutina es "Caminata suave": no son lo mismo.
  (7, 'Caminata suave',          'Sesión opcional',            'Recuperación y bienestar',
      array['Sistema cardiovascular','Movilidad'],             25, 'baja',  140, '11:00', true,  1)
) as v(dia_semana, titulo, subtitulo, enfoque, musculos, duracion_min,
       intensidad, kcal, hora, es_descanso, orden);

-- El titulo identifica de forma unica la rutina dentro de cada dia. Se fija
-- como indice unico para que el seed sea idempotente y para que ningun cliente
-- pueda crear dos rutinas con el mismo nombre el mismo dia.
create unique index rutinas_plan_titulo_idx on public.rutinas (plan_id, titulo);

insert into public.rutinas (
  plan_id, titulo, subtitulo, enfoque, musculos, duracion_min,
  intensidad, kcal_estimadas, hora_programada, es_descanso, orden
)
select
  p.id, v.titulo, v.subtitulo, v.enfoque, v.musculos, v.duracion_min,
  v.intensidad, v.kcal, v.hora, v.es_descanso, v.orden
from _rutinas_def v
join _planes p on p.dia_semana = v.dia_semana
-- Sin `on conflict`: `rutinas` no tiene ninguna restriccion unica sobre
-- (plan_id, orden), asi que un reejecucion duplicaria las rutinas.
where not exists (
  select 1
  from public.rutinas r
  where r.plan_id = p.id
    and r.orden = v.orden
    and r.titulo = v.titulo
);

-- Los ejercicios se resuelven ya contra las rutinas reales: la tabla temporal
-- guarda directamente el `rutina_id`.
insert into public.rutina_ejercicios (
  rutina_id, ejercicio_id, orden, series, reps, carga_sugerida_kg,
  descanso_seg, record_previo_kg, consejo
)
select
  r.id,
  v.ejercicio,
  v.orden,
  v.series,
  v.reps,
  v.carga,
  v.descanso,
  v.record,
  v.consejo
from (values
  -- Lunes, sesion A (empuje). Los cinco primeros coinciden con la sesion web.
  (1, 'Empuje de fuerza', 1, 'press-banca',     4,  8, 45.0, 120, 47.5,
   'Baja la barra al pecho con los codos a 45 grados y los pies bien apoyados.'),
  (1, 'Empuje de fuerza', 2, 'press-inclinado', 3, 10, 22.0,  90, 24.0,
   'Banco a 30 grados, juntura escápula firme y ascenso controlado en dos segundos.'),
  (1, 'Empuje de fuerza', 3, 'aperturas',       3, 12, 12.0,  75, 14.0,
   'Codo ligeramente flexionado y estira sin perder la tensión del pectoral.'),
  (1, 'Empuje de fuerza', 4, 'fondos',          3, 12,  0.0,  90,  0.0,
   'Hombros lejos de las orejas, torso vertical y pausa al final del recorrido.'),
  (1, 'Empuje de fuerza', 5, 'remo-pendlay',    3, 10, 40.0,  90, 42.5,
   'Tirón explosivo hasta el abdomen y descenso lento hasta estirar del todo.'),
  (1, 'Empuje de fuerza', 6, 'press-military',  3, 10, 18.0,  75, 20.0,
   'Deja la escápula fija y no compenses el peso con las piernas.'),

  -- Martes, descarga.
  (2, 'Movilidad y circulación', 1, 'movilidad-cadera',   2, 10,  0.0, 30, 0.0,
   'Circulos lentos y controlando el rango, sin rebotar.'),
  (2, 'Movilidad y circulación', 2, 'movilidad-hombros',  2, 12,  0.0, 30, 0.0,
   'Abre el pecho y deja caer los brazos sin forzar el cuello.'),
  (2, 'Movilidad y circulación', 3, 'movilidad-columna',  2, 10,  0.0, 30, 0.0,
   'Catacow suave, una vértebra cada vez.'),
  (2, 'Movilidad y circulación', 4, 'caminata-rapida',    1, 20,  0.0,  0, 0.0,
   'Ritmo en el que puedas hablar, pero activo.'),
  (2, 'Movilidad y circulación', 5, 'estiramiento-isquio', 2, 30,  0.0, 30, 0.0,
   'Rodilla extendida y cadera hacia atrás sin arquear la espalda.'),

  -- Miercoles, sesion B (tiron). La mas larga: siete ejercicios.
  (3, 'Tirón y espalda', 1, 'remo-barra',          4, 10, 45.0, 120, 47.5,
   'Tirón a la cadera, no a los hombros. Espalda neutra todo el recorrido.'),
  (3, 'Tirón y espalda', 2, 'jalon-alto',          4, 10, 32.5,  90, 35.0,
   'Pecho a la barra al principio y codos por debajo de las muñecas.'),
  (3, 'Tirón y espalda', 3, 'remo-cuerda',         3, 12, 25.0,  75, 28.0,
   'Cadera abierta y pecho alto, no te lleves la cadera hacia delante.'),
  (3, 'Tirón y espalda', 4, 'curl-barra',          3, 10, 25.0,  60, 28.0,
   'Codos pegados al cuerpo y sin subir el hombro.'),
  (3, 'Tirón y espalda', 5, 'face-pull',           3, 15, 18.0,  60, 20.0,
   'Termina con las manos a la altura de las orejas.'),
  (3, 'Tirón y espalda', 6, 'curl-martillo',       3, 12, 14.0,  60, 16.0,
   'Muñecas neutras y sin girar el antebrazo.'),
  (3, 'Tirón y espalda', 7, 'superman',            3, 15,  0.0,  60,  0.0,
   'Eleva pecho y piernas a la vez, mirando al suelo.'),

  -- Jueves, descanso.
  (4, 'Descanso y movilidad', 1, 'movilidad-columna',    2, 10, 0.0, 30, 0.0,
   'Rutina suave para relajar la espalda.'),
  (4, 'Descanso y movilidad', 2, 'perro-camello',        2, 10, 0.0, 30, 0.0,
   'Alterna entre flexion y extension sin prisa.'),
  (4, 'Descanso y movilidad', 3, 'rotacion-torax',       2, 10, 0.0, 30, 0.0,
   'Caderas fijas, gira solo el torso.'),
  (4, 'Descanso y movilidad', 4, 'circunduccion-hombro', 2, 12, 0.0, 30, 0.0,
   'Codo pegado, movimiento pequeño.'),

  -- Viernes, sesion C (pierras).
  (5, 'Tren inferior · Empuje', 1, 'sentadilla-goblet',   4, 10, 30.0, 120, 35.0,
   'Rodillas hacia fuera, pecho alto y profundidad hasta romper la paralela.'),
  (5, 'Tren inferior · Empuje', 2, 'peso-muerto-rumano',  4,  8, 60.0, 150, 65.0,
   'Cadera alta y espalda neutra; no compenses con la zona lumbar.'),
  (5, 'Tren inferior · Empuje', 3, 'hipotonica',          4, 12, 18.0,  60, 20.0,
   'Un pie delante y rodilla que sigue la linea del pie.'),
  (5, 'Tren inferior · Empuje', 4, 'elevacion-pelvis',     3, 15, 24.0,  60, 28.0,
   'Aprieta el gluteo arriba; no empujes con la lumbar.'),
  (5, 'Tren inferior · Empuje', 5, 'extension-pierna',     3, 12, 20.0,  60, 22.0,
   'Cuadriliteo al frente, tobillo alineado con la rodilla.'),
  (5, 'Tren inferior · Empuje', 6, 'abduccion-cadera',     3, 15, 15.0,  60, 17.0,
   'Abre sin girar el tronco ni tirar de la manilla.'),

  -- Viernes, core complementario. El web app declaraba `exercises: 8`, asi que
  -- son ocho: los tres basicos mas cinco de control y anti-rotacion.
  (5, 'Core y estabilidad', 1, 'plancha',            3, 45, 0.0, 60, 0.0,
   'Cadera a la altura del hombro y gluteo apretado todo el tiempo.'),
  (5, 'Core y estabilidad', 2, 'dead-bug',           3, 12, 0.0, 60, 0.0,
   'Lumbar pegada al suelo; mueve el brazo contrario a la pierna.'),
  (5, 'Core y estabilidad', 3, 'rueda-abdominal',    3, 12, 0.0, 60, 0.0,
   'No tires del cuello: upwards desde el abdomen.'),
  (5, 'Core y estabilidad', 4, 'bird-dog',           3,  8, 0.0, 45, 0.0,
   'Alarga brazo y pierna a la vez sin que la cadera gire.'),
  (5, 'Core y estabilidad', 5, 'plancha-lateral',    3, 30, 0.0, 45, 0.0,
   'Apoya el antebrazo y sube la cadera sin dejar caer la cintura.'),
  (5, 'Core y estabilidad', 6, 'hollow-hold',        3, 30, 0.0, 45, 0.0,
   'Lumbar pegada al suelo y escapulas recogidas; aguanta la respiracion.'),
  (5, 'Core y estabilidad', 7, 'mountain-climber',   3, 30, 0.0, 30, 0.0,
   'Rodillas al pecho y extiende rapido, sin que la cadera suba.'),
  (5, 'Core y estabilidad', 8, 'criticas-con-peso', 3, 15, 0.0, 45, 0.0,
   'Rodillas a noventa grados y lumbar pegada; mueve solo el torso.'),

  -- Viernes, recuperacion.
  (5, 'Recuperación de la tarde', 1, 'estiramiento-isquio', 2, 30, 0.0, 30, 0.0,
   'Respira en el estiramiento, no fuerces el rango.'),
  (5, 'Recuperación de la tarde', 2, 'movilidad-cadera',    2, 10, 0.0, 30, 0.0,
   'Circulos lentos en ambos sentidos.'),
  (5, 'Recuperación de la tarde', 3, 'perro-camello',       2, 10, 0.0, 30, 0.0,
   'Alterna despacio entre ambas posiciones.'),
  (5, 'Recuperación de la tarde', 4, 'movilidad-hombros',   2, 12, 0.0, 30, 0.0,
   'Abre el pecho y relaja los hombros.'),
  (5, 'Recuperación de la tarde', 5, 'caminata-rapida',     1, 20, 0.0,  0, 0.0,
   'Final suave para bajar pulsaciones.'),

  -- Sabado, sesion D (tiron, intensidad media).
  (6, 'Tirón de fuerza', 1, 'jalon-alto',           4, 10, 35.0, 120, 38.0,
   'Tira hacia el bajo vientre con la espalda ligeramente inclinada.'),
  (6, 'Tirón de fuerza', 2, 'remo-mano',            4, 10, 32.5, 100, 35.0,
   'Codo pegado al costado y escápula atras al final.'),
  (6, 'Tirón de fuerza', 3, 'peso-muerto-rumano-t', 3, 10, 30.0,  90, 33.0,
   'Usa solo de apoyo; el trabajo esta en la cadera.'),
  (6, 'Tirón de fuerza', 4, 'curl-mancuernas',      3, 12, 14.0,  60, 16.0,
   'Alterna el curl, sin balanceo.'),
  (6, 'Tirón de fuerza', 5, 'elevacion-lateral',    3, 15,  8.0,  60,  9.0,
   'Sube hasta la horizontal del hombro sin encogerte.'),
  (6, 'Tirón de fuerza', 6, 'face-pull',            3, 15, 16.0,  60, 18.0,
   'Termina con las manos junto a las orejas.'),

  -- Domingo, descanso completo: un solo paseo largo, como en el web app.
  (7, 'Caminata suave', 1, 'caminata-rapida', 1, 25, 0.0, 0, 0.0,
   'Paseo largo a ritmo tranquilo, en el que puedas hablar sin esfuerzo.')
) as v(dia_semana, titulo, orden, ejercicio, series, reps, carga,
       descanso, record, consejo)
join _planes p on p.dia_semana = v.dia_semana
-- El `titulo` identifica la rutina dentro del dia: es unico en cada plan. No
-- se puede añadir `r.orden = v.orden` porque `v.orden` es la posicion del
-- ejercicio dentro de la rutina, no la de la rutina dentro del dia.
join public.rutinas r
  on r.plan_id = p.id
 and r.titulo = v.titulo
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Vista de rutinas para la pantalla de semana
--
-- `num_ejercicios` no es una columna: sale de contar las filas de
-- `rutina_ejercicios`. En el web app era un numero que nadie mantenia.
--
-- Tambien trae las columnas del plan al que pertenece la rutina: `dia_semana`,
-- `fase`, `titulo_plan` y `titulo_corto`. El cliente agrupa por dia para pintar
-- la rejilla de la semana, y `Workouts.tsx` llama a ese grupo `DayPlan`, asi que
-- sin el `dia_semano` habria que pedir `planes_entrenamiento` aparte y unir en
-- el cliente. Con la vista, una sola consulta devuelve la semana entera.
-- ---------------------------------------------------------------------------
create or replace view public.v_rutinas_completas
with (security_invoker = true) as
select
  r.*,
  p.dia_semana,
  p.fase,
  p.titulo as titulo_plan,
  p.titulo_corto,
  coalesce(c.total, 0)::smallint as num_ejercicios
from public.rutinas r
join public.planes_entrenamiento p on p.id = r.plan_id
left join (
  select rutina_id, count(*) as total
  from public.rutina_ejercicios
  group by rutina_id
) c on c.rutina_id = r.id;

comment on view public.v_rutinas_completas is
  'Rutinas con el dia y la fase de su plan, y el numero de ejercicios contado sobre rutina_ejercicios.';

grant select on public.v_rutinas_completas to authenticated;

commit;

analyze public.rutinas;
analyze public.rutina_ejercicios;