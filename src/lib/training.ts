/**
 * FORMA · Cliente de entrenamiento del shell web.
 *
 * Espeja la parte de entrenamiento de `forma/lib/data/repositorio.dart`: las
 * mismas tablas y RPC, para que el plan, la sesión activa, el historial y el
 * progreso de fuerza se pinten dentro de FORMA y no en el iframe de FORMA.
 *
 * Igual que `backend.ts`, ninguna función lanza si falta la conexión o la
 * sesión: devuelve `null` (o vacío) y la pantalla decide qué enseñar.
 */

import { isSupabaseConfigured, supabase } from "./supabase"

export type EstadoRutina = "programada" | "completada" | "descanso"

export type Rutina = {
  id: string
  titulo: string
  subtitulo: string
  enfoque: string
  musculos: string[]
  duracionMin: number
  intensidad: string
  kcalEstimadas: number
  horaProgramada: string | null
  esDescanso: boolean
  estado: EstadoRutina
  porcentajeCompletado: number
}

export type DiaEntrenamiento = {
  diaSemana: number
  fecha: string
  esHoy: boolean
  titulo: string
  tituloCorto: string
  rutinas: Rutina[]
}

export type SemanaEntrenamiento = {
  lunes: string
  domingo: string
  sesionEnCurso: string | null
  personal: boolean
  dias: DiaEntrenamiento[]
}

export type SerieSesion = {
  id: string
  numero: number
  kg: number
  reps: number
  completada: boolean
}

export type EjercicioSesion = {
  id: string
  nombre: string
  musculo: string
  icono: string
  seriesPlanificadas: number
  repsPlanificadas: number
  cargaSugeridaKg: number
  descansoSeg: number
  recordPrevioKg: number
  consejo: string
  orden: number
  series: SerieSesion[]
}

export type SesionEntrenamiento = {
  id: string
  rutinaId: string | null
  nombre: string
  fecha: string
  iniciadaAt: string | null
  finalizadaAt: string | null
  duracionSeg: number
  seriesTotales: number
  seriesCompletadas: number
  volumenTotalKg: number
  nuevosRecords: number
  kcalEstimadas: number
  estado: string
  ejercicios: EjercicioSesion[]
}

export type ProgresoFuerza = {
  volumenKg: number
  sesiones: number
  volumenAnteriorKg: number
  sesionesAnteriores: number
  variacionPct: number | null
}

type Crudo = Record<string, unknown>

/** `true` cuando hay cliente y credenciales: sin esto no se consulta nada. */
export function entrenamientoDisponible() {
  return isSupabaseConfigured && supabase !== null
}

// ---------------------------------------------------------------------------
// Utilidades de conversion
// ---------------------------------------------------------------------------

function num(valor: unknown, porDefecto = 0): number {
  const n = typeof valor === "string" ? Number(valor) : valor
  return typeof n === "number" && Number.isFinite(n) ? n : porDefecto
}

function txt(valor: unknown, porDefecto = ""): string {
  return typeof valor === "string" ? valor : porDefecto
}

function bol(valor: unknown, porDefecto = false): boolean {
  return typeof valor === "boolean" ? valor : porDefecto
}

function listaTexto(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string")
    : []
}

/** Fecha local en `YYYY-MM-DD`, sin pasar por UTC (evita saltos de dia). */
export function aISO(fecha: Date): string {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, "0")
  const day = String(fecha.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Lee `YYYY-MM-DD` como fecha local. */
export function deISO(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

// ---------------------------------------------------------------------------
// Mapeo de las respuestas
// ---------------------------------------------------------------------------

function mapearRutina(crudo: Crudo): Rutina {
  const estado = txt(crudo.estado, "programada")
  return {
    id: txt(crudo.id),
    titulo: txt(crudo.titulo),
    subtitulo: txt(crudo.subtitulo),
    enfoque: txt(crudo.enfoque),
    musculos: listaTexto(crudo.musculos),
    duracionMin: num(crudo.duracion_min),
    intensidad: txt(crudo.intensidad, "media"),
    kcalEstimadas: num(crudo.kcal_estimadas),
    horaProgramada: crudo.hora_programada ? txt(crudo.hora_programada) : null,
    esDescanso: bol(crudo.es_descanso),
    estado:
      estado === "completada" || estado === "descanso" ? estado : "programada",
    porcentajeCompletado: num(crudo.porcentaje_completado),
  }
}

function mapearDia(crudo: Crudo): DiaEntrenamiento {
  return {
    diaSemana: num(crudo.dia_semana),
    fecha: txt(crudo.fecha),
    esHoy: bol(crudo.es_hoy),
    titulo: txt(crudo.titulo),
    tituloCorto: txt(crudo.titulo_corto),
    rutinas: Array.isArray(crudo.rutinas)
      ? (crudo.rutinas as Crudo[]).map(mapearRutina)
      : [],
  }
}

function mapearSemana(crudo: Crudo): SemanaEntrenamiento {
  return {
    lunes: txt(crudo.lunes),
    domingo: txt(crudo.domingo),
    sesionEnCurso: crudo.sesion_en_curso ? txt(crudo.sesion_en_curso) : null,
    personal: bol(crudo.personal),
    dias: Array.isArray(crudo.dias)
      ? (crudo.dias as Crudo[]).map(mapearDia)
      : [],
  }
}

function mapearSerie(crudo: Crudo): SerieSesion {
  return {
    id: txt(crudo.id),
    numero: num(crudo.numero_serie),
    kg: num(crudo.kg),
    reps: num(crudo.reps),
    completada: bol(crudo.completada),
  }
}

function mapearEjercicio(crudo: Crudo): EjercicioSesion {
  const anidadas = Array.isArray(crudo.sesiones_series)
    ? crudo.sesiones_series as Crudo[]
    : Array.isArray(crudo.series)
      ? crudo.series as Crudo[]
      : []
  return {
    id: txt(crudo.id),
    nombre: txt(crudo.nombre),
    musculo: txt(crudo.musculo),
    icono: txt(crudo.icono, "dumbbell"),
    seriesPlanificadas: num(crudo.series_planificadas),
    repsPlanificadas: num(crudo.reps_planificadas),
    cargaSugeridaKg: num(crudo.carga_sugerida_kg),
    descansoSeg: num(crudo.descanso_seg),
    recordPrevioKg: num(crudo.record_previo_kg),
    consejo: txt(crudo.consejo),
    orden: num(crudo.orden),
    series: anidadas.map(mapearSerie).sort((a, b) => a.numero - b.numero),
  }
}

function mapearSesion(
  crudo: Crudo,
  ejercicios: EjercicioSesion[],
): SesionEntrenamiento {
  return {
    id: txt(crudo.id),
    rutinaId: crudo.rutina_id ? txt(crudo.rutina_id) : null,
    nombre: txt(crudo.nombre),
    fecha: txt(crudo.fecha),
    iniciadaAt: crudo.iniciada_at ? txt(crudo.iniciada_at) : null,
    finalizadaAt: crudo.finalizada_at ? txt(crudo.finalizada_at) : null,
    duracionSeg: num(crudo.duracion_seg),
    seriesTotales: num(crudo.series_totales),
    seriesCompletadas: num(crudo.series_completadas),
    volumenTotalKg: num(crudo.volumen_total_kg),
    nuevosRecords: num(crudo.nuevos_records),
    kcalEstimadas: num(crudo.kcal_estimadas),
    estado: txt(crudo.estado, "en_curso"),
    ejercicios,
  }
}

async function cargarEjercicios(sesionId: string): Promise<EjercicioSesion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("sesiones_ejercicios")
    .select("*, sesiones_series(*)")
    .eq("sesion_id", sesionId)
    .order("orden", { ascending: true })
  if (error || !data) return []
  return (data as Crudo[]).map(mapearEjercicio)
}

// ---------------------------------------------------------------------------
// Plan semanal y catalogo
// ---------------------------------------------------------------------------

/** RPC `semana_entrenamiento`: la rejilla de lunes a domingo de esa semana. */
export async function semanaEntrenamiento(
  fecha?: Date,
): Promise<SemanaEntrenamiento | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("semana_entrenamiento", {
    p_fecha: aISO(fecha ?? new Date()),
  })
  if (error || !data) return null
  return mapearSemana(data as Crudo)
}

/** Nombres de los ejercicios de una rutina, en orden. */
export async function nombresDeRutina(rutinaId: string): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("rutina_ejercicios")
    .select("orden, ejercicios(nombre)")
    .eq("rutina_id", rutinaId)
    .order("orden", { ascending: true })
  if (error || !data) return []
  return (data as Crudo[])
    .map((fila) => {
      const ejercicio = fila.ejercicios
      if (
        ejercicio &&
        typeof ejercicio === "object" &&
        !Array.isArray(ejercicio)
      ) {
        return txt((ejercicio as Crudo).nombre)
      }
      if (Array.isArray(ejercicio)) {
        return txt((ejercicio[0] as Crudo | undefined)?.nombre)
      }
      return ""
    })
    .filter((nombre) => nombre.length > 0)
}

/** Cuantos ejercicios tiene cada rutina, indexado por id. */
export async function contarEjercicios(
  rutinaIds: string[],
): Promise<Record<string, number>> {
  const conteo: Record<string, number> = {}
  if (!supabase || rutinaIds.length === 0) return conteo
  const { data, error } = await supabase
    .from("rutina_ejercicios")
    .select("rutina_id")
    .in("rutina_id", rutinaIds)
  if (error || !data) return conteo
  for (const fila of data as Crudo[]) {
    const id = txt(fila.rutina_id)
    if (id) conteo[id] = (conteo[id] ?? 0) + 1
  }
  return conteo
}

// ---------------------------------------------------------------------------
// Sesion activa
// ---------------------------------------------------------------------------

/** Crea una sesion en curso con la prescripcion de la rutina. */
export async function iniciarSesion(
  rutinaId: string,
  nombre?: string,
): Promise<SesionEntrenamiento | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("iniciar_sesion", {
    p_rutina_id: rutinaId,
    p_nombre: nombre ?? null,
  })
  if (error || !data) return null
  const sesion = data as Crudo
  const ejercicios = await cargarEjercicios(txt(sesion.id))
  return mapearSesion(sesion, ejercicios)
}

/** La sesion en curso del usuario, si la hay. */
export async function sesionEnCurso(): Promise<SesionEntrenamiento | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("sesiones_entrenamiento")
    .select("*")
    .eq("estado", "en_curso")
    .order("iniciada_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const sesion = data as Crudo
  const ejercicios = await cargarEjercicios(txt(sesion.id))
  return mapearSesion(sesion, ejercicios)
}

/** Guarda una serie. Los triggers del servidor sellan el instante y los totales. */
export async function guardarSerie(serie: {
  id: string
  kg: number
  reps: number
  completada: boolean
}): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from("sesiones_series")
    .update({ kg: serie.kg, reps: serie.reps, completada: serie.completada })
    .eq("id", serie.id)
  return !error
}

/** Cierra la sesion, guarda el resumen y marca la rutina del dia. */
export async function finalizarSesion(
  sesionId: string,
  duracionSeg: number,
): Promise<SesionEntrenamiento | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("finalizar_sesion", {
    p_sesion_id: sesionId,
    p_duracion_seg: duracionSeg,
  })
  if (error || !data) return null
  const sesion = data as Crudo
  const ejercicios = await cargarEjercicios(txt(sesion.id))
  return mapearSesion(sesion, ejercicios)
}

/** Deja una sesion en curso como abandonada (p. ej. al empezar otra rutina). */
export async function abandonarSesion(sesionId: string): Promise<void> {
  if (!supabase) return
  await supabase
    .from("sesiones_entrenamiento")
    .update({ estado: "abandonada" })
    .eq("id", sesionId)
    .eq("estado", "en_curso")
}

// ---------------------------------------------------------------------------
// Historial y progreso
// ---------------------------------------------------------------------------

/** Sesiones terminadas, de la mas reciente a la mas antigua. */
export async function historialSesiones(
  limite = 30,
): Promise<SesionEntrenamiento[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("sesiones_entrenamiento")
    .select("*")
    .neq("estado", "en_curso")
    .order("fecha", { ascending: false })
    .order("iniciada_at", { ascending: false })
    .limit(limite)
  if (error || !data) return []
  return (data as Crudo[]).map((crudo) => mapearSesion(crudo, []))
}

/** RPC `progreso_fuerza`: volumen y sesiones del periodo frente al anterior. */
export async function progresoFuerza(
  desde: Date,
  hasta: Date = new Date(),
): Promise<ProgresoFuerza | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("progreso_fuerza", {
    p_desde: aISO(desde),
    p_hasta: aISO(hasta),
  })
  if (error || !data) return null
  const crudo = data as Crudo
  const variacion = crudo.variacion_pct
  return {
    volumenKg: num(crudo.volumen_kg),
    sesiones: num(crudo.sesiones),
    volumenAnteriorKg: num(crudo.volumen_anterior_kg),
    sesionesAnteriores: num(crudo.sesiones_anteriores),
    variacionPct: typeof variacion === "number" ? variacion : null,
  }
}
