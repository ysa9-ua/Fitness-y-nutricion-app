/**
 * FORMA · Datos compartidos del shell.
 *
 * El diario, los pesos, los alimentos favoritos y los alimentos propios viven
 * aquí para que Inicio, Nutrición y Progreso enseñen exactamente las mismas
 * cifras. Antes cada pantalla tenía sus constantes de ejemplo y no había forma
 * de que coincidieran.
 *
 * La fuente de verdad es Supabase (`public.estado_app`, un documento JSONB por
 * cuenta). `localStorage` queda como caché offline: el arranque pinta al
 * instante lo último conocido y, cuando hay sesión y red, se hidrata desde el
 * servidor y se empujan los cambios pendientes. Sin backend la app sigue
 * funcionando en local, que es lo que usan las demos y las pruebas.
 *
 * Se notifica a los componentes con `useSyncExternalStore`, así que al añadir
 * un alimento o apuntar un peso se refrescan todas las pantallas montadas.
 */

import { useSyncExternalStore } from "react"
import type { Macro, PlanMeal, PlanMealIcon } from "./nutritionPlan"

export type DiarySource = "plan" | "library" | "manual"

export type DiaryEntry = {
  id: string
  date: string
  mealId: string
  mealTitle: string
  foodId?: string
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  source: DiarySource
}

export type DiaryDay = {
  waterMl: number
  entries: DiaryEntry[]
}

/**
 * Comida creada a mano para un día (almuerzo, 5ª/6ª comida, batido...).
 * Se guarda aparte de las entradas para que siga existiendo aunque todavía no
 * tenga alimentos dentro.
 */
export type DiaryMeal = {
  id: string
  title: string
  time: string
  icon: PlanMealIcon
}

export type WeightEntry = {
  date: string
  weight: number
  waist?: number
  hips?: number
  neck?: number
}

export type CustomFoodCategory = "protein" | "carb" | "fat" | "veg"

/** De dónde salió un alimento que el usuario ha guardado en su biblioteca. */
export type CustomFoodSource = "manual" | "scanner" | "lookup"

export type CustomFood = {
  id: string
  name: string
  category: CustomFoodCategory
  /** Valores de la ración, no por 100 g. */
  kcal: number
  protein: number
  carbs: number
  fat: number
  portionGrams: number
  /** Alta manual, escáner OCR o una ficha de la base remota. */
  source?: CustomFoodSource
  brand?: string
  barcode?: string
}

export type NewDiaryEntry = {
  mealId: string
  mealTitle: string
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  source: DiarySource
  foodId?: string
}

type AppData = {
  diary: Record<string, DiaryDay>
  customMeals: Record<string, DiaryMeal[]>
  weights: WeightEntry[]
  favorites: string[]
  customFoods: CustomFood[]
  /**
   * Momento (ms) del último cambio local. Viaja dentro del documento para poder
   * compararlo con `actualizado_en` de Supabase: si el cambio local es más
   * reciente que la fila remota, se sube aunque se haya perdido el marcador de
   * pendiente (por ejemplo, si Android mata el proceso antes de que Chromium
   * vuelque `localStorage` a disco).
   */
  savedAt: number
}

/**
 * Margen entre el reloj del cliente y el del servidor al comparar fechas.
 * Por debajo de esta diferencia se considera que la fila remota ya incluye el
 * cambio local.
 */
const CLOCK_TOLERANCE_MS = 5000

const STORAGE_KEY = "forma:app-data"
const PENDING_KEY = "forma:app-data-pending"
const USER_KEY = "forma:app-data-user"
const REMOTE_SAVE_DELAY = 1200

/** Agua con la que arranca el día de demostración (igual que el diseño previo). */
const DEMO_WATER_ML = 1750
const MAX_WATER_ML = 5000

const EMPTY_DAY: DiaryDay = { waterMl: 0, entries: [] }

const EMPTY_MEALS: DiaryMeal[] = []

function emptyData(): AppData {
  return {
    diary: {},
    customMeals: {},
    weights: [],
    favorites: [],
    customFoods: [],
    savedAt: 0,
  }
}

function numero(valor: unknown, porDefecto = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : porDefecto
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : ""
}

function normalizarEntrada(valor: unknown): DiaryEntry | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null
  const crudo = valor as Record<string, unknown>
  const fuente = crudo.source
  return {
    id: texto(crudo.id),
    date: texto(crudo.date),
    mealId: texto(crudo.mealId),
    mealTitle: texto(crudo.mealTitle),
    foodId: crudo.foodId ? texto(crudo.foodId) : undefined,
    name: texto(crudo.name),
    grams: numero(crudo.grams),
    kcal: numero(crudo.kcal),
    protein: numero(crudo.protein),
    carbs: numero(crudo.carbs),
    fat: numero(crudo.fat),
    source: fuente === "plan" || fuente === "manual" ? fuente : "library",
  }
}

function normalizarDia(valor: unknown): DiaryDay {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return EMPTY_DAY
  }
  const crudo = valor as Record<string, unknown>
  const entradas = Array.isArray(crudo.entries)
    ? crudo.entries
        .map(normalizarEntrada)
        .filter((entrada): entrada is DiaryEntry => entrada !== null)
    : []
  return {
    waterMl: Math.max(0, Math.min(MAX_WATER_ML, numero(crudo.waterMl))),
    entries: entradas,
  }
}

const MEAL_ICONS: PlanMealIcon[] = ["sun", "leaf", "moon", "sparkles", "clock"]

function normalizarComida(valor: unknown): DiaryMeal | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null
  const crudo = valor as Record<string, unknown>
  const id = texto(crudo.id)
  const title = texto(crudo.title)
  if (!id || !title) return null
  const icon = MEAL_ICONS.includes(crudo.icon as PlanMealIcon)
    ? crudo.icon as PlanMealIcon
    : "sparkles"
  return { id, title, time: texto(crudo.time), icon }
}

function normalizarPeso(valor: unknown): WeightEntry | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null
  const crudo = valor as Record<string, unknown>
  const date = texto(crudo.date)
  const weight = numero(crudo.weight)
  if (!date || weight <= 0) return null
  return {
    date,
    weight,
    waist: crudo.waist ? numero(crudo.waist) : undefined,
    hips: crudo.hips ? numero(crudo.hips) : undefined,
    neck: crudo.neck ? numero(crudo.neck) : undefined,
  }
}

function normalizarAlimento(valor: unknown): CustomFood | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null
  const crudo = valor as Record<string, unknown>
  const category = crudo.category
  if (
    category !== "protein" &&
    category !== "carb" &&
    category !== "fat" &&
    category !== "veg"
  ) {
    return null
  }
  const name = texto(crudo.name)
  if (!name) return null
  const source = crudo.source
  return {
    id: texto(crudo.id),
    name,
    category,
    kcal: Math.max(0, numero(crudo.kcal)),
    protein: Math.max(0, numero(crudo.protein)),
    carbs: Math.max(0, numero(crudo.carbs)),
    fat: Math.max(0, numero(crudo.fat)),
    portionGrams: Math.max(1, numero(crudo.portionGrams, 100)),
    source:
      source === "manual" || source === "scanner"
        ? source
        : source
          ? "lookup"
          : undefined,
    brand: texto(crudo.brand) || undefined,
    barcode: texto(crudo.barcode) || undefined,
  }
}

function normalizarDatos(parsed: Record<string, unknown>): AppData {
  const diary: Record<string, DiaryDay> = {}
  if (parsed.diary && typeof parsed.diary === "object") {
    for (const [fecha, dia] of Object.entries(
      parsed.diary as Record<string, unknown>,
    )) {
      diary[fecha] = normalizarDia(dia)
    }
  }
  const customMeals: Record<string, DiaryMeal[]> = {}
  if (parsed.customMeals && typeof parsed.customMeals === "object") {
    for (const [fecha, comidas] of Object.entries(
      parsed.customMeals as Record<string, unknown>,
    )) {
      if (!Array.isArray(comidas)) continue
      customMeals[fecha] = comidas
        .map(normalizarComida)
        .filter((comida): comida is DiaryMeal => comida !== null)
    }
  }
  const weights = Array.isArray(parsed.weights)
    ? parsed.weights
        .map(normalizarPeso)
        .filter((peso): peso is WeightEntry => peso !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
    : []
  const favorites = Array.isArray(parsed.favorites)
    ? parsed.favorites.filter((id): id is string => typeof id === "string")
    : []
  const customFoods = Array.isArray(parsed.customFoods)
    ? parsed.customFoods
        .map(normalizarAlimento)
        .filter((food): food is CustomFood => food !== null)
    : []
  return {
    diary,
    customMeals,
    weights,
    favorites,
    customFoods,
    savedAt: Math.max(0, numero(parsed.savedAt)),
  }
}

function cargar(): AppData {
  if (typeof window === "undefined") return emptyData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    return normalizarDatos(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return emptyData()
  }
}

let state: AppData = cargar()
const listeners = new Set<() => void>()
let sequence = 0
let remoteReady = false
let remoteTimer: number | null = null

function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}:${Date.now().toString(36)}:${sequence}`
}

function persistirLocal(next: AppData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Con el almacenamiento bloqueado la sesión sigue funcionando en memoria.
  }
}

function notificar(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Marca el estado como pendiente y programa el envío a Supabase.
 *
 * Se agrupa con un pequeño retardo porque acciones como completar un
 * check-in cambian varios campos seguidos y no tiene sentido subir el
 * documento tres veces. El marcador de pendiente sobrevive a la recarga: si
 * se cierra la pestaña antes de enviar, el siguiente arranque lo empuja.
 */
function programarGuardadoRemoto(): void {
  if (!remoteReady || typeof window === "undefined") return
  try {
    window.localStorage.setItem(PENDING_KEY, "1")
  } catch {
    // Sin almacenamiento se intenta igualmente.
  }
  if (remoteTimer) window.clearTimeout(remoteTimer)
  remoteTimer = window.setTimeout(() => {
    remoteTimer = null
    void enviarEstadoRemoto()
  }, REMOTE_SAVE_DELAY)
}

async function enviarEstadoRemoto(): Promise<boolean> {
  if (!remoteReady || typeof window === "undefined") return false
  try {
    const { supabase } = await import("./supabase")
    if (!supabase) return false
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user) return false
    const { error } = await supabase.from("estado_app").upsert({
      usuario_id: user.id,
      datos: state,
      actualizado_en: new Date().toISOString(),
    })
    if (error) return false
    try {
      window.localStorage.removeItem(PENDING_KEY)
    } catch {
      // Nada que limpiar.
    }
    return true
  } catch {
    return false
  }
}

/**
 * Hidrata el estado desde Supabase y deja activada la sincronización.
 *
 * Sin sesión no hace nada: la app sigue con la caché local. Si hay cambios
 * pendientes de una sesión anterior se empujan antes de leer, para no pisar lo
 * que el usuario apuntó sin conexión. Al cambiar de cuenta se descarta el
 * estado de la cuenta anterior.
 */
export async function hidratarDatos(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const { isSupabaseConfigured, supabase } = await import("./supabase")
    if (!isSupabaseConfigured || !supabase) {
      remoteReady = false
      return
    }
    const { data: sesion } = await supabase.auth.getSession()
    const user = sesion.session?.user
    if (!user) {
      remoteReady = false
      return
    }

    let usuarioAnterior: string | null = null
    try {
      usuarioAnterior = window.localStorage.getItem(USER_KEY)
    } catch {
      usuarioAnterior = null
    }
    if (usuarioAnterior !== user.id) {
      try {
        window.localStorage.setItem(USER_KEY, user.id)
        window.localStorage.removeItem(PENDING_KEY)
      } catch {
        // Sin almacenamiento se sigue en memoria.
      }
      state = emptyData()
      persistirLocal(state)
      notificar()
    }

    remoteReady = true

    let pendiente = false
    try {
      pendiente = window.localStorage.getItem(PENDING_KEY) === "1"
    } catch {
      pendiente = false
    }
    if (pendiente) {
      await enviarEstadoRemoto()
      return
    }

    const { data: fila, error } = await supabase
      .from("estado_app")
      .select("datos, actualizado_en")
      .eq("usuario_id", user.id)
      .maybeSingle()
    if (error) return

    const remoto =
      fila?.datos && typeof fila.datos === "object"
        ? normalizarDatos(fila.datos as Record<string, unknown>)
        : null
    if (!remoto) {
      // Primera vez con este usuario: se sube lo que hubiera en local.
      await enviarEstadoRemoto()
      return
    }

    const remotoEn = fila?.actualizado_en
      ? Date.parse(fila.actualizado_en as string)
      : 0
    // Un cambio local más reciente manda sobre la fila remota aunque el
    // marcador de pendiente se haya perdido. Así una edición hecha sin red no
    // se pisa al volver a abrir la app.
    if (state.savedAt > remotoEn + CLOCK_TOLERANCE_MS) {
      await enviarEstadoRemoto()
      return
    }

    state = remoto
    persistirLocal(state)
    notificar()
  } catch {
    // Sin red se mantiene la caché; el siguiente arranque reintenta.
    remoteReady = false
  }
}

function commit(next: AppData): void {
  state = { ...next, savedAt: Date.now() }
  persistirLocal(state)
  notificar()
  programarGuardadoRemoto()
}

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function"
) {
  window.addEventListener("online", () => {
    void hidratarDatos()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): AppData {
  return state
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Fecha local en `YYYY-MM-DD`, sin pasar por UTC. */
export function hoyISO(fecha: Date = new Date()): string {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, "0")
  const day = String(fecha.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function useDia(fecha: string): DiaryDay {
  const data = useAppData()
  return data.diary[fecha] ?? EMPTY_DAY
}

/** Comidas creadas a mano para un día, aunque todavía estén vacías. */
export function useComidasDia(fecha: string): DiaryMeal[] {
  const data = useAppData()
  return data.customMeals[fecha] ?? EMPTY_MEALS
}

/**
 * Crea una comida propia en el día. Si ya existe una con el mismo id, no la
 * duplica: devuelve la que había.
 */
export function agregarComidaDiaria(
  fecha: string,
  comida: Omit<DiaryMeal, "id"> & { id?: string },
): DiaryMeal {
  const actuales = state.customMeals[fecha] ?? EMPTY_MEALS
  const existente = comida.id
    ? actuales.find((item) => item.id === comida.id)
    : undefined
  if (existente) return existente

  const nueva: DiaryMeal = {
    id: comida.id ?? nextId("meal"),
    title: comida.title,
    time: comida.time,
    icon: comida.icon,
  }
  commit({
    ...state,
    customMeals: {
      ...state.customMeals,
      [fecha]: [...actuales, nueva],
    },
  })
  return nueva
}

/** Elimina una comida propia y los alimentos que hubiera dentro. */
export function eliminarComidaDiaria(fecha: string, mealId: string): void {
  const comidas = state.customMeals[fecha]
  if (!comidas || !comidas.some((comida) => comida.id === mealId)) return
  const dia = state.diary[fecha] ?? EMPTY_DAY
  commit({
    ...state,
    customMeals: {
      ...state.customMeals,
      [fecha]: comidas.filter((comida) => comida.id !== mealId),
    },
    diary: {
      ...state.diary,
      [fecha]: {
        waterMl: dia.waterMl,
        entries: dia.entries.filter((entry) => entry.mealId !== mealId),
      },
    },
  })
}

export function sumarMacros(entries: DiaryEntry[]): Macro {
  return entries.reduce<Macro>(
    (total, entry) => ({
      kcal: total.kcal + entry.kcal,
      protein: round1(total.protein + entry.protein),
      carbs: round1(total.carbs + entry.carbs),
      fat: round1(total.fat + entry.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function round1(valor: number): number {
  return Math.round(valor * 10) / 10
}

function entradasDeComida(fecha: string, meal: PlanMeal): DiaryEntry[] {
  return meal.foods.map((food) => ({
    id: nextId(`plan:${fecha}:${meal.id}`),
    date: fecha,
    mealId: meal.id,
    mealTitle: meal.title,
    foodId: food.id,
    name: food.name,
    grams: food.grams,
    kcal: food.macros.kcal,
    protein: food.macros.protein,
    carbs: food.macros.carbs,
    fat: food.macros.fat,
    source: "plan",
  }))
}

/**
 * Primer arranque del día de demostración: deja registradas todas las comidas
 * menos la última, para que el diario y la portada tengan contenido coherente
 * y se pueda ver el efecto de completar la comida que falta.
 */
export function sembrarDiaDemo(fecha: string, meals: PlanMeal[]): void {
  if (state.diary[fecha]) return
  const registradas = meals.length > 1 ? meals.slice(0, -1) : meals
  const entries = registradas.flatMap((meal) => entradasDeComida(fecha, meal))
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: { waterMl: DEMO_WATER_ML, entries },
    },
  })
}

export function registrarComida(fecha: string, meal: PlanMeal): void {
  const actual = state.diary[fecha] ?? EMPTY_DAY
  const entries = [
    ...actual.entries.filter((entry) => entry.mealId !== meal.id),
    ...entradasDeComida(fecha, meal),
  ]
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: { waterMl: actual.waterMl, entries },
    },
  })
}

export function quitarComida(fecha: string, mealId: string): void {
  const actual = state.diary[fecha]
  if (!actual) return
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: {
        waterMl: actual.waterMl,
        entries: actual.entries.filter((entry) => entry.mealId !== mealId),
      },
    },
  })
}

export function alternarComida(fecha: string, meal: PlanMeal): void {
  const actual = state.diary[fecha]
  const registrada = actual?.entries.some((entry) => entry.mealId === meal.id)
  if (registrada) quitarComida(fecha, meal.id)
  else registrarComida(fecha, meal)
}

export function quitarEntrada(fecha: string, entradaId: string): void {
  const actual = state.diary[fecha]
  if (!actual) return
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: {
        waterMl: actual.waterMl,
        entries: actual.entries.filter((entry) => entry.id !== entradaId),
      },
    },
  })
}

export function agregarAlimentoDiario(
  fecha: string,
  entrada: NewDiaryEntry,
): void {
  const actual = state.diary[fecha] ?? EMPTY_DAY
  const entry: DiaryEntry = {
    id: nextId(`entry:${fecha}:${entrada.mealId}`),
    date: fecha,
    ...entrada,
  }
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: {
        waterMl: actual.waterMl,
        entries: [...actual.entries, entry],
      },
    },
  })
}

export function ajustarAgua(fecha: string, deltaMl: number): void {
  const actual = state.diary[fecha] ?? EMPTY_DAY
  const waterMl = Math.max(0, Math.min(MAX_WATER_ML, actual.waterMl + deltaMl))
  commit({
    ...state,
    diary: {
      ...state.diary,
      [fecha]: { waterMl, entries: actual.entries },
    },
  })
}

export function registrarPeso(entrada: WeightEntry): void {
  const weights = [
    ...state.weights.filter((peso) => peso.date !== entrada.date),
    entrada,
  ].sort((a, b) => a.date.localeCompare(b.date))
  commit({ ...state, weights })
}

export function alternarFavorito(id: string): void {
  const favorites = state.favorites.includes(id)
    ? state.favorites.filter((favorito) => favorito !== id)
    : [...state.favorites, id]
  commit({ ...state, favorites })
}

/** Clave para reconocer el mismo alimento aunque cambien acentos o espacios. */
export function claveAlimento(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Guarda un alimento en la biblioteca del usuario.
 *
 * Si ya existe uno con el mismo código de barras, o con el mismo nombre cuando
 * ninguno de los dos trae código, actualiza sus valores en vez de crear un
 * duplicado: así volver a escanear el mismo producto corrige la ficha en vez de
 * llenar «Mis alimentos» de copias. El código manda sobre el nombre porque un
 * producto puede volver con el nombre comercial escrito de otra forma.
 */
export function guardarAlimentoPersonalizado(
  entrada: Omit<CustomFood, "id"> & { id?: string },
): {
  food: CustomFood
  created: boolean
} {
  const clave = claveAlimento(entrada.name)
  const barcode = entrada.barcode?.trim() ?? ""
  const indice = state.customFoods.findIndex((food) => {
    if (entrada.id && food.id === entrada.id) return true
    const otroCodigo = (food.barcode ?? "").trim()
    if (barcode && otroCodigo) return otroCodigo === barcode
    if (!barcode && !otroCodigo) return claveAlimento(food.name) === clave
    return false
  })
  const actual = indice >= 0 ? state.customFoods[indice] : undefined
  const food: CustomFood = {
    ...entrada,
    id: actual?.id ?? nextId("custom"),
  }
  const customFoods = actual
    ? state.customFoods.map((item) => (item.id === actual.id ? food : item))
    : [food, ...state.customFoods]
  commit({ ...state, customFoods })
  return { food, created: !actual }
}

export function agregarAlimentoPersonalizado(
  entrada: Omit<CustomFood, "id">,
): CustomFood {
  return guardarAlimentoPersonalizado(entrada).food
}

export function eliminarAlimentoPersonalizado(id: string): void {
  commit({
    ...state,
    customFoods: state.customFoods.filter((food) => food.id !== id),
    favorites: state.favorites.filter((favorito) => favorito !== id),
  })
}

export type PesoResumen = {
  actual: number
  inicial: number
  delta: number
}

/** Último peso apuntado, o el del perfil si todavía no hay mediciones. */
export function ultimoPeso(
  pesos: WeightEntry[],
  pesoPerfil: number,
  pesoInicial?: number,
): PesoResumen {
  const actual = pesos.length > 0 ? pesos[pesos.length - 1]!.weight : pesoPerfil
  // La referencia es el peso del día 1 del onboarding, no la primera medición:
  // el primer check-in ya debe enseñar cuánto se ha movido desde el inicio.
  const inicial =
    pesoInicial ?? (pesos.length > 0 ? pesos[0]!.weight : pesoPerfil)
  return { actual, inicial, delta: round1(actual - inicial) }
}
