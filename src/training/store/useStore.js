import { create } from "zustand"
import { api } from "../lib/api.js"
import { localTZ } from "../lib/format.js"
import { registerCustom } from "../lib/exercises.js"
import { DEMO, DEMO_SEEDED } from "../lib/demo.js"
import { MOBILE, nativeLoad, nativeSave, syncReminder } from "../lib/mobile.js"
import {
  isSupabaseSyncAvailable,
  getSessionUser,
  pullBodyweight,
  pullPlan,
  pushToSupabase,
} from "../lib/supabaseSync.js"

const KEY = "gym_state_v1"
export const DEF = {
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
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local,
  // server pull, backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: "08:00", tz: null },
  effort: null,
  // AI Coach (issue: AI enablement). null until the profile opts in — a null namespace is the
  // same app it was before the feature existed, which is what Epic F asks for. Shape and
  // bounds live in lib/coach.js.
  coach: null,
}
const clone = (o) => JSON.parse(JSON.stringify(o))

// Ejercicios que hay que resolver por id en la interfaz: los que creó el usuario
// y los que llegaron de Supabase (el catálogo remoto usa ids que el catálogo
// local no trae, y las rutinas traídas pueden referenciarlos).
const exerciseIndex = (S) =>
  registerCustom([...(S.customEx || []), ...(S.pulledEx || [])])

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return Object.assign(clone(DEF), JSON.parse(raw))
  } catch (e) {
    /* ignore */
  }
  return clone(DEF)
}

const hasData = (st) =>
  !!(
    (st.workouts || []).length ||
    (st.routines || []).length ||
    (st.bodyweight || []).length
  )

export const useStore = create((set, get) => {
  let pushTm = null
  let saveTm = null
  let supaTm = null

  // FORMA: vuelca el estado a Supabase en segundo plano. No re-renderiza (solo
  // añade metadatos de sincronización al objeto) y reescribe la copia local para
  // que los `supabaseId` recién asignados sobrevivan a un recargado.
  const pushSupabase = (S) =>
    pushToSupabase(S)
      .catch(() => false)
      .finally(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(S))
        } catch (e) {
          /* ignore */
        }
      })

  // Mobile build: mirror the state into a file in the app's data directory (survives WebView
  // storage eviction) and keep the native reminder schedule in step with the weekly plan.
  const nativePersist = () => {
    clearTimeout(saveTm)
    saveTm = setTimeout(() => {
      saveTm = null
      nativeSave(get().S)
      syncReminder(get().S)
    }, 800)
  }

  const persist = (S, push = true) => {
    S._ts = Date.now()
    exerciseIndex(S)
    localStorage.setItem(KEY, JSON.stringify(S))
    set({ S })
    if (MOBILE) nativePersist()
    if (push && get().user) {
      clearTimeout(pushTm)
      pushTm = setTimeout(() => get().pushState(), 1500)
    }
    // FORMA: si hay backend, cada cambio se sincroniza (con el mismo retardo que
    // el push local). `pushSupabase` lee el estado vivo al dispararse, no el de
    // este instante.
    if (push && isSupabaseSyncAvailable()) {
      clearTimeout(supaTm)
      supaTm = setTimeout(() => {
        supaTm = null
        pushSupabase(get().S)
      }, 1500)
    }
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). On mobile the
  // same applies to the file mirror — backgrounding is often the last thing before the OS
  // kills the app.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return
    if (MOBILE && saveTm) {
      clearTimeout(saveTm)
      saveTm = null
      nativeSave(get().S)
    }
    if (pushTm) {
      clearTimeout(pushTm)
      pushTm = null
      get().pushState()
    }
    if (supaTm) {
      clearTimeout(supaTm)
      supaTm = null
      pushSupabase(get().S)
    }
  })

  // Everything a sign-out leaves behind on this device, whichever way it was triggered.
  const clearLocalSession = () => {
    get().setUser(null)
    localStorage.removeItem("gym_guest")
    localStorage.removeItem("gym_dirty")
    localStorage.removeItem(KEY)
    persist(clone(DEF), false)
  }

  return {
    S: (() => {
      const s = loadState()
      exerciseIndex(s)
      return s
    })(),
    user: (() => {
      try {
        return JSON.parse(localStorage.getItem("gym_user")) || null
      } catch {
        return null
      }
    })(),
    ready: false,
    // Instance capabilities from GET /api/config. `config.coach` is present only when the
    // owner has both enabled the Coach and connected a provider — every Coach entry point in
    // the app hangs off it, so an unconfigured instance renders exactly what it always did.
    config: null,

    // Mutate a draft of S via producer fn, then persist + schedule sync.
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
      } else localStorage.removeItem("gym_user")
      set({ user: u })
    },

    async pushState() {
      if (!get().user) return
      clearTimeout(pushTm)
      try {
        await api("/api/data", {
          method: "PUT",
          body: JSON.stringify({ state: get().S }),
        })
        localStorage.removeItem("gym_dirty")
      } catch (e) {
        localStorage.setItem("gym_dirty", "1")
      }
    },
    async pullState() {
      try {
        const { state } = await api("/api/data")
        const S = get().S
        const dirty = localStorage.getItem("gym_dirty") === "1"
        if (
          state &&
          (!hasData(S) || ((state._ts || 0) >= (S._ts || 0) && !dirty))
        ) {
          const active = S.active
          const next = Object.assign(clone(DEF), state)
          if (active) next.active = active
          persist(next, false)
        } else if (hasData(S)) {
          await get().pushState()
        }
      } catch (e) {
        /* offline — keep local */
      }
    },

    async signOut() {
      try {
        await get().pushState()
        await api("/api/logout", { method: "POST", body: "{}" })
      } catch (e) {
        /* */
      }
      clearLocalSession()
    },

    // "Sign out everywhere": the server bumps this profile's session version, which kills every
    // session it has on any device — this browser included, so the app has to end up exactly
    // where a normal signOut leaves it. Unlike signOut the request is NOT swallowed: if it fails
    // the sessions elsewhere are all still valid, and wiping this device's copy of the data
    // would sign the user out of the one place the bump didn't reach. Caller reports the error.
    async signOutAll() {
      await get().pushState() // never throws — stores gym_dirty and moves on when offline
      await api("/api/logout/all", { method: "POST", body: "{}" })
      clearLocalSession()
    },

    // Demo build only: drop the seeded example profile back in (Settings → "Reset demo data").
    // Dynamic import so the generator never ships in the production bundle.
    async resetDemo() {
      const { buildDemoState } = await import("../lib/demoSeed.js")
      localStorage.removeItem("gym_dirty")
      persist(Object.assign(clone(DEF), buildDemoState()), false)
    },

    // Boot: ask the server who we are, then pull.
    async boot() {
      // Mobile build: no backend either — restore from the file mirror (the durable copy;
      // localStorage may have been evicted since the last run) and go straight in.
      if (MOBILE) {
        const saved = await nativeLoad()
        const S = get().S
        if (saved && (!hasData(S) || (saved._ts || 0) >= (S._ts || 0))) {
          persist(Object.assign(clone(DEF), saved), false)
        } else if (hasData(S)) {
          nativeSave(S) // first run after an update from a file-less version: seed the mirror
        }
        get().setGuest(true)
        syncReminder(get().S)
        set({ ready: true })
        return
      }
      // FORMA: si hay credenciales de Supabase y el shell ya abrió sesión, la
      // sección entrena contra el backend real en vez del modo demo. El estado
      // general sigue en `localStorage`; el plan semanal, el peso y el historial
      // de entrenos se sincronizan con Supabase (ver `lib/supabaseSync.js`).
      if (isSupabaseSyncAvailable()) {
        const user = await getSessionUser()
        if (user) {
          const S = get().S
          // El plan viene de Supabase: el propio del usuario si ya lo subió, y si
          // no, el del catálogo. Así la web y Flutter enseñan la misma semana.
          // Solo se siembra el de iniciación si el servidor no tiene ninguno.
          let traido = false
          try {
            traido = await pullPlan(S)
          } catch (e) {
            /* offline — lo local manda */
          }
          if (!traido && !S.routines.length) {
            const { starterRoutines } = await import("../lib/starter.js")
            S.routines = starterRoutines()
            S.week = {
              1: S.routines[0].id,
              3: S.routines[1].id,
              5: S.routines[2].id,
            }
            S.planSource = "local"
          }
          try {
            await pullBodyweight(S)
          } catch (e) {
            /* offline — lo local manda */
          }
          persist(S, false)
          get().setGuest(true)
          set({ ready: true })
          pushSupabase(S)
          return
        }
      }
      // Demo build (GitHub Pages): no backend at all — seed once, stay in guest mode.
      if (DEMO) {
        if (!localStorage.getItem(DEMO_SEEDED)) {
          localStorage.setItem(DEMO_SEEDED, "1")
          await get().resetDemo()
        }
        get().setGuest(true)
        set({ ready: true })
        return
      }
      // Instance capabilities are public and needed whether or not anyone is signed in.
      try {
        set({ config: await api("/api/config") })
      } catch (e) {
        /* offline — assume nothing extra */
      }
      try {
        const me = await api("/api/me")
        get().setUser(me.user)
        await get().pullState()
        // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
        // without needing to revisit Settings.
        const tz = localTZ()
        if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
          get().update((s) => {
            s.reminder = { ...s.reminder, tz }
          })
        }
      } catch (e) {
        if (e.status === 401) get().setUser(null)
      }
      set({ ready: true })
    },
  }
})

export { hasData }
