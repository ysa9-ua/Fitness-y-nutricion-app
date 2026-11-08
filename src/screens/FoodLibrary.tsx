import { useEffect, useMemo, useState, type CSSProperties } from "react"
import Icon, { type IconName } from "../components/Icon"
import { Button, ScreenHeader } from "../components/UI"
import {
  agregarAlimentoDiario,
  alternarFavorito,
  eliminarAlimentoPersonalizado,
  guardarAlimentoPersonalizado,
  hoyISO,
  useAppData,
  type CustomFoodCategory,
  type CustomFoodSource,
  type DiaryMeal,
} from "../lib/appData"
import {
  SECTIONS,
  SUPERMARKETS,
  alimentoDesdeProducto,
  alimentosDeFavoritos,
  buscarProductos,
  macrosDeProducto,
  productosConPersonalizados,
  productosLocales,
  type ChainId,
  type LibraryProduct,
  type LibrarySection,
} from "../lib/foodLibrary"
import {
  RemoteError,
  buscarProductos as buscarProductosRemotos,
  esCodigoDeBarras,
  type RemoteSearchResult,
} from "../lib/productSearch"
import {
  cargarPreferencias,
  generarPlan,
  type PlanProfile,
} from "../lib/nutritionPlan"
import type { OnboardingData } from "./Onboarding"

type FoodLibraryScreenProps = {
  /** Comida del diario a la que se apuntará el alimento, si se viene de una. */
  initialMeal?: DiaryMeal | null
  onAdded: (message: string) => void
  onBack: () => void
  profile: OnboardingData
}

type SourceFilter = "todos" | "favoritos" | "propios"

type ChainFilter = ChainId | "todas-las-cadenas"
type SectionFilter = LibrarySection | "todas-las-secciones"

type CustomForm = {
  name: string
  category: CustomFoodCategory
  portionGrams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

type RemoteState = {
  status: "idle" | "loading" | "ok" | "error"
  query: string
  products: LibraryProduct[]
  total: number
  fromCache: boolean
  error: string
}

const REMOTE_IDLE: RemoteState = {
  status: "idle",
  query: "",
  products: [],
  total: 0,
  fromCache: false,
  error: "",
}

const SOURCE_OPTIONS: Array<{
  id: SourceFilter
  label: string
}> = [
  { id: "todos", label: "Todos" },
  { id: "favoritos", label: "Favoritos" },
  { id: "propios", label: "Mis alimentos" },
]

const CATEGORY_OPTIONS: Array<{
  id: CustomFoodCategory
  label: string
  hint: string
}> = [
  { id: "protein", label: "Proteína", hint: "Carne, pescado, huevo…" },
  { id: "carb", label: "Carbohidrato", hint: "Arroz, pan, fruta…" },
  { id: "fat", label: "Grasa", hint: "Aceite, frutos secos…" },
  { id: "veg", label: "Verdura", hint: "Hortalizas y verduras" },
]

const SECTION_ICONS: Record<LibrarySection, IconName> = {
  proteinas: "dumbbell",
  lacteos: "water",
  carbohidratos: "leaf",
  frutas: "sun",
  verduras: "leaf",
  grasas: "sparkles",
  despensa: "book",
  snacks: "flame",
  bebidas: "water",
}

const EMPTY_FORM: CustomForm = {
  name: "",
  category: "protein",
  portionGrams: 100,
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
}

const number = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 0 })

const decimal = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 })

function perfilDelPlan(profile: OnboardingData): PlanProfile {
  return {
    age: profile.age,
    sex: profile.sex === "male" ? "male" : "female",
    weight: profile.weight,
    height: profile.height,
    bodyFat: profile.bodyFat,
    neck: profile.neck,
    waist: profile.waist,
    hips: profile.hips,
    availability: profile.availability,
    goal: profile.goal,
  }
}

function chainLabel(product: LibraryProduct): string {
  if (product.chain === "todas") return "Disponible en todas las cadenas"
  if (product.chain === "personal") return "Alimento propio"
  if (product.chain === "remota") return "FORMA"
  const market = SUPERMARKETS.find((item) => item.id === product.chain)
  return market?.name ?? product.chain
}

function esDeRemoto(product: LibraryProduct): boolean {
  return product.source === "lookup"
}

const SOURCE_LABELS: Record<CustomFoodSource, string> = {
  manual: "Manual",
  scanner: "Escáner",
  lookup: "FORMA",
}

/** Etiqueta del origen de un alimento propio, o `null` si es del catálogo. */
function origenPropio(product: LibraryProduct): string | null {
  if (product.chain !== "personal") return null
  return SOURCE_LABELS[product.customSource ?? "manual"] ?? null
}

export default function FoodLibraryScreen({
  initialMeal,
  onAdded,
  onBack,
  profile,
}: FoodLibraryScreenProps) {
  const data = useAppData()
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<SourceFilter>("todos")
  const [chain, setChain] = useState<ChainFilter>("todas-las-cadenas")
  const [section, setSection] = useState<SectionFilter>("todas-las-secciones")
  const [selected, setSelected] = useState<LibraryProduct | null>(null)
  const [grams, setGrams] = useState(100)
  const [mealId, setMealId] = useState(() => initialMeal?.id ?? "lunch")
  const [customOpen, setCustomOpen] = useState(false)
  const [form, setForm] = useState<CustomForm>(EMPTY_FORM)
  const [feedback, setFeedback] = useState("")
  const [remote, setRemote] = useState<RemoteState>(REMOTE_IDLE)

  const planProfile = useMemo(() => perfilDelPlan(profile), [profile])
  const plan = useMemo(
    () =>
      generarPlan(
        planProfile,
        cargarPreferencias(planProfile),
        alimentosDeFavoritos(data.favorites, data.customFoods),
      ),
    [planProfile, data.favorites, data.customFoods],
  )

  // Comidas del día: las del plan más las creadas a mano en el Diario.
  const meals = useMemo(() => {
    const ids = new Set(plan.meals.map((meal) => meal.id))
    const extras = (data.customMeals[hoyISO()] ?? []).filter(
      (meal) => !ids.has(meal.id),
    )
    return [...plan.meals, ...extras]
  }, [plan.meals, data.customMeals])

  const products = useMemo(
    () => productosLocales(data.customFoods),
    [data.customFoods],
  )

  /** Catálogo local + lo que haya devuelto la base remota en esta sesión. */
  const catalog = useMemo(() => {
    if (!remote.products.length) return products
    const ids = new Set(products.map((product) => product.id))
    return [
      ...products,
      ...remote.products.filter((product) => !ids.has(product.id)),
    ]
  }, [products, remote.products])

  const favorites = useMemo(() => new Set(data.favorites), [data.favorites])

  const filtered = useMemo(() => {
    // En favoritos se incluyen los productos remotos ya vistos,
    // aunque la búsqueda de esta sesión se haya cerrado o la app se recargue.
    const base =
      source === "favoritos"
        ? productosConPersonalizados(data.customFoods)
        : catalog
    let list = buscarProductos(base, query, chain, section)
    if (source === "favoritos") {
      list = list.filter((product) => favorites.has(product.id))
    } else if (source === "propios") {
      list = list.filter((product) => product.chain === "personal")
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [catalog, data.customFoods, query, chain, section, source, favorites])

  const sectionCounts = useMemo(() => {
    const counts = new Map<LibrarySection, number>()
    catalog.forEach((product) => {
      counts.set(product.section, (counts.get(product.section) ?? 0) + 1)
    })
    return counts
  }, [catalog])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(""), 2600)
    return () => window.clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    if (!selected && !customOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setSelected(null)
      setCustomOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selected, customOpen])

  const openProduct = (product: LibraryProduct) => {
    setSelected(product)
    setGrams(product.portionGrams)
  }

  const buscarOnline = async (termo = query) => {
    const limpio = termo.trim()
    if (limpio.length < 2) return
    setQuery(limpio)
    setRemote({ ...REMOTE_IDLE, status: "loading", query: limpio })
    try {
      const result: RemoteSearchResult = await buscarProductosRemotos(limpio)
      setRemote({
        status: "ok",
        query: limpio,
        products: result.products,
        total: result.total,
        fromCache: result.fromCache,
        error: "",
      })
      if (result.products.length === 0) {
        setFeedback(`Sin resultados para «${limpio}» en FORMA`)
      }
    } catch (error) {
      const message =
        error instanceof RemoteError
          ? error.message
          : "No se pudo buscar en FORMA."
      setRemote({
        status: "error",
        query: limpio,
        products: [],
        total: 0,
        fromCache: false,
        error: message,
      })
    }
  }

  const quitarRemoto = () => {
    setRemote(REMOTE_IDLE)
  }

  const addToDiary = () => {
    if (!selected) return
    const macros = macrosDeProducto(selected, grams)
    const meal =
      meals.find((item) => item.id === mealId) ?? meals[0] ?? initialMeal
    const mealTitle = meal?.title ?? "Comida"
    const name =
      selected.brand === "Genérico" || selected.brand === "Propio"
        ? selected.name
        : `${selected.name} · ${selected.brand}`
    agregarAlimentoDiario(hoyISO(), {
      mealId: meal?.id ?? mealId,
      mealTitle,
      name,
      grams,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      source: "library",
      foodId: selected.id,
    })
    setFeedback(`${name} añadido a ${mealTitle.toLowerCase()}`)
    onAdded(`${name} añadido al diario`)
    setSelected(null)
  }

  const saveCustom = () => {
    const name = form.name.trim()
    if (!name) return
    const { created } = guardarAlimentoPersonalizado({
      name,
      category: form.category,
      portionGrams: Math.max(1, form.portionGrams),
      kcal: Math.max(0, form.kcal),
      protein: Math.max(0, form.protein),
      carbs: Math.max(0, form.carbs),
      fat: Math.max(0, form.fat),
      source: "manual",
    })
    setForm(EMPTY_FORM)
    setCustomOpen(false)
    setFeedback(
      `${name} ${created ? "guardado" : "actualizado"} en Mis alimentos`,
    )
    onAdded(
      created
        ? "Alimento guardado en tu biblioteca"
        : "Alimento actualizado en tu biblioteca",
    )
  }

  /** Guarda en la biblioteca un producto que solo existía en la base remota. */
  const guardarSeleccionado = () => {
    if (!selected || !esDeRemoto(selected)) return
    const { food, created } = guardarAlimentoPersonalizado(
      alimentoDesdeProducto(selected, "lookup"),
    )
    setFeedback(
      `${food.name} ${created ? "guardado" : "actualizado"} en Mis alimentos`,
    )
    onAdded(
      created
        ? "Producto guardado en tu biblioteca"
        : "Producto actualizado en tu biblioteca",
    )
  }

  const eliminarSeleccionado = () => {
    if (!selected || selected.chain !== "personal") return
    eliminarAlimentoPersonalizado(selected.id)
    setSelected(null)
    setFeedback("Alimento eliminado de Mis alimentos")
    onAdded("Alimento eliminado de tu biblioteca")
  }

  const customMacros = selected ? macrosDeProducto(selected, grams) : null

  const yaEnBiblioteca = useMemo(() => {
    if (!selected) return false
    if (selected.chain === "personal") return true
    return data.customFoods.some((food) =>
      selected.barcode
        ? food.barcode === selected.barcode
        : food.name.trim().toLowerCase() === selected.name.trim().toLowerCase(),
    )
  }, [selected, data.customFoods])

  return (
    <main className="food-library-screen screen-stack">
      <ScreenHeader
        action={{
          label: "Crear alimento propio",
          icon: "plus",
          onClick: () => setCustomOpen(true),
        }}
        eyebrow="NUTRICIÓN · BIBLIOTECA"
        onBack={onBack}
        subtitle={`${products.length} locales · FORMA`}
        title="Alimentos"
      />

      <section className="screen-body food-library-body">
        {initialMeal ? (
          <div className="food-library-target">
            <span className="food-library-target__icon">
              <Icon name="target" size={18} />
            </span>
            <div>
              <small>AÑADIR A</small>
              <strong>{initialMeal.title}</strong>
            </div>
            <span>{initialMeal.time || "Sin hora"}</span>
          </div>
        ) : null}

        <section className="food-library-hero">
          <div>
            <span className="eyebrow">SUPERMERCADOS · FORMA</span>
            <strong>Encuentra lo que compras de verdad</strong>
            <p>
              Catálogo de supermercados, tus propios alimentos y la base de
              datos de FORMA: busca por nombre o código de barras cualquier
              producto envasado y apúntalo al diario.
            </p>
          </div>
          <div className="food-library-hero__stats">
            <span>
              <strong>{products.length}</strong>
              locales
            </span>
            <span>
              <strong>{data.favorites.length}</strong>
              favoritos
            </span>
            <span>
              <strong>{SUPERMARKETS.length}</strong>
              cadenas
            </span>
          </div>
        </section>

        {feedback ? (
          <p aria-live="polite" className="food-library-feedback">
            <Icon name="check" size={15} />
            {feedback}
          </p>
        ) : null}

        <form
          className="food-library-search"
          onSubmit={(event) => {
            event.preventDefault()
            void buscarOnline()
          }}
        >
          <Icon name="search" size={18} />
          <input
            aria-label="Buscar alimentos"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pollo, yogur, Mercadona, 8480000213587…"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Limpiar búsqueda"
              onClick={() => setQuery("")}
              type="button"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
          <button
            aria-label="Buscar en FORMA"
            className="food-library-search__go"
            disabled={query.trim().length < 2 || remote.status === "loading"}
            type="submit"
          >
            {remote.status === "loading" ? (
              <span aria-hidden="true" className="food-library-spinner" />
            ) : (
              <Icon name="arrow-right" size={15} />
            )}
          </button>
        </form>
        <p className="food-library-search__hint">
          <Icon name="info" size={12} />
          Pulsa Intro para buscar también en FORMA ·{" "}
          {esCodigoDeBarras(query)
            ? "código de barras detectado"
            : "nombre o código de barras"}
        </p>

        {remote.status !== "idle" ? (
          <div className="food-library-remote" data-state={remote.status}>
            {remote.status === "loading" ? (
              <>
                <span aria-hidden="true" className="food-library-spinner" />
                <p>
                  Buscando <strong>{remote.query}</strong> en FORMA…
                </p>
              </>
            ) : null}
            {remote.status === "ok" ? (
              <>
                <span className="food-library-remote__badge">FORMA</span>
                <p>
                  <strong>
                    {remote.products.length} de{" "}
                    {remote.total.toLocaleString("es-ES")}
                  </strong>{" "}
                  productos para «{remote.query}»
                  {remote.fromCache ? " · guardados en caché" : ""}
                </p>
                <button onClick={quitarRemoto} type="button">
                  Quitar
                </button>
              </>
            ) : null}
            {remote.status === "error" ? (
              <>
                <span className="food-library-remote__badge">!</span>
                <p>{remote.error}</p>
                <button
                  onClick={() => void buscarOnline(remote.query)}
                  type="button"
                >
                  Reintentar
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div
          aria-label="Origen del alimento"
          className="food-library-source"
          role="group"
        >
          {SOURCE_OPTIONS.map((option) => (
            <button
              aria-pressed={source === option.id}
              className={source === option.id ? "is-active" : ""}
              key={option.id}
              onClick={() => setSource(option.id)}
              type="button"
            >
              {option.label}
              {option.id === "favoritos" && data.favorites.length > 0 ? (
                <small>{data.favorites.length}</small>
              ) : null}
            </button>
          ))}
        </div>

        <section className="food-library-filter">
          <div className="food-library-filter__heading">
            <span className="eyebrow">CADENA</span>
            <small>Los genéricos aparecen en todas</small>
          </div>
          <div className="food-library-scroll">
            <button
              aria-pressed={chain === "todas-las-cadenas"}
              className={`food-chip ${
                chain === "todas-las-cadenas" ? "is-active" : ""
              }`}
              onClick={() => setChain("todas-las-cadenas")}
              type="button"
            >
              Todas
            </button>
            {SUPERMARKETS.map((market) => (
              <button
                aria-pressed={chain === market.id}
                className={`food-chip ${
                  chain === market.id ? "is-active" : ""
                }`}
                key={market.id}
                onClick={() => setChain(market.id)}
                style={{ "--chain-color": market.color } as CSSProperties}
                type="button"
              >
                <i />
                {market.short}
              </button>
            ))}
          </div>
        </section>

        <section className="food-library-filter">
          <div className="food-library-filter__heading">
            <span className="eyebrow">SECCIÓN</span>
            <small>Filtra por tipo de producto</small>
          </div>
          <div className="food-library-scroll">
            <button
              aria-pressed={section === "todas-las-secciones"}
              className={`food-chip ${
                section === "todas-las-secciones" ? "is-active" : ""
              }`}
              onClick={() => setSection("todas-las-secciones")}
              type="button"
            >
              Todas
            </button>
            {SECTIONS.map((item) => (
              <button
                aria-pressed={section === item.id}
                className={`food-chip ${
                  section === item.id ? "is-active" : ""
                }`}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                <Icon name={SECTION_ICONS[item.id]} size={13} />
                {item.label}
                <small>{sectionCounts.get(item.id) ?? 0}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="food-library-results">
          <div>
            <span className="eyebrow">
              {remote.status === "ok"
                ? "RESULTADOS · FORMA"
                : "RESULTADOS"}
            </span>
            <strong>
              {filtered.length}{" "}
              {filtered.length === 1 ? "alimento" : "alimentos"}
            </strong>
          </div>
          <button
            disabled={
              query === "" &&
              source === "todos" &&
              chain === "todas-las-cadenas" &&
              section === "todas-las-secciones" &&
              remote.status === "idle"
            }
            onClick={() => {
              setQuery("")
              setSource("todos")
              setChain("todas-las-cadenas")
              setSection("todas-las-secciones")
              quitarRemoto()
            }}
            type="button"
          >
            <Icon name="refresh" size={14} />
            Limpiar filtros
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="food-library-empty">
            <span>
              <Icon name="search" size={22} />
            </span>
            <strong>No hay resultados</strong>
            <p>
              Prueba con otro nombre, cambia de cadena o busca el producto en
              FORMA.
            </p>
            <div className="food-library-empty__actions">
              <Button
                disabled={
                  query.trim().length < 2 || remote.status === "loading"
                }
                icon="search"
                onClick={() => void buscarOnline()}
              >
                Buscar en FORMA
              </Button>
              <Button
                icon="plus"
                variant="ghost"
                onClick={() => setCustomOpen(true)}
              >
                Crear alimento
              </Button>
            </div>
          </div>
        ) : (
          <div className="food-product-list">
            {filtered.map((product) => {
              const favorite = favorites.has(product.id)
              const origen = origenPropio(product)
              return (
                <article className="food-product" key={product.id}>
                  <button
                    className="food-product__main"
                    onClick={() => openProduct(product)}
                    type="button"
                  >
                    {product.image ? (
                      <img
                        alt=""
                        className="food-product__img"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={product.image}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`food-product__mark food-product__mark--${product.section}`}
                      >
                        {product.name.charAt(0)}
                      </span>
                    )}
                    <span className="food-product__copy">
                      <strong>{product.name}</strong>
                      <small>
                        {product.brand} · {chainLabel(product)}
                        {esDeRemoto(product) ? (
                          <b className="food-product__lookup">FORMA</b>
                        ) : null}
                        {origen ? (
                          <b className="food-product__origin">{origen}</b>
                        ) : null}
                      </small>
                      <span>
                        <b>{number(product.per100.kcal)} kcal</b> /100 g ·{" "}
                        {decimal(product.per100.protein)} P ·{" "}
                        {decimal(product.per100.carbs)} C ·{" "}
                        {decimal(product.per100.fat)} G
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                  <button
                    aria-label={
                      favorite
                        ? `Quitar ${product.name} de favoritos`
                        : `Marcar ${product.name} como favorito`
                    }
                    aria-pressed={favorite}
                    className={`food-product__fav ${favorite ? "is-on" : ""}`}
                    onClick={() => alternarFavorito(product.id)}
                    type="button"
                  >
                    <Icon name="heart" size={17} />
                  </button>
                </article>
              )
            })}
          </div>
        )}

        <p className="food-library-note">
          <Icon name="info" size={13} />
          Valores orientativos por 100 g: revisa siempre la etiqueta. Los
          productos de la base de FORMA pueden estar incompletos.
        </p>
      </section>

      {selected ? (
        <div
          aria-labelledby="food-detail-title"
          aria-modal="true"
          className="food-sheet"
          role="dialog"
        >
          <button
            aria-label="Cerrar ficha del alimento"
            className="food-sheet__backdrop"
            onClick={() => setSelected(null)}
            type="button"
          />
          <div className="food-sheet__panel">
            <header className="food-sheet__header">
              <div>
                <span className="eyebrow">{chainLabel(selected)}</span>
                <h2 id="food-detail-title">{selected.name}</h2>
                <p>
                  {selected.brand} ·{" "}
                  {SECTIONS.find((item) => item.id === selected.section)?.label}
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setSelected(null)}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="food-sheet__body">
              {selected.image ? (
                <div className="food-sheet__photo">
                  <img
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={selected.imageLarge ?? selected.image}
                  />
                </div>
              ) : null}

              {esDeRemoto(selected) ? (
                <div className="food-sheet__meta">
                  {selected.barcode ? (
                    <span>EAN {selected.barcode}</span>
                  ) : null}
                  {selected.nutriscore ? (
                    <span
                      className={`food-sheet__nutriscore food-sheet__nutriscore--${selected.nutriscore}`}
                    >
                      Nutri-Score {selected.nutriscore.toUpperCase()}
                    </span>
                  ) : null}
                  <span>FORMA</span>
                </div>
              ) : null}

              <div className="food-sheet__macros">
                <span>
                  <small>CALORÍAS</small>
                  <strong>{number(selected.per100.kcal)}</strong>
                  kcal /100 g
                </span>
                <span>
                  <small>PROTEÍNA</small>
                  <strong>{decimal(selected.per100.protein)}</strong>g
                </span>
                <span>
                  <small>CARBOS</small>
                  <strong>{decimal(selected.per100.carbs)}</strong>g
                </span>
                <span>
                  <small>GRASA</small>
                  <strong>{decimal(selected.per100.fat)}</strong>g
                </span>
              </div>

              <div className="food-sheet__portion">
                <div className="food-sheet__portion-heading">
                  <strong>Cantidad</strong>
                  <span>
                    {grams} g ·{" "}
                    {selected.brand === "Genérico"
                      ? "ración orientativa"
                      : selected.brand}
                  </span>
                </div>
                <div className="food-sheet__stepper">
                  <button
                    aria-label="Reducir 10 gramos"
                    disabled={grams <= 10}
                    onClick={() =>
                      setGrams((value) => Math.max(10, value - 10))
                    }
                    type="button"
                  >
                    <Icon name="minus" size={17} />
                  </button>
                  <input
                    aria-label="Cantidad en gramos"
                    inputMode="numeric"
                    max={1000}
                    min={10}
                    onChange={(event) =>
                      setGrams(
                        Math.max(0, Math.min(1000, Number(event.target.value))),
                      )
                    }
                    type="number"
                    value={grams}
                  />
                  <button
                    aria-label="Aumentar 10 gramos"
                    disabled={grams >= 1000}
                    onClick={() =>
                      setGrams((value) => Math.min(1000, value + 10))
                    }
                    type="button"
                  >
                    <Icon name="plus" size={17} />
                  </button>
                </div>
                <div className="food-sheet__presets">
                  {[50, 100, selected.portionGrams, 200]
                    .filter(
                      (value, index, list) =>
                        value > 0 && list.indexOf(value) === index,
                    )
                    .map((value) => (
                      <button
                        className={grams === value ? "is-active" : ""}
                        key={value}
                        onClick={() => setGrams(value)}
                        type="button"
                      >
                        {value} g
                      </button>
                    ))}
                </div>
              </div>

              {customMacros ? (
                <div className="food-sheet__total">
                  <span>
                    <b>{number(customMacros.kcal)} kcal</b>
                    en esta cantidad
                  </span>
                  <span>
                    {decimal(customMacros.protein)} P ·{" "}
                    {decimal(customMacros.carbs)} C ·{" "}
                    {decimal(customMacros.fat)} G
                  </span>
                </div>
              ) : null}

              <div className="food-sheet__meal">
                <div className="food-sheet__portion-heading">
                  <strong>¿En qué comida?</strong>
                  <span>Se apunta al diario de hoy</span>
                </div>
                <div className="food-sheet__meal-options">
                  {meals.map((meal) => (
                    <button
                      aria-pressed={mealId === meal.id}
                      className={mealId === meal.id ? "is-active" : ""}
                      key={meal.id}
                      onClick={() => setMealId(meal.id)}
                      type="button"
                    >
                      {meal.title}
                      <small>{meal.time || "Sin hora"}</small>
                    </button>
                  ))}
                </div>
              </div>

              <button
                aria-pressed={favorites.has(selected.id)}
                className={`food-sheet__favorite ${
                  favorites.has(selected.id) ? "is-on" : ""
                }`}
                onClick={() => alternarFavorito(selected.id)}
                type="button"
              >
                <Icon name="heart" size={17} />
                {favorites.has(selected.id)
                  ? "Está en favoritos del plan"
                  : "Añadir a favoritos del plan"}
              </button>

              {selected.chain === "personal" ? (
                <button
                  className="food-sheet__remove"
                  onClick={eliminarSeleccionado}
                  type="button"
                >
                  <Icon name="trash" size={16} />
                  Quitar de mi biblioteca
                </button>
              ) : null}
            </div>

            <footer className="food-sheet__footer">
              {esDeRemoto(selected) ? (
                <Button
                  disabled={yaEnBiblioteca}
                  fullWidth
                  icon={yaEnBiblioteca ? "check" : "book"}
                  onClick={guardarSeleccionado}
                  variant="secondary"
                >
                  {yaEnBiblioteca
                    ? "Ya está en tu biblioteca"
                    : "Guardar en mi biblioteca"}
                </Button>
              ) : null}
              <Button
                fullWidth
                icon="plus"
                onClick={addToDiary}
                className="food-sheet__add"
              >
                Añadir {grams} g al diario
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {customOpen ? (
        <div
          aria-labelledby="custom-food-title"
          aria-modal="true"
          className="food-sheet"
          role="dialog"
        >
          <button
            aria-label="Cerrar alimento propio"
            className="food-sheet__backdrop"
            onClick={() => setCustomOpen(false)}
            type="button"
          />
          <div className="food-sheet__panel">
            <header className="food-sheet__header">
              <div>
                <span className="eyebrow">MIS ALIMENTOS</span>
                <h2 id="custom-food-title">Crear alimento</h2>
                <p>Guarda los valores de tu etiqueta o de tu receta.</p>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setCustomOpen(false)}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="food-sheet__body">
              <label className="food-field">
                <span>Nombre</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ej. Tortilla de mi casa"
                  type="text"
                  value={form.name}
                />
              </label>

              <div className="food-sheet__portion-heading">
                <strong>Tipo de alimento</strong>
                <span>Se usa para el menú del plan</span>
              </div>
              <div className="food-sheet__categories">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    aria-pressed={form.category === option.id}
                    className={form.category === option.id ? "is-active" : ""}
                    key={option.id}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        category: option.id,
                      }))
                    }
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </button>
                ))}
              </div>

              <div className="food-sheet__heading-row">
                <strong>Valores de la ración</strong>
                <span>No hace falta pasarlos a 100 g</span>
              </div>

              <div className="food-sheet__form-grid">
                <label className="food-field">
                  <span>Ración (g)</span>
                  <input
                    inputMode="decimal"
                    min={1}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        portionGrams: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={form.portionGrams}
                  />
                </label>
                <label className="food-field">
                  <span>Calorías</span>
                  <input
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        kcal: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={form.kcal}
                  />
                </label>
                <label className="food-field">
                  <span>Proteína (g)</span>
                  <input
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        protein: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={form.protein}
                  />
                </label>
                <label className="food-field">
                  <span>Carbos (g)</span>
                  <input
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        carbs: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={form.carbs}
                  />
                </label>
                <label className="food-field">
                  <span>Grasa (g)</span>
                  <input
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fat: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={form.fat}
                  />
                </label>
              </div>

              <p className="food-sheet__hint">
                <Icon name="info" size={13} />
                Puedes corregir después los valores desde la ficha del alimento.
              </p>
            </div>

            <footer className="food-sheet__footer">
              <Button
                disabled={!form.name.trim()}
                fullWidth
                icon="check"
                onClick={saveCustom}
              >
                Guardar alimento
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  )
}
