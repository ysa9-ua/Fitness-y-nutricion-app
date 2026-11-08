import { useEffect, useMemo, useState } from "react"
import Icon, { type IconName } from "../components/Icon"
import { Button } from "../components/UI"
import {
  contarEjercicios,
  entrenamientoDisponible,
  semanaEntrenamiento,
  type DiaEntrenamiento,
  type EstadoRutina,
  type SemanaEntrenamiento,
  type Rutina as RutinaServidor,
} from "../lib/training"

export type WorkoutsScreenProps = {
  onStartWorkout: (rutinaId: string | null, nombre: string) => void
  onOpenProfile: () => void
  onOpenHistory: () => void
}

type RoutineStatus = "completed" | "scheduled" | "rest"
type RoutineIntensity = "Alta" | "Media" | "Baja"

type Routine = {
  id: string
  title: string
  subtitle: string
  focus: string
  muscles: string[]
  duration: number
  intensity: RoutineIntensity
  exercises: number
  calories: number
  status: RoutineStatus
  time: string
  completion: number
}

type DayPlan = {
  id: string
  title: string
  shortTitle: string
  routines: Routine[]
}

type DayOption = {
  id: string
  weekday: string
  fullName: string
  day: number
  month: string
  isToday: boolean
}

type WeekOption = {
  id: string
  label: string
  monthLabel: string
  days: DayOption[]
}

// ---------------------------------------------------------------------------
// Respaldo sin backend: el plan curado que antes era mock y ahora solo se usa
// cuando no hay Supabase configurado, para que la pantalla no quede vacia.
// ---------------------------------------------------------------------------

const DEMO_PLAN: DayPlan[] = [
  {
    id: "monday",
    title: "Empuje de fuerza",
    shortTitle: "Tren superior · Empuje",
    routines: [
      {
        id: "demo-mon-push",
        title: "Empuje de fuerza",
        subtitle: "Sesión A · Tren superior",
        focus: "Pecho, hombros y tríceps",
        muscles: ["Pecho", "Hombros", "Tríceps"],
        duration: 52,
        intensity: "Alta",
        exercises: 6,
        calories: 470,
        status: "completed",
        time: "07:10",
        completion: 100,
      },
    ],
  },
  {
    id: "tuesday",
    title: "Recuperación activa",
    shortTitle: "Descanso",
    routines: [
      {
        id: "demo-tue-mobility",
        title: "Movilidad y circulación",
        subtitle: "Sesión de descarga",
        focus: "Caderas, columna y hombros",
        muscles: ["Caderas", "Espalda", "Hombros"],
        duration: 20,
        intensity: "Baja",
        exercises: 5,
        calories: 85,
        status: "rest",
        time: "10:00",
        completion: 0,
      },
    ],
  },
  {
    id: "wednesday",
    title: "Tirón y espalda",
    shortTitle: "Tren superior · Tirón",
    routines: [
      {
        id: "demo-wed-pull",
        title: "Tirón y espalda",
        subtitle: "Sesión B · Tren superior",
        focus: "Espalda, bíceps y agarre",
        muscles: ["Espalda", "Bíceps", "Trapecio"],
        duration: 55,
        intensity: "Alta",
        exercises: 7,
        calories: 520,
        status: "completed",
        time: "07:05",
        completion: 100,
      },
    ],
  },
  {
    id: "thursday",
    title: "Descanso y movilidad",
    shortTitle: "Descanso",
    routines: [
      {
        id: "demo-thu-rest",
        title: "Descanso y movilidad",
        subtitle: "Sesión opcional",
        focus: "Movilidad general y postura",
        muscles: ["Movilidad", "Core", "Hombros"],
        duration: 15,
        intensity: "Baja",
        exercises: 4,
        calories: 60,
        status: "rest",
        time: "09:30",
        completion: 0,
      },
    ],
  },
  {
    id: "friday",
    title: "Tren inferior y core",
    shortTitle: "Tren inferior + Core",
    routines: [
      {
        id: "demo-fri-lower",
        title: "Tren inferior · Empuje",
        subtitle: "Sesión C · Tren inferior",
        focus: "Cuádriceps, glúteos y isquios",
        muscles: ["Cuádriceps", "Glúteos", "Isquios"],
        duration: 54,
        intensity: "Alta",
        exercises: 6,
        calories: 500,
        status: "completed",
        time: "07:20",
        completion: 100,
      },
      {
        id: "demo-fri-core",
        title: "Core y estabilidad",
        subtitle: "Sesión complementaria",
        focus: "Abdomen, oblicuos y lumbar",
        muscles: ["Core", "Oblicuos", "Lumbar"],
        duration: 18,
        intensity: "Baja",
        exercises: 8,
        calories: 110,
        status: "scheduled",
        time: "18:30",
        completion: 0,
      },
      {
        id: "demo-fri-recovery",
        title: "Recuperación de la tarde",
        subtitle: "Sesión opcional",
        focus: "Piernas, caderas y espalda baja",
        muscles: ["Piernas", "Caderas", "Espalda baja"],
        duration: 20,
        intensity: "Baja",
        exercises: 5,
        calories: 75,
        status: "rest",
        time: "20:30",
        completion: 0,
      },
    ],
  },
  {
    id: "saturday",
    title: "Tirón de fuerza",
    shortTitle: "Tren superior · Tirón",
    routines: [
      {
        id: "demo-sat-pull",
        title: "Tirón de fuerza",
        subtitle: "Sesión D · Tren superior",
        focus: "Espalda, hombros y bíceps",
        muscles: ["Espalda", "Bíceps", "Hombros"],
        duration: 50,
        intensity: "Media",
        exercises: 6,
        calories: 430,
        status: "scheduled",
        time: "10:00",
        completion: 0,
      },
    ],
  },
  {
    id: "sunday",
    title: "Descanso completo",
    shortTitle: "Descanso",
    routines: [
      {
        id: "demo-sun-recovery",
        title: "Caminata suave",
        subtitle: "Sesión opcional",
        focus: "Recuperación y bienestar",
        muscles: ["Sistema cardiovascular", "Movilidad"],
        duration: 25,
        intensity: "Baja",
        exercises: 1,
        calories: 140,
        status: "rest",
        time: "11:00",
        completion: 0,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

const DIAS_CORTOS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]
const DIAS_LARGOS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
]
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

const capitaliza = (texto: string) =>
  texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto

function lunesDe(fecha: Date): Date {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const indice = (copia.getDay() + 6) % 7
  copia.setDate(copia.getDate() - indice)
  return copia
}

function indiceDeHoy(fecha: Date): number {
  return (fecha.getDay() + 6) % 7
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function numeroSemana(fecha: Date): number {
  const copia = new Date(
    Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
  )
  const dia = copia.getUTCDay() || 7
  copia.setUTCDate(copia.getUTCDate() + 4 - dia)
  const inicio = new Date(Date.UTC(copia.getUTCFullYear(), 0, 1))
  return Math.ceil(((copia.getTime() - inicio.getTime()) / 86400000 + 1) / 7)
}

/** Tres semanas alrededor de hoy: anterior, actual y siguiente. */
function construirSemanas(hoy: Date): WeekOption[] {
  return [-1, 0, 1].map((desplazamiento) => {
    const lunes = lunesDe(hoy)
    lunes.setDate(lunes.getDate() + desplazamiento * 7)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    const days: DayOption[] = Array.from({ length: 7 }, (_, indice) => {
      const fecha = new Date(lunes)
      fecha.setDate(lunes.getDate() + indice)
      return {
        id: `sem-${desplazamiento}-${indice}`,
        weekday: DIAS_CORTOS[indice]!,
        fullName: DIAS_LARGOS[indice]!,
        day: fecha.getDate(),
        month: MESES[fecha.getMonth()]!,
        isToday: mismoDia(fecha, hoy),
      }
    })
    return {
      id: `sem-${desplazamiento}`,
      label: `${lunes.getDate()} — ${domingo.getDate()} ${MESES[
        domingo.getMonth()
      ]!.slice(0, 3)}`,
      monthLabel: `Semana ${numeroSemana(lunes)} · ${capitaliza(
        MESES[lunes.getMonth()]!,
      )} ${lunes.getFullYear()}`,
      days,
    }
  })
}

// ---------------------------------------------------------------------------
// Adaptacion del servidor al modelo de la pantalla
// ---------------------------------------------------------------------------

const statusLabels: Record<RoutineStatus, string> = {
  completed: "Completado",
  scheduled: "Programado",
  rest: "Descanso",
}

const statusIcons: Record<RoutineStatus, IconName> = {
  completed: "check",
  scheduled: "play",
  rest: "moon",
}

const formatNumber = (value: number) => value.toLocaleString("es-ES")

function estadoAServidor(estado: EstadoRutina): RoutineStatus {
  if (estado === "completada") return "completed"
  if (estado === "descanso") return "rest"
  return "scheduled"
}

function horaCorta(hora: string | null): string {
  if (!hora) return "--:--"
  return hora.slice(0, 5)
}

function rutinaARoutine(rutina: RutinaServidor, ejercicios: number): Routine {
  return {
    id: rutina.id,
    title: rutina.titulo,
    subtitle: rutina.subtitulo,
    focus: rutina.enfoque,
    muscles: rutina.musculos,
    duration: rutina.duracionMin,
    intensity: capitaliza(rutina.intensidad) as RoutineIntensity,
    exercises: ejercicios,
    calories: rutina.kcalEstimadas,
    status: estadoAServidor(rutina.estado),
    time: horaCorta(rutina.horaProgramada),
    completion: rutina.porcentajeCompletado,
  }
}

function descansoDeDia(dia: DiaEntrenamiento): Routine {
  return {
    id: `descanso-${dia.fecha}`,
    title: dia.titulo || "Descanso",
    subtitle: "Día de descanso",
    focus: "Recuperación y movilidad",
    muscles: [],
    duration: 0,
    intensity: "Baja",
    exercises: 0,
    calories: 0,
    status: "rest",
    time: "--:--",
    completion: 0,
  }
}

function diaADayPlan(
  dia: DiaEntrenamiento,
  conteo: Record<string, number>,
): DayPlan {
  return {
    id: dia.fecha,
    title: dia.titulo,
    shortTitle: dia.tituloCorto || dia.titulo,
    routines:
      dia.rutinas.length > 0
        ? dia.rutinas.map((rutina) =>
            rutinaARoutine(rutina, conteo[rutina.id] ?? 0),
          )
        : [descansoDeDia(dia)],
  }
}

function getDayStatus(plan: DayPlan): RoutineStatus {
  if (plan.routines.some((routine) => routine.status === "completed"))
    return "completed"
  if (plan.routines.some((routine) => routine.status === "scheduled"))
    return "scheduled"
  return "rest"
}

export default function WorkoutsScreen({
  onStartWorkout,
  onOpenProfile,
  onOpenHistory,
}: WorkoutsScreenProps) {
  const hoy = useMemo(() => new Date(), [])
  const semanas = useMemo(() => construirSemanas(hoy), [hoy])
  const [weekIndex, setWeekIndex] = useState(1)
  const [selectedDayIndex, setSelectedDayIndex] = useState(() =>
    indiceDeHoy(hoy),
  )
  const [view, setView] = useState<"day" | "week">("day")
  const [semana, setSemana] = useState<SemanaEntrenamiento | null>(null)
  const [conteo, setConteo] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!entrenamientoDisponible()) return
    let vivo = true
    const lunes = lunesDe(hoy)
    lunes.setDate(lunes.getDate() + (weekIndex - 1) * 7)
    void (async () => {
      const datos = await semanaEntrenamiento(lunes)
      if (!vivo) return
      setSemana(datos)
      if (!datos) return
      const ids = datos.dias.flatMap((dia) =>
        dia.rutinas.map((rutina) => rutina.id),
      )
      const cuenta = await contarEjercicios(ids)
      if (vivo) setConteo(cuenta)
    })()
    return () => {
      vivo = false
    }
  }, [hoy, weekIndex])

  const selectedWeek = semanas[weekIndex] ?? semanas[1]!
  const planActual = useMemo<DayPlan[]>(() => {
    if (semana && semana.dias.length === 7) {
      return semana.dias.map((dia) => diaADayPlan(dia, conteo))
    }
    return DEMO_PLAN
  }, [semana, conteo])

  const selectedDate =
    selectedWeek.days[selectedDayIndex] ?? selectedWeek.days[0]!
  const selectedPlan = planActual[selectedDayIndex] ?? planActual[0]!
  const primaryRoutine =
    selectedPlan.routines.find((routine) => routine.status === "scheduled") ??
    selectedPlan.routines.find((routine) => routine.status === "completed") ??
    selectedPlan.routines[0]!

  const trainingRoutines = planActual
    .flatMap((plan) => plan.routines)
    .filter((routine) => routine.status !== "rest")
  const completedCount = trainingRoutines.filter(
    (routine) => routine.status === "completed",
  ).length
  const weekMinutes = trainingRoutines.reduce(
    (total, routine) => total + routine.duration,
    0,
  )
  const weekCalories = trainingRoutines.reduce(
    (total, routine) => total + routine.calories,
    0,
  )
  const averageDuration =
    trainingRoutines.length > 0
      ? Math.round(weekMinutes / trainingRoutines.length)
      : 0
  const weekCompletion =
    trainingRoutines.length > 0
      ? Math.round((completedCount / trainingRoutines.length) * 100)
      : 0

  const enCurso = Boolean(semana?.sesionEnCurso)
  const puedeIniciar =
    !enCurso &&
    primaryRoutine.status !== "rest" &&
    !primaryRoutine.id.startsWith("descanso-")

  return (
    <main className="workouts-screen screen-stack">
      <header className="workouts-header">
        <div className="workouts-header__copy">
          <span className="eyebrow">PLAN DE FUERZA</span>
          <h1>Entrenamientos</h1>
          <p>Fase 2 · Recomposición</p>
        </div>
        <div className="workouts-header__actions">
          <button
            aria-label="Ver historial de entrenamientos"
            className="icon-button icon-button--bordered"
            onClick={onOpenHistory}
            type="button"
          >
            <Icon name="book" size={18} />
          </button>
          <button
            aria-label="Abrir mi perfil"
            className="avatar avatar--small workouts-avatar"
            onClick={onOpenProfile}
            type="button"
          >
            <span>LM</span>
            <i className="status-dot" />
          </button>
        </div>
      </header>

      <div className="workouts-content">
        <section
          className="workouts-week-picker"
          aria-labelledby="workouts-week-title"
        >
          <div className="workouts-week-picker__header">
            <button
              aria-label="Ver semana anterior"
              className="icon-button"
              disabled={weekIndex === 0}
              onClick={() => setWeekIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              <Icon name="arrow-left" size={18} />
            </button>
            <div className="workouts-week-picker__copy">
              <span className="eyebrow">SEMANA SELECCIONADA</span>
              <h2 id="workouts-week-title">{selectedWeek.monthLabel}</h2>
            </div>
            <button
              aria-label="Ver semana siguiente"
              className="icon-button"
              disabled={weekIndex === semanas.length - 1}
              onClick={() =>
                setWeekIndex((index) => Math.min(semanas.length - 1, index + 1))
              }
              type="button"
            >
              <Icon name="arrow-right" size={18} />
            </button>
          </div>

          <div
            aria-label={`Calendario de la semana: ${selectedWeek.label}`}
            className="workouts-week-days"
            role="group"
          >
            {selectedWeek.days.map((date, index) => {
              const plan = planActual[index] ?? planActual[0]!
              const dayStatus = getDayStatus(plan)
              const isSelected = index === selectedDayIndex
              return (
                <button
                  aria-label={`${date.fullName}, ${date.day} de ${date.month}. ${plan.shortTitle}. ${statusLabels[dayStatus]}`}
                  aria-pressed={isSelected}
                  className={`workouts-day workouts-day--${dayStatus} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  key={date.id}
                  onClick={() => setSelectedDayIndex(index)}
                  type="button"
                >
                  <span>{date.weekday}</span>
                  <strong>{date.day}</strong>
                  <i aria-hidden="true" className="workouts-day__status" />
                  {date.isToday ? <small>HOY</small> : null}
                </button>
              )
            })}
          </div>
        </section>

        <section
          className="workouts-summary"
          aria-labelledby="workouts-summary-title"
        >
          <div className="workouts-summary__header">
            <div>
              <span className="eyebrow">
                ESTA SEMANA · {selectedWeek.label}
              </span>
              <h2 id="workouts-summary-title">Tu constancia</h2>
            </div>
            <span className="workouts-summary__score">{weekCompletion}%</span>
          </div>

          <div className="workouts-summary__metrics">
            <div>
              <span className="workouts-summary__metric-icon workouts-summary__metric-icon--completed">
                <Icon name="check" size={16} />
              </span>
              <strong>
                {completedCount}
                <small> / {trainingRoutines.length}</small>
              </strong>
              <span>Completadas</span>
            </div>
            <div>
              <span className="workouts-summary__metric-icon workouts-summary__metric-icon--time">
                <Icon name="clock" size={16} />
              </span>
              <strong>
                {weekMinutes}
                <small> min</small>
              </strong>
              <span>Tiempo total</span>
            </div>
            <div>
              <span className="workouts-summary__metric-icon workouts-summary__metric-icon--average">
                <Icon name="timer" size={16} />
              </span>
              <strong>
                {averageDuration}
                <small> min</small>
              </strong>
              <span>Media por sesión</span>
            </div>
            <div>
              <span className="workouts-summary__metric-icon workouts-summary__metric-icon--calories">
                <Icon name="flame" size={16} />
              </span>
              <strong>
                {formatNumber(weekCalories)}
                <small> kcal</small>
              </strong>
              <span>Energía estimada</span>
            </div>
          </div>

          <div className="workouts-summary__progress">
            <progress
              aria-label={`Rutinas completadas: ${completedCount} de ${trainingRoutines.length}`}
              className="workouts-week-progress"
              max={Math.max(1, trainingRoutines.length)}
              value={completedCount}
            />
            <div className="workouts-summary__days" aria-hidden="true">
              {planActual.map((plan, index) => (
                <span
                  className={`workouts-summary__day workouts-summary__day--${getDayStatus(plan)}`}
                  key={plan.id}
                >
                  {selectedWeek.days[index]?.weekday ?? ""}
                </span>
              ))}
            </div>
          </div>
          <p className="workouts-summary__hint">
            <Icon name="sparkles" size={14} />
            {weekCompletion >= 80
              ? "Vas por buen camino. Mantén el ritmo esta semana."
              : `Te faltan ${trainingRoutines.length - completedCount} ${
                  trainingRoutines.length - completedCount === 1
                    ? "sesión"
                    : "sesiones"
                } para cerrar la semana con objetivo.`}
          </p>
        </section>

        <div
          className="workouts-view-switch"
          role="group"
          aria-label="Vista del plan"
        >
          <button
            aria-pressed={view === "day"}
            className={view === "day" ? "is-active" : ""}
            onClick={() => setView("day")}
            type="button"
          >
            <Icon name="calendar" size={16} />
            Día
          </button>
          <button
            aria-pressed={view === "week"}
            className={view === "week" ? "is-active" : ""}
            onClick={() => setView("week")}
            type="button"
          >
            <Icon name="book" size={16} />
            Semana
          </button>
        </div>

        {view === "day" ? (
          <section
            className="workouts-day-plan"
            aria-labelledby="workouts-day-plan-title"
          >
            <div className="workouts-day-plan__header">
              <div>
                <span className="eyebrow">
                  {selectedDate.fullName.toUpperCase()}, {selectedDate.day} DE{" "}
                  {selectedDate.month.toUpperCase()}
                </span>
                <h2 id="workouts-day-plan-title">Rutinas del día</h2>
              </div>
              <span className="workouts-day-plan__count">
                {selectedPlan.routines.length}{" "}
                {selectedPlan.routines.length === 1 ? "bloque" : "bloques"}
              </span>
            </div>

            <div className="workouts-routine-list">
              {selectedPlan.routines.map((routine) => (
                <article
                  className={`workouts-routine workouts-routine--${routine.status}`}
                  key={routine.id}
                >
                  <header className="workouts-routine__header">
                    <span className="workouts-routine__icon">
                      <Icon name={statusIcons[routine.status]} size={18} />
                    </span>
                    <div className="workouts-routine__title">
                      <span className="workouts-routine__status">
                        {statusLabels[routine.status]}
                      </span>
                      <h3>{routine.title}</h3>
                      <small>{routine.subtitle}</small>
                    </div>
                    <span className="workouts-routine__duration">
                      <strong>{routine.duration}</strong>
                      <small>min</small>
                    </span>
                  </header>

                  <p className="workouts-routine__focus">
                    <Icon name="target" size={14} />
                    {routine.focus}
                  </p>

                  {routine.muscles.length > 0 ? (
                    <div
                      aria-label="Grupos musculares"
                      className="workouts-routine__muscles"
                      role="group"
                    >
                      {routine.muscles.map((muscle) => (
                        <span key={muscle}>{muscle}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="workouts-routine__meta">
                    <span>
                      <Icon name="clock" size={14} /> {routine.duration} min
                    </span>
                    <span>
                      <Icon name="flame" size={14} /> Intensidad{" "}
                      {routine.intensity.toLowerCase()}
                    </span>
                    {routine.exercises > 0 ? (
                      <span>
                        <Icon name="dumbbell" size={14} /> {routine.exercises}{" "}
                        ejercicios
                      </span>
                    ) : null}
                  </div>

                  {routine.status === "rest" ? (
                    <p className="workouts-routine__note">
                      <Icon name="moon" size={14} />
                      Sesión opcional de descarga a las {routine.time}.
                    </p>
                  ) : (
                    <>
                      <progress
                        aria-label={`Progreso de ${routine.title}`}
                        className="workouts-routine-progress"
                        max={100}
                        value={routine.completion}
                      />
                      <p className="workouts-routine__note">
                        <Icon
                          name={
                            routine.status === "completed" ? "check" : "timer"
                          }
                          size={14}
                        />
                        {routine.status === "completed"
                          ? `Completado a las ${routine.time}. Buen trabajo.`
                          : `Programado a las ${routine.time}. Prepárate para empezar.`}
                      </p>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section
            className="workouts-program"
            aria-labelledby="workouts-program-title"
          >
            <div className="workouts-program__header">
              <div>
                <span className="eyebrow">PROGRAMA SEMANAL</span>
                <h2 id="workouts-program-title">Tu semana de fuerza</h2>
                <p>
                  {trainingRoutines.length} sesiones · {completedCount}{" "}
                  completadas · {weekMinutes} minutos
                </p>
              </div>
              <span className="workouts-program__badge">
                <Icon name="dumbbell" size={15} />
                FASE 2/3
              </span>
            </div>

            <div className="workouts-program__progress">
              <div>
                <span>Progreso semanal</span>
                <strong>
                  {completedCount} de {trainingRoutines.length}
                </strong>
              </div>
              <progress
                aria-label={`Progreso semanal: ${completedCount} de ${trainingRoutines.length} sesiones`}
                className="workouts-week-progress"
                max={Math.max(1, trainingRoutines.length)}
                value={completedCount}
              />
            </div>

            <div className="workouts-program__grid">
              {planActual.map((plan, index) => {
                const date = selectedWeek.days[index] ?? selectedWeek.days[0]!
                const dayStatus = getDayStatus(plan)
                return (
                  <article
                    className={`workouts-program-day workouts-program-day--${dayStatus}`}
                    key={plan.id}
                  >
                    <button
                      aria-label={`Ver rutinas del ${date.fullName} ${date.day}: ${plan.title}`}
                      className="workouts-program-day__header"
                      onClick={() => {
                        setSelectedDayIndex(index)
                        setView("day")
                      }}
                      type="button"
                    >
                      <span className="workouts-program-day__date">
                        <small>{date.weekday}</small>
                        <strong>{date.day}</strong>
                      </span>
                      <span className="workouts-program-day__copy">
                        <strong>{plan.shortTitle}</strong>
                        <small>{statusLabels[dayStatus]}</small>
                      </span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                    <div className="workouts-program-day__routines">
                      {plan.routines.map((routine) => (
                        <div
                          className="workouts-program-routine"
                          key={routine.id}
                        >
                          <span className="workouts-program-routine__icon">
                            <Icon
                              name={statusIcons[routine.status]}
                              size={14}
                            />
                          </span>
                          <div>
                            <strong>{routine.title}</strong>
                            <small>
                              {routine.duration} min · {routine.intensity}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section
          className="workouts-start-panel"
          aria-labelledby="workouts-start-title"
        >
          <div className="workouts-start-panel__glow" />
          <div className="workouts-start-panel__copy">
            <span className="eyebrow">
              {enCurso
                ? "SESIÓN ABIERTA"
                : primaryRoutine.status === "completed"
                  ? "RUTINA DESTACADA"
                  : primaryRoutine.status === "rest"
                    ? "RECUPERACIÓN"
                    : "PRÓXIMO BLOQUE"}
            </span>
            <h2 id="workouts-start-title">{primaryRoutine.title}</h2>
            <p>
              {primaryRoutine.focus} · {primaryRoutine.duration} min ·
              Intensidad {primaryRoutine.intensity.toLowerCase()}
            </p>
          </div>
          <Button
            className="workouts-start-button"
            disabled={!enCurso && !puedeIniciar}
            fullWidth
            icon={enCurso ? "timer" : "play"}
            onClick={() =>
              onStartWorkout(
                enCurso ? null : primaryRoutine.id,
                primaryRoutine.title,
              )
            }
          >
            {enCurso
              ? "Continuar entrenamiento"
              : puedeIniciar
                ? "Iniciar rutina"
                : "Día de descanso"}
          </Button>
        </section>
      </div>
    </main>
  )
}
