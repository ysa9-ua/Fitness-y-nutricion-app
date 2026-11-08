import { useEffect, useId, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, PhotoSlot, SectionTitle } from "../components/UI"

export type WeeklyCheckInData = {
  weight: number
  waist: number
  hips: number
  neck: number
}

type WeeklyCheckInScreenProps = {
  onClose?: () => void
  onComplete: (data: WeeklyCheckInData) => void
  baseline?: WeeklyCheckInData
}

type MeasureKey = keyof WeeklyCheckInData

type MeasureField = {
  key: MeasureKey
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}

const FIELDS: MeasureField[] = [
  {
    key: "weight",
    label: "Peso",
    unit: "kg",
    min: 30,
    max: 250,
    step: 0.1,
    hint: "En ayunas y sin calzado",
  },
  {
    key: "waist",
    label: "Cintura",
    unit: "cm",
    min: 40,
    max: 180,
    step: 0.5,
    hint: "A nivel del ombligo",
  },
  {
    key: "hips",
    label: "Cadera",
    unit: "cm",
    min: 50,
    max: 180,
    step: 0.5,
    hint: "Punto más ancho",
  },
  {
    key: "neck",
    label: "Cuello",
    unit: "cm",
    min: 20,
    max: 70,
    step: 0.5,
    hint: "Bajo la garganta",
  },
]

/** Referencia del día 1 registrada durante el onboarding. */
const DEFAULT_DAY_ONE: WeeklyCheckInData = {
  weight: 64,
  waist: 72,
  hips: 92,
  neck: 31,
}
const WEEK = 4
const TOTAL_WEEKS = 12

const formatDelta = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")}`
}

export default function WeeklyCheckInScreen({
  onClose,
  onComplete,
  baseline,
}: WeeklyCheckInScreenProps) {
  const dayOne = baseline ?? DEFAULT_DAY_ONE
  const titleId = useId()
  const [values, setValues] = useState<WeeklyCheckInData>({
    weight: 63.2,
    waist: 69.5,
    hips: 90,
    neck: 30.5,
  })
  const [photos, setPhotos] =
    useState<[string | undefined, string | undefined, string | undefined]>([
      undefined,
      undefined,
      undefined,
    ])

  const isMandatory = onClose === undefined

  // El modal obligatorio solo se cierra con la acción principal; el opcional admite Escape.
  useEffect(() => {
    if (isMandatory) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMandatory, onClose])

  const deltas = useMemo(
    () =>
      FIELDS.reduce<Record<MeasureKey, number>>(
        (accumulator, field) => {
          accumulator[field.key] = values[field.key] - dayOne[field.key]
          return accumulator
        },
        { weight: 0, waist: 0, hips: 0, neck: 0 },
      ),
    [values],
  )

  const isValid = FIELDS.every((field) => values[field.key] > 0)
  const photoCount = photos.filter(Boolean).length
  const weightDelta = deltas.weight

  const updateValue = (key: MeasureKey, raw: string) => {
    const parsed = Number(raw)
    setValues((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

  const handleSubmit = () => {
    if (!isValid) return
    onComplete({
      weight: Number(values.weight.toFixed(1)),
      waist: Number(values.waist.toFixed(1)),
      hips: Number(values.hips.toFixed(1)),
      neck: Number(values.neck.toFixed(1)),
    })
  }

  const content = (
    <>
      <header className="checkin-header">
        <div>
          <span className="eyebrow">CHECK-IN SEMANAL</span>
          <h1 id={titleId}>Revisa tu progreso</h1>
          <p>
            Semana {WEEK} de {TOTAL_WEEKS} · tus datos ajustan el plan de forma
            automática.
          </p>
        </div>
        {onClose ? (
          <button
            className="icon-button icon-button--bordered"
            onClick={onClose}
            aria-label="Cerrar check-in"
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
        ) : null}
      </header>

      <div className="screen-body checkin-body">
        <section className="checkin-weight">
          <div className="checkin-weight__copy">
            <span className="eyebrow">PESO ACTUAL</span>
            <label className="checkin-weight__value">
              <span className="sr-only">Peso en kilos</span>
              <input
                inputMode="decimal"
                max={250}
                min={30}
                onChange={(event) => updateValue("weight", event.target.value)}
                step={0.1}
                type="number"
                value={values.weight}
              />
              <small>kg</small>
            </label>
            <p
              className={`checkin-weight__delta ${
                weightDelta <= 0 ? "is-down" : "is-up"
              }`}
            >
              {formatDelta(weightDelta)} kg desde el día 1
            </p>
          </div>
          <div className="checkin-weight__side">
            <div>
              <span>Día 1</span>
              <strong>{dayOne.weight} kg</strong>
            </div>
            <div>
              <span>Meta</span>
              <strong>61 kg</strong>
            </div>
          </div>
        </section>

        <section className="checkin-measures">
          <SectionTitle icon="activity" title="Medidas corporales" />
          <p className="checkin-measures__hint">
            Toma las medidas en el mismo punto cada semana para que la
            comparación sea válida.
          </p>
          <div className="measure-grid">
            {FIELDS.filter((field) => field.key !== "weight").map((field) => (
              <label className="measure-field" key={field.key}>
                <span className="measure-field__label">
                  {field.label}
                  <small>{field.hint}</small>
                </span>
                <div className="measure-field__input">
                  <input
                    aria-label={`${field.label} en ${field.unit}`}
                    inputMode="decimal"
                    max={field.max}
                    min={field.min}
                    onChange={(event) =>
                      updateValue(field.key, event.target.value)
                    }
                    step={field.step}
                    type="number"
                    value={values[field.key]}
                  />
                  <small>{field.unit}</small>
                </div>
                <span className="measure-field__delta">
                  {formatDelta(deltas[field.key])} {field.unit}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="photo-section checkin-photos">
          <div className="photo-section__heading">
            <div>
              <strong>Fotos de esta semana</strong>
              <span>Mismo fondo, luz y distancia que el día 1</span>
            </div>
            <small>{photoCount}/3</small>
          </div>
          <div className="photo-grid">
            {(["Frontal", "Lateral", "Trasera"] as const).map(
              (label, position) => (
                <PhotoSlot
                  hint={
                    position === 1
                      ? "Perfil derecho"
                      : position === 2
                        ? "Espalda"
                        : "Mirando al frente"
                  }
                  key={label}
                  label={label}
                  onChange={(value) =>
                    setPhotos((current) => {
                      const next: [string | undefined, string | undefined, string | undefined] =
                        [...current]
                      next[position] = value
                      return next
                    })
                  }
                  value={photos[position]}
                />
              ),
            )}
          </div>
        </section>

        <section className="checkin-summary">
          <SectionTitle icon="chart" title="Resumen de cambios" />
          <ul className="checkin-summary__list">
            {FIELDS.map((field) => {
              const delta = deltas[field.key]
              return (
                <li className="checkin-summary__row" key={field.key}>
                  <span>{field.label}</span>
                  <div className="checkin-summary__bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(100, Math.abs(delta) * 12)}%`,
                      }}
                    />
                  </div>
                  <strong className={delta <= 0 ? "is-down" : "is-up"}>
                    {formatDelta(delta)} {field.unit}
                  </strong>
                </li>
              )
            })}
          </ul>
          <p className="checkin-summary__note">
            <Icon name="sparkles" size={15} />
            {Math.abs(weightDelta) >= 0.5
              ? "Buen ritmo: el algoritmo subirá ligeramente el volumen la próxima semana."
              : "Peso estable: mantenemos la carga y ajustamos solo el déficit calórico."}
          </p>
        </section>
      </div>

      <footer className="screen-footer checkin-footer">
        <Button
          disabled={!isValid}
          fullWidth
          icon="refresh"
          onClick={handleSubmit}
        >
          Actualizar mi algoritmo
        </Button>
        {onClose ? (
          <Button fullWidth onClick={onClose} variant="ghost">
            Ahora no, más tarde
          </Button>
        ) : (
          <p className="privacy-note">
            <Icon name="info" size={13} /> Este paso es obligatorio para que tu
            plan se mantenga al día.
          </p>
        )}
      </footer>
    </>
  )

  if (isMandatory) {
    return (
      <div className="checkin-overlay">
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="checkin-modal"
          role="dialog"
        >
          {content}
        </div>
      </div>
    )
  }

  return <main className="checkin-screen screen-stack">{content}</main>
}
