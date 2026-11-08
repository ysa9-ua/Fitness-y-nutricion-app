-- FORMA · Catalogo de ejercicios.
--
-- Los cinco primeros son los que WorkoutSession.tsx traia como `ROUTINE`, con
-- el mismo slug, el mismo musculo y los mismos numeros, para que la sesion
-- activa se vea igual. El resto cubre tren inferior, core, movilidad y cardio
-- para poder prescribe el resto de la semana.

insert into public.ejercicios (id, nombre, musculo, icono, grupo_muscular) values
  -- --- Los cinco de la sesion original ---------------------------------
  ('press-banca',         'Press banca',                'Pecto mayor',        'dumbbell', 'push'),
  ('press-inclinado',     'Press inclinado mancuernas', 'Pecto superior',     'dumbbell', 'push'),
  ('aperturas',           'Aperturas en polea',         'Pectoral lateral',   'activity', 'push'),
  ('fondos',              'Fondos en paralelas',        'Triceps',            'target',   'push'),
  ('remo-pendlay',        'Remo Pendlay',               'Espalda y biceps',   'chart',    'pull'),

  -- --- Tren superior: empuje ------------------------------------------
  ('press-military',      'Press militar',              'Hombros',            'dumbbell', 'push'),
  ('press-hombros',       'Press de hombros',           'Hombros',            'dumbbell', 'push'),
  ('elevacion-lateral',   'Elevacion lateral',          'Hombro lateral',     'activity', 'push'),
  ('elevacion-frontal',   'Elevacion frontal',          'Hombro frontal',     'activity', 'push'),
  ('face-pull',           'Face pull',                  'Espalda alta',       'chart',    'pull'),
  ('extensiones-codo',    'Extensiones de codo',        'Triceps',            'dumbbell', 'push'),
  ('press-frances',       'Press frances',              'Triceps',            'dumbbell', 'push'),
  ('fondos-lastrados',    'Fondos lastrados',           'Triceps',            'target',   'push'),
  ('press-inclinado-man', 'Press inclinado mancuernas', 'Hombros',            'dumbbell', 'push'),
  ('criticas-con-peso',   'Criticas con peso corporal',  'Core',               'target',   'core'),

  -- --- Tren superior: tiron ------------------------------------------
  ('remo-barra',          'Remo con barra',             'Espalda',            'chart',    'pull'),
  ('remo-mano',           'Remo con mancuerna',         'Espalda',            'chart',    'pull'),
  ('remo-cuerda',         'Remo en polea',              'Espalda baja',       'chart',    'pull'),
  ('jalon-alto',          'Jalon frontal',              'Dorsal ancho',       'chart',    'pull'),
  ('jalon-bajo',          'Jalon con agarre neutro',    'Dorsal ancho',       'chart',    'pull'),
  ('remo-peso-corporal',  'Remo en TRX',                'Espalda',            'chart',    'pull'),
  ('curl-barra',          'Curl con barra',             'Biceps',             'dumbbell', 'pull'),
  ('curl-mancuernas',     'Curl con mancuernas',        'Biceps',             'dumbbell', 'pull'),
  ('curl-martillo',       'Curl martillo',              'Biceps',             'dumbbell', 'pull'),
  ('izan-reves',          'Izan de reves',              'Espalda baja',       'chart',    'pull'),
  ('superman',            'Superman',                   'Lumbar',             'target',   'core'),

  -- --- Tren inferior ---------------------------------------------------
  ('sentadilla-goblet',   'Sentadilla goblet',          'Cuadriceps',         'target',   'legs'),
  ('sentadilla-barra',    'Sentadilla trasera',         'Cuadriceps',         'dumbbell', 'legs'),
  ('sentadilla-bulgara',  'Sentadilla bulgara',         'Cuadriceps',         'target',   'legs'),
  ('peso-muerto-rumano',  'Peso muerto rumano',         'Isquiotibiales',     'chart',    'legs'),
  ('peso-muerto-rumano-t','Peso muerto rumano en T',    'Aductores',          'target',   'legs'),
  ('hipotonica',          'Hipotonica',                 'Isquiotibiales',     'target',   'legs'),
  ('zancada',             'Zancada',                    'Cuadriceps',         'target',   'legs'),
  ('step-up',             'Step up con mancuernas',     'Cuadriceps',         'target',   'legs'),
  ('extension-pierna',    'Extension de pierna',        'Cuadriceps',         'target',   'legs'),
  ('curl-pierna-sentado', 'Curl de pierna sentado',     'Isquiotibiales',     'target',   'legs'),
  ('elevacion-pelvis',    'Elevacion de pelvis',        'Gluteo medio',       'target',   'legs'),
  ('puente-de-gluteo',    'Puente de gluteo',           'Gluteo mayor',       'target',   'legs'),
  ('hiperextension',      'Hiperextension',             'Lumbar',             'target',   'core'),
  ('abduccion-cadera',    'Aduccion de cadera',         'Gluteo medio',       'target',   'legs'),

  -- --- Core ------------------------------------------------------------
  ('plancha',             'Plancha frontal',            'Core',               'target',   'core'),
  ('plancha-lateral',     'Plancha lateral',            'Oblicuos',           'target',   'core'),
  ('dead-bug',            'Dead bug',                   'Core',               'target',   'core'),
  ('rueda-abdominal',     'Rueda abdominal',            'Oblicuos',           'chart',    'core'),
  ('mountain-climber',    'Mountain climber',           'Core',               'target',   'core'),
  ('bird-dog',            'Bird dog',                   'Lumbar',             'target',   'core'),
  ('elevacion-piernas',   'Elevacion de piernas colgado','Abductores',         'target',   'core'),
  ('hollow-hold',         'Hollow hold',                'Core',               'target',   'core'),
  ('pantalla-kettlebell', 'Pantalla de kettlebell',     'Core',               'target',   'core'),
  ('toque-de-hombros',    'Toque de hombro al suelo',   'Core',               'target',   'core'),

  -- --- Movilidad -------------------------------------------------------
  ('movilidad-cadera',    'Movilidad de cadera',        'Caderas',            'refresh',  'movilidad'),
  ('movilidad-hombros',   'Movilidad de hombros',       'Hombros',            'refresh',  'movilidad'),
  ('movilidad-columna',   'Movilidad de columna',       'Columna',            'refresh',  'movilidad'),
  ('rotacion-torax',      'Rotacion de torax',          'Columna',            'refresh',  'movilidad'),
  ('estiramiento-isquio', 'Estiramiento de isquio',     'Isquiotibiales',     'refresh',  'movilidad'),
  ('flexion-piramidal',   'Flexion piramidal',          'Lumbar',             'refresh',  'movilidad'),
  ('circunduccion-hombro','Circunduccion de hombro',    'Hombros',            'refresh',  'movilidad'),
  ('perro-camello',       'Perro y camello',            'Columna',            'refresh',  'movilidad'),

  -- --- Cardio ----------------------------------------------------------
  ('caminata-rapida',     'Caminata rapida',            'Sistema cardiovascular', 'footprints', 'cardio'),
  ('bici-estatica',       'Bici estatica',              'Cardio',             'chart',    'cardio'),
  ('eliptica',            'Eliptica',                   'Cardio',             'chart',    'cardio'),
  ('cuerda-de-saltar',    'Cuerda de saltar',           'Cardio',             'activity', 'cardio'),
  ('rowing-ergometro',    'Remo en ergometro',          'Cardio',             'chart',    'cardio'),
  ('escaladora',          'Escaladora',                 'Cardio',             'footprints', 'cardio')
on conflict do nothing;

analyze public.ejercicios;