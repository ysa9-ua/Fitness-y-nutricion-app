import { create } from "zustand"
import type { TrainingState, User, Config } from "../types/trainingPlan"
import {
  isSupabaseSyncAvailable,
  getSessionUser,
  pullBodyweight,
  pullPlan,
  pushToSupabase,
} from "../training/lib/supabaseSync.js"
import { registerCustom } from "../training/lib/exercises.js"

const KEY = "gym_state_v1"

export const DEFAULT_STATE: TrainingState = {
  unit: "kg",
  restSec: 90,
  sound: true,
  keepAwake: true,
  lang: "es",
  theme: "dark",
  accent: "lime",
  body: "male",
  targetW: null,
  bodyweight: [],
  routines: [],
  week: {},
  dayPlan: {},
  exWeights: {},
  workouts: [],
  active: null,
  customEx: [],
  gifSize: "full",
  reminder: { on: false, time: "08:00", tz: null },
  effort: null,
  coach: null,
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o))

const exerciseIndex = (S: TrainingState) => {
  registerCustom([...(S.customEx || []), ...(S.pulledEx || [])])
}

function loadState(): TrainingState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      return Object.assign(clone(DEFAULT_STATE), JSON.parse(raw))
    }
  } catch (e) {
    /* ignore */
  }
  return clone(DEFAULT_STATE)
}

const hasData = (st: TrainingState) =>
  !!(
    (st.workouts || []).length ||
    (st.routines || []).length ||
    (st.bodyweight || []).length
  )

export const useTrainingPlanStore = create<{
  S: TrainingState
  user: User | null
  ready: boolean
  config: Config | null
  update: (mut: (s: TrainingState) => void, push?: boolean) => void
  replaceState: (S: TrainingState, push?: boolean) => void
  setUser: (u: User | null) => void
  setGuest: (v: boolean) => void
  isGuest: () => boolean
  pushState: () => Promise<void>
  pullState: () => Promise<void>
  boot: () => Promise<void>
  hydrateFromSupabase: () => Promise<boolean>
  syncToSupabase: () => Promise<boolean>
}>((set, get) => {
  let pushTm: ReturnType<typeof setTimeout> | null = null
  let supaTm: ReturnType<typeof setTimeout> | null = null

  const pushSupabase = (S: TrainingState) =>
    pushToSupabase(S)
      .catch(() => false)
      .finally(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(S))
        } catch (e) {
          /* ignore */
        }
      })

  const persist = (S: TrainingState, push = true) => {
    ;(S as any)._ts = Date.now()
    exerciseIndex(S)
    localStorage.setItem(KEY, JSON.stringify(S))
    set({ S })
    if (push && get().user) {
      if (pushTm) clearTimeout(pushTm)
      pushTm = setTimeout(() => get().pushState(), 1500)
    }
    if (push && isSupabaseSyncAvailable()) {
      if (supaTm) clearTimeout(supaTm)
      supaTm = setTimeout(() => {
        supaTm = null
        pushSupabase(get().S)
      }, 1500)
    }
  }

  return {
    S: (() => {
      const s = loadState()
      exerciseIndex(s)
      return s
    })(),
    user: (() => {
      try {
        return JSON.parse(localStorage.getItem("gym_user") || "null") || null
      } catch {
        return null
      }
    })(),
    ready: false,
    config: null,

    update(mut, push = true) {
      const S = clone(get().S)
      mut(S)
      persist(S, push)
    },

    replaceState(S, push = false) {
      persist(clone(S), push)
    },

    isGuest: () => localStorage.getItem("gym_guest") === "1",

    setGuest(v) {
      if (v) localStorage.setItem("gym_guest", "1")
      else localStorage.removeItem("gym_guest")
      set({})
    },

    setUser(u) {
      if (u) {
        localStorage.setItem("gym_user", JSON.stringify(u))
        localStorage.removeItem("gym_guest")
      } else {
        localStorage.removeItem("gym_user")
      }
      set({ user: u })
    },

    async pushState() {
      if (!get().user) return
      if (pushTm) clearTimeout(pushTm)
      try {
        // Intenta sincronizar con Supabase primero
        if (isSupabaseSyncAvailable()) {
          await pushToSupabase(get().S)
        }
        localStorage.removeItem("gym_dirty")
      } catch (e) {
        localStorage.setItem("gym_dirty", "1")
      }
    },

    async pullState() {
      // Se maneja principalmente via boot
    },

    async hydrateFromSupabase() {
      if (!isSupabaseSyncAvailable()) return false
      const S = get().S
      try {
        const traido = await pullPlan(S)
        if (traido) {
          try {
            await pullBodyweight(S)
          } catch (e) {}
          persist(S, false)
          return true
        }
      } catch (e) {}
      return false
    },

    async syncToSupabase() {
      if (!isSupabaseSyncAvailable()) return false
      try {
        const ok = await pushToSupabase(get().S)
        return !!ok
      } catch (e) {
        return false
      }
    },

    async boot() {
      if (isSupabaseSyncAvailable()) {
        const user = await getSessionUser()
        if (user) {
          const S = get().S
          let traido = false
          try {
            traido = await pullPlan(S)
          } catch (e) {}
          if (!traido && !S.routines?.length) {
            try {
              const { starterRoutines } = await import(
                "../training/lib/starter.js"
              )
              S.routines = (starterRoutines() as any)
              S.week = ({
                1: S.routines[0].id,
                3: S.routines[1].id,
                5: S.routines[2].id,
              } as any)
              S.planSource = "local"
            } catch (e) {}
          }
          try {
            await pullBodyweight(S)
          } catch (e) {}
          persist(S, false)
          get().setGuest(true)
          set({ ready: true, user })
          try {
            pushSupabase(S)
          } catch (e) {}
          return
        }
      }
      const S = get().S
      if (!S.routines?.length) {
        try {
          const { starterRoutines } = await import("../training/lib/starter.js")
          S.routines = (starterRoutines() as any)
          S.week = ({
            1: S.routines[0].id,
            3: S.routines[1].id,
            5: S.routines[2].id,
          } as any)
          S.planSource = "local"
          persist(S, false)
        } catch (e) {}
      } else {
        exerciseIndex(S)
        set({ S: { ...S } })
      }
      set({ ready: true })
    },
  }
})

export { hasData }
export type { TrainingState } from "../types/trainingPlan"
