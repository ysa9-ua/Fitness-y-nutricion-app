import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, ScreenHeader, SectionTitle, Toast } from "../components/UI"

export type FoodEntry = {
  name: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  meal: string
  /** Valores por 100 g, para poder guardar la ficha en la biblioteca. */
  per100: Nutrition
  confidence: number
  saveToLibrary: boolean
  source: Source
}

type FoodDetailScreenProps = {
  onBack: () => void
  onSave: (food: FoodEntry) => void
}

/** Valores nutricionales expressados por cada 100 g de producto. */
type Nutrition = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type MacroKey = keyof Nutrition

type Source = "ocr" | "manual"

type MacroField = {
  key: MacroKey
  label: string
  unit: string
}

const MACRO_FIELDS: MacroField[] = [
  { key: "calories", label: "Calorías", unit: "kcal" },
  { key: "protein", label: "Proteínas", unit: "g" },
  { key: "carbs", label: "Carbohidratos", unit: "g" },
  { key: "fat", label: "Grasas", unit: "g" },
]

const MEALS = ["Desayuno", "Almuerzo", "Cena", "Snack"]
const PORTION_PRESETS = [100, 180, 250]
const MIN_GRAMS = 10
const MAX_GRAMS = 600
const GRAM_STEP = 10

const OCR_READING: Nutrition = {
  calories: 312,
  protein: 24,
  carbs: 28,
  fat: 11,
}
const OCR_NAME = "Pechuga de pollo a la plancha"

type FoodLibraryItem = {
  name: string
  per100: Nutrition
}

const FOOD_LIBRARY: FoodLibraryItem[] = [
  {
    name: "Pechuga de pollo a la plancha",
    per100: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  },
  {
    name: "Arroz blanco cocido",
    per100: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  },
  {
    name: "Salmón al horno",
    per100: { calories: 208, protein: 20, carbs: 0, fat: 13 },
  },
  {
    name: "Avena en hojuelas",
    per100: { calories: 379, protein: 13, carbs: 67, fat: 6.5 },
  },
  {
    name: "Huevos camperos",
    per100: { calories: 143, protein: 13, carbs: 0.7, fat: 9.5 },
  },
  {
    name: "Aguacate",
    per100: { calories: 160, protein: 2, carbs: 8.5, fat: 14.7 },
  },
  {
    name: "Pan integral de masa madre",
    per100: { calories: 247, protein: 13, carbs: 41, fat: 3.4 },
  },
  {
    name: "Batido de proteína",
    per100: { calories: 62, protein: 11, carbs: 3, fat: 1.2 },
  },
]

const formatMacro = (value: number) =>
  value.toFixed(1).replace(".", ",").replace(/,0$/, "")

const clampGrams = (value: number) =>
  Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, value))

const getConfidenceTier = (value: number) =>
  value >= 90 ? "alta" : value >= 70 ? "media" : "baja"

function QuantityStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="quantity-stepper">
      <button
        aria-label="Reducir 10 gramos"
        className="quantity-stepper__button"
        disabled={value <= MIN_GRAMS}
        onClick={() => onChange(clampGrams(value - GRAM_STEP))}
        type="button"
      >
        <Icon name="minus" size={18} />
      </button>
      <div className="quantity-stepper__value">
        <input
          aria-label="Cantidad en gramos"
          inputMode="numeric"
          max={MAX_GRAMS}
          min={MIN_GRAMS}
          onChange={(event) =>
            onChange(clampGrams(Number(event.target.value) || MIN_GRAMS))
          }
          type="number"
          value={value}
        />
        <span>g</span>
      </div>
      <button
        aria-label="Añadir 10 gramos"
        className="quantity-stepper__button"
        disabled={value >= MAX_GRAMS}
        onClick={() => onChange(clampGrams(value + GRAM_STEP))}
        type="button"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

export default function FoodDetailScreen({
  onBack,
  onSave,
}: FoodDetailScreenProps) {
  const [name, setName] = useState(OCR_NAME)
  const [per100, setPer100] = useState<Nutrition>(OCR_READING)
  const [grams, setGrams] = useState(180)
  const [meal, setMeal] = useState<string>("Almuerzo")
  const [confidence, setConfidence] = useState(96)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [source, setSource] = useState<Source>("ocr")
  const [query, setQuery] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [saveToLibrary, setSaveToLibrary] = useState(true)

  useEffect(() => {
    if (!isAnalyzing) return
    const timer = window.setTimeout(() => {
      setConfidence(98)
      setIsAnalyzing(false)
    }, 1300)
    return () => window.clearTimeout(timer)
  }, [isAnalyzing])

  useEffect(() => {
    if (!isSaved) return
    const timer = window.setTimeout(() => setIsSaved(false), 2800)
    return () => window.clearTimeout(timer)
  }, [isSaved])

  const totals = useMemo<Nutrition>(() => {
    const ratio = grams / 100
    return {
      calories: Math.round(per100.calories * ratio),
      protein: Math.round(per100.protein * ratio * 10) / 10,
      carbs: Math.round(per100.carbs * ratio * 10) / 10,
      fat: Math.round(per100.fat * ratio * 10) / 10,
    }
  }, [grams, per100])

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    const pool = term
      ? FOOD_LIBRARY.filter((item) => item.name.toLowerCase().includes(term))
      : FOOD_LIBRARY
    return pool.slice(0, 5)
  }, [query])

  const tier = getConfidenceTier(confidence)
  const canSave = name.trim().length > 1

  const updatePer100 = (key: MacroKey, value: number) => {
    setPer100((current) => {
      const next: Nutrition = { ...current }
      next[key] = Number.isFinite(value) && value >= 0 ? value : 0
      return next
    })
  }

  const handlePickFood = (item: FoodLibraryItem) => {
    setName(item.name)
    setPer100(item.per100)
    setConfidence(100)
    setSource("manual")
    setQuery("")
  }

  const handleSave = () => {
    onSave({
      name: name.trim(),
      grams,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      meal,
      per100,
      confidence,
      saveToLibrary,
      source,
    })
    setIsSaved(true)
  }

  return (
    <main className="food-detail-screen screen-stack">
      <ScreenHeader
        action={{
          label:
            source === "ocr" ? "Buscar manualmente" : "Volver a la lectura",
          icon: source === "ocr" ? "search" : "scan",
          onClick: () => {
            setSource((current) => (current === "ocr" ? "manual" : "ocr"))
            setQuery("")
          },
        }}
        eyebrow="ESCANEO OCR"
        onBack={onBack}
        subtitle="Revisa la lectura antes de añadirla"
        title="Confirma el alimento"
      />

      <div className="screen-body food-detail-screen__body">
        <section className="food-preview-card">
          <div className={`food-preview ${isAnalyzing ? "is-analyzing" : ""}`}>
            <div className="food-preview__frame" aria-hidden="true">
              <span className="food-preview__corner is-top-left" />
              <span className="food-preview__corner is-top-right" />
              <span className="food-preview__corner is-bottom-left" />
              <span className="food-preview__corner is-bottom-right" />
              <div className="food-preview__label">
                <span className="food-preview__brand">
                  INFORMACIÓN NUTRICIONAL
                </span>
                <strong className="food-preview__product">
                  {name || "Alimento"}
                </strong>
                <i className="food-preview__line is-long" />
                <i className="food-preview__line is-medium" />
                <i className="food-preview__line is-short" />
                <b className="food-preview__value">
                  {formatMacro(per100.calories)} kcal / 100 g
                </b>
                <i className="food-preview__line is-long" />
                <i className="food-preview__line is-medium" />
              </div>
              <span className="food-preview__beam" />
            </div>
            <div className="food-preview-caption">
              <span className="eyebrow">ETIQUETA CAPTURADA</span>
              <button
                className="link-button"
                disabled={isAnalyzing}
                onClick={() => setIsAnalyzing(true)}
                type="button"
              >
                <Icon name="refresh" size={13} />{" "}
                {isAnalyzing ? "Analizando..." : "Reanalizar"}
              </button>
            </div>
          </div>

          <div className={`confidence-badge confidence-badge--${tier}`}>
            <Icon name="scan" size={15} />
            <div>
              <strong>
                Confianza {tier}: {confidence}%
              </strong>
              <small>
                {tier === "alta"
                  ? "Lectura nítida, los valores son fiables."
                  : "Revisa los valores: el escáner no ha podido confirmar todos los datos."}
              </small>
            </div>
            <span className="confidence-badge__meter" aria-hidden="true">
              <i style={{ width: `${confidence}%` }} />
            </span>
          </div>
        </section>

        {source === "ocr" ? (
          <>
            <section className="form-section">
              <div className="form-section__title">
                <span>01</span>
                <div>
                  <strong>Lectura detected</strong>
                  <small>Corrige lo que haga falta</small>
                </div>
              </div>

              <label className="form-field">
                <span>Nombre del alimento</span>
                <div className="input-shell">
                  <Icon name="leaf" size={18} />
                  <input
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Escribe el nombre"
                    type="text"
                    value={name}
                  />
                </div>
              </label>

              <div className="ocr-field-grid">
                {MACRO_FIELDS.map((field) => (
                  <label className="ocr-field" key={field.key}>
                    <span>
                      {field.label}
                      <small>por 100 g</small>
                    </span>
                    <div>
                      <input
                        aria-label={`${field.label} por 100 gramos`}
                        inputMode="decimal"
                        min={0}
                        onChange={(event) =>
                          updatePer100(field.key, Number(event.target.value))
                        }
                        step={0.1}
                        type="number"
                        value={per100[field.key]}
                      />
                      <small>{field.unit}</small>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section className="portion-section">
              <SectionTitle icon="weight" title="Tu porción" />
              <QuantityStepper onChange={setGrams} value={grams} />
              <input
                aria-label="Ajustar gramos con el deslizador"
                className="range-input"
                max={MAX_GRAMS}
                min={MIN_GRAMS}
                onChange={(event) =>
                  setGrams(clampGrams(Number(event.target.value)))
                }
                step={GRAM_STEP}
                type="range"
                value={grams}
              />
              <div className="chip-row chip-row--tight">
                {PORTION_PRESETS.map((preset) => (
                  <button
                    className={grams === preset ? "is-selected" : ""}
                    key={preset}
                    onClick={() => setGrams(preset)}
                    type="button"
                  >
                    {preset} g
                  </button>
                ))}
                <span className="chip-row__hint">1 ración ≈ 180 g</span>
              </div>
            </section>

            <section className="macro-summary">
              {MACRO_FIELDS.map((field) => (
                <div
                  className={`macro-card macro-card--${field.key}`}
                  key={field.key}
                >
                  <span>{field.label}</span>
                  <strong>
                    {field.key === "calories"
                      ? totals.calories
                      : formatMacro(totals[field.key])}
                    <small>{field.unit}</small>
                  </strong>
                </div>
              ))}
            </section>

            <section className="meal-section">
              <SectionTitle icon="book" title="¿En qué momento?" />
              <div
                className="chip-row"
                role="radiogroup"
                aria-label="Momento de la ingesta"
              >
                {MEALS.map((item) => (
                  <button
                    aria-checked={meal === item}
                    className={meal === item ? "is-selected" : ""}
                    key={item}
                    onClick={() => setMeal(item)}
                    role="radio"
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="form-section">
            <div className="form-section__title">
              <span>02</span>
              <div>
                <strong>Búsqueda manual</strong>
                <small>{FOOD_LIBRARY.length} alimentos en tu biblioteca</small>
              </div>
            </div>

            <label className="form-field">
              <span>Busca un alimento</span>
              <div className="input-shell">
                <Icon name="search" size={18} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Arroz, salmón, avena..."
                  type="search"
                  value={query}
                />
              </div>
            </label>

            <ul className="food-results">
              {results.length === 0 ? (
                <li className="food-results__empty">
                  <Icon name="info" size={15} /> Sin coincidencias. Prueba con
                  otro término.
                </li>
              ) : (
                results.map((item) => (
                  <li key={item.name}>
                    <button
                      className="food-result"
                      onClick={() => handlePickFood(item)}
                      type="button"
                    >
                      <span className="food-result__icon">
                        <Icon name="leaf" size={17} />
                      </span>
                      <span className="food-result__copy">
                        <strong>{item.name}</strong>
                        <small>
                          {Math.round(item.per100.calories)} kcal ·{" "}
                          {formatMacro(item.per100.protein)} g prot.
                        </small>
                      </span>
                      <Icon name="chevron-right" size={15} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        <button
          aria-checked={saveToLibrary}
          className={`library-save ${saveToLibrary ? "is-on" : ""}`}
          onClick={() => setSaveToLibrary((value) => !value)}
          role="switch"
          type="button"
        >
          <span className="library-save__icon">
            <Icon name="book" size={18} />
          </span>
          <span className="library-save__copy">
            <strong>Guardar en mi biblioteca</strong>
            <small>
              {saveToLibrary
                ? `Se guarda con ${grams} g de ración para no volver a escanearlo.`
                : "Solo se apunta al diario esta vez."}
            </small>
          </span>
          <span aria-hidden="true" className="library-save__switch">
            <i />
          </span>
        </button>
      </div>

      <footer className="screen-footer food-detail-footer">
        <div className="food-detail-footer__total">
          <span>Total de la porción</span>
          <strong>
            {totals.calories} <small>kcal</small>
          </strong>
        </div>
        <Button disabled={!canSave} fullWidth icon="check" onClick={handleSave}>
          Guardar en el diario
        </Button>
        <p className="privacy-note">
          <Icon name="info" size={13} /> {meal} · {grams} g · macros
          recalculados en tiempo real.
        </p>
      </footer>

      <Toast
        message={`${name.trim()} añadida a ${meal.toLowerCase()}${
          saveToLibrary ? " y a tu biblioteca" : ""
        }`}
        visible={isSaved}
      />
    </main>
  )
}
