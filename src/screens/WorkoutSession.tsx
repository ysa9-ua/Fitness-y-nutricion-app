import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Icon, { type IconName } from "../components/Icon"
import { Button } from "../components/UI"
import {
  abandonarSesion,
  aISO,
  entrenamientoDisponible,
  finalizarSesion,
  guardarSerie,
  iniciarSesion,
  sesionEnCurso,
  type SesionEntrenamiento,
} from "../lib/training"
import { sesionDesdeRutina } from "../lib/routineSession"
import { useTrainingPlanStore } from "../store/trainingPlanStore"

type WorkoutSessionScreenProps = {
  onExit: () => void
  onFinish: () => void
  rutinaId?: string | null
  rutinaNombre?: string
}

type SessionExercise = {
  id: string
  name: string
  muscle: string
  icon: IconName
  sets: number
  reps: number
  kg: number
  rest: number
  record: number
  cue: string
}

type SetEntry = {
  id: string
  kg: number
  reps: number
  done: boolean
}

type Notice = {
  tone: "set" | "exercise" | "rest"
  text: string
}

const ICONOS_ENTRENO: readonly string[] = [
  "dumbbell",
  "activity",
  "target",
  "chart",
  "flame",
  "heart",
  "weight",
  "footprints",
  "timer",
]

function iconoValido(valor: string): IconName {
  return ICONOS_ENTRENO.includes(valor) ? valor as IconName : "dumbbell"
}

// ---------------------------------------------------------------------------
// Sesion de ejemplo, sin backend: la rutina que antes era mock.
// ---------------------------------------------------------------------------

const DEMO_ROUTINE_NAME = "Tren superior A"

const DEMO_ROUTINE: SessionExercise[] = [
  {
    id: "press-banca",
    name: "Press banca",
    muscle: "Pecto mayor",
    icon: "dumbbell",
    sets: 4,
    reps: 8,
    kg: 45,
    rest: 120,
    record: 47.5,
    cue: "Baja la barra al pecho con los codos a 45 grados y los pies bien apoyados.",
  },
  {
    id: "press-inclinado",
    name: "Press inclinado mancuernas",
    muscle: "Pecto superior",
    icon: "dumbbell",
    sets: 3,
    reps: 10,
    kg: 22,
    rest: 90,
    record: 24,
    cue: "Banco a 30 grados, juntura escápula firme y ascenso controlado en dos segundos.",
  },
  {
    id: "aperturas",
    name: "Aperturas en polea",
    muscle: "Pectoral lateral",
    icon: "activity",
    sets: 3,
    reps: 12,
    kg: 12,
    rest: 75,
    record: 14,
    cue: "Codo ligeramente flexionado y estira sin perder la tensión del pectoral.",
  },
  {
    id: "fondos",
    name: "Fondos en paralelas",
    muscle: "Tríceps",
    icon: "target",
    sets: 3,
    reps: 12,
    kg: 0,
    rest: 90,
    record: 0,
    cue: "Hombros lejos de las orejas, torso vertical y pausa al final del recorrido.",
  },
  {
    id: "remo-pendlay",
    name: "Remo Pendlay",
    muscle: "Espalda y bíceps",
    icon: "chart",
    sets: 3,
    reps: 10,
    kg: 40,
    rest: 90,
    record: 42.5,
    cue: "Tirón explosivo hasta el abdomen y descenso lento hasta estirar del todo.",
  },
]

function ejercicioDemo(ejercicio: SessionExercise, orden: number) {
  return {
    id: `demo-ej-${orden}`,
    nombre: ejercicio.name,
    musculo: ejercicio.muscle,
    icono: ejercicio.icon as string,
    seriesPlanificadas: ejercicio.sets,
    repsPlanificadas: ejercicio.reps,
    cargaSugeridaKg: ejercicio.kg,
    descansoSeg: ejercicio.rest,
    recordPrevioKg: ejercicio.record,
    consejo: ejercicio.cue,
    orden,
    series: Array.from({ length: ejercicio.sets }, (_, indice) => ({
      id: `demo-serie-${orden}-${indice}`,
      numero: indice + 1,
      kg: ejercicio.kg,
      reps: ejercicio.reps,
      completada: false,
    })),
  }
}

function sesionDemo(nombre?: string): SesionEntrenamiento {
  return {
    id: "demo",
    rutinaId: null,
    nombre: nombre || DEMO_ROUTINE_NAME,
    fecha: aISO(new Date()),
    iniciadaAt: new Date().toISOString(),
    finalizadaAt: null,
    duracionSeg: 0,
    seriesTotales: DEMO_ROUTINE.reduce((total, item) => total + item.sets, 0),
    seriesCompletadas: 0,
    volumenTotalKg: 0,
    nuevosRecords: 0,
    kcalEstimadas: 0,
    estado: "en_curso",
    ejercicios: DEMO_ROUTINE.map(ejercicioDemo),
  }
}

// ---------------------------------------------------------------------------
// Adaptacion servidor -> pantalla
// ---------------------------------------------------------------------------

function aEjercicios(sesion: SesionEntrenamiento): SessionExercise[] {
  return sesion.ejercicios.map((ejercicio) => ({
    id: ejercicio.id,
    name: ejercicio.nombre,
    muscle: ejercicio.musculo,
    icon: iconoValido(ejercicio.icono),
    sets: ejercicio.seriesPlanificadas || ejercicio.series.length,
    reps: ejercicio.repsPlanificadas,
    kg: ejercicio.cargaSugeridaKg,
    rest: ejercicio.descansoSeg,
    record: ejercicio.recordPrevioKg,
    cue: ejercicio.consejo || "Técnica controlada en cada repetición.",
  }))
}

function aLogs(sesion: SesionEntrenamiento): Record<string, SetEntry[]> {
  const logs: Record<string, SetEntry[]> = {}
  for (const ejercicio of sesion.ejercicios) {
    logs[ejercicio.id] = ejercicio.series.map((serie) => ({
      id: serie.id,
      kg: serie.kg,
      reps: serie.reps,
      done: serie.completada,
    }))
  }
  return logs
}

const formatClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

const isExerciseDone = (sets: SetEntry[]) =>
  sets.length > 0 && sets.every((set) => set.done)

export default function WorkoutSessionScreen({
  onExit,
  onFinish,
  rutinaId = null,
  rutinaNombre,
}: WorkoutSessionScreenProps) {
  const [sesion, setSesion] = useState<SesionEntrenamiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, SetEntry[]>>({})
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [rest, setRest] = useState({ remaining: 0, total: 0 })
  const [isResting, setIsResting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const restPanelRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const logsRef = useRef<Record<string, SetEntry[]>>({})

  // Resuelve de que sesion se trata: la que hay abierta o una nueva.
  useEffect(() => {
    let vivo = true
    void (async () => {
      if (!entrenamientoDisponible()) {
        // Sin backend se entrena con la rutina del plan local (la que se edita
        // en el shell). Si no hay rutina, se cae a la sesión de ejemplo.
        const rutina = rutinaId
          ? useTrainingPlanStore
              .getState()
              .S.routines.find((r) => r.id === rutinaId)
          : undefined
        const local =
          rutina && rutina.ex.length
            ? sesionDesdeRutina(rutina, rutinaNombre)
            : null
        const demo = local ?? sesionDemo(rutinaNombre)
        if (!vivo) return
        setSesion(demo)
        setLogs(aLogs(demo))
        setCargando(false)
        return
      }
      const existente = await sesionEnCurso()
      if (!vivo) return
      if (existente && (!rutinaId || existente.rutinaId === rutinaId)) {
        setSesion(existente)
        setLogs(aLogs(existente))
        setElapsed(
          existente.iniciadaAt
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(existente.iniciadaAt).getTime()) /
                    1000,
                ),
              )
            : 0,
        )
        setCargando(false)
        return
      }
      if (rutinaId) {
        if (existente) await abandonarSesion(existente.id)
        const nueva = await iniciarSesion(rutinaId, rutinaNombre)
        if (!vivo) return
        if (nueva) {
          setSesion(nueva)
          setLogs(aLogs(nueva))
        } else {
          setAviso("No se ha podido abrir la sesión. Inténtalo de nuevo.")
        }
        setCargando(false)
        return
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [rutinaId, rutinaNombre])

  const exercises = useMemo(() => (sesion ? aEjercicios(sesion) : []), [sesion])
  const totalSeries = useMemo(
    () => exercises.reduce((total, item) => total + item.sets, 0),
    [exercises],
  )
  const current = exercises[index]

  // Reloj de sesión: se detiene al pausar y limpia su intervalo al desmontar.
  useEffect(() => {
    if (isPaused || !sesion) return
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [isPaused, sesion])

  // Cuenta atrás de descanso.
  useEffect(() => {
    if (!isResting) return
    const timer = window.setInterval(() => {
      setRest((currentRest) => ({
        ...currentRest,
        remaining: Math.max(0, currentRest.remaining - 1),
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isResting])

  // Al agotarse el descanso se cierra el panel y se avisa al usuario.
  useEffect(() => {
    if (!isResting || rest.remaining > 0) return
    setIsResting(false)
    setNotice({
      tone: "rest",
      text: "Descanso completo. Nos queda la siguiente serie.",
    })
  }, [isResting, rest.remaining])

  // Los avisos temporales se autolimpian para no dejar paneles obsoletos.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (isResting) restPanelRef.current?.focus()
  }, [isResting])

  useEffect(() => {
    if (showSummary) summaryRef.current?.focus()
  }, [showSummary])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  const stats = useMemo(() => {
    let doneSets = 0
    let volume = 0
    let records = 0

    for (const exercise of exercises) {
      const sets = logs[exercise.id] ?? []
      const bestKg = sets.reduce(
        (max, set) => (set.done && set.kg > max ? set.kg : max),
        0,
      )
      if (exercise.record > 0 && bestKg > exercise.record) records += 1
      for (const set of sets) {
        if (!set.done) continue
        doneSets += 1
        volume += set.kg * set.reps
      }
    }

    return {
      doneSets,
      volume,
      records,
      calories: Math.round((elapsed / 60) * 7.4),
    }
  }, [elapsed, exercises, logs])

  const routineProgress =
    totalSeries > 0 ? Math.round((stats.doneSets / totalSeries) * 100) : 0
  const restProgress =
    rest.total > 0 ? ((rest.total - rest.remaining) / rest.total) * 100 : 0

  const startRest = (seconds: number) => {
    if (seconds <= 0) return
    setRest({ remaining: seconds, total: seconds })
    setIsResting(true)
  }

  const goToExercise = (position: number) => {
    if (position < 0 || position >= exercises.length) return
    setIndex(position)
    setIsResting(false)
    setNotice(null)
  }

  const actualizarSerie = useCallback(
    (exerciseId: string, setIndex: number, patch: Partial<SetEntry>) => {
      setLogs((currentLogs) => {
        const sets = currentLogs[exerciseId] ?? []
        return {
          ...currentLogs,
          [exerciseId]: sets.map((set, position) =>
            position === setIndex ? { ...set, ...patch } : set,
          ),
        }
      })
    },
    [],
  )

  const persistirSerie = (entry: SetEntry) => {
    if (!entrenamientoDisponible() || sesion?.id === "demo") return
    void guardarSerie({
      id: entry.id,
      kg: entry.kg,
      reps: entry.reps,
      completada: entry.done,
    })
  }

  const persistirPorIndice = (exerciseId: string, setIndex: number) => {
    const entry = (logsRef.current[exerciseId] ?? [])[setIndex]
    if (entry) persistirSerie(entry)
  }

  const handleToggleSet = (setIndex: number) => {
    if (!current) return
    const sets = logs[current.id] ?? []
    const target = sets[setIndex]
    if (!target) return

    const nextSets = sets.map((set, position) =>
      position === setIndex ? { ...set, done: !set.done } : set,
    )
    setLogs((currentLogs) => ({ ...currentLogs, [current.id]: nextSets }))
    persistirSerie({ ...target, done: !target.done })

    if (target.done) {
      setIsResting(false)
      setNotice(null)
      return
    }

    if (isExerciseDone(nextSets)) {
      setIsResting(false)
      setNotice({
        tone: "exercise",
        text: `${current.name} completado. Buen trabajo.`,
      })
      if (index === exercises.length - 1) setShowSummary(true)
      return
    }

    setNotice({
      tone: "set",
      text: `Serie ${setIndex + 1} de ${current.name} completada.`,
    })
    startRest(current.rest)
  }

  // En local/demo no hay backend: el entreno se guarda en el estado de FORMA
  // (`gym_state_v1`) con la misma forma que usa, para que Progreso y el
  // historial lo reflejen en la app principal.
  const persistirLocal = () => {
    if (!sesion || sesion.id !== "demo" || entrenamientoDisponible()) return
    const store = useTrainingPlanStore.getState()
    const peso = store.S.bodyweight?.length
      ? store.S.bodyweight[store.S.bodyweight.length - 1].w
      : 0
    let volumen = 0
    const entries = sesion.ejercicios.map((ejercicio) => {
      const series = (logsRef.current[ejercicio.id] ?? [])
        .filter((serie) => serie.done)
        .map((serie) => {
          volumen += (serie.kg || 0) * (serie.reps || 0)
          return { w: serie.kg || 0, r: serie.reps || 0, done: true }
        })
      const topW = series.reduce((max, serie) => Math.max(max, serie.w || 0), 0)
      return { id: ejercicio.id, n: ejercicio.nombre, sets: series, topW }
    })
    const workout = {
      id: `local-${Date.now().toString(36)}`,
      d: aISO(new Date()),
      start: Date.now() - elapsed * 1000,
      end: Date.now(),
      routineId: rutinaId ?? undefined,
      name: sesion.nombre,
      bw: peso,
      cur: sesion.ejercicios.length,
      entries,
      vol: volumen,
      prs: [],
    }
    store.update((estado) => {
      estado.workouts = [...(estado.workouts || []), workout]
    })
  }

  const cerrarSesion = async () => {
    if (guardando) return
    if (sesion && sesion.id !== "demo") {
      setGuardando(true)
      await finalizarSesion(sesion.id, elapsed)
      setGuardando(false)
    } else {
      persistirLocal()
    }
    onFinish()
  }

  if (cargando) {
    return (
      <main className="workout-session-screen screen-stack">
        <header className="session-header">
          <button
            aria-label="Salir del entrenamiento"
            className="icon-button"
            onClick={onExit}
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
          <div className="session-header__copy">
            <span className="eyebrow">PREPARANDO SESIÓN</span>
            <strong>{rutinaNombre || "Entrenamiento"}</strong>
          </div>
        </header>
        <div className="screen-body session-body">
          <p className="session-notice session-notice--rest" role="status">
            <Icon name="timer" size={15} /> Cargando tu sesión…
          </p>
        </div>
      </main>
    )
  }

  if (!sesion || exercises.length === 0) {
    return (
      <main className="workout-session-screen screen-stack">
        <header className="session-header">
          <button
            aria-label="Salir del entrenamiento"
            className="icon-button"
            onClick={onExit}
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
          <div className="session-header__copy">
            <span className="eyebrow">SIN SESIÓN</span>
            <strong>Entrenamiento</strong>
          </div>
        </header>
        <div className="screen-body session-body">
          <p className="session-notice session-notice--rest" role="status">
            <Icon name="info" size={15} />{" "}
            {aviso ?? "Elige una rutina del plan para empezar."}
          </p>
        </div>
        <footer className="session-footer">
          <Button fullWidth icon="arrow-left" onClick={onExit}>
            Volver al plan
          </Button>
        </footer>
      </main>
    )
  }

  if (showSummary) {
    return (
      <main className="workout-session-screen session-summary screen-stack">
        <header className="session-header">
          <span
            className="icon-button icon-button--bordered"
            aria-hidden="true"
          >
            <Icon name="sparkles" size={19} />
          </span>
          <div className="session-header__copy">
            <span className="eyebrow">SESIÓN COMPLETADA</span>
            <strong>{sesion.nombre}</strong>
          </div>
        </header>

        <div className="screen-body session-summary__body">
          <section className="session-summary__hero">
            <span className="success-mark">
              <Icon name="check" size={22} />
            </span>
            <h2 ref={summaryRef} tabIndex={-1}>
              Rutina completada
            </h2>
            <p>
              Has entrenado {formatClock(elapsed)} y el algoritmo ya tiene en
              cuenta este esfuerzo.
            </p>
          </section>

          <section className="macro-summary session-summary__stats">
            <div className="macro-card macro-card--calories">
              <span>Volumen total</span>
              <strong>
                {Math.round(stats.volume).toLocaleString("es-ES")}{" "}
                <small>kg</small>
              </strong>
            </div>
            <div className="macro-card macro-card--protein">
              <span>Series</span>
              <strong>
                {stats.doneSets}
                <small>/{totalSeries}</small>
              </strong>
            </div>
            <div className="macro-card macro-card--carbs">
              <span>Duración</span>
              <strong>{formatClock(elapsed)}</strong>
            </div>
            <div className="macro-card macro-card--fat">
              <span>Estimadas</span>
              <strong>
                {stats.calories} <small>kcal</small>
              </strong>
            </div>
          </section>

          <section className="session-summary__list">
            <h3>Detalle por ejercicio</h3>
            <ul>
              {exercises.map((exercise) => {
                const sets = logs[exercise.id] ?? []
                const volume = sets.reduce(
                  (total, set) =>
                    set.done ? total + set.kg * set.reps : total,
                  0,
                )
                const bestKg = sets.reduce(
                  (max, set) => (set.kg > max ? set.kg : max),
                  0,
                )
                const isRecord = exercise.record > 0 && bestKg > exercise.record
                return (
                  <li className="session-summary__item" key={exercise.id}>
                    <span className="session-summary__icon">
                      <Icon name={exercise.icon} size={17} />
                    </span>
                    <div>
                      <strong>{exercise.name}</strong>
                      <small>
                        {sets.filter((set) => set.done).length}/{exercise.sets}{" "}
                        series · {Math.round(volume)} kg de volumen
                      </small>
                    </div>
                    {isRecord ? (
                      <span className="session-summary__record">RECORD</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>

          {stats.records > 0 ? (
            <p className="success-note">
              <Icon name="sparkles" size={15} /> {stats.records}{" "}
              {stats.records === 1 ? "marca nueva" : "marcas nuevas"} esta
              semana.
            </p>
          ) : null}
        </div>

        <footer className="screen-footer session-summary__footer">
          <Button
            disabled={guardando}
            fullWidth
            icon="check"
            onClick={() => void cerrarSesion()}
          >
            {guardando ? "Guardando…" : "Guardar sesión"}
          </Button>
          <Button
            fullWidth
            onClick={() => setShowSummary(false)}
            variant="ghost"
          >
            Revisar mis series
          </Button>
        </footer>
      </main>
    )
  }

  if (!current) return null

  const currentSets = logs[current.id] ?? []
  return (
    <main className="workout-session-screen screen-stack">
      <header className="session-header">
        <button
          aria-label="Salir del entrenamiento"
          className="icon-button"
          onClick={onExit}
          type="button"
        >
          <Icon name="close" size={19} />
        </button>
        <div className="session-header__copy">
          <span className="eyebrow">SESIÓN EN CURSO</span>
          <strong>{sesion.nombre}</strong>
        </div>
        <div className="session-header__meta">
          <span className="session-clock">
            <Icon name="timer" size={14} /> {formatClock(elapsed)}
          </span>
          <button
            aria-label={isPaused ? "Reanudar sesión" : "Pausar sesión"}
            aria-pressed={isPaused}
            className="icon-button icon-button--bordered"
            onClick={() => setIsPaused((value) => !value)}
            type="button"
          >
            <Icon name={isPaused ? "play" : "pause"} size={17} />
          </button>
        </div>
      </header>

      <div className="session-progress">
        <div className="session-progress__bar" aria-hidden="true">
          <i style={{ width: `${routineProgress}%` }} />
        </div>
        <p>
          <span>
            Ejercicio {index + 1} de {exercises.length}
          </span>
          <span>
            {stats.doneSets}/{totalSeries} series
          </span>
        </p>
      </div>

      <ol className="session-rail" aria-label="Ejercicios de la rutina">
        {exercises.map((exercise, position) => {
          const state = isExerciseDone(logs[exercise.id] ?? [])
            ? "done"
            : position === index
              ? "active"
              : "pending"
          return (
            <li key={exercise.id}>
              <button
                aria-current={position === index ? "step" : undefined}
                className={`session-rail__item is-${state}`}
                onClick={() => goToExercise(position)}
                type="button"
              >
                <span>
                  {state === "done" ? (
                    <Icon name="check" size={12} />
                  ) : (
                    position + 1
                  )}
                </span>
                <small>{exercise.name}</small>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="screen-body session-body">
        {current ? (
          <section className="exercise-card">
            <div className="exercise-card__head">
              <div>
                <span className="eyebrow">{current.muscle}</span>
                <h2>{current.name}</h2>
              </div>
              <span className="exercise-card__scheme">
                {current.sets} × {current.reps}
              </span>
            </div>

            <figure className="session-figure">
              <div className="session-figure__stage" aria-hidden="true">
                <span className="session-figure__grid" />
                <Icon name={current.icon} size={46} />
                <span className="session-figure__tag">
                  {current.rest}s de descanso
                </span>
              </div>
              <figcaption>{current.cue}</figcaption>
            </figure>

            <div className="exercise-card__meta">
              <span>
                <Icon name="weight" size={14} /> Carga sugerida {current.kg} kg
              </span>
              {current.record > 0 ? (
                <span>
                  <Icon name="target" size={14} /> Marca previa {current.record}{" "}
                  kg
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="set-section">
          <div className="set-section__head">
            <strong>Registra tus series</strong>
            <small>Los datos quedan guardados en tu historial</small>
          </div>
          <ol className="set-list">
            {currentSets.map((set, setIndex) => (
              <li
                className={`set-row ${set.done ? "is-done" : ""}`}
                key={set.id || setIndex}
              >
                <span className="set-row__index">{setIndex + 1}</span>
                <label className="set-row__field">
                  <span className="sr-only">
                    Peso de la serie {setIndex + 1} en kilos
                  </span>
                  <input
                    inputMode="decimal"
                    min={0}
                    onBlur={() => persistirPorIndice(current.id, setIndex)}
                    onChange={(event) =>
                      actualizarSerie(current.id, setIndex, {
                        kg: Number(event.target.value),
                      })
                    }
                    step={0.5}
                    type="number"
                    value={set.kg}
                  />
                  <small>kg</small>
                </label>
                <label className="set-row__field">
                  <span className="sr-only">
                    Repeticiones de la serie {setIndex + 1}
                  </span>
                  <input
                    inputMode="numeric"
                    min={0}
                    onBlur={() => persistirPorIndice(current.id, setIndex)}
                    onChange={(event) =>
                      actualizarSerie(current.id, setIndex, {
                        reps: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={set.reps}
                  />
                  <small>reps</small>
                </label>
                <label className={`set-check ${set.done ? "is-checked" : ""}`}>
                  <input
                    checked={set.done}
                    onChange={() => handleToggleSet(setIndex)}
                    type="checkbox"
                  />
                  <span>
                    <Icon name="check" size={12} />
                  </span>
                  <i className="sr-only">
                    Marcar serie {setIndex + 1} como completada
                  </i>
                </label>
              </li>
            ))}
          </ol>
        </section>

        {notice ? (
          <p
            className={`session-notice session-notice--${notice.tone}`}
            role="status"
          >
            <Icon name={notice.tone === "rest" ? "bell" : "check"} size={15} />{" "}
            {notice.text}
          </p>
        ) : null}
      </div>

      <footer className="session-footer">
        <Button
          disabled={index === 0}
          icon="arrow-left"
          onClick={() => goToExercise(index - 1)}
          variant="secondary"
        >
          Anterior
        </Button>
        <Button
          icon={index === exercises.length - 1 ? "check" : "arrow-right"}
          onClick={() => {
            if (index === exercises.length - 1) setShowSummary(true)
            else goToExercise(index + 1)
          }}
        >
          {index === exercises.length - 1 ? "Ver resumen" : "Siguiente"}
        </Button>
      </footer>

      {isResting && current ? (
        <div className="session-rest">
          <div
            aria-label="Descanso activo"
            className="session-rest__panel"
            ref={restPanelRef}
            role="dialog"
            tabIndex={-1}
          >
            <span className="eyebrow">DESCANSO</span>
            <p className="session-rest__count">{formatClock(rest.remaining)}</p>
            <p className="sr-only" aria-live="polite">
              Quedan {rest.remaining} segundos de descanso.
            </p>
            <div className="session-rest__bar" aria-hidden="true">
              <i style={{ width: `${restProgress}%` }} />
            </div>
            <p className="session-rest__next">
              Próxima: serie{" "}
              {currentSets.findIndex((set) => !set.done) + 1 ||
                currentSets.length}{" "}
              de {current.name}
            </p>
            <div className="session-rest__actions">
              <Button
                onClick={() =>
                  setRest((value) => ({
                    ...value,
                    remaining: value.remaining + 30,
                    total: value.total + 30,
                  }))
                }
                variant="secondary"
              >
                +30 s
              </Button>
              <Button onClick={() => setIsResting(false)}>Saltar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
