import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, ScreenHeader } from "../components/UI"
import { useAppData } from "../lib/appData"
import { alimentosDeFavoritos } from "../lib/foodLibrary"
import type { OnboardingData } from "./Onboarding"
import {
  ACTIVITY_OPTIONS,
  CARB_FOODS,
  EXCLUSION_OPTIONS,
  FAT_FOODS,
  GOAL_OPTIONS,
  PROTEIN_FOODS,
  cargarPreferencias,
  generarPlan,
  guardarPreferencias,
  preferenciasPorDefecto,
  type ActivityLevel,
  type Food,
  type Goal,
  type MealsPerDay,
  type PlanMeal,
  type PlanPreferences,
  type PlanProfile,
} from "../lib/nutritionPlan"

type NutritionPlanScreenProps = {
  profile: OnboardingData
  onBack: () => void
  onOpenLibrary: () => void
}

type PlanTab = "analysis" | "menu" | "shopping"

type PlanChoice = {
  id: string
  label: string
}

const TABS: Array<{
  id: PlanTab
  label: string
  icon: "chart" | "leaf" | "book"
}> = [
  { id: "analysis", label: "Análisis", icon: "chart" },
  { id: "menu", label: "Menú", icon: "leaf" },
  { id: "shopping", label: "Compra", icon: "book" },
]

const MEAL_COUNTS: MealsPerDay[] = [3, 4, 5, 6]

const number = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 0 })

const decimal = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 })

const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value))}`

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

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="plan-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}

function CalcRow({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <div className={`plan-calc__row ${strong ? "is-strong" : ""}`}>
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <strong>{value}</strong>
    </div>
  )
}

function MacroCard({
  id,
  label,
  grams,
  kcal,
  pct,
}: {
  id: string
  label: string
  grams: number
  kcal: number
  pct: number
}) {
  return (
    <article className={`plan-macro plan-macro--${id}`}>
      <div className="plan-macro__top">
        <span>{label}</span>
        <strong>
          {grams}
          <small> g</small>
        </strong>
      </div>
      <div
        aria-label={`${label}: ${grams} gramos, ${pct}% de las calorías`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={pct}
        className="plan-macro__bar"
        role="progressbar"
      >
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <small>
        {number(kcal)} kcal · {pct}% del total
      </small>
    </article>
  )
}

function ChoiceChips({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: string
  options: PlanChoice[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="plan-config__section">
      <div className="plan-config__heading">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="plan-chip-grid">
        {options.map((option) => (
          <button
            aria-pressed={value === option.id}
            className={`plan-chip ${value === option.id ? "is-on" : ""}`}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function FoodChips({
  label,
  hint,
  foods,
  selected,
  onToggle,
}: {
  label: string
  hint: string
  foods: Food[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <section className="plan-config__section">
      <div className="plan-config__heading">
        <strong>{label}</strong>
        <small>{hint}</small>
      </div>
      <div className="plan-chip-grid">
        {foods.map((food) => {
          const active = selected.includes(food.id)
          return (
            <button
              aria-pressed={active}
              className={`plan-chip plan-chip--food ${active ? "is-on" : ""}`}
              key={food.id}
              onClick={() => onToggle(food.id)}
              type="button"
            >
              {food.name}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MealCard({ meal }: { meal: PlanMeal }) {
  return (
    <article className={`plan-meal plan-meal--${meal.id}`}>
      <header className="plan-meal__header">
        <span className="plan-meal__icon">
          <Icon name={meal.icon} size={18} />
        </span>
        <div className="plan-meal__title">
          <strong>{meal.title}</strong>
          <small>{meal.time}</small>
        </div>
        <span className="plan-meal__kcal">
          {number(meal.macros.kcal)} <small>kcal</small>
        </span>
      </header>

      <p className="plan-meal__dish">{meal.dish}</p>

      <div className="plan-meal__foods">
        {meal.foods.map((food) => (
          <div className="plan-food" key={food.id}>
            <span aria-hidden="true" className="plan-food__mark">
              {food.name.charAt(0)}
            </span>
            <div className="plan-food__copy">
              <strong>{food.name}</strong>
              <small>{food.quantity}</small>
            </div>
            <span className="plan-food__kcal">
              {number(food.macros.kcal)} kcal
            </span>
          </div>
        ))}
      </div>

      <footer className="plan-meal__footer">
        <span>
          <b>{decimal(meal.macros.protein)} g</b> P
        </span>
        <span>
          <b>{decimal(meal.macros.carbs)} g</b> C
        </span>
        <span>
          <b>{decimal(meal.macros.fat)} g</b> G
        </span>
      </footer>
    </article>
  )
}

export default function NutritionPlanScreen({
  profile,
  onBack,
  onOpenLibrary,
}: NutritionPlanScreenProps) {
  const data = useAppData()
  const planProfile = useMemo(() => perfilDelPlan(profile), [profile])
  const [prefs, setPrefs] = useState<PlanPreferences>(() =>
    cargarPreferencias(planProfile),
  )
  const [tab, setTab] = useState<PlanTab>("analysis")
  const [configOpen, setConfigOpen] = useState(false)
  const [draft, setDraft] = useState<PlanPreferences>(prefs)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const favorites = useMemo(
    () => alimentosDeFavoritos(data.favorites, data.customFoods),
    [data.favorites, data.customFoods],
  )

  const plan = useMemo(
    () => generarPlan(planProfile, prefs, favorites),
    [planProfile, prefs, favorites],
  )
  const analysis = plan.analysis

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!configOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfigOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [configOpen])

  const openConfig = () => {
    setDraft(prefs)
    setConfigOpen(true)
  }

  const applyConfig = () => {
    setPrefs(draft)
    guardarPreferencias(draft)
    setConfigOpen(false)
  }

  const resetConfig = () => {
    setDraft({
      ...preferenciasPorDefecto(planProfile),
      variant: draft.variant,
    })
  }

  const varyMenu = () => {
    const next = { ...prefs, variant: prefs.variant + 1 }
    setPrefs(next)
    guardarPreferencias(next)
  }

  const toggleFood = (key: "proteins" | "carbs" | "fats", id: string) => {
    setDraft((current) => {
      const list = current[key]
      return {
        ...current,
        [key]: list.includes(id)
          ? list.filter((item) => item !== id)
          : [...list, id],
      }
    })
  }

  const toggleExclusion = (id: string) => {
    setDraft((current) => ({
      ...current,
      exclusions: current.exclusions.includes(id)
        ? current.exclusions.filter((item) => item !== id)
        : [...current.exclusions, id],
    }))
  }

  const toggleChecked = (id: string) => {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyShoppingList = async () => {
    const text = plan.shopping
      .map(
        (group) =>
          `${group.label}\n${group.items
            .map((item) => `- ${item.name}: ${item.quantity}`)
            .join("\n")}`,
      )
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const missingBodyFat = analysis.bodyFat === null

  return (
    <main className="plan-nutrition-screen screen-stack">
      <ScreenHeader
        action={{
          label: "Ajustar plan",
          icon: "settings",
          onClick: openConfig,
        }}
        eyebrow="NUTRICIÓN · PLAN"
        onBack={onBack}
        subtitle="Calculado con tus datos y preferencias"
        title="Tu plan"
      />

      <section className="screen-body plan-nutrition-body">
        <section className="plan-hero" aria-labelledby="plan-hero-title">
          <div className="plan-hero__copy">
            <span className="eyebrow">OBJETIVO DIARIO</span>
            <strong id="plan-hero-title">
              {number(analysis.calories)} <small>kcal</small>
            </strong>
            <p>
              {analysis.goalLabel} · {analysis.activityLabel}
            </p>
          </div>
          <div className="plan-hero__macros">
            <span>
              <b>{analysis.protein}</b> P
            </span>
            <span>
              <b>{analysis.carbs}</b> C
            </span>
            <span>
              <b>{analysis.fat}</b> G
            </span>
          </div>
        </section>

        <button
          className="plan-library-cta"
          onClick={onOpenLibrary}
          type="button"
        >
          <span>
            <Icon name="book" size={19} />
          </span>
          <div>
            <strong>Biblioteca de alimentos</strong>
            <small>
              {data.favorites.length > 0
                ? `${data.favorites.length} ${
                    data.favorites.length === 1
                      ? "favorito entra"
                      : "favoritos entran"
                  } en la rotación del menú`
                : "Elige supermercado y marca favoritos"}
            </small>
          </div>
          <Icon name="chevron-right" size={16} />
        </button>

        <nav
          aria-label="Secciones del plan"
          className="plan-tabs"
          role="tablist"
        >
          {TABS.map((item) => (
            <button
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "analysis" ? (
          <section
            aria-labelledby="plan-analysis-title"
            className="plan-tab-panel"
            role="tabpanel"
          >
            <div className="plan-section-heading">
              <div>
                <span className="eyebrow">SECCIÓN 1 · ANÁLISIS</span>
                <h2 id="plan-analysis-title">Tus números</h2>
              </div>
              <span className="plan-badge">
                {analysis.formula === "katch"
                  ? "Katch-McArdle"
                  : "Mifflin-St Jeor"}
              </span>
            </div>

            <div className="plan-metrics">
              <Metric label="Edad" value={`${profile.age} años`} />
              <Metric
                label="Sexo"
                value={profile.sex === "male" ? "Hombre" : "Mujer"}
              />
              <Metric label="Peso" value={`${decimal(profile.weight)} kg`} />
              <Metric label="Altura" value={`${number(profile.height)} cm`} />
              <Metric hint="kg/m²" label="IMC" value={decimal(analysis.bmi)} />
              <Metric
                hint={missingBodyFat ? "Sin dato" : "Katch-McArdle"}
                label="Grasa"
                value={missingBodyFat ? "—" : `${decimal(analysis.bodyFat!)}%`}
              />
              <Metric
                label="Cintura"
                value={
                  typeof profile.waist === "number"
                    ? `${decimal(profile.waist)} cm`
                    : "—"
                }
              />
              <Metric
                label="Cadera"
                value={
                  typeof profile.hips === "number"
                    ? `${decimal(profile.hips)} cm`
                    : "—"
                }
              />
              <Metric
                label="Cuello"
                value={
                  typeof profile.neck === "number"
                    ? `${decimal(profile.neck)} cm`
                    : "—"
                }
              />
            </div>

            <section className="plan-card">
              <div className="plan-section-heading">
                <div>
                  <span className="eyebrow">CÁLCULO ENERGÉTICO</span>
                  <h2>Cómo sale tu objetivo</h2>
                </div>
              </div>
              <div className="plan-calc">
                <CalcRow
                  hint="Metabolismo en reposo"
                  label="Gasto basal"
                  value={`${number(analysis.bmr)} kcal`}
                />
                <CalcRow
                  hint={`× ${decimal(analysis.activityFactor)} · ${analysis.activityLabel}`}
                  label="Gasto total (TDEE)"
                  value={`${number(analysis.tdee)} kcal`}
                />
                <CalcRow
                  hint="Ajuste por objetivo"
                  label={analysis.goalLabel}
                  value={`${signed(analysis.adjustment)} kcal`}
                />
                <CalcRow
                  label="Calorías objetivo"
                  strong
                  value={`${number(analysis.calories)} kcal`}
                />
                <CalcRow
                  hint="35 ml por kg + margen de entreno"
                  label="Agua recomendada"
                  value={`${decimal(analysis.waterMl / 1000)} L`}
                />
              </div>
              <p className="plan-note">
                <Icon name="info" size={13} />
                {analysis.formula === "katch"
                  ? "Se usa tu porcentaje de grasa para estimar la masa magra (Katch-McArdle)."
                  : "Falta el porcentaje de grasa, así que se usa Mifflin-St Jeor."}{" "}
                El resultado es una estimación: ajústalo según tu evolución.
              </p>
            </section>

            <section className="plan-card">
              <div className="plan-section-heading">
                <div>
                  <span className="eyebrow">MACROS DIARIOS</span>
                  <h2>Reparto del día</h2>
                </div>
                <span className="plan-badge">{analysis.proteinPct}% P</span>
              </div>
              <div className="plan-macro-grid">
                <MacroCard
                  grams={analysis.protein}
                  id="protein"
                  kcal={analysis.proteinKcal}
                  label="Proteínas"
                  pct={analysis.proteinPct}
                />
                <MacroCard
                  grams={analysis.carbs}
                  id="carbs"
                  kcal={analysis.carbsKcal}
                  label="Carbohidratos"
                  pct={analysis.carbsPct}
                />
                <MacroCard
                  grams={analysis.fat}
                  id="fat"
                  kcal={analysis.fatKcal}
                  label="Grasas"
                  pct={analysis.fatPct}
                />
              </div>
              <p className="plan-note">
                <Icon name="target" size={13} />
                Proteína calculada sobre{" "}
                {analysis.leanMass !== null
                  ? "tu masa magra"
                  : "tu peso corporal"}{" "}
                y ajustada al objetivo de {analysis.goalLabel.toLowerCase()}.
              </p>
            </section>

            {plan.warnings.length > 0 ? (
              <div className="plan-warning" role="status">
                <Icon name="info" size={15} />
                <div>
                  {plan.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="plan-actions">
              <Button icon="settings" onClick={openConfig} variant="secondary">
                Cambiar preferencias
              </Button>
              <Button icon="leaf" onClick={() => setTab("menu")}>
                Ver el menú
              </Button>
            </div>
          </section>
        ) : null}

        {tab === "menu" ? (
          <section
            aria-labelledby="plan-menu-title"
            className="plan-tab-panel"
            role="tabpanel"
          >
            <div className="plan-section-heading">
              <div>
                <span className="eyebrow">SECCIÓN 2 · MENÚ DIARIO</span>
                <h2 id="plan-menu-title">Un día base</h2>
              </div>
              <button
                className="plan-text-action"
                onClick={varyMenu}
                type="button"
              >
                <Icon name="refresh" size={14} />
                Variar
              </button>
            </div>

            <p className="plan-intro">
              {plan.meals.length} comidas · mismo menú durante 7 días. La lista
              de la compra ya está calculada para esa semana.
            </p>

            <div className="plan-meal-list">
              {plan.meals.map((meal) => (
                <MealCard key={meal.id} meal={meal} />
              ))}
            </div>

            <div className="plan-menu-total">
              <div>
                <span className="eyebrow">TOTAL DEL DÍA</span>
                <strong>
                  {number(plan.totals.kcal)} <small>kcal</small>
                </strong>
              </div>
              <div className="plan-menu-total__macros">
                <span>
                  <b>{decimal(plan.totals.protein)} g</b> P
                </span>
                <span>
                  <b>{decimal(plan.totals.carbs)} g</b> C
                </span>
                <span>
                  <b>{decimal(plan.totals.fat)} g</b> G
                </span>
              </div>
              <small>
                Objetivo: {number(analysis.calories)} kcal · {analysis.protein}{" "}
                g P · {analysis.carbs} g C · {analysis.fat} g G
              </small>
            </div>

            <div className="plan-actions">
              <Button icon="refresh" onClick={varyMenu} variant="secondary">
                Otro menú
              </Button>
              <Button icon="book" onClick={() => setTab("shopping")}>
                Lista de la compra
              </Button>
            </div>
          </section>
        ) : null}

        {tab === "shopping" ? (
          <section
            aria-labelledby="plan-shopping-title"
            className="plan-tab-panel"
            role="tabpanel"
          >
            <div className="plan-section-heading">
              <div>
                <span className="eyebrow">SECCIÓN 3 · COMPRA SEMANAL</span>
                <h2 id="plan-shopping-title">7 días</h2>
              </div>
              <button
                className="plan-text-action"
                onClick={() => void copyShoppingList()}
                type="button"
              >
                <Icon name={copied ? "check" : "book"} size={14} />
                {copied ? "Copiada" : "Copiar"}
              </button>
            </div>

            <p className="plan-intro">
              Cantidades en crudo para los 7 días del menú. Marca lo que ya
              tengas en casa.
            </p>

            {plan.shopping.length === 0 ? (
              <div className="plan-warning" role="status">
                <Icon name="info" size={15} />
                <p>
                  No hay ingredientes con las preferencias actuales. Ajusta el
                  plan para generar la compra.
                </p>
              </div>
            ) : null}

            <div className="plan-shopping">
              {plan.shopping.map((group) => (
                <section className="plan-shop-group" key={group.id}>
                  <header>
                    <div>
                      <strong>{group.label}</strong>
                      <small>{group.hint}</small>
                    </div>
                    <span>{group.items.length}</span>
                  </header>
                  <div className="plan-shop-list">
                    {group.items.map((item) => {
                      const isChecked = checked.has(item.id)
                      return (
                        <button
                          aria-pressed={isChecked}
                          className={`plan-shop-item ${
                            isChecked ? "is-checked" : ""
                          }`}
                          key={item.id}
                          onClick={() => toggleChecked(item.id)}
                          type="button"
                        >
                          <span className="plan-shop-item__check">
                            <Icon name="check" size={12} />
                          </span>
                          <span className="plan-shop-item__name">
                            {item.name}
                          </span>
                          <strong>{item.quantity}</strong>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="plan-actions">
              <Button
                icon={copied ? "check" : "book"}
                onClick={() => void copyShoppingList()}
                variant="secondary"
              >
                {copied ? "Lista copiada" : "Copiar lista"}
              </Button>
              <Button icon="leaf" onClick={() => setTab("menu")}>
                Ver el menú
              </Button>
            </div>
          </section>
        ) : null}

        <p className="plan-disclaimer">
          <Icon name="shield" size={12} />
          Plan orientativo generado con tus datos. No sustituye el consejo de un
          profesional sanitario.
        </p>
      </section>

      {configOpen ? (
        <div
          aria-labelledby="plan-config-title"
          aria-modal="true"
          className="plan-config"
          role="dialog"
        >
          <button
            aria-label="Cerrar ajustes del plan"
            className="plan-config__backdrop"
            onClick={() => setConfigOpen(false)}
            type="button"
          />
          <div className="plan-config__panel">
            <header className="plan-config__header">
              <div>
                <span className="eyebrow">PERSONALIZAR</span>
                <h2 id="plan-config-title">Ajusta tu plan</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setConfigOpen(false)}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="plan-config__body">
              <ChoiceChips
                hint="Marca el déficit o superávit"
                label="Objetivo"
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    goal: value as Goal,
                  }))
                }
                options={GOAL_OPTIONS}
                value={draft.goal}
              />

              <ChoiceChips
                hint="Cuánto te mueves además del entreno"
                label="Nivel de actividad"
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    activity: value as ActivityLevel,
                  }))
                }
                options={ACTIVITY_OPTIONS.map((option) => ({
                  id: option.id,
                  label: `${option.label} · ${option.detail}`,
                }))}
                value={draft.activity}
              />

              <ChoiceChips
                hint="El menú tendrá exactamente estas comidas"
                label="Comidas al día"
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    mealsPerDay: Number(value) as MealsPerDay,
                  }))
                }
                options={MEAL_COUNTS.map((count) => ({
                  id: String(count),
                  label: `${count} comidas`,
                }))}
                value={String(draft.mealsPerDay)}
              />

              <FoodChips
                foods={PROTEIN_FOODS}
                hint="Elige las que de verdad te gustan"
                label="Proteínas preferidas"
                onToggle={(id) => toggleFood("proteins", id)}
                selected={draft.proteins}
              />

              <FoodChips
                foods={CARB_FOODS}
                hint="La base energética del día"
                label="Carbohidratos preferidos"
                onToggle={(id) => toggleFood("carbs", id)}
                selected={draft.carbs}
              />

              <FoodChips
                foods={FAT_FOODS}
                hint="Aceites, frutos secos, aguacate…"
                label="Grasas preferidas"
                onToggle={(id) => toggleFood("fats", id)}
                selected={draft.fats}
              />

              <div className="plan-config__section">
                <div className="plan-config__heading">
                  <strong>Alergias y exclusiones</strong>
                  <small>No aparecerán en ningún plato</small>
                </div>
                <div className="plan-chip-grid">
                  {EXCLUSION_OPTIONS.map((option) => {
                    const active = draft.exclusions.includes(option.id)
                    return (
                      <button
                        aria-pressed={active}
                        className={`plan-chip plan-chip--danger ${
                          active ? "is-on" : ""
                        }`}
                        key={option.id}
                        onClick={() => toggleExclusion(option.id)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="plan-config__note">
                <Icon name="info" size={13} />
                Si dejas una categoría vacía, se usarán alternativas que no
                choquen con tus exclusiones.
              </p>
            </div>

            <footer className="plan-config__footer">
              <Button onClick={resetConfig} variant="ghost">
                Restablecer
              </Button>
              <Button icon="check" onClick={applyConfig}>
                Aplicar plan
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  )
}
