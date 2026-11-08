// FORMA · Genera la semilla `ejercicios` a partir del catálogo de FORMA.
//
// FORMA trae su propio catálogo de ejercicios en
// `src/training/lib/exercises-data.js` (`EXDB`), con ids numéricos ("0025") y
// nombres en inglés. El esquema de FORMA (`ejercicios`) usa ids-slug para su
// catálogo curado, pero la columna `id` es `text`, así que ambos conviven.
//
// Sin este volcado, `rutina_ejercicios.ejercicio_id` no puede resolver la clave
// foránea de una rutina creada en el cliente de entrenamiento. El fichero que
// produce (`dbb-supabase/supabase/seeds/05_catalogo_ejercicios.sql`) es generado:
// no se edita a mano.
//
//   node scripts/generate-exercises.mjs
//
// Es determinista (ordena por id), así que regenerarlo sin cambios no produce
// ruido en el diff.

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { EXDB } from "../src/training/lib/exercises-data.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEST = join(
  __dirname,
  "..",
  "dbb-supabase",
  "supabase",
  "seeds",
  "05_catalogo_ejercicios.sql",
)

// Músculo principal (`mg`) y objetivo (`tg`) de FORMA → `grupo_muscular` de
// FORMA. Se prueba primero el objetivo, que es lo que el ejercicio trabaja.
const POR_MUSCULO = {
  "cardiovascular system": "cardio",
  abs: "core",
  abdominals: "core",
  obliques: "core",
  "hip flexors": "core",
  "lower back": "core",
  spine: "core",
  core: "core",
  pectorals: "push",
  triceps: "push",
  delts: "push",
  shoulders: "push",
  "serratus anterior": "push",
  "levator scapulae": "push",
  biceps: "pull",
  lats: "pull",
  "upper back": "pull",
  traps: "pull",
  trapezius: "pull",
  forearms: "pull",
  rhomboids: "pull",
  "latissimus dorsi": "pull",
  "wrist flexors": "pull",
  "wrist extensors": "pull",
  hands: "pull",
  wrists: "pull",
  "rotator cuff": "pull",
  glutes: "legs",
  quadriceps: "legs",
  hamstrings: "legs",
  calves: "legs",
  adductors: "legs",
  abductors: "legs",
  soleus: "legs",
  ankles: "legs",
  "ankle stabilizers": "legs",
}

// Respaldo por parte del cuerpo (`bp`) cuando el músculo no está en la tabla.
const POR_PARTE = {
  waist: "core",
  cardio: "cardio",
  chest: "push",
  shoulders: "push",
  "upper arms": "push",
  "lower arms": "push",
  neck: "push",
  back: "pull",
  "upper legs": "legs",
  "lower legs": "legs",
}

// El icono es uno de los nombres de `IconName` que ya usan las pantallas.
const ICONO = {
  push: "dumbbell",
  pull: "chart",
  legs: "target",
  core: "target",
  cardio: "footprints",
  movilidad: "refresh",
  full_body: "dumbbell",
}

const grupoDe = (e) =>
  POR_MUSCULO[e.tg] || POR_MUSCULO[e.mg] || POR_PARTE[e.bp] || "full_body"

// "pectorals" → "Pectorals". Las etiquetas del catálogo de FORMA van en
// capitalizada ("Pecto mayor"), así que se conserva ese aspecto.
const titulo = (s) =>
  String(s || "")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")

const esc = (s) => String(s).replace(/'/g, "''")

const filas = EXDB.map((e) => ({
  id: e.id,
  nombre: e.n || e.id,
  musculo: titulo(e.tg || e.mg || e.bp),
  grupo: grupoDe(e),
  icono: ICONO[grupoDe(e)] || "dumbbell",
})).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

const lineas = filas.map(
  (f) =>
    `  ('${f.id}', ${q(f.nombre)}, ${q(f.musculo)}, '${f.icono}', '${f.grupo}')`,
)

function q(s) {
  return `'${esc(s)}'`
}

const sql = `-- FORMA · Catalogo de ejercicios de FORMA.
--
-- GENERADO por \`scripts/generate-exercises.mjs\` a partir de
-- \`src/training/lib/exercises-data.js\`. No se edita a mano.
--
-- Son los ejercicios que el cliente de entrenamiento (FORMA) referencia en sus
-- rutinas. Los ids son los suyos (numericos, "0025") y conviven con los slugs del
-- catalogo curado de FORMA ('press-banca'): la columna \`id\` es \`text\`, asi que
-- no chocan. Sin estas filas, \`rutina_ejercicios.ejercicio_id\` no resolveria.
--
-- \`musculo\` es el objetivo en ingles capitalizado y \`grupo_muscular\` se deriva
-- del musculo para poder agrupar y balancear.

insert into public.ejercicios (id, nombre, musculo, icono, grupo_muscular) values
${lineas.join(",\n")}
on conflict (id) do nothing;

analyze public.ejercicios;
`

writeFileSync(DEST, sql, "utf8")
console.log(`Escritos ${filas.length} ejercicios en ${DEST}`)
