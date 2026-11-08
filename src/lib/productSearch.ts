/**
 * FORMA · Buscador de productos
 *
 * Puente con una base de datos abierta de productos envasados para que la
 * biblioteca no se quede en el catálogo curado: se puede buscar cualquier
 * producto envasado por nombre o código de barras y apuntarlo al diario.
 *
 * Reglas de la API:
 * - 10 búsquedas/min por IP y 15 lecturas de producto/min. Por eso aquí no hay
 *   búsqueda mientras se escribe: la pantalla busca al enviar el formulario y
 *   los resultados se cachean 30 días en `localStorage` (`forma:product-cache`).
 * - Se piden solo los campos que usa la ficha, nunca el producto completo.
 * - Si la red falla, la biblioteca local y los alimentos propios siguen
 *   funcionando: este módulo nunca lanza en tiempo de importación.
 *
 * Los datos son de la comunidad y pueden estar incompletos: la pantalla lo
 * avisa y el usuario siempre puede corregir los gramos o crear su alimento.
 */

import type { ChainId, LibraryProduct, LibrarySection } from "./foodLibrary"

const SEARCH_ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl"
const PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product"
const SEARCH_FIELDS = [
  "code",
  "product_name",
  "product_name_es",
  "brands",
  "categories_tags",
  "quantity",
  "serving_size",
  "nutriments",
  "image_front_small_url",
  "image_front_url",
  "nutriscore_grade",
  "allergens_tags",
  "countries_tags",
].join(",")

const CACHE_KEY = "forma:product-cache"
const CACHE_VERSION = 2
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const MAX_QUERIES = 24
const MAX_PRODUCTS = 240
const PAGE_SIZE = 24
const TIMEOUT_MS = 14000
const MIN_SEARCH_GAP = 6500
const MIN_PRODUCT_GAP = 4500

export type RemoteNutriments = {
  "energy-kcal_100g"?: number
  energy_100g?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
}

export type RemoteRaw = {
  code?: string
  product_name?: string
  product_name_es?: string
  brands?: string
  categories_tags?: string[]
  quantity?: string
  serving_size?: string
  nutriments?: RemoteNutriments
  image_front_small_url?: string
  image_front_url?: string
  nutriscore_grade?: string
  allergens_tags?: string[]
  countries_tags?: string[]
}

export type RemoteSearchResult = {
  products: LibraryProduct[]
  total: number
  query: string
  fromCache: boolean
  fetchedAt: number
}

export type RemoteErrorCode = "network" | "timeout" | "rate-limit" | "unavailable"

export class RemoteError extends Error {
  code: RemoteErrorCode

  constructor(code: RemoteErrorCode, message: string) {
    super(message)
    this.name = "RemoteError"
    this.code = code
  }
}

type CachedProduct = {
  at: number
  raw: RemoteRaw
}

type CachedQuery = {
  at: number
  total: number
  codes: string[]
}

type RemoteCache = {
  version: number
  lastSearch: number
  lastProduct: number
  queries: Record<string, CachedQuery>
  products: Record<string, CachedProduct>
}

function cacheVacia(): RemoteCache {
  return {
    version: CACHE_VERSION,
    lastSearch: 0,
    lastProduct: 0,
    queries: {},
    products: {},
  }
}

function almacen(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function leerCache(): RemoteCache {
  const storage = almacen()
  if (!storage) return cacheVacia()
  try {
    const crudo = storage.getItem(CACHE_KEY)
    if (!crudo) return cacheVacia()
    const parsed = JSON.parse(crudo) as Partial<RemoteCache>
    if (parsed.version !== CACHE_VERSION) return cacheVacia()
    return {
      version: CACHE_VERSION,
      lastSearch: numero(parsed.lastSearch),
      lastProduct: numero(parsed.lastProduct),
      queries:
        parsed.queries && typeof parsed.queries === "object"
          ? parsed.queries
          : {},
      products:
        parsed.products && typeof parsed.products === "object"
          ? parsed.products
          : {},
    }
  } catch {
    return cacheVacia()
  }
}

function guardarCache(cache: RemoteCache) {
  const storage = almacen()
  if (!storage) return
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Sin espacio: se descarta la caché y se sigue tirando de red.
    try {
      storage.removeItem(CACHE_KEY)
    } catch {}
  }
}

function numero(valor: unknown, porDefecto = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : porDefecto
}

function recortarCache(cache: RemoteCache) {
  const consultas = Object.entries(cache.queries).sort(
    (a, b) => b[1].at - a[1].at,
  )
  cache.queries = Object.fromEntries(consultas.slice(0, MAX_QUERIES))

  const productos = Object.entries(cache.products).sort(
    (a, b) => b[1].at - a[1].at,
  )
  cache.products = Object.fromEntries(productos.slice(0, MAX_PRODUCTS))
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Un código de barras EAN/UPC: solo dígitos y entre 8 y 14. */
export function esCodigoDeBarras(texto: string): boolean {
  return /^\d{8,14}$/.test(texto.trim())
}

/** Id estable con el que la biblioteca y los favoritos guardan un producto. */
export function idDeProductoRemoto(code: string): string {
  return `producto-${code}`
}

/** Prefijo de la marca → cadena española, cuando se puede deducir. */
const CHAIN_BY_BRAND: Array<{
  chain: Exclude<ChainId, "todas" | "personal" | "remota">
  needles: string[]
}> = [
  { chain: "mercadona", needles: ["hacendado", "mercadona", "bosque verde"] },
  { chain: "carrefour", needles: ["carrefour", "simply", "bellarom"] },
  { chain: "lidl", needles: ["milbona", "lidl", "deluxe"] },
  { chain: "aldi", needles: ["aldi", "gut bio", "milsani"] },
  { chain: "alcampo", needles: ["alcampo", "auchan", "simply basic"] },
  { chain: "eroski", needles: ["eroski", "sannia", "suma"] },
  { chain: "dia", needles: ["dia", "bontá"] },
  { chain: "consum", needles: ["consum", "eroski contigo"] },
  {
    chain: "hipercor",
    needles: ["hipercor", "el corte inglés", "el corte ingles"],
  },
  { chain: "ahorramas", needles: ["ahorramas", "alipende"] },
  { chain: "gadis", needles: ["gadis"] },
  { chain: "froiz", needles: ["froiz"] },
  { chain: "bonpreu", needles: ["bonpreu", "esclat"] },
  { chain: "condis", needles: ["condis"] },
  { chain: "caprabo", needles: ["caprabo"] },
  { chain: "masymas", needles: ["masymas", "mas y mas"] },
  { chain: "coviran", needles: ["coviran"] },
  { chain: "spar", needles: ["spar"] },
  { chain: "alimerka", needles: ["alimerka"] },
  { chain: "bm", needles: ["bm supermercados", "uvesco"] },
  { chain: "supercor", needles: ["supercor"] },
  { chain: "sanchez-romero", needles: ["sánchez romero", "sanchez romero"] },
  { chain: "plusfresc", needles: ["plusfresc"] },
  { chain: "ametller", needles: ["ametller"] },
  { chain: "veritas", needles: ["veritas"] },
  { chain: "gros-mercat", needles: ["gros mercat"] },
  { chain: "la-sirena", needles: ["la sirena"] },
]

/** Palabras que deciden la sección; el orden es la prioridad. */
const SECTION_KEYWORDS: Array<{
  section: LibrarySection
  needles: string[]
}> = [
  {
    section: "bebidas",
    needles: [
      "bebida",
      "agua mineral",
      "zumo",
      "refresco",
      "cerveza",
      "vino",
      "cafe",
      "te verde",
      "te negro",
      "te rojo",
      "te blanco",
      "te helado",
      "infusion",
      "smoothie",
      "bebidas",
      "water",
      "juice",
      "soda",
      "beer",
      "wine",
      "coffee",
      "tea",
      "drink",
      "beverage",
    ],
  },
  {
    section: "lacteos",
    needles: [
      "lacteo",
      "leche",
      "yogur",
      "yogurt",
      "queso",
      "mantequilla",
      "nata",
      "kefir",
      "cuajada",
      "dairy",
      "milk",
      "cheese",
      "cream",
      "butter",
      "fromage",
    ],
  },
  {
    section: "snacks",
    needles: [
      "galleta",
      "chocolate",
      "patata frita",
      "chips",
      "aperitivo",
      "snack",
      "bollo",
      "helado",
      "caramelo",
      "dulce",
      "cookie",
      "biscuit",
      "candy",
      "ice cream",
      "cake",
      "crisps",
      "dessert",
    ],
  },
  {
    section: "proteinas",
    needles: [
      "pollo",
      "pavo",
      "ternera",
      "cerdo",
      "jamon",
      "carne",
      "pescado",
      "atun",
      "salmon",
      "merluza",
      "gamba",
      "marisco",
      "huevo",
      "tofu",
      "legumbre",
      "lenteja",
      "garbanzo",
      "alubia",
      "meat",
      "fish",
      "chicken",
      "egg",
      "ham",
      "tuna",
      "salmon",
      "seafood",
      "legume",
      "lentil",
      "chickpea",
      "bean",
      "soy",
    ],
  },
  {
    section: "grasas",
    needles: [
      "aceite",
      "oliva",
      "fruto seco",
      "almendra",
      "nuez",
      "cacahuete",
      "aguacate",
      "semilla",
      "oil",
      "olive",
      "almond",
      "walnut",
      "peanut",
      "avocado",
      "seed",
      "nut",
    ],
  },
  {
    section: "frutas",
    needles: [
      "fruta",
      "manzana",
      "platano",
      "naranja",
      "fresa",
      "pera",
      "uva",
      "melocoton",
      "kiwi",
      "sandia",
      "melon",
      "fruit",
      "apple",
      "banana",
      "orange",
      "strawberry",
    ],
  },
  {
    section: "verduras",
    needles: [
      "verdura",
      "hortaliza",
      "tomate",
      "lechuga",
      "zanahoria",
      "cebolla",
      "brocoli",
      "pimiento",
      "calabacin",
      "espinaca",
      "vegetable",
      "tomato",
      "lettuce",
      "carrot",
      "onion",
      "broccoli",
      "pepper",
      "spinach",
    ],
  },
  {
    section: "carbohidratos",
    needles: [
      "arroz",
      "pan ",
      "pasta",
      "harina",
      "avena",
      "cereal",
      "patata",
      "quinoa",
      "cuscus",
      "bread",
      "rice",
      "flour",
      "oat",
      "potato",
    ],
  },
]

const SECTION_FOOD_CATEGORY: Record<LibrarySection, LibraryProduct["category"]> =
  {
    proteinas: "protein",
    lacteos: "protein",
    carbohidratos: "carb",
    frutas: "carb",
    verduras: "veg",
    grasas: "fat",
    despensa: "carb",
    snacks: "carb",
    bebidas: "carb",
  }

const NO_PLAN_SECTIONS = new Set<LibrarySection>(["snacks", "bebidas"])

function seccionDeRemoto(raw: RemoteRaw, nombre: string): LibrarySection {
  const heno = normalizarTexto(
    `${nombre} ${(raw.categories_tags ?? []).join(" ").replace(/en:/g, " ")}`,
  )
  for (const regla of SECTION_KEYWORDS) {
    if (regla.needles.some((needle) => heno.includes(needle))) {
      return regla.section
    }
  }
  return "despensa"
}

function cadenaDeRemoto(brand: string): ChainId {
  const heno = normalizarTexto(brand)
  if (!heno) return "remota"
  for (const regla of CHAIN_BY_BRAND) {
    if (regla.needles.some((needle) => heno.includes(needle))) {
      return regla.chain
    }
  }
  return "remota"
}

/** "750 g (6x125g)" → 125, "1,5 l" → 1500, "1 serving (1 cup)" → null. */
function gramosDeTexto(texto?: string): number | null {
  if (!texto) return null
  const normalizado = texto.replace(",", ".").toLowerCase()
  const porciones = normalizado.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/)
  if (porciones) {
    const total = Number(porciones[1]) * Number(porciones[2])
    return total > 0 ? Math.round(total) : null
  }
  const match = normalizado.match(/(\d+(?:\.\d+)?)\s*(kg|g|mg|l|ml|cl)\b/)
  if (!match) return null
  const valor = Number(match[1])
  if (!Number.isFinite(valor) || valor <= 0) return null
  switch (match[2]) {
    case "kg":
      return Math.round(valor * 1000)
    case "g":
      return Math.round(valor)
    case "mg":
      return Math.max(1, Math.round(valor / 1000))
    case "l":
      return Math.round(valor * 1000)
    case "cl":
      return Math.round(valor * 10)
    default:
      return Math.round(valor)
  }
}

function etiquetasDeRemoto(raw: RemoteRaw): string[] {
  const etiquetas = new Set<string>()
  for (const tag of raw.allergens_tags ?? []) {
    if (typeof tag !== "string") continue
    const limpio = tag
      .replace(/^[a-z]{2}:/, "")
      .replace(/-/g, " ")
      .trim()
    if (limpio) etiquetas.add(limpio)
  }
  return [...etiquetas]
}

function kcalDeRemoto(nutriments: RemoteNutriments): number {
  const directo = numero(nutriments["energy-kcal_100g"], -1)
  if (directo > 0) return Math.round(directo)
  const kj = numero(nutriments.energy_100g, -1)
  if (kj > 0) return Math.round(kj / 4.184)
  return 0
}

/**
 * Traduce un producto crudo de la API a la forma que usa la biblioteca.
 * Devuelve `null` si no hay nombre o no hay ni macros ni calorías: esos
 * productos no se pueden apuntar al diario con un mínimo de sentido.
 */
export function productoDesdeRemoto(raw: RemoteRaw): LibraryProduct | null {
  const code = String(raw.code ?? "").trim()
  const nombre = String(raw.product_name_es || raw.product_name || "").trim()
  if (!code || nombre.length < 2) return null

  const nutriments = raw.nutriments ?? {}
  const kcal = kcalDeRemoto(nutriments)
  const protein = Math.max(0, numero(nutriments.proteins_100g))
  const carbs = Math.max(0, numero(nutriments.carbohydrates_100g))
  const fat = Math.max(0, numero(nutriments.fat_100g))
  if (kcal === 0 && protein === 0 && carbs === 0 && fat === 0) return null

  const marca = String(raw.brands ?? "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)[0]
  const brand = marca || "FORMA"

  const section = seccionDeRemoto(raw, nombre)
  // La ración por defecto es la del envase (si viene en gramos), nunca el
  // tamaño del paquete: un kilo de arroz no es una ración.
  const racion = gramosDeTexto(raw.serving_size) ?? 100
  const nutriscore = String(raw.nutriscore_grade ?? "").toLowerCase()
  const image =
    raw.image_front_small_url || raw.image_front_url
      ? raw.image_front_small_url || raw.image_front_url
      : undefined

  return {
    id: idDeProductoRemoto(code),
    name: nombre,
    brand,
    chain: cadenaDeRemoto(brand),
    section,
    category: SECTION_FOOD_CATEGORY[section],
    per100: {
      kcal,
      protein: redondear1(protein),
      carbs: redondear1(carbs),
      fat: redondear1(fat),
    },
    portionGrams: Math.min(1000, Math.max(5, racion)),
    tags: etiquetasDeRemoto(raw),
    planEligible: !NO_PLAN_SECTIONS.has(section) && kcal > 0,
    source: "lookup",
    barcode: code,
    image,
    imageLarge: raw.image_front_url || undefined,
    nutriscore: /^[a-e]$/.test(nutriscore) ? nutriscore : undefined,
  }
}

function redondear1(valor: number): number {
  return Math.round(valor * 10) / 10
}

/** Los productos con nombre en español, foto y macros van primero. */
function puntuarRemoto(raw: RemoteRaw, product: LibraryProduct): number {
  let puntos = 0
  if (raw.product_name_es) puntos += 3
  if (product.per100.kcal > 0) puntos += 2
  if (raw.image_front_small_url) puntos += 1
  if (product.nutriscore) puntos += 1
  if ((raw.countries_tags ?? []).includes("en:spain")) puntos += 2
  return puntos
}

let memoriaProductos: LibraryProduct[] | null = null

function invalidarMemoria() {
  memoriaProductos = null
}

/** Productos remotos ya consultados (para resolver favoritos). */
export function productosRemotosCache(): LibraryProduct[] {
  if (memoriaProductos) return memoriaProductos
  const cache = leerCache()
  const ahora = Date.now()
  const productos: LibraryProduct[] = []
  for (const entry of Object.values(cache.products)) {
    if (ahora - entry.at > CACHE_TTL) continue
    const product = productoDesdeRemoto(entry.raw)
    if (product) productos.push(product)
  }
  memoriaProductos = productos
  return productos
}

/** Producto cacheado por id (`producto-<código>`), o `undefined`. */
export function productoRemotoPorId(id: string): LibraryProduct | undefined {
  return productosRemotosCache().find((product) => product.id === id)
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function pedirJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      referrerPolicy: "no-referrer",
      credentials: "omit",
    })
    if (response.status === 429) {
      throw new RemoteError(
        "rate-limit",
        "FORMA ha recibido demasiadas peticiones. Espera un minuto y vuelve a intentarlo.",
      )
    }
    if (response.status === 503) {
      throw new RemoteError(
        "unavailable",
        "FORMA está saturado ahora mismo. Prueba en unos segundos.",
      )
    }
    if (!response.ok) {
      throw new RemoteError(
        "network",
        `FORMA respondió con un error ${response.status}.`,
      )
    }
    const texto = await response.text()
    if (!texto.trim().startsWith("{")) {
      throw new RemoteError(
        "unavailable",
        "FORMA devolvió una página de mantenimiento. Prueba en unos segundos.",
      )
    }
    return JSON.parse(texto)
  } catch (error) {
    if (error instanceof RemoteError) throw error
    if ((error as Error)?.name === "AbortError") {
      throw new RemoteError(
        "timeout",
        "FORMA tarda demasiado en contestar. Comprueba tu conexión.",
      )
    }
    throw new RemoteError(
      "network",
      "No se pudo conectar con FORMA. Sin conexión sigues teniendo el catálogo local.",
    )
  } finally {
    clearTimeout(timer)
  }
}

async function esperarTurno(tipo: "search" | "product") {
  const cache = leerCache()
  const ultima = tipo === "search" ? cache.lastSearch : cache.lastProduct
  const hueco = tipo === "search" ? MIN_SEARCH_GAP : MIN_PRODUCT_GAP
  const espera = hueco - (Date.now() - ultima)
  if (espera > 0) await esperar(espera)
  const ahora = Date.now()
  const siguiente = leerCache()
  if (tipo === "search") siguiente.lastSearch = ahora
  else siguiente.lastProduct = ahora
  guardarCache(siguiente)
}

function guardarConsulta(
  query: string,
  total: number,
  raws: RemoteRaw[],
): LibraryProduct[] {
  const cache = leerCache()
  const ahora = Date.now()
  const productos: LibraryProduct[] = []
  const codes: string[] = []

  for (const raw of raws) {
    const product = productoDesdeRemoto(raw)
    if (!product || !product.barcode) continue
    if (codes.includes(product.barcode)) continue
    codes.push(product.barcode)
    productos.push(product)
    cache.products[product.barcode] = { at: ahora, raw }
  }

  cache.queries[normalizarTexto(query)] = { at: ahora, total, codes }
  recortarCache(cache)
  guardarCache(cache)
  invalidarMemoria()
  return productos
}

function leerConsulta(query: string): RemoteSearchResult | null {
  const cache = leerCache()
  const guardada = cache.queries[normalizarTexto(query)]
  if (!guardada) return null
  if (Date.now() - guardada.at > CACHE_TTL) return null
  const products: LibraryProduct[] = []
  for (const code of guardada.codes) {
    const entry = cache.products[code]
    if (!entry) continue
    const product = productoDesdeRemoto(entry.raw)
    if (product) products.push(product)
  }
  if (!products.length) return null
  return {
    products,
    total: guardada.total,
    query,
    fromCache: true,
    fetchedAt: guardada.at,
  }
}

let busquedaEnCurso: Promise<RemoteSearchResult> | null = null
let busquedaEnCursoClave = ""

/**
 * Busca productos en la base remota. Con un código de barras va directo a la
 * ficha del producto; con texto usa el buscador clásico.
 *
 * Lanza `RemoteError` con un mensaje en español si la red o la API fallan.
 */
export function buscarProductos(query: string): Promise<RemoteSearchResult> {
  const limpio = query.trim()
  if (limpio.length < 2) {
    return Promise.resolve({
      products: [],
      total: 0,
      query: limpio,
      fromCache: false,
      fetchedAt: Date.now(),
    })
  }

  const clave = normalizarTexto(limpio)
  if (busquedaEnCurso && busquedaEnCursoClave === clave) return busquedaEnCurso

  const cacheada = leerConsulta(limpio)
  if (cacheada) return Promise.resolve(cacheada)

  const promesa = esCodigoDeBarras(limpio)
    ? buscarPorCodigo(limpio)
    : buscarPorTexto(limpio)
  busquedaEnCurso = promesa
  busquedaEnCursoClave = clave
  const limpiar = () => {
    busquedaEnCurso = null
    busquedaEnCursoClave = ""
  }
  promesa.then(limpiar, limpiar)
  return promesa
}

async function buscarPorTexto(query: string): Promise<RemoteSearchResult> {
  await esperarTurno("search")
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(PAGE_SIZE),
    sort_by: "unique_scans_n",
    fields: SEARCH_FIELDS,
  })
  const data = (await pedirJson(`${SEARCH_ENDPOINT}?${params.toString()}`)) as {
    count?: number
    products?: RemoteRaw[]
  }

  const raws = Array.isArray(data.products) ? data.products : []
  const ordenados = raws
    .map((raw) => ({ raw, product: productoDesdeRemoto(raw) }))
    .filter(
      (item): item is {
        raw: RemoteRaw
        product: LibraryProduct
      } => item.product !== null,
    )
    .sort((a, b) => puntuarRemoto(b.raw, b.product) - puntuarRemoto(a.raw, a.product))
    .map((item) => item.raw)

  const products = guardarConsulta(query, numero(data.count), ordenados)
  return {
    products,
    total: numero(data.count, products.length),
    query,
    fromCache: false,
    fetchedAt: Date.now(),
  }
}

async function buscarPorCodigo(code: string): Promise<RemoteSearchResult> {
  await esperarTurno("product")
  const params = new URLSearchParams({ fields: SEARCH_FIELDS })
  const data = (await pedirJson(
    `${PRODUCT_ENDPOINT}/${encodeURIComponent(code)}.json?${params.toString()}`,
  )) as {
    status?: number
    product?: RemoteRaw
  }

  const raw = data.product
  if (!raw) {
    throw new RemoteError(
      "network",
      `No hay ningún producto con el código ${code} en FORMA.`,
    )
  }
  const products = guardarConsulta(code, 1, [raw])
  return {
    products,
    total: products.length,
    query: code,
    fromCache: false,
    fetchedAt: Date.now(),
  }
}
