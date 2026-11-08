import { useEffect, useState } from "react"
import Icon from "../components/Icon"
import {
  Button,
  ProgressRing,
  ScreenHeader,
  SectionTitle,
  Toast,
} from "../components/UI"
import type { OnboardingData } from "./Onboarding"

type ProfileScreenProps = {
  onBack: () => void
  onOpenSettings: () => void
  onOpenCheckIn: () => void
  onRecalculate: () => void
  profile: OnboardingData
}

type RecalculateState = "idle" | "loading" | "done"

type Stat = {
  label: string
  value: string
  detail: string
  icon: "chart" | "dumbbell" | "flame" | "calendar"
}

const DEFAULT_GOAL_WEIGHT = 61
const WEEK = 4
const TOTAL_WEEKS = 12
const LAST_CHECK_IN = "hace 5 días"

export default function ProfileScreen({
  onBack,
  onOpenSettings,
  onOpenCheckIn,
  onRecalculate,
  profile,
}: ProfileScreenProps) {
  const [recalculate, setRecalculate] = useState<RecalculateState>("idle")
  const [lastRun, setLastRun] = useState("hace 2 días")
  const dayOneWeight = profile.initialWeight ?? profile.weight
  const currentWeight = profile.weight
  const goalWeight = Math.min(DEFAULT_GOAL_WEIGHT, dayOneWeight - 1)
  const bodyFat = profile.bodyFat
  const lostWeight = Math.max(0, dayOneWeight - currentWeight)
  const goalLabels: Record<string, string> = {
    hypertrophy: "Hipertrofia",
    "fat-loss": "Pérdida de peso",
    recomposition: "Recomposición",
    health: "Salud general",
  }
  const goalDescriptions: Record<string, string> = {
    hypertrophy: "Ganar masa muscular con una progresión de fuerza controlada.",
    "fat-loss": "Reducir grasa manteniendo el rendimiento y la fuerza.",
    recomposition: "Ganar músculo sin perder el peso que has trabajado.",
    health: "Mejorar tu bienestar con un plan sostenible y flexible.",
  }
  const experienceLabels: Record<string, string> = {
    beginner: "Iniciación",
    intermediate: "Intermedio",
    advanced: "Avanzado",
  }
  const sportLabels: Record<string, string> = {
    strength: "Fuerza",
    running: "Running",
    crossfit: "CrossFit",
    other: "Otro",
  }
  const stats: Stat[] = [
    {
      label: "Entrenos",
      value: "18",
      detail: "3 esta semana",
      icon: "dumbbell",
    },
    {
      label: "Peso perdido",
      value: `${lostWeight.toFixed(1).replace(".", ",")} kg`,
      detail: "desde el día 1",
      icon: "chart",
    },
    { label: "Racha", value: "12 días", detail: "récord: 21", icon: "flame" },
    {
      label: "Adherencia",
      value: "92%",
      detail: "diario nutricional",
      icon: "calendar",
    },
  ]
  const bodyData = [
    {
      label: "Peso",
      value: `${currentWeight.toFixed(1).replace(".", ",")} kg`,
      detail:
        lostWeight > 0
          ? `−${lostWeight.toFixed(1).replace(".", ",")} kg`
          : "sin cambios",
    },
    { label: "Altura", value: `${profile.height} cm`, detail: "sin cambios" },
    { label: "Edad", value: `${profile.age} años`, detail: "sin cambios" },
    { label: "Cintura", value: "69,5 cm", detail: "−2,5 cm" },
  ]

  useEffect(() => {
    if (recalculate !== "loading") return
    const timer = window.setTimeout(() => {
      setRecalculate("done")
      setLastRun("ahora mismo")
    }, 1600)
    return () => window.clearTimeout(timer)
  }, [recalculate])

  useEffect(() => {
    if (recalculate !== "done") return
    const timer = window.setTimeout(() => setRecalculate("idle"), 3600)
    return () => window.clearTimeout(timer)
  }, [recalculate])

  const weightProgress = Math.min(
    100,
    Math.round(
      ((dayOneWeight - currentWeight) / (dayOneWeight - goalWeight)) * 100,
    ),
  )
  const weekProgress = Math.round((WEEK / TOTAL_WEEKS) * 100)

  const handleRecalculate = () => {
    if (recalculate === "loading") return
    setRecalculate("loading")
    onRecalculate()
  }

  return (
    <main className="profile-screen screen-stack">
      <ScreenHeader
        action={{
          label: "Abrir ajustes",
          icon: "settings",
          onClick: onOpenSettings,
        }}
        eyebrow="MI CUENTA"
        onBack={onBack}
        title="Perfil"
      />

      <div className="screen-body profile-body">
        <section className="profile-card">
          <div className="profile-card__head">
            <span className="avatar avatar--large">
              <span>LM</span>
              <i className="status-dot" />
            </span>
            <div>
              <h2>Lucía Martínez</h2>
              <p>@lucia · Miembro desde marzo de 2026</p>
            </div>
          </div>
          <div className="muscle-tags">
            <span>{goalLabels[profile.goal] ?? "Recomposición"}</span>
            <span>{experienceLabels[profile.experience] ?? "Intermedio"}</span>
            <span>{sportLabels[profile.sport] ?? "Fuerza"}</span>
            <span>{profile.availability}</span>
          </div>
        </section>

        <section className="starting-point-card profile-goal">
          <div>
            <span className="eyebrow">TU OBJETIVO</span>
            <strong>{goalLabels[profile.goal] ?? "Recomposición"}</strong>
            <p>
              {goalDescriptions[profile.goal] ??
                "Ganar músculo sin perder el peso que has trabajado."}
            </p>
            <div className="progress-bar" aria-hidden="true">
              <i style={{ width: `${weekProgress}%` }} />
            </div>
            <small>
              Semana {WEEK} de {TOTAL_WEEKS} · {weekProgress}% del plan
            </small>
          </div>
          <ProgressRing
            label="Progreso hacia la meta de peso"
            size={84}
            stroke={8}
            value={weightProgress}
            max={100}
          >
            <strong>{weightProgress}%</strong>
            <small>meta</small>
          </ProgressRing>
        </section>

        <section className="profile-stats">
          {stats.map((stat) => (
            <div className="profile-stat" key={stat.label}>
              <span className="profile-stat__icon">
                <Icon name={stat.icon} size={16} />
              </span>
              <strong>{stat.value}</strong>
              <small>{stat.label}</small>
              <em>{stat.detail}</em>
            </div>
          ))}
        </section>

        <section className="measurement-card">
          <div className="measurement-card__header">
            <span>
              <Icon name="weight" size={18} />
            </span>
            <div>
              <strong>Datos corporales</strong>
              <small>Actualizados en tu último check-in</small>
            </div>
          </div>
          <ul className="profile-data-list">
            {bodyData.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small className={item.detail.startsWith("−") ? "is-down" : ""}>
                  {item.detail}
                </small>
              </li>
            ))}
          </ul>
          <div className="profile-body-fat">
            <ProgressRing
              label="Grasa corporal estimada"
              size={72}
              stroke={7}
              value={bodyFat}
              max={35}
            >
              <strong>{bodyFat.toFixed(1).replace(".", ",")}%</strong>
            </ProgressRing>
            <div>
              <strong>Grasa corporal estimada</strong>
              <small>
                Calculada con perímetro de cintura y peso. Ha bajado 1,6 puntos
                desde el día 1.
              </small>
            </div>
          </div>
        </section>

        <section className="checkin-card">
          <SectionTitle icon="calendar" title="Último check-in" />
          <p className="checkin-card__date">
            <Icon name="check" size={15} /> Semana {WEEK - 1} · registrado{" "}
            {LAST_CHECK_IN}
          </p>
          <ul className="checkin-card__values">
            <li>
              <span>Peso</span>
              <strong>63,4 kg</strong>
            </li>
            <li>
              <span>Cintura</span>
              <strong>70 cm</strong>
            </li>
            <li>
              <span>Fotos</span>
              <strong>3/3</strong>
            </li>
          </ul>
          <Button
            fullWidth
            icon="refresh"
            onClick={onOpenCheckIn}
            variant="secondary"
          >
            Hacer check-in de esta semana
          </Button>
        </section>

        <section className="recalc-card">
          <div className="recalc-card__head">
            <span className="recalc-card__icon">
              <Icon name="sparkles" size={18} />
            </span>
            <div>
              <strong>Algoritmo adaptativo</strong>
              <small>Última actualización {lastRun}</small>
            </div>
          </div>
          <p>
            Recalcula tus calorías, cargas y volumen con los datos de esta
            semana. Úsalo si entrenas o sigues una dieta distinta a la
            planificada.
          </p>
          <Button
            aria-busy={recalculate === "loading"}
            disabled={recalculate === "loading"}
            fullWidth
            icon={recalculate === "loading" ? "refresh" : "sparkles"}
            onClick={handleRecalculate}
          >
            {recalculate === "loading"
              ? "Recalculando..."
              : recalculate === "done"
                ? "Plan actualizado"
                : "Forzar recálculo"}
          </Button>
        </section>

        <button
          className="settings-link"
          onClick={onOpenSettings}
          type="button"
        >
          <Icon name="settings" size={18} />
          <span>Ver todos los ajustes</span>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      <Toast
        message={
          recalculate === "done" ? "Algoritmo actualizado con tus datos" : ""
        }
        visible={recalculate === "done"}
      />
    </main>
  )
}
