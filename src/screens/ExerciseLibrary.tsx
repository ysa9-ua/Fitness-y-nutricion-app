import { useMemo, useState } from "react"
import { useTrainingPlanStore } from "../store/trainingPlanStore"
import Icon from "../components/Icon"
import { Button } from "../components/UI"
import {
  EXDB,
  allExercises,
  equipmentOf,
  imgSrc,
} from "../training/lib/exercises.js"
import { t } from "../training/lib/i18n.js"
import type { RoutineExerciseConfig } from "../types/trainingPlan"
import { defaultConfig, modeOf } from "../training/lib/history.js"
import {
  MUSCLE_ZONES,
  matchZone,
  musclesOf,
  type MuscleZoneId,
} from "../lib/muscles"
import BodyMap from "../components/BodyMap"

type Props = {
  routineId?: string | null
  onBack: () => void
  onPicked: () => void
}

function Thumb({ ex }: { ex: any }) {
  if (!ex.img) {
    return (
      <div className="tp-thumb tp-thumb--empty">
        <Icon name="dumbbell" size={18} />
      </div>
    )
  }
  return (
    <img
      className="tp-thumb"
      loading="lazy"
      decoding="async"
      src={imgSrc(ex)}
      alt=""
    />
  )
}

export default function ExerciseLibrary({
  routineId,
  onBack,
  onPicked,
}: Props) {
  const { S, update } = useTrainingPlanStore()

  const [q, setQ] = useState("")
  const [zone, setZone] = useState<MuscleZoneId | null>(null)
  const [eq, setEq] = useState("")
  const [shown, setShown] = useState(40)

  const ql = q.toLowerCase().trim()
  const all = useMemo(() => allExercises(S as any) as any[], [S])

  // Búsqueda por texto (igual que antes) sobre todo el catálogo.
  const searched = useMemo(
    () =>
      all.filter(
        (e: any) =>
          !ql ||
          e.n.toLowerCase().includes(ql) ||
          e.tg?.includes(ql) ||
          e.eq?.includes(ql) ||
          (e.desc || "").toLowerCase().includes(ql),
      ),
    [all, ql],
  )

  // Cuántos ejercicios hay en cada grupo muscular (principales + involucrados).
  const counts = useMemo(() => {
    const out: Partial<Record<MuscleZoneId, number>> = {}
    for (const ex of searched) {
      const m = musclesOf(ex)
      if (m.primary) out[m.primary] = (out[m.primary] ?? 0) + 1
      for (const z of m.involved) out[z] = (out[z] ?? 0) + 1
    }
    return out
  }, [searched])

  // Filtro por grupo muscular: principales primero, luego los que solo lo
  // activan como secundario.
  const inZone = useMemo(() => {
    if (!zone) return searched
    const cache = new Map<any, ReturnType<typeof musclesOf>>()
    return searched
      .filter((e: any) => matchZone(e, zone, cache))
      .sort((a: any, b: any) => {
        const ma = matchZone(a, zone, cache)
        const mb = matchZone(b, zone, cache)
        if (ma === mb) return 0
        return ma === "primary" ? -1 : 1
      })
  }, [searched, zone])

  const eqOpts = equipmentOf(inZone)
  const eqOn = eqOpts.includes(eq) ? eq : ""
  const f = eqOn ? inZone.filter((e: any) => e.eq === eqOn) : inZone

  const primaryCount = zone
    ? inZone.filter((e: any) => matchZone(e, zone) === "primary").length
    : 0
  const involvedCount = zone ? inZone.length - primaryCount : 0

  const handleAddExercise = (ex: any) => {
    if (!routineId) {
      onBack()
      return
    }
    const mode = modeOf(ex)
    const cfg = defaultConfig(ex.id, mode) as RoutineExerciseConfig
    const config: RoutineExerciseConfig = {
      id: ex.id,
      sets: cfg.sets,
      reps: cfg.reps,
      weight: cfg.weight || 0,
      mode: cfg.mode,
      sec: (cfg as any).sec,
      min: (cfg as any).min,
      speed: (cfg as any).speed,
    }
    update((s) => {
      const r = s.routines.find((rt) => rt.id === routineId)
      if (r) {
        r.ex.push(config)
      }
    })
    onPicked()
  }

  return (
    <main
      className="screen-stack"
      style={{ width: "100%", maxWidth: "640px", margin: "0 auto" }}
    >
      <header
        style={{
          flexShrink: 0,
          padding: "1.5rem 1rem 0",
          marginBottom: "1.25rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--app-text)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <Icon name="arrow-left" size={18} />
          Volver
        </button>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", margin: 0 }}>
          Biblioteca de ejercicios
        </h1>
        <p style={{ color: "var(--app-muted)", marginTop: "0.25rem" }}>
          {EXDB.length} ejercicios
        </p>
      </header>

      <div className="screen-body" style={{ padding: "0 1rem 6rem" }}>
        <div className="tp-search">
          <Icon name="search" size={18} />
          <input
            placeholder={t("Search…")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setShown(40)
            }}
          />
        </div>

        <BodyMap
          value={zone}
          onChange={(next) => {
            setZone(next)
            setEq("")
            setShown(40)
          }}
          counts={counts}
        />

        {zone ? (
          <p className="bodymap__summary">
            <strong>
              {MUSCLE_ZONES.find((z) => z.id === zone)?.label}: {primaryCount}{" "}
              principales
            </strong>
            <span>
              y {involvedCount} en los que ese grupo también interviene.
            </span>
          </p>
        ) : null}

        {eqOpts.length > 1 && (
          <div className="tp-chips">
            <button
              className={`tp-chip${!eqOn ? " is-on" : ""}`}
              onClick={() => {
                setEq("")
                setShown(40)
              }}
            >
              {t("Any equipment")}
            </button>
            {eqOpts.map((x: string) => (
              <button
                key={x}
                className={`tp-chip${eqOn === x ? " is-on" : ""}`}
                onClick={() => {
                  setEq(x)
                  setShown(40)
                }}
              >
                {t(x)}
              </button>
            ))}
          </div>
        )}

        <div className="workouts-routine-list">
          {f.slice(0, shown).map((e: any) => {
            const kind = zone ? matchZone(e, zone) : null
            return (
              <div
                key={e.id}
                className="workouts-routine"
                style={{ cursor: "pointer" }}
                onClick={() => handleAddExercise(e)}
              >
                <Thumb ex={e} />
                <div
                  className="workouts-routine__title"
                  style={{ marginLeft: "0.75rem" }}
                >
                  <h3 style={{ textTransform: "capitalize" }}>{e.n}</h3>
                  <small>
                    {t(e.tg || e.bp)} · {t(e.eq)}
                  </small>
                  {kind ? (
                    <span className={`bodymap__tag bodymap__tag--${kind}`}>
                      {kind === "primary"
                        ? "Músculo principal"
                        : "También interviene"}
                    </span>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    handleAddExercise(e)
                  }}
                >
                  Añadir
                </Button>
              </div>
            )
          })}
          {f.length === 0 && (
            <div
              className="empty-state"
              style={{
                textAlign: "center",
                padding: "2rem",
                color: "var(--app-muted)",
              }}
            >
              <Icon
                name="search"
                size={40}
                style={{ opacity: 0.5, marginBottom: "0.75rem" }}
              />
              <p>No hay resultados</p>
            </div>
          )}
        </div>

        {f.length > shown && (
          <div style={{ marginTop: "1rem" }}>
            <Button onClick={() => setShown((s) => s + 40)}>Mostrar más</Button>
          </div>
        )}
      </div>
    </main>
  )
}
