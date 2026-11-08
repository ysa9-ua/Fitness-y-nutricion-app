import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, ProgressRing } from "../components/UI"
import {
  agregarComidaDiaria,
  alternarComida,
  ajustarAgua,
  claveAlimento,
  eliminarComidaDiaria,
  hoyISO,
  quitarEntrada,
  sembrarDiaDemo,
  sumarMacros,
  useAppData,
  useComidasDia,
  useDia,
  type DiaryEntry,
  type DiaryMeal,
} from "../lib/appData"
import { alimentosDeFavoritos } from "../lib/foodLibrary"
import {
  cargarPreferencias,
  generarPlan,
  type PlanMeal,
  type PlanMealIcon,
  type PlanProfile,
} from "../lib/nutritionPlan"
import type { OnboardingData } from "./Onboarding"

export type RecentFood = {
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  meal: string
  grams: number
}

export type NutritionScreenProps = {
  onOpenLibrary: (meal?: DiaryMeal) => void
  onOpenPlan: () => void
  onOpenProfile: () => void
  onOpenScanner: () => void
  profile: OnboardingData
  recentFood?: RecentFood | null
}

type DayOption = {
  iso: string
  weekday: string
  fullName: string
  day: number
  monthLong: string
  isToday: boolean
}

type ViewMeal = {
  id: string
  title: string
  time: string
  icon: PlanMealIcon
  plan: PlanMeal | null
  entries: DiaryEntry[]
}

type MealMeta = {
  title: string
  time: string
  icon: PlanMealIcon
}

const MEAL_META: Record<string, MealMeta> = {
  breakfast: { title: "Desayuno", time: "08:00", icon: "sun" },
  "mid-morning": { title: "Almuerzo", time: "11:00", icon: "clock" },
  lunch: { title: "Comida", time: "13:30", icon: "leaf" },
  snack: { title: "Merienda", time: "17:30", icon: "sparkles" },
  dinner: { title: "Cena", time: "20:30", icon: "moon" },
  late: { title: "Recena", time: "22:30", icon: "moon" },
  sixth: { title: "6ª comida", time: "", icon: "sparkles" },
}

/** Comidas que se pueden crear desde la hoja «Añadir comida». */
const MEAL_SUGGESTIONS: DiaryMeal[] = [
  { id: "breakfast", title: "Desayuno", time: "08:00", icon: "sun" },
  { id: "mid-morning", title: "Almuerzo", time: "11:00", icon: "clock" },
  { id: "lunch", title: "Comida", time: "13:30", icon: "leaf" },
  { id: "snack", title: "Merienda", time: "17:30", icon: "sparkles" },
  { id: "dinner", title: "Cena", time: "20:30", icon: "moon" },
  { id: "late", title: "Recena", time: "22:30", icon: "moon" },
  { id: "sixth", title: "6ª comida", time: "", icon: "sparkles" },
]

const WATER_STEP = 250
const MIN_DATE = -56
const MAX_DATE = 56

const formatNumber = (value: number) => value.toLocaleString("es-ES")

const formatMacro = (value: number) =>
  value.toFixed(1).replace(".", ",").replace(/,0$/, "")

const formatLiters = (ml: number) =>
  (ml / 1000).toLocaleString("es-ES", {
    minimumFractionDigits: ml % 1000 === 0 ? 1 : 2,
    maximumFractionDigits: 2,
  })

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

function parseISO(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function addDays(iso: string, days: number): string {
  const date = parseISO(iso)
  date.setDate(date.getDate() + days)
  return hoyISO(date)
}

function startOfWeek(iso: string): string {
  const date = parseISO(iso)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return hoyISO(date)
}

function weekDays(startIso: string): DayOption[] {
  const today = hoyISO()
  return Array.from({ length: 7 }, (_, index) => {
    const iso = addDays(startIso, index)
    const date = parseISO(iso)
    const weekday = date
      .toLocaleDateString("es-ES", { weekday: "short" })
      .replace(".", "")
      .toUpperCase()
    const fullName = date.toLocaleDateString("es-ES", { weekday: "long" })
    const monthLong = date.toLocaleDateString("es-ES", { month: "long" })
    return {
      iso,
      weekday,
      fullName: fullName.charAt(0).toUpperCase() + fullName.slice(1),
      day: date.getDate(),
      monthLong,
      isToday: iso === today,
    }
  })
}

function monthLabel(days: DayOption[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ""
  const firstMonth = first.monthLong
  const lastMonth = last.monthLong
  const year = parseISO(last.iso).getFullYear()
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
  if (firstMonth === lastMonth) return `${capital(firstMonth)} ${year}`
  return `${capital(firstMonth)} — ${capital(lastMonth)} ${year}`
}

function sourceLabel(entry: DiaryEntry): string {
  if (entry.source === "plan") return "Plan"
  if (entry.source === "manual") return "Manual"
  return "Biblioteca"
}

export default function NutritionScreen({
  onOpenLibrary,
  onOpenPlan,
  onOpenProfile,
  onOpenScanner,
  profile,
  recentFood,
}: NutritionScreenProps) {
  const data = useAppData()
  const [selectedDate, setSelectedDate] = useState(() => hoyISO())
  const [expandedMeal, setExpandedMeal] = useState<string | null>("breakfast")
  const [mealSheetOpen, setMealSheetOpen] = useState(false)
  const [newMealName, setNewMealName] = useState("")
  const [newMealTime, setNewMealTime] = useState("")

  const planProfile = useMemo(() => perfilDelPlan(profile), [profile])
  const prefs = useMemo(() => cargarPreferencias(planProfile), [planProfile])
  const plan = useMemo(
    () =>
      generarPlan(
        planProfile,
        prefs,
        alimentosDeFavoritos(data.favorites, data.customFoods),
      ),
    [planProfile, prefs, data.favorites, data.customFoods],
  )

  // Primer arranque: deja el día de hoy con todas las comidas menos la última,
  // para que Inicio y el diario enseñen lo mismo desde el principio.
  useEffect(() => {
    sembrarDiaDemo(hoyISO(), plan.meals)
  }, [plan.meals])

  const day = useDia(selectedDate)
  const customMeals = useComidasDia(selectedDate)
  const totals = useMemo(() => sumarMacros(day.entries), [day.entries])
  const analysis = plan.analysis
  const calorieGoal = analysis.calories
  const calorieProgress =
    calorieGoal > 0
      ? Math.min(100, Math.round((totals.kcal / calorieGoal) * 100))
      : 0
  const remainingCalories = Math.max(calorieGoal - totals.kcal, 0)
  const remainingWater = Math.max(analysis.waterMl - day.waterMl, 0)
  const waterProgress =
    analysis.waterMl > 0
      ? Math.min(100, Math.round((day.waterMl / analysis.waterMl) * 100))
      : 0
  const macroSummary = [
    {
      id: "protein",
      label: "Proteínas",
      current: totals.protein,
      goal: analysis.protein,
    },
    {
      id: "carbs",
      label: "Carbohidratos",
      current: totals.carbs,
      goal: analysis.carbs,
    },
    {
      id: "fat",
      label: "Grasas",
      current: totals.fat,
      goal: analysis.fat,
    },
  ]

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const selected = days.find((date) => date.iso === selectedDate) ?? days[0]
  const offsetFromToday = Math.round(
    (parseISO(selectedDate).getTime() - parseISO(hoyISO()).getTime()) /
      (24 * 60 * 60 * 1000),
  )

  const meals = useMemo<ViewMeal[]>(() => {
    const planIds = new Set(plan.meals.map((meal) => meal.id))
    const customIds = new Set(customMeals.map((meal) => meal.id))
    // Entradas antiguas de comidas que ya no existen: se siguen mostrando.
    const extras = new Map<string, DiaryEntry[]>()
    day.entries.forEach((entry) => {
      if (planIds.has(entry.mealId) || customIds.has(entry.mealId)) return
      const list = extras.get(entry.mealId) ?? []
      extras.set(entry.mealId, [...list, entry])
    })
    const planned: ViewMeal[] = plan.meals.map((meal) => ({
      id: meal.id,
      title: meal.title,
      time: meal.time,
      icon: meal.icon,
      plan: meal,
      entries: day.entries.filter((entry) => entry.mealId === meal.id),
    }))
    const custom: ViewMeal[] = customMeals
      .filter((meal) => !planIds.has(meal.id))
      .map((meal) => ({
        id: meal.id,
        title: meal.title,
        time: meal.time,
        icon: meal.icon,
        plan: null,
        entries: day.entries.filter((entry) => entry.mealId === meal.id),
      }))
    const extraMeals: ViewMeal[] = [...extras.entries()].map(
      ([mealId, entries]) => {
        const meta = MEAL_META[mealId]
        return {
          id: mealId,
          title: meta?.title ?? entries[0]?.mealTitle ?? "Comida",
          time: meta?.time ?? "",
          icon: meta?.icon ?? "sparkles",
          plan: null,
          entries,
        }
      },
    )
    // Orden por hora: así el almuerzo de las 11:00 cae entre el desayuno y la
    // comida. Las comidas sin hora (6ª comida, nombre libre) van al final.
    return [...planned, ...custom, ...extraMeals].sort((a, b) =>
      (a.time || "99:99").localeCompare(b.time || "99:99"),
    )
  }, [plan.meals, day.entries, customMeals])

  const registeredCount = meals.filter((meal) => meal.entries.length > 0).length
  const targetMeals = meals.length

  const availableSuggestions = useMemo(
    () =>
      MEAL_SUGGESTIONS.filter(
        (item) => !meals.some((meal) => meal.id === item.id),
      ),
    [meals],
  )

  const cerrarHojaComida = () => {
    setMealSheetOpen(false)
    setNewMealName("")
    setNewMealTime("")
  }

  const abrirComida = (meal: Omit<DiaryMeal, "id"> & { id?: string }) => {
    const final = agregarComidaDiaria(selectedDate, meal)
    cerrarHojaComida()
    onOpenLibrary(final)
  }

  /** Una sugerencia solo rellena el formulario: el nombre se puede cambiar. */
  const elegirSugerencia = (suggestion: DiaryMeal) => {
    setNewMealName(suggestion.title)
    setNewMealTime(suggestion.time)
  }

  const crearComida = () => {
    const title = newMealName.trim()
    if (!title) return
    const clave = claveAlimento(title)
    // Si ya hay una comida con ese nombre, se reutiliza en vez de duplicarla.
    const existente = meals.find((meal) => claveAlimento(meal.title) === clave)
    if (existente) {
      cerrarHojaComida()
      onOpenLibrary({
        id: existente.id,
        title: existente.title,
        time: existente.time,
        icon: existente.icon,
      })
      return
    }
    const sugerencia = MEAL_SUGGESTIONS.find(
      (item) => claveAlimento(item.title) === clave,
    )
    abrirComida({
      title,
      time: newMealTime || sugerencia?.time || "",
      icon: sugerencia?.icon ?? "sparkles",
    })
  }

  useEffect(() => {
    if (!mealSheetOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMealSheetOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mealSheetOpen])

  return (
    <main className="nutrition-screen screen-stack">
      <header className="nutrition-header">
        <div className="nutrition-header__copy">
          <span className="eyebrow">DIARIO NUTRICIONAL</span>
          <h1>Nutrición</h1>
          <p>Tu equilibrio, día a día.</p>
        </div>
        <button
          aria-label="Abrir mi perfil"
          className="avatar avatar--small nutrition-avatar"
          onClick={onOpenProfile}
          type="button"
        >
          <span>LM</span>
          <i className="status-dot" />
        </button>
      </header>

      <div className="nutrition-content">
        <section
          className="nutrition-date-picker"
          aria-labelledby="nutrition-date-title"
        >
          <div className="nutrition-date-picker__header">
            <div>
              <span className="eyebrow">SELECCIONA UN DÍA</span>
              <h2 id="nutrition-date-title">{monthLabel(days)}</h2>
            </div>
            <div className="nutrition-date-picker__navigation">
              <button
                aria-label="Ver semana anterior"
                className="icon-button"
                disabled={offsetFromToday <= MIN_DATE}
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
                type="button"
              >
                <Icon name="arrow-left" size={18} />
              </button>
              <button
                aria-label="Ver semana siguiente"
                className="icon-button"
                disabled={offsetFromToday >= MAX_DATE}
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
                type="button"
              >
                <Icon name="arrow-right" size={18} />
              </button>
            </div>
          </div>
          <div
            aria-label="Días de la semana"
            className="nutrition-week"
            role="group"
          >
            {days.map((date) => {
              const isSelected = date.iso === selectedDate
              return (
                <button
                  aria-label={`${date.fullName}, ${date.day} de ${date.monthLong}`}
                  aria-pressed={isSelected}
                  className={`nutrition-day ${isSelected ? "is-selected" : ""}`}
                  key={date.iso}
                  onClick={() => setSelectedDate(date.iso)}
                  type="button"
                >
                  <span>{date.weekday}</span>
                  <strong>{date.day}</strong>
                  {date.isToday ? (
                    <>
                      <i aria-hidden="true" className="nutrition-day__today" />
                      <span className="sr-only">Hoy</span>
                    </>
                  ) : null}
                </button>
              )
            })}
          </div>
          <p className="nutrition-selected-date">
            <Icon name="calendar" size={14} />
            {selected?.isToday ? "Hoy" : "Día seleccionado"} ·{" "}
            {selected?.fullName}, {selected?.day} de {selected?.monthLong}
          </p>
        </section>

        {recentFood ? (
          <section aria-live="polite" className="nutrition-recent-food">
            <span>
              <Icon name="check" size={16} />
            </span>
            <div>
              <small>AÑADIDO A {recentFood.meal.toUpperCase()}</small>
              <strong>{recentFood.name}</strong>
              <p>
                {recentFood.grams} g · {recentFood.calories} kcal ·{" "}
                {recentFood.protein} g proteína
              </p>
            </div>
          </section>
        ) : null}

        <section
          aria-labelledby="nutrition-plan-cta-title"
          className="nutrition-plan-cta"
        >
          <div className="nutrition-plan-cta__copy">
            <span className="eyebrow">PLAN PERSONALIZADO</span>
            <h2 id="nutrition-plan-cta-title">Tu menú y tu compra</h2>
            <p>
              {formatNumber(calorieGoal)} kcal · {analysis.protein} g de
              proteína
            </p>
          </div>
          <Button icon="leaf" onClick={onOpenPlan} variant="secondary">
            Ver plan
          </Button>
        </section>

        <div
          aria-label="Acciones rápidas"
          className="nutrition-quick-actions"
          role="group"
        >
          <Button
            className="nutrition-action nutrition-action--scan"
            fullWidth
            icon="scan"
            onClick={onOpenScanner}
            variant="secondary"
          >
            Escanear etiqueta
          </Button>
          <Button
            className="nutrition-action nutrition-action--add"
            fullWidth
            icon="book"
            onClick={() => onOpenLibrary()}
          >
            Biblioteca
          </Button>
        </div>

        <section
          className="nutrition-summary"
          aria-labelledby="nutrition-summary-title"
        >
          <div className="nutrition-section-heading">
            <div>
              <span className="eyebrow">RESUMEN DEL DÍA</span>
              <h2 id="nutrition-summary-title">Tu energía</h2>
            </div>
            <span className="nutrition-streak">
              <Icon name="flame" size={15} />
              {registeredCount} de {targetMeals} comidas
            </span>
          </div>

          <div className="nutrition-calorie-summary">
            <ProgressRing
              className="nutrition-calorie-ring"
              label="Calorías consumidas"
              max={calorieGoal}
              size={132}
              stroke={10}
              value={totals.kcal}
            >
              <strong>{formatNumber(totals.kcal)}</strong>
              <span>kcal</span>
            </ProgressRing>
            <div className="nutrition-calorie-copy">
              <span>Consumido</span>
              <strong>
                {formatNumber(totals.kcal)}{" "}
                <small>/ {formatNumber(calorieGoal)} kcal</small>
              </strong>
              <p>
                Te quedan <b>{formatNumber(remainingCalories)} kcal</b> para
                completar tu objetivo.
              </p>
            </div>
          </div>

          <div className="nutrition-total-progress">
            <div className="nutrition-total-progress__labels">
              <span>Progreso total</span>
              <strong>{calorieProgress}%</strong>
            </div>
            <div
              aria-label={`Progreso calórico: ${calorieProgress}%`}
              aria-valuemax={calorieGoal}
              aria-valuemin={0}
              aria-valuenow={totals.kcal}
              className="nutrition-progress-track"
              role="progressbar"
            >
              <span />
            </div>
            <small>
              {formatNumber(totals.kcal)} de {formatNumber(calorieGoal)} kcal
              diarios
            </small>
          </div>

          <div
            aria-label="Resumen de macronutrientes"
            className="nutrition-macro-summary"
            role="group"
          >
            {macroSummary.map((macro) => {
              const percentage =
                macro.goal > 0
                  ? Math.min(
                      100,
                      Math.round((macro.current / macro.goal) * 100),
                    )
                  : 0
              return (
                <article
                  className={`nutrition-macro nutrition-macro--${macro.id}`}
                  key={macro.id}
                >
                  <div className="nutrition-macro__header">
                    <span>{macro.label}</span>
                    <strong>
                      {formatMacro(macro.current)}
                      <small> / {macro.goal} g</small>
                    </strong>
                  </div>
                  <div
                    aria-label={`${macro.label}: ${formatMacro(macro.current)} de ${macro.goal} gramos`}
                    aria-valuemax={macro.goal}
                    aria-valuemin={0}
                    aria-valuenow={macro.current}
                    className="nutrition-progress-track"
                    role="progressbar"
                  >
                    <span />
                  </div>
                  <small>{percentage}% del objetivo</small>
                </article>
              )
            })}
          </div>
        </section>

        <section
          className="nutrition-meals"
          aria-labelledby="nutrition-meals-title"
        >
          <div className="nutrition-section-heading">
            <div>
              <span className="eyebrow">COMIDAS</span>
              <h2 id="nutrition-meals-title">
                {registeredCount} de {targetMeals} registradas
              </h2>
            </div>
            <button
              className="nutrition-text-action"
              onClick={() => setMealSheetOpen(true)}
              type="button"
            >
              <Icon name="plus" size={15} />
              Añadir comida
            </button>
          </div>

          <div className="nutrition-meal-list">
            {meals.map((meal) => {
              const isExpanded = expandedMeal === meal.id
              const panelId = `nutrition-meal-panel-${meal.id}`
              const registered = meal.entries.length > 0
              const mealMacros = sumarMacros(meal.entries)
              const shown = registered
                ? mealMacros
                : (meal.plan?.macros ?? mealMacros)
              const foodsLabel = registered
                ? `${meal.entries.length} ${
                    meal.entries.length === 1 ? "alimento" : "alimentos"
                  }`
                : meal.plan
                  ? "Del plan · sin registrar"
                  : "Sin alimentos"
              return (
                <article
                  className={`nutrition-meal-card nutrition-meal-card--${meal.id} ${
                    isExpanded ? "is-expanded" : ""
                  }`}
                  key={meal.id}
                >
                  <button
                    aria-controls={panelId}
                    aria-expanded={isExpanded}
                    className="nutrition-meal-card__header"
                    id={`nutrition-meal-button-${meal.id}`}
                    onClick={() => setExpandedMeal(isExpanded ? null : meal.id)}
                    type="button"
                  >
                    <span className="nutrition-meal-card__icon">
                      <Icon name={meal.icon} size={19} />
                    </span>
                    <span className="nutrition-meal-card__title">
                      <strong>{meal.title}</strong>
                      <small>
                        {meal.time ? `${meal.time} · ` : ""}
                        {foodsLabel}
                      </small>
                    </span>
                    <span className="nutrition-meal-card__calories">
                      {formatNumber(shown.kcal)} <small>kcal</small>
                    </span>
                    <span className="nutrition-meal-card__chevron">
                      <Icon name="chevron-down" size={17} />
                    </span>
                  </button>

                  <div
                    aria-labelledby={`nutrition-meal-button-${meal.id}`}
                    className="nutrition-meal-card__body"
                    hidden={!isExpanded}
                    id={panelId}
                  >
                    {registered ? (
                      <div className="nutrition-food-list">
                        {meal.entries.map((entry) => (
                          <div className="nutrition-food" key={entry.id}>
                            <span
                              aria-hidden="true"
                              className="nutrition-food__mark"
                            >
                              {entry.name.charAt(0)}
                            </span>
                            <div className="nutrition-food__copy">
                              <strong>{entry.name}</strong>
                              <small>
                                {entry.grams} g · {sourceLabel(entry)}
                              </small>
                            </div>
                            <div
                              role="group"
                              className="nutrition-food__macros"
                              aria-label={`${entry.protein} gramos de proteína, ${entry.carbs} de carbohidratos y ${entry.fat} de grasa`}
                            >
                              <span>
                                <b>{formatMacro(entry.protein)}</b> P
                              </span>
                              <span>
                                <b>{formatMacro(entry.carbs)}</b> C
                              </span>
                              <span>
                                <b>{formatMacro(entry.fat)}</b> G
                              </span>
                            </div>
                            <strong className="nutrition-food__calories">
                              {formatNumber(entry.kcal)} kcal
                            </strong>
                            <button
                              aria-label={`Quitar ${entry.name} del diario`}
                              className="nutrition-food__remove"
                              onClick={() =>
                                quitarEntrada(selectedDate, entry.id)
                              }
                              type="button"
                            >
                              <Icon name="close" size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : meal.plan ? (
                      <div className="nutrition-meal-plan">
                        <span className="nutrition-meal-plan__label">
                          Propuesta del plan
                        </span>
                        {meal.plan.foods.map((food) => (
                          <div className="nutrition-food" key={food.id}>
                            <span
                              aria-hidden="true"
                              className="nutrition-food__mark"
                            >
                              {food.name.charAt(0)}
                            </span>
                            <div className="nutrition-food__copy">
                              <strong>{food.name}</strong>
                              <small>{food.quantity}</small>
                            </div>
                            <strong className="nutrition-food__calories">
                              {formatNumber(food.macros.kcal)} kcal
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="nutrition-meal-empty">
                        <span className="nutrition-meal-empty__icon">
                          <Icon name="camera" size={20} />
                        </span>
                        <div>
                          <strong>Tu comida empieza aquí</strong>
                          <p>Escanea el plato o añade alimentos manualmente.</p>
                        </div>
                        <button
                          aria-label={`Añadir alimento para ${meal.title.toLowerCase()}`}
                          onClick={() =>
                            onOpenLibrary({
                              id: meal.id,
                              title: meal.title,
                              time: meal.time,
                              icon: meal.icon,
                            })
                          }
                          type="button"
                        >
                          <Icon name="plus" size={17} />
                        </button>
                      </div>
                    )}

                    <div className="nutrition-meal-card__footer">
                      <div
                        aria-label="Macronutrientes de la comida"
                        className="nutrition-meal-macros"
                        role="group"
                      >
                        <span>
                          <b>{formatMacro(shown.protein)} g</b> Proteínas
                        </span>
                        <span>
                          <b>{formatMacro(shown.carbs)} g</b> Carbohidratos
                        </span>
                        <span>
                          <b>{formatMacro(shown.fat)} g</b> Grasas
                        </span>
                      </div>
                      <div className="nutrition-meal-actions">
                        <button
                          className="nutrition-inline-action"
                          onClick={() =>
                            onOpenLibrary({
                              id: meal.id,
                              title: meal.title,
                              time: meal.time,
                              icon: meal.icon,
                            })
                          }
                          type="button"
                        >
                          <Icon name="plus" size={14} />
                          Alimento
                        </button>
                        {meal.plan ? (
                          <button
                            className="nutrition-inline-action nutrition-inline-action--toggle"
                            onClick={() =>
                              alternarComida(selectedDate, meal.plan!)
                            }
                            type="button"
                          >
                            <Icon
                              name={registered ? "close" : "check"}
                              size={14}
                            />
                            {registered ? "Quitar" : "Registrar"}
                          </button>
                        ) : !registered ? (
                          <button
                            className="nutrition-inline-action nutrition-inline-action--remove"
                            onClick={() =>
                              eliminarComidaDiaria(selectedDate, meal.id)
                            }
                            type="button"
                          >
                            <Icon name="trash" size={14} />
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section
          className="nutrition-water"
          aria-labelledby="nutrition-water-title"
        >
          <div className="nutrition-water__header">
            <span className="nutrition-water__icon">
              <Icon name="water" size={21} />
            </span>
            <div>
              <span className="eyebrow">HIDRATACIÓN</span>
              <h2 id="nutrition-water-title">Mantén el flujo</h2>
            </div>
            <strong>
              {formatLiters(day.waterMl)}
              <small> / {formatLiters(analysis.waterMl)} L</small>
            </strong>
          </div>

          <div
            aria-label={`${formatNumber(day.waterMl)} de ${formatNumber(analysis.waterMl)} mililitros de agua`}
            aria-valuemax={analysis.waterMl}
            aria-valuemin={0}
            aria-valuenow={day.waterMl}
            aria-valuetext={`${waterProgress}% del objetivo diario`}
            className="nutrition-water__meter"
            role="progressbar"
          >
            {Array.from({ length: 8 }, (_, index) => (
              <span
                className={
                  index < Math.round(day.waterMl / WATER_STEP)
                    ? "is-filled"
                    : ""
                }
                key={index}
              >
                <Icon name="water" size={15} />
              </span>
            ))}
          </div>

          <div className="nutrition-water__controls">
            <button
              aria-label="Restar 250 mililitros de agua"
              disabled={day.waterMl === 0}
              onClick={() => ajustarAgua(selectedDate, -WATER_STEP)}
              type="button"
            >
              <Icon name="minus" size={16} />
              250 ml
            </button>
            <div aria-live="polite">
              <strong>{formatNumber(day.waterMl)} ml</strong>
              <span>
                {remainingWater > 0
                  ? `Faltan ${formatNumber(remainingWater)} ml`
                  : "Objetivo alcanzado"}
              </span>
            </div>
            <button
              aria-label="Añadir 250 mililitros de agua"
              disabled={day.waterMl >= analysis.waterMl}
              onClick={() => ajustarAgua(selectedDate, WATER_STEP)}
              type="button"
            >
              250 ml
              <Icon name="plus" size={16} />
            </button>
          </div>

          <div className="nutrition-water__goal">
            <span>
              <Icon name="target" size={14} /> Objetivo FORMA
            </span>
            <strong>{formatLiters(analysis.waterMl)} L diarios</strong>
            <p>Ajusta el consumo en pasos de 250 ml según tu día.</p>
          </div>
        </section>
      </div>

      <footer className="nutrition-footer">
        <Icon name="sparkles" size={14} />
        Registra con calma. La constancia importa más que la perfección.
      </footer>

      {mealSheetOpen ? (
        <div
          aria-labelledby="meal-sheet-title"
          aria-modal="true"
          className="meal-sheet"
          role="dialog"
        >
          <button
            aria-label="Cerrar añadir comida"
            className="meal-sheet__backdrop"
            onClick={cerrarHojaComida}
            type="button"
          />
          <div className="meal-sheet__panel">
            <header className="meal-sheet__header">
              <div>
                <span className="eyebrow">NUEVA COMIDA</span>
                <h2 id="meal-sheet-title">Añadir comida</h2>
                <p>Crea una comida para este día y elige sus alimentos.</p>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={cerrarHojaComida}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="meal-sheet__body">
              <section className="meal-sheet__section">
                <span className="meal-sheet__label">Nombre de la comida</span>
                <div className="meal-sheet__form">
                  <label className="meal-sheet__field">
                    <span>Nombre</span>
                    <input
                      onChange={(event) => setNewMealName(event.target.value)}
                      placeholder="Almuerzo, 6ª comida, batido…"
                      type="text"
                      value={newMealName}
                    />
                  </label>
                  <label className="meal-sheet__field">
                    <span>Hora (opcional)</span>
                    <input
                      onChange={(event) => setNewMealTime(event.target.value)}
                      type="time"
                      value={newMealTime}
                    />
                  </label>
                </div>

                {availableSuggestions.length > 0 ? (
                  <div
                    aria-label="Sugerencias de comida"
                    className="meal-sheet__suggestions"
                    role="group"
                  >
                    {availableSuggestions.map((suggestion) => (
                      <button
                        aria-pressed={
                          claveAlimento(newMealName) ===
                          claveAlimento(suggestion.title)
                        }
                        className={`meal-sheet__chip ${
                          claveAlimento(newMealName) ===
                          claveAlimento(suggestion.title)
                            ? "is-active"
                            : ""
                        }`}
                        key={suggestion.id}
                        onClick={() => elegirSugerencia(suggestion)}
                        type="button"
                      >
                        <Icon name={suggestion.icon} size={13} />
                        {suggestion.title}
                        <small>{suggestion.time || "Sin hora"}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                <Button
                  disabled={!newMealName.trim()}
                  fullWidth
                  icon="plus"
                  onClick={crearComida}
                >
                  Crear y elegir alimentos
                </Button>
              </section>

              <p className="meal-sheet__hint">
                <Icon name="info" size={13} />
                Elige el nombre que quieras: si ya existe una comida con ese
                nombre se reutiliza. Después eliges los alimentos en la
                biblioteca.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
