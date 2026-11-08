// Tipos para la edición de planes y rutinas (estilo FORMA)
// Basados en el esquema y store de FORMA

export type EffortKind = "none" | "rir" | "rpe" | null

export type ExercisePrescriptionMode = "reps" | "time" | "cardio"

export type ProgressionPolicy = "linear" | "pyramid" | "reverse" | "wave" | "double" | "off"

export interface RoutineExerciseConfig {
  id: string // ID del ejercicio (catalogo o custom)
  sg?: string // Superset group
  sets?: number
  reps?: number
  weight?: number
  mode?: ExercisePrescriptionMode
  sec?: number // tiempo en segundos (time)
  min?: number // minutos (cardio)
  speed?: number // km/h (cardio)
  prog?: ProgressionPolicy
  inc?: number
  repsMin?: number
}

export interface Routine {
  id: string
  name: string
  emoji: string
  ex: RoutineExerciseConfig[]
  prog?: ProgressionPolicy
}

export interface CustomExercise {
  id: string
  n: string
  bp: string
  tg?: string
  eq?: string
  sm?: string[]
  st?: string[]
  desc?: string
  custom?: boolean
}

export interface PulledExercise {
  id: string
  n: string
  bp?: string
  tg?: string
  mg?: string
  eq?: string
  sm?: string[]
  st?: string[]
}

export interface BodyweightEntry {
  d: string // ISO date
  w: number
  t?: number
}

export interface WorkoutSet {
  w?: number // weight
  r?: number // reps
  min?: number
  speed?: number
  sec?: number
  done?: boolean
  rir?: number
  rpe?: number
}

export interface WorkoutEntry {
  id: string
  sg?: string
  n?: string
  topW?: number
  target?: any
  plan?: any
  sets: WorkoutSet[]
  asked?: boolean
}

export interface Workout {
  id: string
  d: string
  start: number
  end?: number
  routineId?: string
  name: string
  bw?: number | null
  cur: number
  entries: WorkoutEntry[]
  vol?: number
  prs?: string[]
  supabaseId?: string
}

export interface PlanWeek {
  [key: number]: string | undefined // day -> routineId (0 domingo, 1 lunes...)
}

export interface DayPlanOverrides {
  [isoDate: string]: string | null // 'rest' or routineId
}

export interface ExWeights {
  [exId: string]: {
    w: number
    d: string
  }
}

export interface Reminder {
  on: boolean
  time: string
  tz?: string | null
}

export interface CoachConfig {
  [key: string]: any
}

export interface SupaSyncMap {
  [day: number]: string
}

export interface TrainingState {
  unit: "kg" | "lb"
  restSec: number
  sound: boolean
  keepAwake: boolean
  lang: string
  theme: "dark" | "light"
  accent: string
  body: "male" | "female"
  targetW: number | null
  bodyweight: BodyweightEntry[]
  routines: Routine[]
  week: PlanWeek
  dayPlan: DayPlanOverrides
  exWeights: ExWeights
  workouts: Workout[]
  active: Workout | null
  customEx: CustomExercise[]
  gifSize: string
  reminder: Reminder
  effort: EffortKind
  coach: CoachConfig | null
  pulledEx?: PulledExercise[]
  planSig?: string
  planSource?: "local" | "supabase" | "catalog"
  supaPlans?: SupaSyncMap
  supaRoutines?: SupaSyncMap
  supaSynced?: Record<string, boolean>
  _ts?: number
}

export interface User {
  id: string
  name?: string
  email?: string
  admin?: boolean
}

export interface Config {
  coach?: any
  [key: string]: any
}
