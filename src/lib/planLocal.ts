/**
 * FORMA · Lectura del plan de entrenamiento local (modo demo).
 *
 * El plan que se edita en la sección de entrenamiento vive en `gym_state_v1`
 * (el estado de FORMA, ver `src/store/trainingPlanStore.ts`). Cuando no hay
 * backend, Dashboard y Progreso leen de aquí en vez de `semanaEntrenamiento`,
 * para que la UI refleje el mismo plan que el usuario acaba de editar.
 *
 * Con Supabase configurado estas pantallas siguen usando `src/lib/training.ts`
 * y este módulo no se toca.
 */

import type { Routine, TrainingState } from "../types/trainingPlan"

export const LOCAL_TRAINING_KEY = "gym_state_v1"

/** Fecha local en `YYYY-MM-DD`, sin pasar por UTC (evita saltos de día). */
export function aISO(fecha: Date): string {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, "0")
  const day = String(fecha.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Estado de FORMA guardado en `localStorage`, o `null` si no hay/procede. */
export function leerEstadoLocal(): TrainingState | null {
  try {
    const raw = localStorage.getItem(LOCAL_TRAINING_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TrainingState
  } catch {
    return null
  }
}

/** Rutina asignada a un día, respetando `dayPlan` (misma regla que FORMA). */
export function rutinaDelDia(
  st: TrainingState,
  fecha: Date,
): Routine | undefined {
  const override = st.dayPlan?.[aISO(fecha)]
  if (override === "rest") return undefined
  if (override) {
    const forzada = (st.routines || []).find((r) => r.id === override)
    if (forzada) return forzada
  }
  const routineId = st.week?.[fecha.getDay()]
  if (!routineId) return undefined
  return (st.routines || []).find((r) => r.id === routineId)
}
