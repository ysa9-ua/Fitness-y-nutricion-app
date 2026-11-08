// FORMA · Puente entre el estado del entrenamiento y las tablas de
// Supabase.
//
// El entrenamiento guarda todo su mundo en un único objeto `S` (routines, week, workouts,
// bodyweight…). Este fichero lo vuelca al esquema de FORMA y lo rehidrata:
//
//   · `S.routines` + `S.week` → `planes_entrenamiento` + `rutinas` + `rutina_ejercicios`
//   · `S.bodyweight`          → `mediciones_progreso`   (peso, única por fecha)
//   · `S.workouts`            → `sesiones_entrenamiento` + `_ejercicios` + `_series`
//                               y `registro_rutinas_diarias` (marca la rutina del
//                               día como completada, que es lo que lee Flutter)
//
// Las rutinas del usuario son filas propias (`planes_entrenamiento.usuario_id`),
// encima del catálogo compartido. El detalle del esquema está en la migración
// `20261014090000_entrenamiento_usuario.sql` y en `src/training/README.md`.
//
// La sincronización es "push primero": no escribe en Supabase nada que el
// usuario no haya registrado. La idempotencia se apoya en claves estables que se
// guardan dentro del propio `S` (`rutina.supabaseId`, `S.supaPlans`, `S.planSig`),
// de modo que reintentar nunca duplica.

import { supabase, isSupabaseConfigured } from "../../lib/supabase"
import { exOr, EXIDX } from "./exercises.js"
import { DEFAULT_GLYPH } from "./glyphs.js"

/** `true` si el entorno trae credenciales de Supabase. */
export const isSupabaseSyncAvailable = () => isSupabaseConfigured && !!supabase

/** El usuario de Auth de la sesión actual, o `null` si no hay sesión. */
export async function getSessionUser() {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user ?? null
  } catch {
    return null
  }
}

// `crypto.randomUUID` existe en todos los navegadores y WebViews modernos; el
// respaldo evita un `undefined` en un contexto raro.
const newId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const clampSmall = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

// FORMA numera los días como `Date.getDay()` (0 = domingo); el esquema, como
// ISO (1 = lunes … 7 = domingo). Estas dos van y vienen entre ambos.
const isoDay = (jsDay) => (Number(jsDay) === 0 ? 7 : Number(jsDay))
const jsDay = (iso) => (Number(iso) === 7 ? 0 : Number(iso))

// ---------------------------------------------------------------------------
// Ejercicios
// ---------------------------------------------------------------------------
const GRUPO_POR_PARTE = {
  cardio: "cardio",
  waist: "core",
  chest: "push",
  shoulders: "push",
  "upper arms": "push",
  "lower arms": "push",
  neck: "push",
  back: "pull",
  "upper legs": "legs",
  "lower legs": "legs",
}

/** Grupo muscular de FORMA a partir del ejercicio del entrenamiento. */
function grupoDe(ex) {
  if (!ex) return "full_body"
  if (ex.grupo_muscular) return ex.grupo_muscular
  return GRUPO_POR_PARTE[ex.bp] || "full_body"
}

/**
 * Los ejercicios propios (`S.customEx`) que usen las rutinas, en la forma que
 * espera `upsert_catalogo_ejercicios`. El catálogo del entrenamiento ya va sembrado, así
 * que esto solo cubre los que el usuario creó en su dispositivo.
 */
function customExerciseRows(S, ids) {
  return (S.customEx || [])
    .filter((e) => e && e.id && ids.has(e.id))
    .map((e) => ({
      id: e.id,
      nombre: e.n || e.id,
      musculo: e.tg || e.mg || e.bp || "",
      icono: "dumbbell",
      grupo_muscular: grupoDe(e),
    }))
}

// ---------------------------------------------------------------------------
// Plan (rutinas + semana)
// ---------------------------------------------------------------------------

/**
 * Firma de la parte de `S` que se sincroniza como plan. Se guarda en `S.planSig`
 * tras cada pull/push: si sigue igual, no hay nada que enviar (y, sobre todo, un
 * plan que solo vino del catálogo no se convierte en propio por el simple hecho
 * de abrir la app).
 */
export function planSignature(S) {
  const routines = (S?.routines || []).map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    ex: (r.ex || []).map((e) => [
      e.id,
      e.sets ?? null,
      e.reps ?? null,
      e.weight ?? 0,
      e.mode ?? "",
    ]),
  }))
  const week = Object.keys(S?.week || {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((d) => [d, S.week[d]])
  return JSON.stringify({ routines, week })
}

/** Una fila de `rutina_ejercicios` a partir de una entrada de rutina. */
function prescriptionRow(rutinaId, e, orden) {
  if (!e || !e.id) return null
  const mode = e.mode === "cardio" || e.mode === "time" ? e.mode : "reps"
  // El esquema no guarda el modo: el tiempo va en `reps` (minutos o segundos) y
  // el modo se recupera al leer por el `grupo_muscular` del ejercicio.
  const reps =
    mode === "cardio"
      ? num(e.min) || 20
      : mode === "time"
        ? num(e.sec) || 45
        : num(e.reps) || 10
  return {
    rutina_id: rutinaId,
    ejercicio_id: e.id,
    orden,
    series: clampSmall(num(e.sets) || 1, 1, 32767),
    reps: clampSmall(reps, 1, 32767),
    carga_sugerida_kg: Math.max(0, num(e.weight)),
    descanso_seg: 90,
    record_previo_kg: 0,
    consejo: "",
  }
}

/**
 * Vuelca a Supabase las rutinas del usuario y el reparto de la semana.
 *
 * Se crea un plan por día de la semana (el entrenamiento solo puede tener una rutina por
 * día) con una única rutina colgando de él y sus prescripciones. Los ids de plan
 * y rutina se guardan en `S.supaPlans` / `S.supaRoutines`, indexados por día, para
 * que reintentar actualice en vez de duplicar. Un día que se quede sin rutina no
 * se borra (borrar la rutina arrastraría el historial de `registro_rutinas_diarias`):
 * se marca `activo = false`.
 */
export async function pushPlan(S) {
  if (!supabase || !S) return false
  const user = await getSessionUser()
  if (!user) return false
  if (!(S.routines || []).length) return true // nada que empujar, no se toca el servidor

  const sig = planSignature(S)
  if (S.planSig === sig) return true // sin cambios desde el último pull/push

  const week = S.week || {}
  const days = Object.keys(week)
    .map(Number)
    .filter((d) => (S.routines || []).some((r) => r.id === week[d]))
  if (!days.length) return true

  // Si lo que hay en pantalla es el plan del catálogo, no se tocan sus filas: los
  // planes propios se crean con ids nuevos (y, al tener dueño, tapan al catálogo
  // en `semana_entrenamiento`).
  if (S.planSource === "catalog") {
    S.supaPlans = {}
    S.supaRoutines = {}
  }
  S.supaPlans = S.supaPlans || {}
  S.supaRoutines = S.supaRoutines || {}

  // 1) Asegurar que existan los ejercicios propios referenciados.
  const ids = new Set()
  for (const r of S.routines)
    for (const e of r.ex || []) if (e && e.id) ids.add(e.id)
  const customs = customExerciseRows(S, ids)
  if (customs.length) {
    try {
      await supabase.rpc("upsert_catalogo_ejercicios", {
        p_ejercicios: customs,
      })
    } catch {
      /* si falla, la FK lo dirá al insertar la prescripción */
    }
  }

  let ok = true
  for (const day of days) {
    const r = (S.routines || []).find((x) => x.id === week[day])
    if (!r) continue
    if (!S.supaPlans[day]) S.supaPlans[day] = newId()
    if (!S.supaRoutines[day]) S.supaRoutines[day] = newId()
    const planId = S.supaPlans[day]
    const rutinaId = S.supaRoutines[day]
    const titulo = r.name || "Rutina"

    try {
      const { error: ePlan } = await supabase
        .from("planes_entrenamiento")
        .upsert({
          id: planId,
          usuario_id: user.id,
          titulo,
          titulo_corto: titulo,
          dia_semana: isoDay(day),
          fase: 1,
          activo: true,
        })
      if (ePlan) {
        ok = false
        continue
      }

      const { error: eRutina } = await supabase.from("rutinas").upsert({
        id: rutinaId,
        plan_id: planId,
        titulo,
        subtitulo: "",
        enfoque: "",
        musculos: [],
        duracion_min: 0,
        intensidad: "media",
        kcal_estimadas: 0,
        hora_programada: null,
        es_descanso: false,
        orden: 1,
        activo: true,
      })
      if (eRutina) {
        ok = false
        continue
      }

      await supabase
        .from("rutina_ejercicios")
        .delete()
        .eq("rutina_id", rutinaId)
      const rows = (r.ex || [])
        .map((e, i) => prescriptionRow(rutinaId, e, i))
        .filter(Boolean)
      if (rows.length) {
        const { error: eEx } = await supabase
          .from("rutina_ejercicios")
          .insert(rows)
        if (eEx) ok = false
      }
    } catch {
      // Sin red a mitad: se reintenta en el siguiente ciclo.
      ok = false
    }
  }

  // Días que ya no tienen rutina asignada: se desactivan (no se borran).
  for (const key of Object.keys(S.supaPlans)) {
    const d = Number(key)
    if (days.includes(d)) continue
    try {
      await supabase
        .from("planes_entrenamiento")
        .update({ activo: false })
        .eq("id", S.supaPlans[key])
      if (S.supaRoutines[key]) {
        await supabase
          .from("rutinas")
          .update({ activo: false })
          .eq("id", S.supaRoutines[key])
      }
    } catch {
      /* se reintentará */
    }
  }

  if (ok) {
    S.planSig = sig
    S.planSource = "supabase"
  }
  return ok
}

/**
 * Trae de Supabase el plan de la semana y lo mete en `S.routines` / `S.week`.
 *
 * `semana_entrenamiento` ya resuelve la preferencia: el plan propio del usuario
 * si lo tiene, y si no el del catálogo. Los ejercicios que aparezcan y el entrenamiento no
 * conozca (los del catálogo, o los de otro dispositivo) se registran en
 * `S.pulledEx` para que la interfaz sepa pintarlos.
 *
 * No pisa ediciones locales sin sincronizar: si `S` trae un plan distinto del
 * último que se subió (`S.planSig`), se deja ganar a lo local y se empujará.
 */
export async function pullPlan(S) {
  if (!supabase || !S) return false
  const localDirty =
    (S.routines || []).length > 0 && S.planSig !== planSignature(S)
  if (localDirty) return false

  let semana
  try {
    const { data, error } = await supabase.rpc("semana_entrenamiento", {})
    if (error || !data) return false
    semana = data
  } catch {
    return false
  }

  // Un solo día → una rutina: es todo lo que el estado sabe representar por día.
  const porDia = {}
  const rutinaIds = []
  for (const d of Array.isArray(semana.dias) ? semana.dias : []) {
    const rutina = (d.rutinas || [])[0]
    if (!rutina || !rutina.id) continue
    const day = jsDay(d.dia_semana)
    porDia[day] = {
      rutinaId: rutina.id,
      planId: rutina.plan_id,
      propio: !!rutina.propio,
      titulo: rutina.titulo || "Rutina",
    }
    rutinaIds.push(rutina.id)
  }
  if (!rutinaIds.length) return false

  let presc = []
  try {
    const { data, error } = await supabase
      .from("rutina_ejercicios")
      .select(
        "rutina_id, ejercicio_id, orden, series, reps, carga_sugerida_kg, ejercicios(nombre, musculo, grupo_muscular)",
      )
      .in("rutina_id", rutinaIds)
    if (!error && Array.isArray(data)) presc = data
  } catch {
    /* se sigue con las rutinas sin detalle */
  }

  const porRutina = {}
  for (const row of presc) {
    ;(porRutina[row.rutina_id] = porRutina[row.rutina_id] || []).push(row)
  }

  const pulled = S.pulledEx || []
  const pulledIds = new Set(pulled.map((e) => e.id))
  const routines = []
  const week = {}
  const supaPlans = {}
  const supaRoutines = {}
  let propio = false

  for (const day of Object.keys(porDia)
    .map(Number)
    .sort((a, b) => a - b)) {
    const info = porDia[day]
    const ex = (porRutina[info.rutinaId] || [])
      .slice()
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((row) => {
        const ej = row.ejercicios || {}
        if (!EXIDX[row.ejercicio_id] && !pulledIds.has(row.ejercicio_id)) {
          pulledIds.add(row.ejercicio_id)
          pulled.push({
            id: row.ejercicio_id,
            n: ej.nombre || row.ejercicio_id,
            bp: ej.grupo_muscular === "cardio" ? "cardio" : "",
            tg: ej.musculo || "",
            mg: ej.musculo || "",
            eq: "",
            sm: [],
            st: [],
          })
        }
        return {
          id: row.ejercicio_id,
          sets: row.series,
          reps: row.reps,
          weight: num(row.carga_sugerida_kg),
        }
      })

    // El id local de la rutina es el del servidor: así `rutinaIdForWorkout`
    // resuelve sin tabla intermedia cuando la rutina no es propia.
    routines.push({
      id: info.rutinaId,
      name: info.titulo,
      emoji: DEFAULT_GLYPH,
      ex,
    })
    week[day] = info.rutinaId
    if (info.propio) {
      propio = true
      supaPlans[day] = info.planId
      supaRoutines[day] = info.rutinaId
    }
  }

  S.routines = routines
  S.week = week
  S.pulledEx = pulled
  if (propio) {
    S.supaPlans = supaPlans
    S.supaRoutines = supaRoutines
    S.planSource = "supabase"
  } else {
    // Catálogo: no es del usuario, así que no se reutilizan sus ids. Si edita, se
    // crearán planes propios encima.
    S.planSource = "catalog"
  }
  S.planSig = planSignature(S)
  return true
}

// ---------------------------------------------------------------------------
// Peso corporal
// ---------------------------------------------------------------------------

const within = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi

/**
 * Añade a `S.bodyweight` las fechas que existan en Supabase y falten en local.
 *
 * Solo un sentido (servidor → local) y por fecha: no pisa una medida que el
 * usuario ya tenga en el dispositivo.
 */
export async function pullBodyweight(S) {
  if (!supabase || !S) return false
  const user = await getSessionUser()
  if (!user) return false

  let data
  try {
    const res = await supabase
      .from("mediciones_progreso")
      .select("fecha, peso_kg")
      .order("fecha", { ascending: true })
    if (res.error || !Array.isArray(res.data)) return false
    data = res.data
  } catch {
    // Sin red: lo que ya hay en el dispositivo manda.
    return false
  }

  const actuales = S.bodyweight || []
  const fechas = new Set(actuales.map((b) => b.d))
  const nuevas = []
  for (const fila of data) {
    const fecha = fila?.fecha
    const peso = Number(fila?.peso_kg)
    if (!fecha || !within(peso, 30, 250) || fechas.has(fecha)) continue
    nuevas.push({ d: fecha, w: Math.round(peso * 10) / 10 })
    fechas.add(fecha)
  }
  if (!nuevas.length) return false

  S.bodyweight = [...actuales, ...nuevas].sort((a, b) =>
    a.d < b.d ? -1 : a.d > b.d ? 1 : 0,
  )
  return true
}

/** Vuelca el peso corporal en `mediciones_progreso` (upsert por fecha). */
export async function pushBodyweight(S) {
  if (!supabase || !S) return false
  const user = await getSessionUser()
  if (!user) return false

  const filas = (S.bodyweight || [])
    .filter((b) => b?.d)
    .map((b) => ({ ...b, w: Number(b.w) }))
    .filter((b) => within(b.w, 30, 250))
    .map((b) => ({
      usuario_id: user.id,
      fecha: b.d,
      peso_kg: b.w,
      origen: "check_in",
    }))
  if (!filas.length) return true

  try {
    const { error } = await supabase
      .from("mediciones_progreso")
      .upsert(filas, { onConflict: "usuario_id,fecha" })
    return !error
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Entrenamientos terminados
// ---------------------------------------------------------------------------

/**
 * A qué rutina de Supabase corresponde un entrenamiento, si el usuario lo empezó
 * desde una rutina. Se busca por el día de la semana; si la rutina estaba
 * asignada a otro día (o es del catálogo), se busca en cualquier día.
 */
export function rutinaIdForWorkout(S, routineId, fecha) {
  if (!routineId) return null
  const week = S.week || {}
  const supaRoutines = S.supaRoutines || {}
  let day = null
  try {
    day = new Date(`${fecha}T00:00:00`).getDay()
  } catch {
    day = null
  }
  if (day != null && week[day] === routineId && supaRoutines[day])
    return supaRoutines[day]
  for (const d of Object.keys(week)) {
    if (week[d] === routineId && supaRoutines[d]) return supaRoutines[d]
  }
  // Plan del catálogo: el id local de la rutina ya es el del servidor, y vale
  // aunque el entreno se haga un día distinto del asignado.
  if (S.planSource === "catalog") {
    for (const d of Object.keys(week))
      if (week[d] === routineId) return routineId
  }
  return null
}

/**
 * Convierte un entrenamiento terminado en la fila de
 * `sesiones_entrenamiento` y las de sus ejercicios/series.
 *
 * Función pura a propósito (salvo `sessionId` y `rutinaId`, que se le pasan): así
 * el mapeo se puede probar sin una base de datos delante.
 */
export function workoutToRows(w, userId, sessionId, rutinaId = null) {
  const duracion =
    w.start && w.end ? Math.max(0, Math.round((w.end - w.start) / 1000)) : 0

  const session = {
    id: sessionId,
    usuario_id: userId,
    // La rutina de la que salió, si salió de una.
    rutina_id: rutinaId,
    nombre: w.name || "Entrenamiento",
    fecha: w.d,
    iniciada_at: w.start ? new Date(w.start).toISOString() : null,
    finalizada_at: w.end ? new Date(w.end).toISOString() : null,
    duracion_seg: duracion,
    estado: "completada",
    // El servidor usa 7,4 kcal/min al finalizar; se adelanta aquí para que la
    // fila quede completa en un solo insert.
    kcal_estimadas: Math.round((duracion / 60) * 7.4),
  }

  const ejercicios = (w.entries || []).map((entry, orden) => {
    const ex = exOr(entry.id)
    const sets = entry.sets || []
    const row = {
      sesion_id: sessionId,
      // El catálogo ya está en `ejercicios`, pero el id puede ser el de
      // un ejercicio propio o desconocido; el nombre y el músculo se copian igual
      // para que la sesión se lea sin depender de la FK.
      ejercicio_id: EXIDX[entry.id] ? entry.id : null,
      nombre: ex.n || "Ejercicio",
      musculo: ex.mg || ex.tg || ex.bp || "",
      icono: "dumbbell",
      series_planificadas: sets.length,
      reps_planificadas: sets[0]?.r ?? 0,
      carga_sugerida_kg: entry.topW ?? sets[0]?.w ?? 0,
      descanso_seg: 0,
      record_previo_kg: 0,
      consejo: "",
      orden,
    }
    const series = sets.map((s, i) => ({
      numero_serie: i + 1,
      kg: s.w ?? 0,
      reps: s.r ?? 0,
      completada: !!s.done,
    }))
    return { row, series }
  })

  return { session, ejercicios }
}

/**
 * Vuelca los entrenamientos terminados que aún no están en Supabase.
 *
 * Cada workout recibe una vez un `supabaseId` estable que se guarda en el
 * propio objeto (y por tanto en `localStorage`): así reintentar actualiza la
 * misma sesión en vez de crear otra. Los hijos se borran y se reescriben en cada
 * intento, para que un envío cortado a medias no deje series huérfanas ni
 * dispare el índice `unique (sesion_id, orden)`.
 *
 * Si el entrenamiento salió de una rutina, además se marca esa rutina como
 * completada para el día (`registro_rutinas_diarias`): es lo que hace que la
 * semana de Flutter aparezca con la rutina hecha.
 */
export async function pushWorkouts(S) {
  if (!supabase || !S) return false
  const user = await getSessionUser()
  if (!user) return false

  const enviados = (S.supaSynced = S.supaSynced || {})
  let ok = true

  for (const w of S.workouts || []) {
    if (!w || !w.d || !w.id || enviados[w.id]) continue
    try {
      if (!w.supabaseId) w.supabaseId = newId()

      const rutinaId = rutinaIdForWorkout(S, w.routineId, w.d)
      const { session, ejercicios } = workoutToRows(
        w,
        user.id,
        w.supabaseId,
        rutinaId,
      )
      const { error: errorSesion } = await supabase
        .from("sesiones_entrenamiento")
        .upsert(session)
      if (errorSesion) {
        ok = false
        continue
      }

      await supabase
        .from("sesiones_ejercicios")
        .delete()
        .eq("sesion_id", session.id)

      let hijosOk = true
      for (const { row, series } of ejercicios) {
        const { data, error } = await supabase
          .from("sesiones_ejercicios")
          .insert(row)
          .select("id")
          .single()
        if (error || !data) {
          hijosOk = false
          break
        }
        if (series.length) {
          const { error: errorSeries } = await supabase
            .from("sesiones_series")
            .insert(series.map((s) => ({ ...s, sesion_ejercicio_id: data.id })))
          if (errorSeries) {
            hijosOk = false
            break
          }
        }
      }
      if (!hijosOk) {
        ok = false
        continue
      }

      // Marca la rutina del día como hecha. Best-effort: si falla, la sesión ya
      // está guardada y el reintento no vuelve a pasar por aquí, así que no se
      // bloquea el envío por esto.
      if (rutinaId) {
        try {
          const { error: errorRegistro } = await supabase
            .from("registro_rutinas_diarias")
            .upsert(
              {
                usuario_id: user.id,
                rutina_id: rutinaId,
                fecha: w.d,
                estado: "completada",
                porcentaje_completado: 100,
                completada_at: w.end
                  ? new Date(w.end).toISOString()
                  : new Date().toISOString(),
              },
              { onConflict: "usuario_id,rutina_id,fecha" },
            )
          if (errorRegistro) ok = false
        } catch {
          ok = false
        }
      }

      enviados[w.id] = true
    } catch {
      // Sin red a mitad: se dejará para el siguiente intento.
      ok = false
    }
  }

  return ok
}

/**
 * Empuja plan, peso y entrenamientos. Devuelve `false` si algo no se pudo
 * guardar. El plan va primero para que un entrenamiento pueda enlazar con su
 * rutina recién creada.
 */
export async function pushToSupabase(S) {
  if (!S) return false
  const planOk = await pushPlan(S)
  const pesoOk = await pushBodyweight(S)
  const entrenosOk = await pushWorkouts(S)
  return planOk && pesoOk && entrenosOk
}
