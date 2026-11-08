import { useEffect, useMemo, useState } from "react"
import { useTrainingPlanStore } from "../store/trainingPlanStore"
import Icon from "../components/Icon"
import { Button } from "../components/UI"
import type { Routine, RoutineExerciseConfig } from "../types/trainingPlan"
import { DEFAULT_GLYPH } from "../training/lib/glyphs.js"
import { exCount } from "../training/lib/format.js"
import { routineIcon, GLYPH_CHOICES } from "../lib/trainingGlyphs"
import { exOr } from "../training/lib/exercises.js"
import { exLine, modeOf, defaultConfig } from "../training/lib/history.js"

type Props = {
  routineId?: string | null
  onBack: () => void
  onOpenExercises: (routineId: string) => void
  onDeleted: () => void
}

export default function RoutineEditor({
  routineId,
  onBack,
  onOpenExercises,
  onDeleted,
}: Props) {
  const { S, update } = useTrainingPlanStore()
  const isNew = !routineId
  const activeId = useMemo(() => {
    if (!routineId) {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    }
    return routineId
  }, [routineId])

  const routine = S.routines.find(
    (r) => r.id === activeId,
  ) as Routine | undefined

  const [showGlyphPicker, setShowGlyphPicker] = useState(false)

  useEffect(() => {
    if (!isNew || routine) return
    const newRoutine: Routine = {
      id: activeId,
      name: "Nueva rutina",
      emoji: DEFAULT_GLYPH,
      ex: [],
    }
    update((s) => {
      if (!s.routines.find((r) => r.id === activeId)) {
        s.routines.push(newRoutine)
      }
    })
  }, [isNew, routine, activeId])

  const setNameImmediate = (value: string) => {
    if (!routine) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (r) r.name = value
    })
  }

  const commitName = () => {
    if (!routine) return
    if (routine.name.trim()) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (r) r.name = "Rutina"
    })
  }

  const handleDelete = () => {
    if (!routine) return
    if (!confirm(`¿Eliminar la rutina "${routine.name}"?`)) return
    update((s) => {
      s.routines = s.routines.filter((x) => x.id !== routine.id)
      Object.keys(s.week).forEach((k) => {
        if ((s.week as any)[k] === routine.id) delete (s.week as any)[k]
      })
    })
    onDeleted()
  }

  // Al salir de una rutina recién creada y aún vacía no tiene sentido dejarla
  // en la lista: se descarta para no acumular borradores.
  const handleBack = () => {
    if (
      routine &&
      isNew &&
      routine.ex.length === 0 &&
      routine.name === "Nueva rutina"
    ) {
      update((s) => {
        s.routines = s.routines.filter((x) => x.id !== routine.id)
      })
    }
    onBack()
  }

  const setIcon = (glyph: string) => {
    if (!routine) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (r) r.emoji = glyph
    })
    setShowGlyphPicker(false)
  }

  const addExercise = () => {
    if (!routine) return
    onOpenExercises(routine.id)
  }

  const moveExercise = (index: number, dir: number) => {
    if (!routine) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (!r) return
      const ex = r.ex
      const j = index + dir
      if (j < 0 || j >= ex.length) return
      ;[ex[index], ex[j]] = [ex[j], ex[index]]
    })
  }

  const removeExercise = (index: number) => {
    if (!routine) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (r) r.ex.splice(index, 1)
    })
  }

  const updateConfig = (
    index: number,
    patch: Partial<RoutineExerciseConfig>,
  ) => {
    if (!routine) return
    update((s) => {
      const r = s.routines.find((x) => x.id === routine.id)
      if (!r) return
      r.ex[index] = { ...r.ex[index], ...patch }
    })
  }

  if (!routine) return null

  return (
    <main
      className="screen-stack"
      style={{ width: "100%", maxWidth: "640px", margin: "0 auto" }}
    >
      <header style={{ flexShrink: 0, padding: "1.5rem 1rem 0" }}>
        <button
          onClick={handleBack}
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
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <button
            className="icon-button icon-button--bordered"
            onClick={() => setShowGlyphPicker(true)}
            type="button"
            aria-label="Cambiar icono"
          >
            <Icon name={routineIcon(routine.emoji)} size={24} />
          </button>
          <input
            className="input"
            value={routine.name}
            onChange={(e) => setNameImmediate(e.target.value)}
            onBlur={commitName}
            style={{
              flex: 1,
              fontSize: "1.25rem",
              fontWeight: "600",
              background: "var(--app-surface)",
              color: "var(--app-text)",
              border: "1px solid var(--app-border)",
              borderRadius: "10px",
              padding: "8px 10px",
            }}
            placeholder="Nombre de la rutina"
          />
        </div>
      </header>

      <section className="screen-body" style={{ padding: "0 1rem 6rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ fontSize: "1.125rem", margin: 0 }}>Ejercicios</h2>
          <span style={{ color: "var(--app-muted)", fontSize: "0.875rem" }}>
            {exCount(routine.ex?.length || 0)}
          </span>
        </div>

        {routine.ex.length === 0 ? (
          <div
            className="empty-state"
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "var(--app-muted)",
              background: "var(--app-surface)",
              borderRadius: "12px",
              border: "1px solid var(--app-border)",
            }}
          >
            <Icon
              name="dumbbell"
              size={40}
              style={{ opacity: 0.5, marginBottom: "0.75rem" }}
            />
            <p>No hay ejercicios aún</p>
          </div>
        ) : (
          <div className="workouts-routine-list">
            {routine.ex.map((ex, i) => {
              const exInfo = exOr(ex.id)
              const mode = modeOf(ex)
              return (
                <div
                  key={i}
                  className="workouts-routine"
                  style={{ cursor: "default" }}
                >
                  <header
                    className="workouts-routine__header"
                    style={{ alignItems: "flex-start" }}
                  >
                    <div
                      className="workouts-routine__title"
                      style={{ marginLeft: 0 }}
                    >
                      <h3 style={{ textTransform: "capitalize" }}>
                        {exInfo?.n || ex.id}
                      </h3>
                      <small>{exLine(ex, "kg")}</small>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.25rem",
                        flexDirection: "column",
                      }}
                    >
                      <button
                        className="icon-button"
                        onClick={() => moveExercise(i, -1)}
                        disabled={i === 0}
                        type="button"
                      >
                        <Icon
                          name="chevron-down"
                          size={16}
                          style={{ transform: "rotate(180deg)" }}
                        />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => moveExercise(i, 1)}
                        disabled={i === routine.ex.length - 1}
                        type="button"
                      >
                        <Icon name="chevron-down" size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => removeExercise(i)}
                        style={{ color: "var(--danger)" }}
                        type="button"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </header>
                  <div className="tp-fields">
                    <label className="tp-field">
                      <span>Series</span>
                      <input
                        type="number"
                        min={1}
                        value={ex.sets || defaultConfig(ex.id, mode).sets}
                        onChange={(ev) =>
                          updateConfig(i, {
                            sets: Number(ev.target.value) || 1,
                          })
                        }
                      />
                    </label>
                    {mode === "reps" && (
                      <label className="tp-field">
                        <span>Reps</span>
                        <input
                          type="number"
                          min={1}
                          value={ex.reps || defaultConfig(ex.id, mode).reps}
                          onChange={(ev) =>
                            updateConfig(i, {
                              reps: Number(ev.target.value) || 1,
                            })
                          }
                        />
                      </label>
                    )}
                    {mode === "time" && (
                      <label className="tp-field">
                        <span>Seg</span>
                        <input
                          type="number"
                          min={5}
                          value={ex.sec || defaultConfig(ex.id, mode).sec}
                          onChange={(ev) =>
                            updateConfig(i, {
                              sec: Number(ev.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    )}
                    {mode === "cardio" && (
                      <>
                        <label className="tp-field">
                          <span>Min</span>
                          <input
                            type="number"
                            min={5}
                            value={ex.min || defaultConfig(ex.id, mode).min}
                            onChange={(ev) =>
                              updateConfig(i, {
                                min: Number(ev.target.value) || 0,
                              })
                            }
                          />
                        </label>
                        <label className="tp-field">
                          <span>km/h</span>
                          <input
                            type="number"
                            step={0.1}
                            value={ex.speed || defaultConfig(ex.id, mode).speed}
                            onChange={(ev) =>
                              updateConfig(i, {
                                speed: Number(ev.target.value) || 0,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    <label className="tp-field">
                      <span>kg</span>
                      <input
                        type="number"
                        step={0.5}
                        value={ex.weight || 0}
                        onChange={(ev) =>
                          updateConfig(i, {
                            weight: Number(ev.target.value) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <Button fullWidth icon="plus" onClick={addExercise}>
            Añadir ejercicio
          </Button>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <Button variant="ghost" fullWidth onClick={handleBack}>
            Volver
          </Button>
          <Button
            variant="danger"
            icon="trash"
            fullWidth
            onClick={handleDelete}
          >
            Eliminar rutina
          </Button>
        </div>
      </section>

      {showGlyphPicker && (
        <div
          className="tp-sheet"
          role="dialog"
          onClick={() => setShowGlyphPicker(false)}
        >
          <div className="tp-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="tp-sheet__title">
              <h2>Elegir icono</h2>
              <button
                className="icon-button"
                onClick={() => setShowGlyphPicker(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="tp-sheet__body">
              <div className="tp-glyph-grid">
                {GLYPH_CHOICES.map((g) => (
                  <button
                    key={g.key}
                    className={`tp-glyph${
                      g.key === routine.emoji ? " is-on" : ""
                    }`}
                    onClick={() => setIcon(g.key)}
                  >
                    <Icon name={g.icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
