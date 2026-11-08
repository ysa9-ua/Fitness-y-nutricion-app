import type { IconName } from "../components/Icon"
import { GLYPHS } from "../training/lib/glyphs.js"

// FORMA guarda en `routine.emoji` una clave de su propio set de iconos
// (`figureStrength`, `arm`, `bike`…). El shell de FORMA usa otro set (`IconName`),
// así que aquí se traduce una a otra. Se conserva la clave original en el estado
// para no romper la compatibilidad con FORMA: solo cambia cómo se pinta.
const MAP: Record<string, IconName> = {
  figureStrength: "dumbbell",
  arm: "dumbbell",
  abs: "target",
  legs: "footprints",
  pullup: "activity",
  dumbbell: "dumbbell",
  barbell: "dumbbell",
  kettlebell: "weight",
  plate: "weight",
  machine: "dumbbell",
  figureRun: "footprints",
  bike: "activity",
  swim: "water",
  boxing: "target",
  timer: "timer",
  stretch: "activity",
  moon: "moon",
  heart: "heart",
  flame: "flame",
  bolt: "sparkles",
  trophy: "sparkles",
  medal: "sparkles",
  star: "sparkles",
  crown: "sparkles",
  shield: "shield",
  rocket: "sparkles",
  scale: "weight",
  sparkles: "sparkles",
  lightbulb: "info",
}

/** Convierte la clave de icono de FORMA en un icono válido del shell. */
export function routineIcon(glyph?: string | null): IconName {
  if (!glyph) return "dumbbell"
  return MAP[glyph] || "dumbbell"
}

// Opciones del selector de icono. Se parte del catálogo de FORMA para que la
// clave guardada siga siendo válida para ambos lados.
export const GLYPH_CHOICES: {
  key: string
  icon: IconName
}[] = (GLYPHS as string[]).map((key) => ({ key, icon: routineIcon(key) }))
