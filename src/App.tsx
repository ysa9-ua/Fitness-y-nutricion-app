import { useCallback, useEffect, useRef, useState } from "react"
import { BottomNav, SideNav, Toast, type AppTab } from "./components/UI"
import { guardarPerfil, onboardingAPerfil, perfil, perfilAOnboarding } from "./lib/backend"
import { isSupabaseConfigured, supabase } from "./lib/supabase"
import {
  AuthScreen,
  SplashScreen,
  type AuthMode,
} from "./screens/Auth"
import DashboardScreen from "./screens/Dashboard"
import FoodDetailScreen, { type FoodEntry } from "./screens/FoodDetail"
import FoodLibraryScreen from "./screens/FoodLibrary"
import NutritionScreen from "./screens/Nutrition"
import NutritionPlanScreen from "./screens/NutritionPlan"
import OnboardingScreen, { type OnboardingData } from "./screens/Onboarding"
import ProfileScreen from "./screens/Profile"
import ProgressScreen from "./screens/Progress"
import ScannerScreen from "./screens/Scanner"
import SettingsScreen from "./screens/Settings"
import WeeklyCheckInScreen from "./screens/WeeklyCheckIn"
import WorkoutHistoryScreen from "./screens/WorkoutHistory"
import WorkoutSessionScreen from "./screens/WorkoutSession"
import TrainingPlan from "./screens/TrainingPlan"
import RoutinesList from "./screens/RoutinesList"
import RoutineEditor from "./screens/RoutineEditor"
import ExerciseLibrary from "./screens/ExerciseLibrary"
import { type FormaWindow } from "./lib/native"
import {
  agregarAlimentoDiario,
  guardarAlimentoPersonalizado,
  hidratarDatos,
  hoyISO,
  registrarPeso,
  type DiaryMeal,
} from "./lib/appData"
import { alimentoDesdePer100 } from "./lib/foodLibrary"

type Route = "splash" | "auth" | "onboarding" | "dashboard" | "nutrition" | "nutrition-plan" | "food-library" | "workouts" | "routines" | "routine-editor" | "exercises" | "progress" | "scanner" | "food-detail" | "workout-session" | "history" | "profile" | "settings"

const SESSION_KEY = "forma:session"
const THEME_KEY = "forma:theme"
const NOTIFICATIONS_KEY = "forma:notifications"
const CHECK_IN_KEY = "forma:last-check-in"
const PROFILE_KEY = "forma:profile"

const defaultProfile: OnboardingData = {
  age: 29,
  weight: 63.2,
  initialWeight: 64,
  height: 168,
  bodyFat: 18.6,
  sex: "female",
  neck: 31,
  waist: 72,
  hips: 92,
  experience: "intermediate",
  sport: "strength",
  availability: "4 días",
  goal: "hypertrophy",
  calories: 2320,
}

const tabRoutes: Record<AppTab, Route> = {
  dashboard: "dashboard",
  nutrition: "nutrition",
  workouts: "workouts",
  progress: "progress",
}

const routeLabels: Record<Route, string> = {
  splash: "Carga",
  auth: "Acceso",
  onboarding: "Configuración inicial",
  dashboard: "Inicio",
  nutrition: "Diario nutricional",
  "nutrition-plan": "Plan nutricional",
  "food-library": "Biblioteca de alimentos",
  workouts: "Mis entrenamientos",
  routines: "Rutinas",
  "routine-editor": "Editor de rutina",
  exercises: "Ejercicios",
  progress: "Progreso",
  scanner: "Escáner OCR",
  "food-detail": "Detalle de alimento",
  "workout-session": "Entrenamiento activo",
  history: "Historial de entrenamientos",
  profile: "Mi perfil",
  settings: "Ajustes",
}

function readStorage(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The prototype remains usable if storage is disabled.
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // The prototype remains usable if storage is disabled.
  }
}

function isCheckInDue() {
  const lastCheckIn = Number(readStorage(CHECK_IN_KEY, "0"))
  if (!lastCheckIn) return true
  return Date.now() - lastCheckIn >= 7 * 24 * 60 * 60 * 1000
}

/** Marca de "el backend no ha contestado a tiempo". */
const SIN_RESPUESTA = Symbol("sin-respuesta")

/** Error de red de GoTrue, tal y como lo devuelve el cliente. */
type NetworkAuthError = {
  name?: string
  message?: string
}

/**
 * `true` si el error es de conexión y no de credenciales.
 *
 * Con el backend caído, GoTrue devuelve un `AuthRetryableFetchError` genérico;
 * confundirlo con una contraseña mala haría perder tiempo buscando el problema
 * en el sitio equivocado.
 */
function isNetworkAuthError(error: NetworkAuthError) {
  const texto = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase()
  return (
    texto.includes("fetch") ||
    texto.includes("network") ||
    texto.includes("retryable")
  )
}

/**
 * Traduce los mensajes de GoTrue a algo legible.
 *
 * GoTrue responde en inglés y distingue causas por el texto, no por un código;
 * se comprueban los fragmentos conocidos y el resto cae en un mensaje genérico
 * en castellano en vez de enseñar el original.
 */
function authErrorMessage(message: string) {
  const texto = message.toLowerCase()
  if (texto.includes("already registered") || texto.includes("already been"))
    return "Ese correo ya tiene una cuenta."
  if (texto.includes("password"))
    return "La contraseña no cumple los requisitos (mínimo 6 caracteres)."
  if (texto.includes("email")) return "El correo no tiene un formato válido."
  return "No se ha podido completar el acceso. Inténtalo de nuevo."
}

function readProfile() {
  const stored = readStorage(PROFILE_KEY, "")
  if (!stored) return defaultProfile
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return defaultProfile
    const candidate = parsed as Record<string, unknown>
    const next = { ...defaultProfile }
    const numericKeys = [
      "age",
      "weight",
      "initialWeight",
      "height",
      "bodyFat",
      "neck",
      "waist",
      "hips",
      "calories",
    ] as const
    const textKeys = ["experience", "sport", "availability", "goal"] as const
    numericKeys.forEach((key) => {
      const value = candidate[key]
      if (typeof value === "number" && Number.isFinite(value)) next[key] = value
    })
    textKeys.forEach((key) => {
      const value = candidate[key]
      if (typeof value === "string" && value) next[key] = value
    })
    if (candidate.sex === "female" || candidate.sex === "male") {
      next.sex = candidate.sex
    }
    if (Array.isArray(candidate.photos)) {
      next.photos = candidate.photos
        .slice(0, 3)
        .filter((photo): photo is string => typeof photo === "string")
    }
    return next
  } catch {
    return defaultProfile
  }
}

/** Nombres del detalle de alimento → ids del diario y del plan. */
type MealTarget = {
  id: string
  title: string
}

const MEAL_TARGETS: Record<string, MealTarget> = {
  Desayuno: { id: "breakfast", title: "Desayuno" },
  Almuerzo: { id: "lunch", title: "Comida" },
  Cena: { id: "dinner", title: "Cena" },
  Snack: { id: "snack", title: "Merienda" },
}

export default function App() {
  const [route, setRoute] = useState<Route>("splash")
  const [authMode, setAuthMode] = useState<AuthMode>("login")
  const [profile, setProfile] = useState<OnboardingData>(readProfile)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = readStorage(THEME_KEY, "dark")
    return stored === "light" ? "light" : "dark"
  })
  const [notifications, setNotifications] = useState(
    () => readStorage(NOTIFICATIONS_KEY, "true") !== "false",
  )
  const [checkInDue, setCheckInDue] = useState(isCheckInDue)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [recentFood, setRecentFood] = useState<FoodEntry | null>(null)
  const [workoutTarget, setWorkoutTarget] = useState<{
    rutinaId: string | null
    nombre: string
  } | null>(null)
  const [routineEditorId, setRoutineEditorId] = useState<string | null>(null)
  const [assignDay, setAssignDay] = useState<number | null>(null)
  const [libraryMeal, setLibraryMeal] = useState<DiaryMeal | null>(null)
  const [toast, setToast] = useState({ message: "", visible: false })
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ message, visible: true })
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }))
    }, 2300)
  }, [])

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    },
    [],
  )

  // Routes are plain React state, not URLs, so the history API cannot express
  // them. This stack is what lets the Android hardware back button walk back
  // through screens instead of closing the app.
  const backStackRef = useRef<Route[]>([])

  const navigate = useCallback(
    (
      next: Route,
      options?: {
        replace?: boolean
        reset?: boolean
      },
    ) => {
      if (next === route) return
      if (options?.reset) {
        backStackRef.current = []
      } else if (!options?.replace) {
        backStackRef.current = [...backStackRef.current, route]
      }
      setRoute(next)
    },
    [route],
  )

  const goBack = useCallback((): boolean => {
    const stack = backStackRef.current
    const previous = stack[stack.length - 1]
    if (!previous) return false
    backStackRef.current = stack.slice(0, -1)
    setRoute(previous)
    return true
  }, [])

  // La biblioteca puede abrirse desde una comida concreta (o desde el acceso
  // rápido, sin comida preseleccionada).
  const openLibrary = useCallback(
    (meal?: DiaryMeal) => {
      setLibraryMeal(meal ?? null)
      navigate("food-library")
    },
    [navigate],
  )

  // Entrar en "Empezar entreno": se guarda de qué rutina se trata (o `null`
  // para reanudar la que esté abierta) y se navega a la sesión nativa.
  const startWorkout = useCallback(
    (rutinaId: string | null, nombre: string) => {
      setWorkoutTarget({ rutinaId, nombre })
      navigate("workout-session")
    },
    [navigate],
  )

  const openRoutines = useCallback(
    (assignToDay?: number) => {
      setAssignDay(assignToDay ?? null)
      navigate("routines")
    },
    [navigate],
  )

  const openRoutineEditor = useCallback(
    (id?: string) => {
      setRoutineEditorId(id ?? null)
      navigate("routine-editor")
    },
    [navigate],
  )

  const openExercises = useCallback(
    (id: string) => {
      setRoutineEditorId(id)
      navigate("exercises")
    },
    [navigate],
  )

  // The native shell has to decide synchronously whether a back press belongs
  // to the web app or closes the app, and a JS call into Java is the only
  // synchronous channel available. So push the decision on every change
  // instead of querying it while the key event is being handled.
  useEffect(() => {
    const native = (window as FormaWindow).FORMA_NATIVE
    native?.setCanGoBack(backStackRef.current.length > 0)
  })

  // Invoked by the native shell once it knows the web app wants the press.
  useEffect(() => {
    const target = window as FormaWindow
    target.__formaBack = goBack
    return () => {
      target.__formaBack = undefined
    }
  }, [goBack])

  // Trae el perfil real de Supabase (si hay sesión) y lo vuelca en el estado y
  // en la copia local, para que las pantallas del shell enseñen los datos del
  // servidor en vez del perfil de ejemplo.
  const refreshProfile = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const remoto = await perfil()
    if (!remoto) return
    setProfile((current) => {
      const next = {
        ...current,
        ...perfilAOnboarding(remoto),
      } as OnboardingData
      const { photos: _photos, ...persistable } = next
      writeStorage(PROFILE_KEY, JSON.stringify(persistable))
      return next
    })
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  // La sesión de Supabase puede restaurarse o cambiar después de montar. En
  // cuanto haya usuario se recarga el documento remoto y se activa el guardado
  // automático de `appData`.
  useEffect(() => {
    void hidratarDatos()
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void hidratarDatos()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const finishSplash = useCallback(async () => {
    // El estado se hidrata en paralelo: si el backend contesta, la portada se
    // repinta con el documento del usuario sin bloquear el arranque.
    void hidratarDatos()
    // Con backend, la sesión la manda Supabase; sin él, el marcador local de
    // siempre.
    if (isSupabaseConfigured && supabase) {
      // La consulta al backend lleva red de cortesía: si no responde (pila
      // local apagada, sin cobertura) la app no se queda en el splash para
      // siempre y arranca en modo local.
      const resultado = await Promise.race([
        supabase.auth
          .getSession()
          .then((d) => d.data?.session ?? null)
          .catch(() => SIN_RESPUESTA),
        new Promise<typeof SIN_RESPUESTA>((r) =>
          window.setTimeout(() => r(SIN_RESPUESTA), 3000),
        ),
      ])
      if (resultado !== SIN_RESPUESTA) {
        navigate(resultado ? "dashboard" : "auth", { replace: true })
        return
      }
    }
    navigate(readStorage(SESSION_KEY, "") === "active" ? "dashboard" : "auth", {
      replace: true,
    })
  }, [navigate])

  useEffect(() => {
    writeStorage(THEME_KEY, theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    writeStorage(NOTIFICATIONS_KEY, String(notifications))
  }, [notifications])

  useEffect(() => {
    document.title = `${routeLabels[route]} · FORMA`
  }, [route])

  useEffect(() => {
    const isMainRoute = [
      "dashboard",
      "nutrition",
      "workouts",
      "progress",
    ].includes(route)
    if (!isMainRoute || !checkInDue) return
    const timer = window.setTimeout(() => setCheckInOpen(true), 900)
    return () => window.clearTimeout(timer)
  }, [checkInDue, route])

  const handleAuth = () => navigate("onboarding")

  const handleAuthenticate = useCallback(
    async ({
      mode,
      email,
      password,
      name,
    }: {
      mode: AuthMode
      email: string
      password: string
      name: string
    }) => {
      // Sin credenciales configuradas se mantiene el acceso de demostración: la
      // app sigue funcionando en local aunque no haya backend.
      if (!isSupabaseConfigured || !supabase) {
        handleAuth()
        return null
      }
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
        if (error) {
          return isNetworkAuthError(error)
            ? "No se ha podido conectar con el servidor. Inténtalo más tarde."
            : authErrorMessage(error.message)
        }
        if (!data.session) {
          return "Cuenta creada. Revisa tu correo para confirmarla e inicia sesión."
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          return isNetworkAuthError(error)
            ? "No se ha podido conectar con el servidor. Comprueba tu conexión."
            : "Correo o contraseña incorrectos."
        }
      }
      await refreshProfile()
      const remoto = await perfil()
      if (remoto?.onboarding_completado) {
        navigate("dashboard", { replace: true, reset: true })
      } else {
        handleAuth()
      }
      return null
    },
    // `handleAuth` cierra sobre `navigate`, que a su vez depende de la ruta.
    [handleAuth, refreshProfile],
  )
  const handleOnboardingComplete = (data: OnboardingData) => {
    setProfile(data)
    const { photos: _photos, ...persistableProfile } = data
    writeStorage(PROFILE_KEY, JSON.stringify(persistableProfile))
    writeStorage(SESSION_KEY, "active")
    void guardarPerfil(onboardingAPerfil(data))
    const now = Date.now()
    writeStorage(CHECK_IN_KEY, String(now))
    setCheckInDue(false)
    setCheckInOpen(false)
    navigate("dashboard", { replace: true })
    showToast("Tu plan personalizado está activo")
  }

  const handleLogout = () => {
    // Cerrar sesión en Supabase es lo que deja al iframe de entrenamiento sin
    // usuario; el marcador local se limpia igual.
    void supabase?.auth.signOut()
    removeStorage(SESSION_KEY)
    setCheckInOpen(false)
    navigate("auth", { replace: true })
    showToast("Sesión cerrada correctamente")
  }

  const handleTabChange = (tab: AppTab) =>
    navigate(tabRoutes[tab], { replace: true })
  const activeTab: AppTab = [
    "dashboard",
    "nutrition",
    "workouts",
    "progress",
  ].includes(route)
    ? route as AppTab
    : "dashboard"
  const isMainRoute = [
    "dashboard",
    "nutrition",
    "workouts",
    "progress",
  ].includes(route)

  const screen = (() => {
    switch (route) {
      case "splash":
        return <SplashScreen onComplete={finishSplash} />
      case "auth":
        return (
          <AuthScreen
            mode={authMode}
            onAuthenticate={handleAuthenticate}
            onGoogle={handleAuth}
            onModeChange={setAuthMode}
          />
        )
      case "onboarding":
        return <OnboardingScreen onComplete={handleOnboardingComplete} />
      case "dashboard":
        return (
          <DashboardScreen
            onOpenCheckIn={() => setCheckInOpen(true)}
            onOpenLibrary={() => openLibrary()}
            onOpenNutrition={() => navigate("nutrition", { replace: true })}
            onOpenProfile={() => navigate("profile")}
            onOpenScanner={() => navigate("scanner")}
            onOpenWorkouts={() => navigate("workouts", { replace: true })}
            onStartWorkout={startWorkout}
            profile={profile}
          />
        )
      case "nutrition":
        return (
          <NutritionScreen
            onOpenLibrary={openLibrary}
            onOpenPlan={() => navigate("nutrition-plan")}
            onOpenProfile={() => navigate("profile")}
            onOpenScanner={() => navigate("scanner")}
            profile={profile}
            recentFood={recentFood}
          />
        )
      case "nutrition-plan":
        return (
          <NutritionPlanScreen
            onBack={goBack}
            onOpenLibrary={() => openLibrary()}
            profile={profile}
          />
        )
      case "food-library":
        return (
          <FoodLibraryScreen
            initialMeal={libraryMeal}
            onAdded={(message) => showToast(message)}
            onBack={goBack}
            profile={profile}
          />
        )
      case "workouts":
        return (
          <TrainingPlan
            onOpenRoutines={openRoutines}
            onOpenRoutineEditor={openRoutineEditor}
            onOpenHistory={() => navigate("history")}
            onStartWorkout={startWorkout}
          />
        )
      case "routines":
        return (
          <RoutinesList
            assignToDay={assignDay}
            onBack={goBack}
            onOpenRoutineEditor={openRoutineEditor}
            onAssigned={() => navigate("workouts", { replace: true })}
          />
        )
      case "routine-editor":
        return (
          <RoutineEditor
            routineId={routineEditorId}
            onBack={goBack}
            onOpenExercises={openExercises}
            onDeleted={() => navigate("workouts", { replace: true })}
          />
        )
      case "exercises":
        return (
          <ExerciseLibrary
            routineId={routineEditorId}
            onBack={goBack}
            onPicked={goBack}
          />
        )
      case "progress":
        return (
          <ProgressScreen
            onOpenCheckIn={() => setCheckInOpen(true)}
            onOpenProfile={() => navigate("profile")}
            profile={profile}
          />
        )
      case "scanner":
        return (
          <ScannerScreen
            onBack={goBack}
            onFoodDetected={() => navigate("food-detail")}
          />
        )
      case "food-detail":
        return (
          <FoodDetailScreen
            onBack={goBack}
            onSave={(food) => {
              const meal = MEAL_TARGETS[food.meal] ?? MEAL_TARGETS.Almuerzo!
              agregarAlimentoDiario(hoyISO(), {
                mealId: meal.id,
                mealTitle: meal.title,
                name: food.name,
                grams: food.grams,
                kcal: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat,
                source: "manual",
              })
              // El escáner también alimenta la biblioteca: lo escaneado se
              // guarda como alimento propio para no tener que repetirlo.
              if (food.saveToLibrary) {
                guardarAlimentoPersonalizado(
                  alimentoDesdePer100({
                    name: food.name,
                    per100: {
                      kcal: food.per100.calories,
                      protein: food.per100.protein,
                      carbs: food.per100.carbs,
                      fat: food.per100.fat,
                    },
                    grams: food.grams,
                    source: food.source === "ocr" ? "scanner" : "manual",
                  }),
                )
              }
              setRecentFood(food)
              navigate("nutrition", { replace: true })
              showToast(
                food.saveToLibrary
                  ? "Alimento añadido al diario y a tu biblioteca"
                  : "Alimento añadido al diario",
              )
            }}
          />
        )
      case "workout-session":
        return (
          <WorkoutSessionScreen
            onExit={goBack}
            onFinish={() => {
              if (!goBack()) navigate("workouts", { replace: true })
              showToast("Sesión guardada")
            }}
            rutinaId={workoutTarget?.rutinaId ?? null}
            rutinaNombre={workoutTarget?.nombre}
          />
        )
      case "history":
        return <WorkoutHistoryScreen onBack={goBack} />
      case "profile":
        return (
          <ProfileScreen
            onBack={goBack}
            onOpenCheckIn={() => setCheckInOpen(true)}
            onOpenSettings={() => navigate("settings")}
            onRecalculate={() =>
              showToast("Calorías recalculadas con tus datos actuales")
            }
            profile={profile}
          />
        )
      case "settings":
        return (
          <SettingsScreen
            notifications={notifications}
            onBack={goBack}
            onLogout={handleLogout}
            onNotificationsChange={setNotifications}
            onThemeChange={setTheme}
            theme={theme}
          />
        )
    }
  })()

  const isGate = route === "splash" || route === "auth"

  return (
    <div className={`app-stage app-stage--${theme}`} data-theme={theme}>
      {!isGate ? (
        <SideNav
          active={activeTab}
          onChange={handleTabChange}
          onOpenProfile={() => navigate("profile")}
          onOpenSettings={() => navigate("settings")}
        />
      ) : null}
      <div className={`app-main ${isGate ? "app-main--gate" : ""}`}>
        <div className="app-view" key={route}>
          {screen}
          {isMainRoute && !isGate ? (
            <BottomNav active={activeTab} onChange={handleTabChange} />
          ) : null}
        </div>
        {checkInOpen ? (
          <WeeklyCheckInScreen
            baseline={{
              weight: profile.initialWeight ?? profile.weight,
              waist: profile.waist ?? 72,
              hips: profile.hips ?? 92,
              neck: profile.neck ?? 31,
            }}
            onClose={() => setCheckInOpen(false)}
            onComplete={(data) => {
              setProfile((current) => {
                const next = {
                  ...current,
                  weight: data.weight,
                  waist: data.waist,
                  hips: data.hips,
                  neck: data.neck,
                }
                const { photos: _photos, ...persistable } = next
                writeStorage(PROFILE_KEY, JSON.stringify(persistable))
                return next
              })
              registrarPeso({
                date: hoyISO(),
                weight: data.weight,
                waist: data.waist,
                hips: data.hips,
                neck: data.neck,
              })
              void guardarPerfil({
                peso_kg: data.weight,
                cintura_cm: data.waist,
                cadera_cm: data.hips,
                cuello_cm: data.neck,
              })
              writeStorage(CHECK_IN_KEY, String(Date.now()))
              setCheckInDue(false)
              setCheckInOpen(false)
              showToast("Check-in semanal completado")
            }}
          />
        ) : null}
        <Toast message={toast.message} visible={toast.visible} />
      </div>
    </div>
  )
}
