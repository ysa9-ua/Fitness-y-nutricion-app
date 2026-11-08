import { useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, PhotoSlot, ProgressRing } from "../components/UI"

export type OnboardingData = {
  age: number
  weight: number
  initialWeight?: number
  height: number
  bodyFat: number
  /** Sexo biológico: condiciona el gasto basal y la estimación de grasa. */
  sex?: "female" | "male"
  /** Perímetros del paso 1; se usan para el índice cintura/cadera. */
  neck?: number
  waist?: number
  hips?: number
  experience: string
  sport: string
  availability: string
  goal: string
  calories: number
  photos?: Array<string | undefined>
}

type OnboardingScreenProps = {
  onComplete: (data: OnboardingData) => void
}

type Biometrics = {
  sex: "female" | "male"
  age: number
  weight: number
  height: number
  neck: number
  waist: number
  hips: number
}

const experienceOptions = [
  {
    id: "beginner",
    title: "Iniciación",
    detail: "Menos de 6 meses",
    icon: "sparkles" as const,
  },
  {
    id: "intermediate",
    title: "Intermedio",
    detail: "6 meses a 2 años",
    icon: "activity" as const,
  },
  {
    id: "advanced",
    title: "Avanzado",
    detail: "Más de 2 años",
    icon: "dumbbell" as const,
  },
]

const sportOptions = [
  { id: "strength", label: "Force", icon: "dumbbell" as const },
  { id: "running", label: "Running", icon: "footprints" as const },
  { id: "crossfit", label: "CrossFit", icon: "target" as const },
  { id: "other", label: "Otro", icon: "heart" as const },
]

const availabilityOptions = ["3 días", "4 días", "5 días", "6+ días"]
const goalOptions = [
  {
    id: "hypertrophy",
    title: "Hipertrofia",
    detail: "Ganar masa muscular",
    icon: "dumbbell" as const,
  },
  {
    id: "fat-loss",
    title: "Pérdida de peso",
    detail: "Reducir grasa",
    icon: "flame" as const,
  },
  {
    id: "recomposition",
    title: "Recomposición",
    detail: "Ganar y perder a la vez",
    icon: "refresh" as const,
  },
  {
    id: "health",
    title: "Salud general",
    detail: "Movimiento y bienestar",
    icon: "heart" as const,
  },
]

function StepProgress({ step }: { step: number }) {
  return (
    <div className="step-progress" aria-label={`Paso ${step} de 3`}>
      {[1, 2, 3].map((item) => (
        <span className={item <= step ? "is-active" : ""} key={item} />
      ))}
    </div>
  )
}

type FieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  suffix: string
  min: number
  max: number
  step?: number
}

function MeasurementField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
}: FieldProps) {
  const inputId = `field-${label.toLowerCase().split(" ").join("-")}`
  return (
    <label className="measurement-field" htmlFor={inputId}>
      <span>{label}</span>
      <div>
        <input
          id={inputId}
          inputMode="decimal"
          max={max}
          min={min}
          onChange={(event) => {
            const parsed = Number(event.target.value)
            onChange(
              Number.isFinite(parsed)
                ? Math.min(max, Math.max(min, parsed))
                : min,
            )
          }}
          step={step}
          type="number"
          value={value}
        />
        <small>{suffix}</small>
      </div>
    </label>
  )
}

function BiometricsStep({
  values,
  onChange,
}: {
  values: Biometrics
  onChange: (values: Biometrics) => void
}) {
  const update = (key: keyof Biometrics, value: number | Biometrics["sex"]) => {
    onChange({ ...values, [key]: value } as Biometrics)
  }
  const valid = Object.entries(values).every(
    ([, value]) => typeof value === "string" || value > 0,
  )

  return (
    <>
      <section className="onboarding-heading">
        <span className="eyebrow">PASO 1 · DATOS CORPORALES</span>
        <h1>
          Conócenos para
          <br />
          adaptar tu plan.
        </h1>
        <p>
          Las medidas nos ayudan a estimar tu composición corporal y ajustar las
          calorías.
        </p>
      </section>

      <div
        className="sex-selector"
        role="radiogroup"
        aria-label="Sexo biológico"
      >
        {(["female", "male"] as const).map((sex) => (
          <button
            aria-checked={values.sex === sex}
            className={values.sex === sex ? "is-active" : ""}
            key={sex}
            onClick={() => update("sex", sex)}
            role="radio"
            type="button"
          >
            {sex === "female" ? "Mujer" : "Hombre"}
          </button>
        ))}
      </div>

      <div className="measurement-card">
        <div className="measurement-card__header">
          <span>
            <Icon name="weight" size={18} />
          </span>
          <div>
            <strong>Biometría</strong>
            <small>Datos básicos</small>
          </div>
        </div>
        <div className="measurement-grid">
          <MeasurementField
            label="Edad"
            max={90}
            min={16}
            onChange={(value) => update("age", value)}
            suffix="años"
            value={values.age}
          />
          <MeasurementField
            label="Peso"
            max={250}
            min={35}
            onChange={(value) => update("weight", value)}
            step={0.1}
            suffix="kg"
            value={values.weight}
          />
          <MeasurementField
            label="Altura"
            max={230}
            min={140}
            onChange={(value) => update("height", value)}
            suffix="cm"
            value={values.height}
          />
        </div>
      </div>

      <div className="measurement-card">
        <div className="measurement-card__header">
          <span>
            <Icon name="activity" size={18} />
          </span>
          <div>
            <strong>Perímetros</strong>
            <small>Usa una cinta métrica</small>
          </div>
        </div>
        <div className="measurement-grid measurement-grid--three">
          <MeasurementField
            label="Cuello"
            max={70}
            min={20}
            onChange={(value) => update("neck", value)}
            suffix="cm"
            value={values.neck}
          />
          <MeasurementField
            label="Cintura"
            max={180}
            min={40}
            onChange={(value) => update("waist", value)}
            suffix="cm"
            value={values.waist}
          />
          <MeasurementField
            label="Cadera"
            max={180}
            min={50}
            onChange={(value) => update("hips", value)}
            suffix="cm"
            value={values.hips}
          />
        </div>
      </div>

      {!valid ? (
        <p className="form-error">
          <Icon name="info" size={14} /> Completa todos los campos para
          continuar.
        </p>
      ) : null}
    </>
  )
}

type ProfileStepProps = {
  experience: string
  sport: string
  availability: string
  goal: string
  onChange: (
    key: "experience" | "sport" | "availability" | "goal",
    value: string,
  ) => void
}

function ProfileStep({
  experience,
  sport,
  availability,
  goal,
  onChange,
}: ProfileStepProps) {
  return (
    <>
      <section className="onboarding-heading">
        <span className="eyebrow">PASO 2 · TU PERFIL</span>
        <h1>
          Entrenamos según
          <br />
          tu realidad.
        </h1>
        <p>Diseñaremos una rutina sostenible para tu estilo de vida.</p>
      </section>

      <div className="form-section">
        <div className="form-section__title">
          <span>01</span>
          <div>
            <strong>Experiencia</strong>
            <small>¿Dónde estás actualmente?</small>
          </div>
        </div>
        <div className="choice-stack">
          {experienceOptions.map((option) => (
            <button
              className={`choice-card ${
                experience === option.id ? "is-selected" : ""
              }`}
              key={option.id}
              onClick={() => onChange("experience", option.id)}
              type="button"
            >
              <span className="choice-card__icon">
                <Icon name={option.icon} size={19} />
              </span>
              <span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
              <i>
                <Icon name="check" size={13} />
              </i>
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section__title">
          <span>02</span>
          <div>
            <strong>Deporte principal</strong>
            <small>¿Qué haces con más frecuencia?</small>
          </div>
        </div>
        <div className="sport-grid">
          {sportOptions.map((option) => (
            <button
              className={sport === option.id ? "is-selected" : ""}
              key={option.id}
              onClick={() => onChange("sport", option.id)}
              type="button"
            >
              <Icon name={option.icon} size={20} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section__title">
          <span>03</span>
          <div>
            <strong>Tiempo disponible</strong>
            <small>Días de entrenamiento por semana</small>
          </div>
        </div>
        <div className="chip-row">
          {availabilityOptions.map((option) => (
            <button
              className={availability === option ? "is-selected" : ""}
              key={option}
              onClick={() => onChange("availability", option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section__title">
          <span>04</span>
          <div>
            <strong>Objetivo principal</strong>
            <small>¿Qué quieres conseguir?</small>
          </div>
        </div>
        <div className="goal-grid">
          {goalOptions.map((option) => (
            <button
              className={goal === option.id ? "is-selected" : ""}
              key={option.id}
              onClick={() => onChange("goal", option.id)}
              type="button"
            >
              <span>
                <Icon name={option.icon} size={20} />
              </span>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

type PlanStepProps = {
  bodyFat: number
  values: Biometrics
  goal: string
  sport: string
  experience: string
  availability: string
  photos: [string | undefined, string | undefined, string | undefined]
  onPhotoChange: (index: number, value?: string) => void
  onComplete: (calories: number) => void
}

function PlanStep({
  bodyFat,
  values,
  goal,
  sport,
  experience,
  availability,
  photos,
  onPhotoChange,
  onComplete,
}: PlanStepProps) {
  const goalLabel =
    goalOptions.find((option) => option.id === goal)?.title ?? "Recomposición"
  const days = Number.parseInt(availability, 10) || 4
  const sexOffset = values.sex === "male" ? 5 : -161
  const basalMetabolism =
    10 * values.weight + 6.25 * values.height - 5 * values.age + sexOffset
  const activityFactor =
    days <= 3 ? 1.4 : days === 4 ? 1.5 : days === 5 ? 1.65 : 1.75
  const goalAdjustment =
    goal === "hypertrophy"
      ? 300
      : goal === "fat-loss"
        ? -400
        : goal === "recomposition"
          ? -100
          : 0
  const calories = Math.max(
    1200,
    Math.round((basalMetabolism * activityFactor + goalAdjustment) / 10) * 10,
  )
  const planTitles: Record<string, string> = {
    hypertrophy: "Hipertrofia y fuerza",
    "fat-loss": "Definitions y resistencia",
    recomposition: "Fuerza + recomposición",
    health: "Movimiento y bienestar",
  }
  const muscleGroups: Record<string, string[]> = {
    strength: ["Tren superior", "Tren inferior", "Core"],
    running: ["Fuerza", "Cardio", "Movilidad"],
    crossfit: ["Fuerza", "Condicionamiento", "Core"],
    other: ["Fuerza", "Movilidad", "Bienestar"],
  }
  const planTitle = planTitles[goal] ?? planTitles.recomposition
  const planMuscles = muscleGroups[sport] ?? muscleGroups.other
  const sessionDuration =
    experience === "beginner"
      ? "35–45"
      : experience === "advanced"
        ? "55–70"
        : "45–60"
  const phases = experience === "advanced" ? 4 : 3

  return (
    <>
      <section className="onboarding-heading onboarding-heading--centered">
        <span className="success-mark">
          <Icon name="sparkles" size={20} />
        </span>
        <span className="eyebrow">PASO 3 · TU PUNTO DE PARTIDA</span>
        <h1>Tu plan está listo.</h1>
        <p>
          Hemos creado una primera versión que ajustaremos según tu progreso.
        </p>
      </section>

      <section className="plan-card">
        <div className="plan-card__glow" />
        <div className="plan-card__top">
          <div>
            <span>PLAN PERSONALIZADO</span>
            <strong>{planTitle}</strong>
          </div>
          <span className="plan-badge">4 SEMANAS</span>
        </div>
        <div className="plan-card__stats">
          <div>
            <strong>{days}</strong>
            <span>días/semana</span>
          </div>
          <div>
            <strong>{sessionDuration}</strong>
            <span>min/sesión</span>
          </div>
          <div>
            <strong>{phases}</strong>
            <span>fases</span>
          </div>
        </div>
        <div className="muscle-tags">
          {planMuscles.map((muscle) => (
            <span key={muscle}>{muscle}</span>
          ))}
        </div>
        <p className="plan-card__note">
          <Icon name="refresh" size={14} /> El algoritmo adaptará cargas y
          volumen cada semana.
        </p>
      </section>

      <section className="starting-point-card">
        <div>
          <span className="eyebrow">CALORÍAS INICIALES</span>
          <strong>
            {calories.toLocaleString("es-ES")} <small>kcal/día</small>
          </strong>
          <p>
            Objetivo orientado a <b>{goalLabel.toLowerCase()}</b>
          </p>
        </div>
        <ProgressRing
          label="Grasa corporal estimada"
          size={86}
          stroke={8}
          value={bodyFat}
          max={45}
        >
          <strong>{bodyFat.toFixed(1)}%</strong>
          <small>grasa est.</small>
        </ProgressRing>
      </section>

      <section className="photo-section">
        <div className="photo-section__heading">
          <div>
            <strong>Tu Día 1</strong>
            <span>Registra tu punto de partida</span>
          </div>
          <small>{photos.filter(Boolean).length}/3</small>
        </div>
        <p>
          Fotos frontales, laterales y trasera. Usa luz natural y ropa ajustada.
        </p>
        <div className="photo-grid">
          {(["Frontal", "Lateral", "Trasera"] as const).map((label, index) => (
            <PhotoSlot
              hint={
                index === 1
                  ? "Perfil derecho"
                  : index === 2
                    ? "Espalda"
                    : "Mirando al frente"
              }
              key={label}
              label={label}
              onChange={(value) => onPhotoChange(index, value)}
              value={photos[index]}
            />
          ))}
        </div>
      </section>

      <div className="screen-footer">
        <Button fullWidth onClick={() => onComplete(calories)}>
          Activar mi plan
        </Button>
        <p className="privacy-note">
          <Icon name="shield" size={13} /> Tus fotos son privadas y solo las
          utilizas para tu seguimiento.
        </p>
      </div>
      <span className="sr-only">
        Peso inicial: {values.weight} kilos. Altura: {values.height}{" "}
        centímetros.
      </span>
    </>
  )
}

export default function OnboardingScreen({
  onComplete,
}: OnboardingScreenProps) {
  const [step, setStep] = useState(1)
  const [biometrics, setBiometrics] = useState<Biometrics>({
    sex: "female",
    age: 29,
    weight: 64,
    height: 168,
    neck: 31,
    waist: 72,
    hips: 92,
  })
  const [experience, setExperience] = useState("intermediate")
  const [sport, setSport] = useState("strength")
  const [availability, setAvailability] = useState("4 días")
  const [goal, setGoal] = useState("hypertrophy")
  const [photos, setPhotos] =
    useState<[string | undefined, string | undefined, string | undefined]>([
      undefined,
      undefined,
      undefined,
    ])

  const bodyFat = useMemo(() => {
    const heightMeters = biometrics.height / 100
    const bmi = biometrics.weight / (heightMeters * heightMeters)
    const sexAdjustment = biometrics.sex === "male" ? -5.4 : -10.8
    const waistAdjustment = Math.max(
      -1.5,
      Math.min(3, (biometrics.waist - biometrics.height * 0.42) * 0.35),
    )
    return Math.min(
      48,
      Math.max(
        8,
        1.2 * bmi +
          0.23 * biometrics.age +
          sexAdjustment -
          5.4 +
          waistAdjustment,
      ),
    )
  }, [biometrics])

  const canContinue =
    step === 1
      ? Object.values(biometrics).every(
          (value) => typeof value === "string" || value > 0,
        )
      : step === 2
        ? Boolean(experience && sport && availability && goal)
        : true

  const handleStepChange = (
    field: "experience" | "sport" | "availability" | "goal",
    value: string,
  ) => {
    if (field === "experience") setExperience(value)
    if (field === "sport") setSport(value)
    if (field === "availability") setAvailability(value)
    if (field === "goal") setGoal(value)
  }

  const next = () => {
    if (step < 3) setStep((value) => value + 1)
  }

  return (
    <main className="onboarding-screen screen-stack">
      <header className="onboarding-header">
        {step > 1 ? (
          <button
            className="icon-button"
            onClick={() => setStep((value) => value - 1)}
            type="button"
            aria-label="Volver"
          >
            <Icon name="arrow-left" size={20} />
          </button>
        ) : (
          <span className="onboarding-header__space" />
        )}
        <span className="onboarding-header__wordmark">FORMA</span>
        <span className="onboarding-header__count">0{step} / 03</span>
      </header>
      <StepProgress step={step} />

      <section className="screen-body onboarding-screen__body">
        {step === 1 ? (
          <BiometricsStep onChange={setBiometrics} values={biometrics} />
        ) : null}
        {step === 2 ? (
          <ProfileStep
            availability={availability}
            experience={experience}
            goal={goal}
            onChange={handleStepChange}
            sport={sport}
          />
        ) : null}
        {step === 3 ? (
          <PlanStep
            availability={availability}
            bodyFat={bodyFat}
            experience={experience}
            goal={goal}
            onComplete={(calories) =>
              onComplete({
                age: biometrics.age,
                weight: biometrics.weight,
                initialWeight: biometrics.weight,
                height: biometrics.height,
                bodyFat: Number(bodyFat.toFixed(1)),
                sex: biometrics.sex,
                neck: biometrics.neck,
                waist: biometrics.waist,
                hips: biometrics.hips,
                experience,
                sport,
                availability,
                goal,
                calories,
                photos: [...photos],
              })
            }
            onPhotoChange={(index, value) => {
              setPhotos((current) => {
                const nextPhotos: [string | undefined, string | undefined, string | undefined] =
                  [...current]
                nextPhotos[index] = value
                return nextPhotos
              })
            }}
            photos={photos}
            sport={sport}
            values={biometrics}
          />
        ) : null}
      </section>

      {step < 3 ? (
        <footer className="onboarding-footer">
          <Button disabled={!canContinue} fullWidth onClick={next}>
            Continuar <Icon name="arrow-right" size={17} />
          </Button>
        </footer>
      ) : null}
    </main>
  )
}
