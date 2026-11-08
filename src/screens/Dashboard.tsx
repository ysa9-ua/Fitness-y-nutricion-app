import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, ProgressRing, SectionTitle } from "../components/UI"
import {
  hoyISO,
  sembrarDiaDemo,
  sumarMacros,
  ultimoPeso,
  useAppData,
  useDia,
} from "../lib/appData"
import { alimentosDeFavoritos } from "../lib/foodLibrary"
import { cargarPreferencias, generarPlan } from "../lib/nutritionPlan"
import {
  entrenamientoDisponible,
  nombresDeRutina,
  semanaEntrenamiento,
  type DiaEntrenamiento,
  type Rutina,
  type SemanaEntrenamiento,
} from "../lib/training"
import type { OnboardingData } from "./Onboarding"
import { aISO, leerEstadoLocal, rutinaDelDia } from "../lib/planLocal"

type DashboardScreenProps = {
  onOpenCheckIn: () => void
  onOpenLibrary: () => void
  onOpenNutrition: () => void
  onOpenProfile: () => void
  onOpenScanner: () => void
  onOpenWorkouts: () => void
  onStartWorkout: (rutinaId: string | null, nombre: string) => void
  profile: OnboardingData
}

/** Respaldo sin backend para la tarjeta de entrenamiento. */
const workoutExercises = [
  "Press banca",
  "Remo Pendlay",
  "Press militar",
  "Fondos",
]

const capitaliza = (texto: string) =>
  texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto

const formatNumber = (value: number) => value.toLocaleString("es-ES")

const formatDecimal = (value: number) => value.toFixed(1).replace(".", ",")

const formatLiters = (ml: number) =>
  (ml / 1000).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })

function indiceDeHoy(fecha: Date): number {
  return (fecha.getDay() + 6) % 7
}

function formatGoal(goal: string) {
  const goals: Record<string, string> = {
    hypertrophy: "Hipertrofia",
    "fat-loss": "Pérdida de peso",
    recomposition: "Recomposición",
    health: "Salud general",
  }
  return goals[goal] ?? "Recomposición"
}

function perfilDelPlan(profile: OnboardingData) {
  return {
    age: profile.age,
    sex: profile.sex === "male" ? "male" as const : "female" as const,
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

export default function DashboardScreen({
  onOpenCheckIn,
  onOpenLibrary,
  onOpenNutrition,
  onOpenProfile,
  onOpenScanner,
  onOpenWorkouts,
  onStartWorkout,
  profile,
}: DashboardScreenProps) {
  const now = useMemo(() => new Date(), [])
  const todayLabel = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(now)
    .toUpperCase()
  const greeting =
    now.getHours() < 13
      ? "Buenos días"
      : now.getHours() < 21
        ? "Buenas tardes"
        : "Buenas noches"

  const data = useAppData()
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
  const analysis = plan.analysis
  const today = hoyISO(now)
  const day = useDia(today)
  const totals = useMemo(() => sumarMacros(day.entries), [day.entries])

  // El día de demostración se siembra una sola vez; si el usuario ya tiene
  // diario, `sembrarDiaDemo` no toca nada.
  useEffect(() => {
    sembrarDiaDemo(today, plan.meals)
  }, [today, plan.meals])

  const caloriesConsumed = totals.kcal
  const caloriesGoal = analysis.calories
  const caloriesRemaining = Math.max(0, caloriesGoal - caloriesConsumed)
  const calorieProgress =
    caloriesGoal > 0
      ? Math.min(100, Math.round((caloriesConsumed / caloriesGoal) * 100))
      : 0
  const macroRows = [
    {
      label: "Proteínas",
      value: Math.round(totals.protein),
      target: analysis.protein,
      color: "var(--blue)",
    },
    {
      label: "Carbohidratos",
      value: Math.round(totals.carbs),
      target: analysis.carbs,
      color: "var(--pink)",
    },
    {
      label: "Grasas",
      value: Math.round(totals.fat),
      target: analysis.fat,
      color: "var(--yellow)",
    },
  ]

  const waterProgress =
    analysis.waterMl > 0
      ? Math.min(100, Math.round((day.waterMl / analysis.waterMl) * 100))
      : 0
  const weight = ultimoPeso(data.weights, profile.weight, profile.initialWeight)
  const weightBar = Math.min(100, Math.max(6, Math.abs(weight.delta) * 20))
  const weightDelta =
    weight.delta === 0
      ? "sin cambios"
      : `${weight.delta > 0 ? "+" : "−"}${formatDecimal(
          Math.abs(weight.delta),
        )} kg`

  const [semana, setSemana] = useState<SemanaEntrenamiento | null>(null)
  const [nombres, setNombres] = useState<string[]>([])

  useEffect(() => {
    if (!entrenamientoDisponible()) return
    let vivo = true
    void (async () => {
      const datos = await semanaEntrenamiento(now)
      if (!vivo) return
      setSemana(datos)
    })()
    return () => {
      vivo = false
    }
  }, [now])

  // Demo/local: se lee una sola vez el estado de FORMA (`gym_state_v1`).
  const estadoLocal = useMemo(
    () => (entrenamientoDisponible() ? null : leerEstadoLocal()),
    [],
  )

  const weekStart = useMemo(() => {
    const start = new Date(now)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    start.setHours(0, 0, 0, 0)
    return start
  }, [now])

  const objetivosSemanales = useMemo(() => {
    if (semana) {
      return Math.max(
        1,
        semana.dias
          .flatMap((dia) => dia.rutinas)
          .filter((rutina) => !rutina.esDescanso).length,
      )
    }
    if (estadoLocal) {
      return Math.max(
        1,
        Object.values(estadoLocal.week ?? {}).filter(Boolean).length,
      )
    }
    const dias = Number.parseInt(profile.availability, 10)
    return Number.isFinite(dias) && dias > 0 ? dias : 4
  }, [semana, estadoLocal, profile.availability])

  const completadosSemanales = useMemo(() => {
    if (semana) {
      return semana.dias
        .flatMap((dia) => dia.rutinas)
        .filter((rutina) => rutina.estado === "completada").length
    }
    if (!estadoLocal) return 0
    return (estadoLocal.workouts ?? []).filter((workout) => {
      const fecha = workout.start
        ? new Date(workout.start)
        : new Date(workout.d)
      return fecha >= weekStart && fecha <= now
    }).length
  }, [semana, estadoLocal, weekStart, now])

  const diaHoy: DiaEntrenamiento | undefined = useMemo(() => {
    if (semana) {
      return (
        semana.dias.find((dia) => dia.esHoy) ?? semana.dias[indiceDeHoy(now)]
      )
    }

    if (!estadoLocal) return undefined
    const jsDay = now.getDay() // 0 domingo .. 6 sábado
    const rutina = rutinaDelDia(estadoLocal, now)
    return {
      diaSemana: jsDay,
      fecha: aISO(now),
      esHoy: true,
      titulo: rutina?.name ?? "Descanso",
      tituloCorto: rutina?.name ?? "Descanso",
      rutinas: rutina
        ? [
            {
              id: rutina.id,
              titulo: rutina.name,
              subtitulo: "PLAN LOCAL",
              enfoque: "",
              musculos: [],
              duracionMin: 45,
              intensidad: "media",
              kcalEstimadas: 0,
              horaProgramada: null,
              esDescanso: false,
              estado: "programada",
              porcentajeCompletado: 0,
            },
          ]
        : [
            {
              id: "descanso",
              titulo: "Descanso",
              subtitulo: "",
              enfoque: "",
              musculos: [],
              duracionMin: 0,
              intensidad: "media",
              kcalEstimadas: 0,
              horaProgramada: null,
              esDescanso: true,
              estado: "descanso",
              porcentajeCompletado: 0,
            },
          ],
    }
  }, [semana, now, estadoLocal])

  const rutinaHoy: Rutina | undefined = useMemo(() => {
    if (!diaHoy) return undefined
    return (
      diaHoy.rutinas.find((rutina) => !rutina.esDescanso) ?? diaHoy.rutinas[0]
    )
  }, [diaHoy])

  useEffect(() => {
    if (!rutinaHoy || rutinaHoy.esDescanso) {
      setNombres([])
      return
    }
    if (!entrenamientoDisponible()) {
      // Demo/local: resolver los nombres con el catálogo de FORMA, cargado
      // aparte para no meter ~900 KB en el bundle del shell.
      const rutina = (estadoLocal?.routines || []).find(
        (r) => r.id === rutinaHoy.id,
      )
      if (!rutina) {
        setNombres([])
        return
      }
      let vivo = true
      void (async () => {
        const { EXIDX } = await import("../training/lib/exercises.js")
        if (!vivo) return
        setNombres(
          (rutina.ex || []).map((e) => {
            const ex = (EXIDX as Record<string, { n?: string }>)[e.id]
            return ex?.n || e.id
          }),
        )
      })()
      return () => {
        vivo = false
      }
    }
    let vivo = true
    void (async () => {
      const lista = await nombresDeRutina(rutinaHoy.id)
      if (vivo) setNombres(lista)
    })()
    return () => {
      vivo = false
    }
  }, [rutinaHoy, estadoLocal])

  const enCurso = Boolean(semana?.sesionEnCurso)
  const esDescanso = rutinaHoy?.esDescanso ?? false
  const puedeIniciar = !enCurso && !esDescanso
  const tituloRutina = rutinaHoy?.titulo ?? "Push & Core"
  const subtituloRutina = rutinaHoy?.subtitulo
    ? rutinaHoy.subtitulo.toUpperCase()
    : "FUERZA · SESIÓN A"
  const duracionRutina = rutinaHoy?.duracionMin ?? 52
  const intensidadRutina = capitaliza(rutinaHoy?.intensidad ?? "media")
  const musculosRutina =
    rutinaHoy?.musculos && rutinaHoy.musculos.length > 0
      ? rutinaHoy.musculos
      : ["Pecho", "Hombros", "Tríceps"]
  const preview = nombres.length > 0 ? nombres : workoutExercises
  const visibles = preview.slice(0, 3)
  const restantes = Math.max(0, preview.length - visibles.length)
  const weeklyProgress = Math.min(
    100,
    Math.round((completadosSemanales / objetivosSemanales) * 100),
  )

  return (
    <main className="dashboard-screen screen-stack">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">{todayLabel}</span>
          <h1>
            {greeting}, Lucía <span>✦</span>
          </h1>
        </div>
        <button
          className="avatar"
          onClick={onOpenProfile}
          type="button"
          aria-label="Abrir mi perfil"
        >
          <span>LM</span>
          <i className="status-dot" />
        </button>
      </header>

      <section className="screen-body dashboard-screen__body">
        <section className="calorie-hero">
          <div className="calorie-hero__heading">
            <div>
              <span className="eyebrow">ENERGÍA RESTANTE</span>
              <strong>
                {formatNumber(caloriesRemaining)} <small>kcal</small>
              </strong>
            </div>
            <button onClick={onOpenNutrition} type="button">
              Ver diario <Icon name="chevron-right" size={14} />
            </button>
          </div>

          <div className="calorie-hero__content">
            <ProgressRing
              label="Calorías consumidas"
              size={132}
              stroke={10}
              value={caloriesConsumed}
              max={caloriesGoal}
            >
              <strong>{calorieProgress}%</strong>
              <small>consumido</small>
            </ProgressRing>
            <div className="macro-list">
              {macroRows.map((macro) => (
                <div className="macro-row" key={macro.label}>
                  <div>
                    <span>
                      <i style={{ background: macro.color }} />
                      {macro.label}
                    </span>
                    <small>
                      {macro.value} / {macro.target} g
                    </small>
                  </div>
                  <div className="macro-bar">
                    <i
                      style={{
                        background: macro.color,
                        width: `${
                          macro.target > 0
                            ? Math.min(100, (macro.value / macro.target) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="calorie-hero__footer">
            <Icon name="sparkles" size={15} />
            <span>
              {caloriesConsumed >= caloriesGoal
                ? "Objetivo del día cubierto"
                : "Vas según el ritmo de tu plan"}
            </span>
            <strong>
              {formatNumber(caloriesConsumed)} / {formatNumber(caloriesGoal)}
            </strong>
          </div>
        </section>

        <div className="dashboard-stats">
          <button className="mini-stat" onClick={onOpenNutrition} type="button">
            <span className="mini-stat__icon mini-stat__icon--cyan">
              <Icon name="water" size={20} />
            </span>
            <span>
              <small>AGUA</small>
              <strong>{formatLiters(day.waterMl)} L</strong>
            </span>
            <div className="mini-stat__progress mini-stat__progress--cyan">
              <i style={{ width: `${waterProgress}%` }} />
            </div>
            <em>{formatLiters(analysis.waterMl)} L</em>
          </button>
          <button className="mini-stat" onClick={onOpenCheckIn} type="button">
            <span className="mini-stat__icon mini-stat__icon--blue">
              <Icon name="weight" size={20} />
            </span>
            <span>
              <small>PESO</small>
              <strong>{formatDecimal(weight.actual)} kg</strong>
            </span>
            <div className="mini-stat__progress">
              <i style={{ width: `${weightBar}%` }} />
            </div>
            <em>{weightDelta}</em>
          </button>
        </div>

        <SectionTitle
          action="Ver semana"
          onAction={onOpenWorkouts}
          title="Entrenamiento de hoy"
          icon="dumbbell"
        />
        <section className="today-workout-card">
          <div className="today-workout-card__visual">
            <div className="workout-grid-lines" />
            <span className="workout-badge">
              <i /> {enCurso ? "SESIÓN ABIERTA" : "RUTINA DE HOY"}
            </span>
            <div className="barbell-illustration" aria-hidden="true">
              <span className="barbell-illustration__plate barbell-illustration__plate--left" />
              <span className="barbell-illustration__bar" />
              <span className="barbell-illustration__plate barbell-illustration__plate--right" />
            </div>
            <span className="workout-number">01</span>
          </div>
          <div className="today-workout-card__content">
            <div>
              <span>{subtituloRutina}</span>
              <h3>{tituloRutina}</h3>
              <p>
                <Icon name="clock" size={13} /> {duracionRutina} min <i />{" "}
                <Icon name="activity" size={13} /> {intensidadRutina}
              </p>
            </div>
            <div className="muscle-tags muscle-tags--compact">
              {musculosRutina.slice(0, 3).map((musculo) => (
                <span key={musculo}>{musculo}</span>
              ))}
            </div>
            <div className="exercise-preview">
              {visibles.map((exercise, index) => (
                <span key={exercise}>
                  <i>{index + 1}</i>
                  {exercise}
                </span>
              ))}
              {restantes > 0 ? (
                <span>
                  <i>+{restantes}</i>Más ejercicios
                </span>
              ) : null}
            </div>
            <Button
              disabled={!enCurso && !puedeIniciar}
              fullWidth
              icon={enCurso ? "timer" : "play"}
              onClick={() =>
                onStartWorkout(
                  enCurso ? null : (rutinaHoy?.id ?? null),
                  tituloRutina,
                )
              }
            >
              {enCurso
                ? "Continuar entrenamiento"
                : puedeIniciar
                  ? "Iniciar rutina"
                  : "Día de descanso"}
            </Button>
          </div>
        </section>

        <SectionTitle title="Acciones rápidas" />
        <div className="quick-actions">
          <button onClick={onOpenScanner} type="button">
            <span>
              <Icon name="scan" size={21} />
            </span>
            <div>
              <strong>Escanear alimento</strong>
              <small>Lee una etiqueta con OCR</small>
            </div>
            <Icon name="chevron-right" size={16} />
          </button>
          <button onClick={onOpenLibrary} type="button">
            <span>
              <Icon name="book" size={21} />
            </span>
            <div>
              <strong>Biblioteca de alimentos</strong>
              <small>Supermercados, favoritos y tus propios productos</small>
            </div>
            <Icon name="chevron-right" size={16} />
          </button>
          <button onClick={onOpenCheckIn} type="button">
            <span>
              <Icon name="weight" size={21} />
            </span>
            <div>
              <strong>Registrar peso</strong>
              <small>Actualiza tus medidas</small>
            </div>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>

        <section className="weekly-goal-card">
          <div className="weekly-goal-card__header">
            <div>
              <span className="eyebrow">OBJETIVO ACTUAL</span>
              <strong>{formatGoal(profile.goal)}</strong>
            </div>
            <span className="weekly-goal-card__badge">
              {completadosSemanales}/{objetivosSemanales} ESTA SEMANA
            </span>
          </div>
          <div className="weekly-goal-card__progress">
            <span style={{ width: `${weeklyProgress}%` }} />
          </div>
          <div className="weekly-goal-card__footer">
            <span>
              {completadosSemanales} de {objetivosSemanales}{" "}
              {objetivosSemanales === 1 ? "entreno" : "entrenos"} completados
            </span>
            <strong>{weeklyProgress}%</strong>
          </div>
        </section>
      </section>
    </main>
  )
}
