import { useEffect, useMemo, useState } from "react"
import Icon, { type IconName } from "../components/Icon"
import { Button } from "../components/UI"
import { useTrainingPlanStore } from "../store/trainingPlanStore"
import { entrenamientoDisponible } from "../lib/training"
import {
  isSupabaseSyncAvailable,
  rutinaIdForWorkout,
} from "../training/lib/supabaseSync.js"
import { aISO } from "../lib/training"
import { exCount } from "../training/lib/format.js"
import { routineIcon } from "../lib/trainingGlyphs"

export type TrainingPlanProps = {
  onOpenRoutines: (assignDay?: number) => void
  onOpenRoutineEditor: (routineId?: string) => void
  onOpenHistory: () => void
  onStartWorkout: (rutinaId: string | null, nombre: string) => void
}

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

type DayOption = {
  id: string
  weekday: string
  fullName: string
  day: number
  month: string
  iso: string
  isToday: boolean
}

type WeekOption = {
  id: string
  label: string
  monthLabel: string
  days: DayOption[]
}

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
        iso: aISO(fecha),
        isToday: mismoDia(fecha, hoy),
      }
    })
    return {
      id: `sem-${desplazamiento}`,
      label: `${lunes.getDate()} — ${domingo.getDate()} ${MESES[domingo.getMonth()]!.slice(0, 3)}`,
      monthLabel: `Semana ${numeroSemana(lunes)} · ${capitaliza(MESES[lunes.getMonth()]!)} ${lunes.getFullYear()}`,
      days,
    }
  })
}

const STATUS_LABELS = {
  completed: "Completado",
  scheduled: "Programado",
  rest: "Descanso",
}

const STATUS_ICONS: Record<string, IconName> = {
  completed: "check",
  scheduled: "play",
  rest: "moon",
}

type DayStatus = "completed" | "scheduled" | "rest"

export default function TrainingPlan({
  onOpenRoutines,
  onOpenRoutineEditor,
  onOpenHistory,
  onStartWorkout,
}: TrainingPlanProps) {
  const hoy = useMemo(() => new Date(), [])
  const semanas = useMemo(() => construirSemanas(hoy), [hoy])
  const [weekIndex, setWeekIndex] = useState(1)
  const [selectedDayIndex, setSelectedDayIndex] = useState(() =>
    indiceDeHoy(hoy),
  )
  const [view, setView] = useState<"day" | "week">("day")

  const { S, boot, update, hydrateFromSupabase, syncToSupabase } =
    useTrainingPlanStore()
  const routines = S.routines
  const week = S.week

  useEffect(() => {
    boot()
    if (entrenamientoDisponible()) {
      hydrateFromSupabase()
    }
  }, [])

  const selectedWeek = semanas[weekIndex] ?? semanas[1]!
  const selectedDate =
    selectedWeek.days[selectedDayIndex] ?? selectedWeek.days[0]!
  const jsDay = selectedDayIndex === 6 ? 0 : selectedDayIndex + 1 // convertir a formato JS (0=domingo)

  const rutinaDelDia = routines.find((r) => r.id === week[(jsDay as any)])
  const hayRutina = !!rutinaDelDia

  const fechasCompletadas = useMemo(() => {
    const set = new Set<string>()
    for (const entreno of S.workouts || []) {
      if (entreno?.d) set.add(entreno.d)
    }
    return set
  }, [S.workouts])

  const getDayStatus = (diaJs: number, iso: string): DayStatus => {
    if (fechasCompletadas.has(iso)) return "completed"
    if (week[(diaJs as any)]) return "scheduled"
    return "rest"
  }

  const dayStatus = getDayStatus(jsDay, selectedDate.iso)

  const trainingRoutinesCount = Object.keys(week).filter(
    (k) => week[Number(k)],
  ).length
  const completedCount = selectedWeek.days.filter((dia) =>
    fechasCompletadas.has(dia.iso),
  ).length

  const handleAssignRoutine = (dayJs: number) => {
    onOpenRoutines(dayJs)
  }

  const handleClearDay = (dayJs: number) => {
    update((s) => {
      delete (s.week as any)[dayJs]
    })
    if (isSupabaseSyncAvailable()) {
      syncToSupabase().catch(() => {})
    }
  }

  const handleStartWorkout = () => {
    if (!rutinaDelDia) return
    // Con backend, la sesión apunta a la rutina del servidor (los ids locales se
    // remapean al hidratar el plan); en local rige el id del propio plan.
    let id = rutinaDelDia.id
    if (isSupabaseSyncAvailable()) {
      const supaId = rutinaIdForWorkout(S, rutinaDelDia.id, aISO(new Date()))
      if (supaId) id = supaId
    }
    onStartWorkout(id, rutinaDelDia.name)
  }

  const handleEditRoutine = () => {
    if (rutinaDelDia) {
      onOpenRoutineEditor(rutinaDelDia.id)
    }
  }

  return (
    <main className="workouts-screen screen-stack">
      <header className="workouts-header">
        <div className="workouts-header__copy">
          <span className="eyebrow">PLAN DE ENTRENAMIENTO</span>
          <h1>Entrenos</h1>
          <p>Plan semanal editable</p>
        </div>
        <div className="workouts-header__actions">
          <button
            aria-label="Gestionar rutinas"
            className="icon-button icon-button--bordered"
            onClick={() => onOpenRoutines()}
            type="button"
          >
            <Icon name="book" size={18} />
          </button>
          <button
            aria-label="Crear nueva rutina"
            className="icon-button icon-button--bordered"
            onClick={() => onOpenRoutineEditor()}
            type="button"
          >
            <Icon name="plus" size={18} />
          </button>
          <button
            aria-label="Historial de entrenamientos"
            className="icon-button icon-button--bordered"
            onClick={onOpenHistory}
            type="button"
          >
            <Icon name="clock" size={18} />
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
              const jsDayMap = index === 6 ? 0 : index + 1
              const status = getDayStatus(jsDayMap, date.iso)
              const isSelected = index === selectedDayIndex
              const ridMap = week[(jsDayMap as any)]
              const rutinaMap = routines.find((r) => r.id === ridMap)
              return (
                <button
                  aria-label={`${date.fullName}, ${date.day} de ${date.month}. ${
                    rutinaMap ? rutinaMap.name : "Descanso"
                  }. ${STATUS_LABELS[status]}`}
                  aria-pressed={isSelected}
                  className={`workouts-day workouts-day--${status} ${
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
                <h2 id="workouts-day-plan-title">Rutina del día</h2>
              </div>
            </div>

            <div className="workouts-routine-list">
              {hayRutina ? (
                <article
                  className={`workouts-routine workouts-routine--${dayStatus}`}
                >
                  <header className="workouts-routine__header">
                    <span className="workouts-routine__icon">
                      <Icon
                        name={STATUS_ICONS[dayStatus] || "play"}
                        size={18}
                      />
                    </span>
                    <div className="workouts-routine__title">
                      <span className="workouts-routine__status">
                        {STATUS_LABELS[dayStatus]}
                      </span>
                      <h3>{rutinaDelDia.name}</h3>
                      <small>
                        {exCount(rutinaDelDia.ex?.length || 0)} ·{" "}
                        <Icon
                          name={routineIcon(rutinaDelDia.emoji)}
                          size={14}
                        />
                      </small>
                    </div>
                  </header>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      marginTop: "1rem",
                    }}
                  >
                    <Button
                      icon="edit"
                      onClick={() =>
                        rutinaDelDia && onOpenRoutineEditor(rutinaDelDia.id)
                      }
                    >
                      Editar rutina
                    </Button>
                    <Button
                      variant="ghost"
                      icon="refresh"
                      onClick={() => handleAssignRoutine(jsDay)}
                    >
                      Cambiar rutina
                    </Button>
                    <Button
                      variant="danger"
                      icon="trash"
                      onClick={() => handleClearDay(jsDay)}
                    >
                      Limpiar día
                    </Button>
                  </div>
                </article>
              ) : (
                <article className="workouts-routine workouts-routine--rest">
                  <header className="workouts-routine__header">
                    <span className="workouts-routine__icon">
                      <Icon name="moon" size={18} />
                    </span>
                    <div className="workouts-routine__title">
                      <span className="workouts-routine__status">Descanso</span>
                      <h3>Día de descanso</h3>
                      <small>No hay rutina asignada</small>
                    </div>
                  </header>
                  <div style={{ marginTop: "1rem" }}>
                    <Button
                      icon="plus"
                      onClick={() => handleAssignRoutine(jsDay)}
                    >
                      Asignar rutina
                    </Button>
                  </div>
                </article>
              )}
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
                <h2 id="workouts-program-title">Tu semana de entrenamiento</h2>
                <p>
                  {trainingRoutinesCount}{" "}
                  {trainingRoutinesCount === 1
                    ? "sesión programada"
                    : "sesiones programadas"}{" "}
                  · {completedCount} completadas
                </p>
              </div>
            </div>

            <div className="workouts-program__grid">
              {[1, 2, 3, 4, 5, 6, 0].map((jsDayNum, index) => {
                const date = selectedWeek.days[index] ?? selectedWeek.days[0]!
                const status = getDayStatus(jsDayNum, date.iso)
                const rid = week[(jsDayNum as any)]
                const rutina = routines.find((r) => r.id === rid)
                return (
                  <article
                    className={`workouts-program-day workouts-program-day--${status}`}
                    key={`day-${jsDayNum}`}
                  >
                    <button
                      aria-label={`Ver rutinas del ${date.fullName} ${date.day}: ${
                        rutina ? rutina.name : "Descanso"
                      }`}
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
                        <strong>{rutina ? rutina.name : "Descanso"}</strong>
                        <small>{STATUS_LABELS[status]}</small>
                      </span>
                      <Icon name="chevron-right" size={16} />
                    </button>
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
              {hayRutina ? "PRÓXIMO BLOQUE" : "RECUPERACIÓN"}
            </span>
            <h2 id="workouts-start-title">
              {rutinaDelDia ? rutinaDelDia.name : "Día de descanso"}
            </h2>
            <p>
              {hayRutina
                ? `${rutinaDelDia.ex?.length || 0} ejercicios · Plan personalizado`
                : "Hoy toca descansar y recuperarse"}
            </p>
          </div>
          <Button
            className="workouts-start-button"
            disabled={!hayRutina}
            fullWidth
            icon="play"
            onClick={handleStartWorkout}
          >
            {hayRutina ? "Iniciar rutina" : "Día de descanso"}
          </Button>
        </section>
      </div>
    </main>
  )
}
