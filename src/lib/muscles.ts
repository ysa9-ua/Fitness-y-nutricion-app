/**
 * Taxonomía de grupos musculares.
 *
 * El catálogo de ejercicios (1324) viene del dataset de FORMA con tres campos
 * de musculatura con nombres distintos y poco consistentes:
 *
 *   mg → músculo principal   ("trapezius", "lats", "quadriceps"…)
 *   tg → objetivo             ("pectorals", "delts", "abs"…)
 *   sm → músculos secundarios  (lista: los que también intervienen)
 *
 * Aquí se traducen esos nombres crudos a 13 grupos canónicos, que son los que
 * se muestran en la figura del cuerpo. Cada grupo tiene una zona en el cuerpo;
 * al tocarla se listan los ejercicios cuyo músculo principal cae en el grupo
 * ("principales") y los que solo lo activan como secundario ("involucrados").
 */

export type MuscleZoneId = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms" | "core" | "glutes" | "quads" | "hamstrings" | "calves" | "neck" | "cardio"

export type MuscleZone = {
  id: MuscleZoneId
  /** Nombre visible en español. */
  label: string
}

export const MUSCLE_ZONES: MuscleZone[] = [
  { id: "chest", label: "Pecho" },
  { id: "back", label: "Espalda" },
  { id: "shoulders", label: "Hombros" },
  { id: "biceps", label: "Bíceps" },
  { id: "triceps", label: "Tríceps" },
  { id: "forearms", label: "Antebrazos" },
  { id: "core", label: "Core" },
  { id: "glutes", label: "Glúteos" },
  { id: "quads", label: "Cuádriceps" },
  { id: "hamstrings", label: "Isquiotibiales" },
  { id: "calves", label: "Pantorrillas" },
  { id: "neck", label: "Cuello" },
  { id: "cardio", label: "Cardio" },
]

export const ZONE_BY_ID = new Map(MUSCLE_ZONES.map((z) => [z.id, z]))

/**
 * Nombre crudo del dataset → grupo canónico. Cubre los valores reales de `mg`,
 * `tg` y `sm` del catálogo (ver scripts/check-muscle-zones.mjs, que falla si
 * aparece un nombre nuevo sin mapear).
 */
const RAW_TO_ZONE: Record<string, MuscleZoneId> = {
  // Pecho
  chest: "chest",
  pectorals: "chest",
  "upper chest": "chest",
  "serratus anterior": "chest",
  // Espalda
  back: "back",
  lats: "back",
  "latissimus dorsi": "back",
  traps: "back",
  trapezius: "back",
  "upper back": "back",
  rhomboids: "back",
  spine: "back",
  "lower back": "back",
  "spine erectors": "back",
  "levator scapulae": "back",
  // Hombros
  shoulders: "shoulders",
  deltoids: "shoulders",
  delts: "shoulders",
  "rear deltoids": "shoulders",
  "rotator cuff": "shoulders",
  // Brazos
  biceps: "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  "wrist flexors": "forearms",
  "wrist extensors": "forearms",
  wrists: "forearms",
  hands: "forearms",
  "grip muscles": "forearms",
  // Core
  core: "core",
  abs: "core",
  abdominals: "core",
  "lower abs": "core",
  obliques: "core",
  "hip flexors": "core",
  groin: "core",
  // Pierna y cadera
  glutes: "glutes",
  quadriceps: "quads",
  quads: "quads",
  adductors: "quads",
  abductors: "quads",
  "inner thighs": "quads",
  hamstrings: "hamstrings",
  calves: "calves",
  soleus: "calves",
  ankles: "calves",
  "ankle stabilizers": "calves",
  shins: "calves",
  feet: "calves",
  // Cuello
  neck: "neck",
  sternocleidomastoid: "neck",
  // Cardiovascular
  cardio: "cardio",
  "cardiovascular system": "cardio",
  // Zona del cuerpo (bp). "upper arms" y "upper legs" no se mapean a propósito:
  // son ambiguos (bíceps/tríceps, cuádriceps/glúteos) y el músculo principal
  // (mg) da la respuesta correcta.
  waist: "core",
  "lower legs": "calves",
  "lower arms": "forearms",
}

export function zoneOfRaw(name?: string | null): MuscleZoneId | null {
  if (!name) return null
  return RAW_TO_ZONE[name.trim().toLowerCase()] ?? null
}

export type ExerciseMuscles = {
  /** El grupo canónico principal del ejercicio (mg o tg). */
  primary: MuscleZoneId | null
  /** Grupos canónicos que también intervienen (sm). */
  involved: MuscleZoneId[]
}

export function musclesOf(ex: any): ExerciseMuscles {
  const mgZone = zoneOfRaw(ex?.mg)
  const tgZone = zoneOfRaw(ex?.tg)
  const bpZone = zoneOfRaw(ex?.bp)
  // El músculo principal del dataset manda sobre la zona del cuerpo: un
  // "pulldown lateral" tiene bp=back pero mg=biceps, y su ejercicio principal
  // es el bíceps. El cardio es la excepción: es una modalidad, no un músculo,
  // así que el ejercicio es de cardio y sus músculos pasan a "involucrados".
  const muscle = mgZone ?? tgZone ?? bpZone
  // "cardio" y "neck" son regiones, no músculos: mandan sobre el mg.
  const regionFirst = ex?.bp === "cardio" || ex?.bp === "neck"
  const primary: MuscleZoneId | null = regionFirst ? bpZone : muscle
  const involved: MuscleZoneId[] = []
  const push = (zone: MuscleZoneId | null) => {
    if (zone && zone !== primary && !involved.includes(zone))
      involved.push(zone)
  }
  const sm: string[] = Array.isArray(ex?.sm) ? ex.sm : []
  for (const raw of sm) push(zoneOfRaw(raw))
  push(bpZone)
  if (regionFirst) push(muscle)
  return { primary, involved }
}

/**
 * Cómo cae un ejercicio en un grupo: "primary" si ese músculo es el
 * principal, "involved" si solo participa, null si no tiene nada que ver.
 */
export function matchZone(
  ex: any,
  zone: MuscleZoneId,
  cache?: Map<any, ExerciseMuscles>,
): "primary" | "involved" | null {
  let info = cache?.get(ex)
  if (!info) {
    info = musclesOf(ex)
    cache?.set(ex, info)
  }
  if (info.primary === zone) return "primary"
  if (info.involved.includes(zone)) return "involved"
  return null
}

export function zoneLabel(id: MuscleZoneId): string {
  return ZONE_BY_ID.get(id)?.label ?? id
}

/**
 * La figura del cuerpo se dibuja con la geometría de `src/training/lib/body-paths.js`
 * (el mapa muscular de FORMA), que habla un idioma más fino: 18 músculos más
 * el cuello. Estos son sus nombres propios; los 13 grupos canónicos de FORMA se
 * arman agrupándolos.
 */
export type FigureMuscle = "trapezius" | "deltoids" | "chest" | "upper-back" | "serratus" | "biceps" | "triceps" | "forearm" | "abs" | "obliques" | "lower-back" | "gluteal" | "quadriceps" | "hamstring" | "adductors" | "hip-flexors" | "calves" | "tibialis" | "neck"

/** Orden de la figura: de cabeza a pies, como en la anatomía. */
export const FIGURE_MUSCLES: FigureMuscle[] = [
  "trapezius",
  "deltoids",
  "chest",
  "upper-back",
  "serratus",
  "biceps",
  "triceps",
  "forearm",
  "abs",
  "obliques",
  "lower-back",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "hip-flexors",
  "calves",
  "tibialis",
  "neck",
]

/** Músculos de la figura que pertenecen a cada grupo canónico. */
export const ZONE_FIGURE_MUSCLES: Record<MuscleZoneId, FigureMuscle[]> = {
  chest: ["chest", "serratus"],
  back: ["trapezius", "upper-back", "lower-back"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  core: ["abs", "obliques", "hip-flexors"],
  glutes: ["gluteal"],
  quads: ["quadriceps", "adductors"],
  hamstrings: ["hamstring"],
  calves: ["calves", "tibialis"],
  neck: ["neck"],
  // El cardio es una modalidad, no un músculo: no tiene zona en la figura.
  cardio: [],
}

/** Grupo canónico al que pertenece cada músculo de la figura (para el clic). */
export const FIGURE_MUSCLE_ZONE: Record<FigureMuscle, MuscleZoneId> = {
  trapezius: "back",
  deltoids: "shoulders",
  chest: "chest",
  "upper-back": "back",
  serratus: "chest",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  abs: "core",
  obliques: "core",
  "lower-back": "back",
  gluteal: "glutes",
  quadriceps: "quads",
  hamstring: "hamstrings",
  adductors: "quads",
  "hip-flexors": "core",
  calves: "calves",
  tibialis: "calves",
  neck: "neck",
}

/** Nombre en español del músculo de la figura (tooltip al tocarlo). */
export const FIGURE_MUSCLE_LABEL: Record<FigureMuscle, string> = {
  trapezius: "Trapecio",
  deltoids: "Hombros",
  chest: "Pecho",
  "upper-back": "Espalda alta",
  serratus: "Serrato",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearm: "Antebrazos",
  abs: "Abdominales",
  obliques: "Oblicuos",
  "lower-back": "Espalda baja",
  gluteal: "Glúteos",
  quadriceps: "Cuádriceps",
  hamstring: "Isquiotibiales",
  adductors: "Aductores",
  "hip-flexors": "Flexores de cadera",
  calves: "Pantorrillas",
  tibialis: "Tibial anterior",
  neck: "Cuello",
}
