#!/usr/bin/env node
/**
 * Comprueba la biblioteca de alimentos y el puente con la base remota:
 * integridad del catálogo curado, mapeo de la API, caché y favoritos.
 *
 * Carga los módulos TypeScript con Vite (SSR) para no duplicar la lógica ni
 * depender de un paso de compilación aparte.
 *
 * Uso:  node scripts/check-food-library.mjs
 */

import { createServer } from "vite"

const problems = []
const notes = []

function check(condition, message) {
  if (!condition) problems.push(message)
}

// `productSearch.ts` lee `window.localStorage` de forma perezosa: se simula
// antes de tocar la caché para poder probar los favoritos sin navegador.
const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
}

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
})

let lib
let remoto
let datos
try {
  lib = await server.ssrLoadModule("/src/lib/foodLibrary.ts")
  remoto = await server.ssrLoadModule("/src/lib/productSearch.ts")
  datos = await server.ssrLoadModule("/src/lib/appData.ts")
} finally {
  await server.close()
}

const {
  PRODUCTS,
  SECTIONS,
  SUPERMARKETS,
  alimentoDesdePer100,
  alimentoDesdeProducto,
  alimentosDeFavoritos,
  buscarProductos,
  categoriaDeMacros,
  productoPorId,
  productosLocales,
} = lib
const {
  esCodigoDeBarras,
  idDeProductoRemoto,
  productoDesdeRemoto,
  productosRemotosCache,
} = remoto
const { claveAlimento, guardarAlimentoPersonalizado } = datos

// 1. Catálogo curado: ids únicos, cadenas y secciones conocidas, macros
//    coherentes y raciones razonables.
const chainIds = new Set([
  "todas",
  "personal",
  "remota",
  ...SUPERMARKETS.map((market) => market.id),
])
const sectionIds = new Set(SECTIONS.map((section) => section.id))
const ids = new Set()

for (const product of PRODUCTS) {
  const label = `${product.id} (${product.name})`
  check(!ids.has(product.id), `Id duplicado en el catálogo: ${label}`)
  ids.add(product.id)

  check(
    chainIds.has(product.chain),
    `Cadena desconocida en ${label}: ${product.chain}`,
  )
  check(
    sectionIds.has(product.section),
    `Sección desconocida en ${label}: ${product.section}`,
  )
  check(
    product.source !== "lookup",
    `El catálogo curado no debe llevar source lookup: ${label}`,
  )

  for (const key of ["kcal", "protein", "carbs", "fat"]) {
    const value = product.per100[key]
    check(
      Number.isFinite(value) && value >= 0,
      `Macro inválido en ${label}: ${key}=${value}`,
    )
  }
  check(
    product.per100.kcal <= 900,
    `Las kcal por 100 g no pueden pasar de 900: ${label}`,
  )
  for (const key of ["protein", "carbs", "fat"]) {
    check(
      product.per100[key] <= 100,
      `Los gramos por 100 g no pueden pasar de 100: ${label} ${key}`,
    )
  }
  check(
    product.per100.protein + product.per100.carbs + product.per100.fat <= 105,
    `Los macros suman más de 100 g por 100 g: ${label}`,
  )
  check(
    product.portionGrams > 0 && product.portionGrams <= 1000,
    `Ración fuera de rango en ${label}: ${product.portionGrams} g`,
  )
}

check(
  PRODUCTS.length >= 150,
  `El catálogo curado se ha quedado corto: ${PRODUCTS.length} productos`,
)
check(
  productosLocales([]).length === PRODUCTS.length,
  "productosLocales() debe devolver el catálogo curado sin tocar la API",
)
notes.push(
  `${PRODUCTS.length} productos curados en ${SUPERMARKETS.length} cadenas`,
)

// 2. Búsqueda por código de barras sobre un producto de la API.
const yogurRaw = {
  code: "8480000205599",
  product_name: "Yogur natural al estilo griego",
  product_name_es: "Yogur natural al estilo griego",
  brands: "Hacendado, Mercadona",
  categories_tags: ["en:dairies", "en:fermented-foods", "en:yogurts"],
  quantity: "750 g (6x125g)",
  serving_size: "125 g",
  nutriments: {
    "energy-kcal_100g": 103.2,
    proteins_100g: 3.9,
    carbohydrates_100g: 3.9,
    fat_100g: 10.8,
  },
  image_front_small_url:
    "https://images.openfoodfacts.org/images/products/848/000/020/5599/front_es.25.200.jpg",
  image_front_url:
    "https://images.openfoodfacts.org/images/products/848/000/020/5599/front_es.25.full.jpg",
  nutriscore_grade: "c",
  allergens_tags: ["en:milk"],
  countries_tags: ["en:spain"],
}
const yogur = productoDesdeRemoto(yogurRaw)
check(Boolean(yogur), "Un yogur completo de la base remota debe mapearse")
if (yogur) {
  check(
    yogur.id === "producto-8480000205599",
    `Id remoto inesperado: ${yogur.id}`,
  )
  check(yogur.source === "lookup", "El producto debe marcar su origen")
  check(
    yogur.chain === "mercadona",
    `Hacendado debe ser Mercadona: ${yogur.chain}`,
  )
  check(yogur.section === "lacteos", `Un yogur es lácteo: ${yogur.section}`)
  check(
    yogur.portionGrams === 125,
    `La ración debe ser serving_size: ${yogur.portionGrams}`,
  )
  check(yogur.per100.kcal === 103, `kcal mal redondeadas: ${yogur.per100.kcal}`)
  check(
    yogur.barcode === "8480000205599",
    "El código de barras debe conservarse",
  )
  check(yogur.nutriscore === "c", `Nutri-Score inesperado: ${yogur.nutriscore}`)
  check(
    yogur.tags.includes("milk"),
    `Falta el alérgeno: ${yogur.tags.join(", ")}`,
  )
  check(Boolean(yogur.image), "El producto debe traer foto")

  const porCodigo = buscarProductos(
    [yogur],
    "8480000205599",
    "todas-las-cadenas",
    "todas-las-secciones",
  )
  check(
    porCodigo.length === 1 && porCodigo[0].id === yogur.id,
    "La búsqueda debe indexar el código de barras",
  )
  const porMarca = buscarProductos(
    [yogur],
    "hacendado",
    "todas-las-cadenas",
    "todas-las-secciones",
  )
  check(porMarca.length === 1, "La búsqueda debe indexar la marca")
}

// 3. Reglas de mapeo: kJ, nombre en español, cadena, ración y exclusiones.
const aceite = productoDesdeRemoto({
  code: "8410000000001",
  product_name: "Olive oil",
  product_name_es: "Aceite de oliva virgen extra",
  brands: "Carbonell",
  categories_tags: ["en:olive-oils"],
  quantity: "1 l",
  nutriments: { energy_100g: 3700, fat_100g: 100 },
})
check(Boolean(aceite), "Un producto con energía en kJ debe mapearse")
if (aceite) {
  check(
    aceite.name === "Aceite de oliva virgen extra",
    `Debe preferir product_name_es: ${aceite.name}`,
  )
  check(
    aceite.per100.kcal === 884,
    `Conversión kJ→kcal incorrecta: ${aceite.per100.kcal}`,
  )
  check(
    aceite.portionGrams === 100,
    `Sin serving_size la ración es 100 g, no el envase: ${aceite.portionGrams}`,
  )
  check(aceite.section === "grasas", `El aceite es grasa: ${aceite.section}`)
  check(aceite.chain === "remota", `Carbonell no es una cadena: ${aceite.chain}`)
}

const milbona = productoDesdeRemoto({
  code: "8410000000002",
  product_name: "Yogur natural",
  brands: "Milbona",
  categories_tags: ["en:dairies"],
  nutriments: { "energy-kcal_100g": 60, proteins_100g: 4 },
})
check(milbona?.chain === "lidl", `Milbona debe ser Lidl: ${milbona?.chain}`)

const refresco = productoDesdeRemoto({
  code: "5449000000996",
  product_name: "Refresco de cola",
  brands: "Coca-Cola",
  categories_tags: ["en:beverages", "en:sodas"],
  serving_size: "330 ml",
  nutriments: { "energy-kcal_100g": 42, carbohydrates_100g: 10.6 },
})
check(
  refresco?.section === "bebidas",
  `Un refresco es bebida: ${refresco?.section}`,
)
check(
  refresco?.planEligible === false,
  "Las bebidas no deben entrar en el menú del plan",
)

check(
  productoDesdeRemoto({ code: "1", product_name: "Sin datos" }) === null,
  "Un producto sin macros ni calorías debe descartarse",
)
check(
  productoDesdeRemoto({ code: "2", nutriments: { fat_100g: 10 } }) === null,
  "Un producto sin nombre debe descartarse",
)

// 4. Códigos de barras e ids.
check(
  esCodigoDeBarras("8480000205599"),
  "Un EAN de 13 dígitos es código de barras",
)
check(
  esCodigoDeBarras(" 8480000205599 "),
  "El código admite espacios alrededor",
)
check(!esCodigoDeBarras("yogur griego"), "Un texto no es código de barras")
check(!esCodigoDeBarras("1234567"), "Un número de 7 dígitos no es EAN")
check(
  idDeProductoRemoto("8480000205599") === "producto-8480000205599",
  "idDeProductoRemoto debe prefijar producto-",
)

// 5. Caché y favoritos: un producto remoto guardado sigue resolviendo en el
//    plan aunque la búsqueda ya no esté en pantalla. La versión de la caché
//    debe coincidir con la de `productSearch.ts`.
const CACHE_VERSION = 2
store.set(
  "forma:product-cache",
  JSON.stringify({
    version: CACHE_VERSION,
    lastSearch: 0,
    lastProduct: 0,
    queries: {},
    products: {
      8480000205599: { at: Date.now(), raw: yogurRaw },
    },
  }),
)

const cacheados = productosRemotosCache()
check(
  cacheados.length === 1 && cacheados[0].id === "producto-8480000205599",
  `La caché debe devolver el producto guardado: ${cacheados.length}`,
)
check(
  productoPorId("producto-8480000205599")?.name === "Yogur natural al estilo griego",
  "productoPorId debe resolver un producto de la caché remota",
)
const favoritos = alimentosDeFavoritos(["producto-8480000205599"])
check(
  favoritos.length === 1 &&
    favoritos[0].name === "Yogur natural al estilo griego",
  `Un favorito remoto debe entrar en el plan: ${JSON.stringify(favoritos)}`,
)
check(
  favoritos[0]?.per100.kcal === 103,
  "El favorito debe conservar las kcal por 100 g",
)
check(
  alimentosDeFavoritos(["producto-9999999999999"]).length === 0,
  "Un favorito remoto sin caché no debe inventarse",
)

// 6. Retroalimentación de la biblioteca: lo que guarda el usuario (a mano o
//    desde el escáner) se convierte en alimento propio y no se duplica.
check(
  categoriaDeMacros({ protein: 31, carbs: 0, fat: 3.6 }) === "protein",
  "Una pechuga de pollo debe clasificarse como proteína",
)
check(
  categoriaDeMacros({ protein: 0, carbs: 0, fat: 100 }) === "fat",
  "El aceite debe clasificarse como grasa (manda la energía, no los gramos)",
)
check(
  categoriaDeMacros({ protein: 1, carbs: 70, fat: 1 }) === "carb",
  "El arroz debe clasificarse como carbohidrato",
)
check(
  categoriaDeMacros({ protein: 0, carbs: 0, fat: 0 }) === "carb",
  "Un alimento sin macros no debe romper la categoría",
)

const racionEscaneada = alimentoDesdePer100({
  name: "  Tortilla de casa ",
  per100: { kcal: 180, protein: 12, carbs: 3, fat: 13 },
  grams: 150,
  source: "scanner",
})
check(
  racionEscaneada.name === "Tortilla de casa",
  `El nombre debe limpiarse: ${JSON.stringify(racionEscaneada.name)}`,
)
check(
  racionEscaneada.portionGrams === 150 && racionEscaneada.kcal === 270,
  `La ración debe escalar las kcal: ${JSON.stringify(racionEscaneada)}`,
)
check(
  racionEscaneada.protein === 18 && racionEscaneada.fat === 19.5,
  "La ración debe escalar los macros con un decimal",
)
check(
  racionEscaneada.source === "scanner",
  "El alimento debe recordar que vino del escáner",
)

const verdura = PRODUCTS.find((product) => product.category === "veg")
check(Boolean(verdura), "El catálogo debe tener alguna verdura")
const verduraGuardada = alimentoDesdeProducto(verdura, "lookup")
check(
  verduraGuardada.category === "veg",
  `Guardar un producto debe conservar su categoría: ${verduraGuardada.category}`,
)
check(
  verduraGuardada.source === "lookup",
  "Guardar un producto remoto debe marcar el origen",
)
check(
  verduraGuardada.portionGrams === verdura.portionGrams,
  "La ración guardada debe ser la del producto",
)

check(
  claveAlimento("  Arroz   cocido ") === claveAlimento("arroz cocido"),
  "La clave del alimento debe ignorar acentos, mayúsculas y espacios",
)

const primeraAlta = guardarAlimentoPersonalizado({ ...racionEscaneada })
check(primeraAlta.created, "La primera alta debe crear el alimento")
const segundaAlta = guardarAlimentoPersonalizado({
  ...racionEscaneada,
  kcal: 300,
  source: "manual",
})
check(
  !segundaAlta.created && segundaAlta.food.id === primeraAlta.food.id,
  "Volver a guardar el mismo alimento debe actualizarlo, no duplicarlo",
)
const guardado = JSON.parse(store.get("forma:app-data"))
check(
  guardado.customFoods.length === 1,
  `«Mis alimentos» debe tener una sola ficha: ${guardado.customFoods.length}`,
)
check(
  guardado.customFoods[0].kcal === 300 &&
    guardado.customFoods[0].source === "manual",
  "La ficha actualizada debe conservar los valores nuevos",
)
const conCodigo = guardarAlimentoPersonalizado({
  ...racionEscaneada,
  name: "Yogur griego",
  barcode: "8480000205599",
})
check(conCodigo.created, "Un producto con código distinto debe crear otra ficha")
check(
  guardarAlimentoPersonalizado({
    ...racionEscaneada,
    name: "Otro nombre comercial",
    barcode: "8480000205599",
  }).food.id === conCodigo.food.id,
  "El código de barras debe identificar el producto aunque cambie el nombre",
)
notes.push("alimentos propios, escáner y deduplicación por nombre/código")

for (const note of notes) console.log(`OK  ${note}`)
if (problems.length) {
  console.error("\nFALLO:")
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log("OK  mapeo de la base remota, caché y favoritos")
