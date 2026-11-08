// FORMA · Comprobacion de la sincronizacion de entrenamiento con Supabase.
//
// Ejercita el codigo real del web app (`src/lib/supabase.ts` y
// `src/training/lib/supabaseSync.js`) contra la pila local de `dbb-supabase/`:
// inicia sesion con el usuario de demostracion, vuelca un entrenamiento y un
// peso, comprueba que las filas y los agregados quedan bien, que reintentar no
// duplica, y limpia lo que ha escrito.
//
// Los modulos se cargan con el runner SSR de Vite porque el codigo de FORMA
// usa `import.meta.glob` e `import.meta.env`, que no existen en Node a secas.
//
// Uso, con la pila levantada (`npx supabase start` y `npx supabase db reset`) y
// el `.env` apuntando a ella:
//
//   pnpm run check:sync
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
})

const { supabase } = await server.ssrLoadModule("/src/lib/supabase.ts")
const {
  pushToSupabase,
  pullBodyweight,
  pullPlan,
  pushPlan,
  rutinaIdForWorkout,
  workoutToRows,
} = await server.ssrLoadModule("/src/training/lib/supabaseSync.js")

let fallos = 0
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FALLO"} ${msg}`)
  if (!cond) fallos++
}

const email = "demo@forma.test"
const password = "forma2026"
const FECHA_PESO = "2026-01-05"
const NOMBRE = "E2E Test Sync"

// 1) Inicio de sesion con el cliente real del proyecto.
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email,
  password,
})
ok(!authErr && !!auth.session, "inicia sesion el usuario de demostracion")
if (authErr) {
  console.error(authErr.message)
  await server.close()
  process.exit(1)
}
const userId = auth.session.user.id

// El plan propio que deje una ejecucion anterior (o una interrumpida) alteraria
// `semana_entrenamiento`: se parte de cero antes de probar nada.
await supabase.from("planes_entrenamiento").delete().eq("usuario_id", userId)

// 2) Mapeo puro: un entreno con un ejercicio y dos series completadas.
const workout = {
  id: "e2e-w-1",
  d: "2026-01-05",
  name: NOMBRE,
  start: new Date("2026-01-05T18:00:00Z").getTime(),
  end: new Date("2026-01-05T18:30:00Z").getTime(),
  entries: [
    {
      id: "0025",
      topW: 60,
      sets: [
        { w: 60, r: 8, done: true },
        { w: 60, r: 8, done: true },
      ],
    },
  ],
}
const rows = workoutToRows(
  workout,
  userId,
  "00000000-0000-4000-8000-000000000001",
)
ok(rows.session.duracion_seg === 1800, "duracion calculada = 1800 s")
ok(rows.session.estado === "completada", "estado completada")
ok(rows.session.kcal_estimadas === Math.round(30 * 7.4), "kcal estimadas")
ok(rows.ejercicios.length === 1, "un ejercicio mapeado")
ok(rows.ejercicios[0].series.length === 2, "dos series mapeadas")
ok(
  rows.ejercicios[0].series.every(
    (s) => s.completada && s.kg === 60 && s.reps === 8,
  ),
  "series con kg/reps/completada",
)

// 3) Push real.
const S = {
  bodyweight: [{ d: FECHA_PESO, w: 80.5 }],
  workouts: [workout],
  supaSynced: {},
}
const pushOk = await pushToSupabase(S)
ok(pushOk, "pushToSupabase devuelve ok")

// 4) Verificacion en la base.
const { data: sesiones } = await supabase
  .from("sesiones_entrenamiento")
  .select(
    "id, nombre, duracion_seg, estado, volumen_total_kg, series_completadas, kcal_estimadas",
  )
  .eq("nombre", NOMBRE)
ok(sesiones && sesiones.length === 1, "hay exactamente una sesion")
const sesion = sesiones?.[0]
ok(
  sesion?.volumen_total_kg === 960,
  `volumen = 960 kg (real: ${sesion?.volumen_total_kg})`,
)
ok(
  sesion?.series_completadas === 2,
  `series completadas = 2 (real: ${sesion?.series_completadas})`,
)

const { data: ejercicios } = await supabase
  .from("sesiones_ejercicios")
  .select(
    "id, nombre, musculo, series_planificadas, reps_planificadas, carga_sugerida_kg",
  )
  .eq("sesion_id", sesion.id)
ok(ejercicios?.length === 1, "una fila de ejercicio")
ok(
  !!ejercicios?.[0]?.nombre,
  `el ejercicio tiene nombre (${ejercicios?.[0]?.nombre})`,
)
ok(ejercicios?.[0]?.series_planificadas === 2, "series_planificadas = 2")

const { data: series } = await supabase
  .from("sesiones_series")
  .select("numero_serie, kg, reps, completada")
  .eq("sesion_ejercicio_id", ejercicios?.[0]?.id)
  .order("numero_serie")
ok(series?.length === 2, "dos series en la base")
ok(
  series?.every((s) => s.kg === 60 && s.reps === 8 && s.completada),
  "las series guardadas coinciden",
)

const { data: peso } = await supabase
  .from("mediciones_progreso")
  .select("fecha, peso_kg, origen")
  .eq("fecha", FECHA_PESO)
ok(
  peso?.length === 1 && Number(peso[0].peso_kg) === 80.5,
  "peso corporal sincronizado",
)
ok(peso?.[0]?.origen === "check_in", "origen = check_in")

// 5) Idempotencia: se olvida lo enviado y se repite el push.
S.supaSynced = {}
await pushToSupabase(S)
const { data: sesiones2 } = await supabase
  .from("sesiones_entrenamiento")
  .select("id")
  .eq("nombre", NOMBRE)
ok(sesiones2?.length === 1, "reintentar no duplica la sesion")
// Los hijos se reescriben, de modo que se cuentan por la sesion, no por el id
// del ejercicio anterior.
const { data: ejercicios2 } = await supabase
  .from("sesiones_ejercicios")
  .select("id")
  .eq("sesion_id", sesion.id)
const idsEjercicio = (ejercicios2 || []).map((e) => e.id)
const { count: seriesCount } = await supabase
  .from("sesiones_series")
  .select("*", { count: "exact", head: true })
  .in("sesion_ejercicio_id", idsEjercicio)
ok(seriesCount === 2, `reintentar deja 2 series, no mas (real: ${seriesCount})`)

// 6) Pull del peso a un estado vacio.
const S2 = { bodyweight: [] }
const changed = await pullBodyweight(S2)
ok(
  changed && S2.bodyweight.length > 0,
  `pullBodyweight trae ${S2.bodyweight.length} medidas`,
)
ok(
  S2.bodyweight.every((b, i, a) => i === 0 || a[i - 1].d <= b.d),
  "las medidas llegan ordenadas por fecha",
)

// 7) Plan: rutinas + semana -> esquema normalizado (filas propias del usuario).
const rutinaLocal = {
  id: "r-e2e",
  name: "E2E Push",
  emoji: "figureStrength",
  ex: [
    { id: "0025", sets: 4, reps: 8, weight: 60 },
    { id: "0047", sets: 3, reps: 10, weight: 45 },
    // Un ejercicio del catalogo curado de FORMA (slug): FORMA no lo conoce, asi
    // que al traer el plan tiene que registrarlo para poder pintarlo.
    { id: "press-banca", sets: 5, reps: 5, weight: 80 },
  ],
}
const SP = {
  routines: [rutinaLocal],
  week: { 2: "r-e2e" },
  customEx: [],
  planSource: "local",
}
ok(await pushPlan(SP), "pushPlan devuelve ok")
ok(
  !!SP.supaPlans?.[2] && !!SP.supaRoutines?.[2],
  "asigna ids estables de plan y rutina",
)
ok(SP.planSource === "supabase", "tras subirlo, el plan pasa a ser propio")

const { data: planes } = await supabase
  .from("planes_entrenamiento")
  .select("id, dia_semana")
  .eq("usuario_id", userId)
ok(
  planes?.length === 1 && planes[0].dia_semana === 2,
  "queda un plan propio para el martes",
)
const { data: ruts } = await supabase
  .from("rutinas")
  .select("id, titulo")
  .eq("plan_id", planes[0].id)
ok(
  ruts?.length === 1 && ruts[0].titulo === "E2E Push",
  "la rutina cuelga del plan",
)
const { data: presc } = await supabase
  .from("rutina_ejercicios")
  .select("ejercicio_id, orden, series, reps")
  .eq("rutina_id", ruts[0].id)
  .order("orden")
ok(presc?.length === 3, "tres prescripciones")
ok(
  presc?.[0]?.ejercicio_id === "0025" &&
    presc[0].series === 4 &&
    presc[0].reps === 8,
  "la primera prescripcion coincide",
)

const { data: semana } = await supabase.rpc("semana_entrenamiento", {})
ok(semana?.personal === true, "semana_entrenamiento marca el plan como propio")
const martes = (semana?.dias || []).find((d) => d.dia_semana === 2)
ok(
  martes?.rutinas?.[0]?.titulo === "E2E Push" &&
    martes.rutinas[0].propio === true,
  "el martes sale del plan propio",
)

// 8) Pull del plan a un estado vacio.
const SP2 = { routines: [], week: {}, customEx: [], pulledEx: [] }
const traido = await pullPlan(SP2)
ok(traido, "pullPlan trae el plan")
ok(
  SP2.routines.length === 1 && SP2.week[2] === SP2.routines[0].id,
  "rutina y semana rehidratadas",
)
ok(
  SP2.pulledEx.some((e) => e.id === "press-banca") &&
    !SP2.pulledEx.some((e) => e.id === "0025"),
  "el ejercicio del catalogo se registra y el que FORMA ya conoce no",
)
ok(!!SP2.supaRoutines?.[2], "el pull recuerda el id de rutina")

// 9) Idempotencia: cambiar la rutina y volver a subir no duplica.
SP.routines[0].ex[1].weight = 50
await pushPlan(SP)
const { data: planesB } = await supabase
  .from("planes_entrenamiento")
  .select("id")
  .eq("usuario_id", userId)
ok(planesB?.length === 1, "reintentar el plan no duplica")

// 10) Un entreno que sale de la rutina la marca completada para el dia.
const rutinaId = rutinaIdForWorkout(SP2, SP2.week[2], "2026-01-05")
ok(!!rutinaId, "el entreno enlaza con su rutina")
SP2.workouts = [
  {
    id: "e2e-w-2",
    d: "2026-01-05",
    routineId: SP2.week[2],
    name: "E2E Plan Session",
    start: new Date("2026-01-05T18:00:00Z").getTime(),
    end: new Date("2026-01-05T18:30:00Z").getTime(),
    entries: [{ id: "0025", topW: 60, sets: [{ w: 60, r: 8, done: true }] }],
  },
]
SP2.supaSynced = {}
ok(await pushToSupabase(SP2), "push del entreno enlazado")
const { data: ses2 } = await supabase
  .from("sesiones_entrenamiento")
  .select("rutina_id")
  .eq("nombre", "E2E Plan Session")
ok(ses2?.[0]?.rutina_id === rutinaId, "la sesion apunta a la rutina")
const { data: reg } = await supabase
  .from("registro_rutinas_diarias")
  .select("estado, porcentaje_completado")
  .eq("rutina_id", rutinaId)
  .eq("fecha", "2026-01-05")
ok(
  reg?.length === 1 &&
    reg[0].estado === "completada" &&
    reg[0].porcentaje_completado === 100,
  "la rutina del dia queda completada",
)

// 11) Reasignar un dia que se dejo atras. Mover la rutina del martes al jueves
// deja el martes inactivo; un dispositivo que no recuerde los ids (localStorage
// borrado) debe poder volver a poner rutina el martes sin chocar con la fila
// inactiva.
const SPmov = {
  ...SP,
  week: { 4: "r-e2e" },
  supaPlans: { ...SP.supaPlans },
  supaRoutines: { ...SP.supaRoutines },
  planSig: null,
}
await pushPlan(SPmov)
const { data: martesInactivos } = await supabase
  .from("planes_entrenamiento")
  .select("id")
  .eq("usuario_id", userId)
  .eq("dia_semana", 2)
  .eq("activo", false)
ok((martesInactivos?.length || 0) >= 1, "el martes queda inactivo, no borrado")
const SPfresh = {
  routines: SP.routines,
  week: { 2: "r-e2e" },
  customEx: [],
  planSource: "local",
}
ok(await pushPlan(SPfresh), "sin memoria de ids, se reasigna el martes")
const { data: martesActivos } = await supabase
  .from("planes_entrenamiento")
  .select("id")
  .eq("usuario_id", userId)
  .eq("dia_semana", 2)
  .eq("activo", true)
ok(martesActivos?.length === 1, "queda un unico martes activo")

// 12) Limpieza. Borrar el plan arrastra rutina, prescripciones y registro.
await supabase.from("sesiones_entrenamiento").delete().eq("nombre", NOMBRE)
await supabase
  .from("sesiones_entrenamiento")
  .delete()
  .eq("nombre", "E2E Plan Session")
await supabase.from("mediciones_progreso").delete().eq("fecha", FECHA_PESO)
await supabase.from("planes_entrenamiento").delete().eq("usuario_id", userId)
await supabase.auth.signOut()
await server.close()

console.log(fallos === 0 ? "\nTODO CORRECTO" : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
