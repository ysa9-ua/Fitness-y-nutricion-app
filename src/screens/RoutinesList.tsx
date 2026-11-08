import { useTrainingPlanStore } from "../store/trainingPlanStore"
import Icon from "../components/Icon"
import { Button } from "../components/UI"
import { exCount } from "../training/lib/format.js"
import { routineIcon } from "../lib/trainingGlyphs"

type Props = {
  assignToDay?: number | null
  onBack: () => void
  onOpenRoutineEditor: (routineId?: string) => void
  onAssigned: () => void
}

export default function RoutinesList({
  assignToDay,
  onBack,
  onOpenRoutineEditor,
  onAssigned,
}: Props) {
  const { S, update } = useTrainingPlanStore()
  const routines = S.routines

  const handleSelectRoutine = (routineId: string) => {
    if (assignToDay !== undefined && assignToDay !== null) {
      update((st) => {
        ;(st.week as any)[(assignToDay as any)] = routineId
      })
      onAssigned()
      return
    }
    onOpenRoutineEditor(routineId)
  }

  const handleNewRoutine = () => {
    onOpenRoutineEditor()
  }

  const handleDuplicate = (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const original = routines.find((r) => r.id === routineId)
    if (!original) return
    const copy = {
      ...JSON.parse(JSON.stringify(original)),
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: original.name + " (copia)",
    }
    update((s) => {
      s.routines.push(copy)
    })
  }

  const handleDelete = (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const original = routines.find((r) => r.id === routineId)
    if (!original) return
    if (confirm(`¿Eliminar la rutina "${original.name}"?`)) {
      update((s) => {
        s.routines = s.routines.filter((x) => x.id !== routineId)
        Object.keys(s.week).forEach((k) => {
          if ((s.week as any)[k] === routineId) delete (s.week as any)[k]
        })
      })
    }
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
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--app-text)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <Icon name="arrow-left" size={18} />
            Volver
          </button>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", margin: 0 }}>
            {assignToDay !== undefined ? "Seleccionar rutina" : "Mis rutinas"}
          </h1>
          <p style={{ color: "var(--app-muted)", marginTop: "0.25rem" }}>
            {assignToDay !== undefined && assignToDay !== null
              ? "Elige una rutina para asignar al día seleccionado"
              : `${routines.length} rutinas`}
          </p>
        </div>
      </header>

      <div className="screen-body" style={{ padding: "0 1rem 6rem" }}>
        <div className="workouts-routine-list">
          {routines.map((routine) => (
            <article
              key={routine.id}
              className="workouts-routine"
              style={{ cursor: "pointer" }}
              onClick={() => handleSelectRoutine(routine.id)}
            >
              <header className="workouts-routine__header">
                <span className="workouts-routine__icon">
                  <Icon name={routineIcon(routine.emoji)} size={18} />
                </span>
                <div className="workouts-routine__title">
                  <span className="workouts-routine__status">Rutina</span>
                  <h3>{routine.name}</h3>
                  <small>{exCount(routine.ex?.length || 0)}</small>
                </div>
              </header>
              {!assignToDay && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginTop: "1rem",
                  }}
                >
                  <Button
                    variant="ghost"
                    icon="plus"
                    onClick={(e) => handleDuplicate(routine.id, e as any)}
                  >
                    Duplicar
                  </Button>
                  <Button
                    variant="ghost"
                    icon="trash"
                    onClick={(e) => handleDelete(routine.id, e as any)}
                  >
                    Eliminar
                  </Button>
                </div>
              )}
            </article>
          ))}

          {routines.length === 0 && (
            <div
              className="empty-state"
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                color: "var(--app-muted)",
              }}
            >
              <Icon
                name="book"
                size={48}
                style={{ opacity: 0.5, marginBottom: "1rem" }}
              />
              <p>No tienes rutinas aún</p>
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <Button fullWidth icon="plus" onClick={handleNewRoutine}>
            Crear nueva rutina
          </Button>
        </div>
      </div>
    </main>
  )
}
