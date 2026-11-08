import type { Routine } from "../types/trainingPlan"
import type { EjercicioSesion, SesionEntrenamiento } from "./training"
import { aISO } from "./training"
import { exOr } from "../training/lib/exercises.js"
import { modeOf } from "../training/lib/history.js"

const DESCANSO_POR_DEFECTO = 90

/**
 * Construye una sesión a partir de una rutina del plan local (la que edita el
 * shell). Se usa cuando el backend no está disponible: así el editor integrado
 * también dirige el entrenamiento en modo local/demo, no solo con Supabase.
 *
 * El `id` es `"demo"`, la marca que `WorkoutSession` ya usa para no persistir
 * series ni sesión cuando no hay servidor.
 */
export function sesionDesdeRutina(
  rutina: Routine,
  nombre?: string,
): SesionEntrenamiento {
  const ejercicios: EjercicioSesion[] = rutina.ex.map((cfg, orden) => {
    const ex = exOr(cfg.id) as {
      n?: string
      bp?: string
    } | undefined
    const mode = modeOf(cfg)
    const sets = cfg.sets || 1
    const reps = mode === "reps" ? cfg.reps || 10 : 0
    const kg = cfg.weight || 0
    const consejo =
      mode === "cardio"
        ? `${cfg.min || 20} min a ${cfg.speed || 8} km/h`
        : mode === "time"
          ? `${cfg.sec || 45} s por serie`
          : ""
    return {
      id: `local-${rutina.id}-${orden}`,
      nombre: ex?.n || cfg.id,
      musculo: ex?.bp || "",
      icono: "dumbbell",
      seriesPlanificadas: sets,
      repsPlanificadas: reps,
      cargaSugeridaKg: kg,
      descansoSeg: DESCANSO_POR_DEFECTO,
      recordPrevioKg: 0,
      consejo,
      orden,
      series: Array.from({ length: sets }, (_, indice) => ({
        id: `local-${rutina.id}-${orden}-${indice}`,
        numero: indice + 1,
        kg,
        reps,
        completada: false,
      })),
    }
  })

  return {
    id: "demo",
    rutinaId: rutina.id,
    nombre: nombre || rutina.name,
    fecha: aISO(new Date()),
    iniciadaAt: new Date().toISOString(),
    finalizadaAt: null,
    duracionSeg: 0,
    seriesTotales: ejercicios.reduce(
      (total, item) => total + item.seriesPlanificadas,
      0,
    ),
    seriesCompletadas: 0,
    volumenTotalKg: 0,
    nuevosRecords: 0,
    kcalEstimadas: 0,
    estado: "en_curso",
    ejercicios,
  }
}
