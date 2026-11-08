/**
 * FORMA · Motor del plan nutricional personalizado.
 *
 * Calcula el gasto energético, reparte los macros y monta un día de comidas
 * con una lista de la compra semanal. Todo se resuelve en local, igual que el
 * resto de la sección de nutrición del shell web: no hay llamada a ningún
 * servicio externo ni claves que configurar.
 *
 * El cálculo es determinista (misma entrada, mismo plan) y la rotación de
 * alimentos solo cambia con `variant`. Así el usuario puede pedir otro menú
 * sin que las cifras bailen solas entre renders.
 */

export type Macro = {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export type Goal = "fat-loss" | "recomposition" | "hypertrophy" | "health"

export type ActivityLevel = "sedentary" | "light" | "moderate" | "high" | "athlete"

export type MealsPerDay = 3 | 4 | 5 | 6

export type FoodCategory = "protein" | "carb" | "fat" | "veg"

export type ShopCategory = "proteinas" | "fruteria" | "carbohidratos" | "grasas"

export type MealSlot = "breakfast" | "main" | "snack" | "recena"

export type FoodUnit = {
  grams: number
  singular: string
  plural: string
}

export type Food = {
  id: string
  name: string
  category: FoodCategory
  shop: ShopCategory
  per100: Macro
  tags: string[]
  slots: MealSlot[]
  unit?: FoodUnit
  step: number
}

export type PlanProfile = {
  age: number
  sex: "male" | "female"
  weight: number
  height: number
  bodyFat?: number
  neck?: number
  waist?: number
  hips?: number
  availability?: string
  goal?: string
}

export type PlanPreferences = {
  goal: Goal
  activity: ActivityLevel
  mealsPerDay: MealsPerDay
  proteins: string[]
  carbs: string[]
  fats: string[]
  exclusions: string[]
  variant: number
}

export type PlanAnalysis = {
  bmr: number
  tdee: number
  calories: number
  adjustment: number
  protein: number
  carbs: number
  fat: number
  proteinKcal: number
  carbsKcal: number
  fatKcal: number
  proteinPct: number
  carbsPct: number
  fatPct: number
  bmi: number
  bodyFat: number | null
  leanMass: number | null
  waistHip: number | null
  waterMl: number
  formula: "katch" | "mifflin"
  goalLabel: string
  activityLabel: string
  activityFactor: number
}

export type PlanMealFood = {
  id: string
  name: string
  grams: number
  quantity: string
  macros: Macro
  per100: Macro
}

export type PlanMealIcon = "sun" | "leaf" | "moon" | "sparkles" | "clock"

export type PlanMeal = {
  id: string
  title: string
  /** Nombre del plato compuesto con los alimentos que lo forman. */
  dish: string
  time: string
  kind: MealSlot
  icon: PlanMealIcon
  macros: Macro
  foods: PlanMealFood[]
}

export type ShoppingItem = {
  id: string
  name: string
  grams: number
  quantity: string
}

export type ShoppingGroup = {
  id: ShopCategory
  label: string
  hint: string
  items: ShoppingItem[]
}

export type NutritionPlan = {
  analysis: PlanAnalysis
  meals: PlanMeal[]
  totals: Macro
  shopping: ShoppingGroup[]
  warnings: string[]
}

type MealTemplate = {
  id: string
  title: string
  time: string
  kind: MealSlot
  share: number
  icon: PlanMealIcon
}

type ActivityOption = {
  id: ActivityLevel
  label: string
  detail: string
  factor: number
}

type GoalOption = {
  id: Goal
  label: string
  detail: string
}

type ExclusionOption = {
  id: string
  label: string
}

const PLAN_KEY = "forma:nutrition-plan"

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  {
    id: "sedentary",
    label: "Sedentario",
    detail: "Sin entrenar o trabajo de escritorio",
    factor: 1.2,
  },
  {
    id: "light",
    label: "Ligero",
    detail: "1–2 entrenos por semana",
    factor: 1.375,
  },
  {
    id: "moderate",
    label: "Moderado",
    detail: "3–4 entrenos por semana",
    factor: 1.55,
  },
  {
    id: "high",
    label: "Alto",
    detail: "5–6 entrenos por semana",
    factor: 1.725,
  },
  {
    id: "athlete",
    label: "Atleta",
    detail: "Dos sesiones al día o trabajo físico",
    factor: 1.9,
  },
]

export const GOAL_OPTIONS: GoalOption[] = [
  {
    id: "fat-loss",
    label: "Pérdida de grasa",
    detail: "Déficit moderado, proteína alta",
  },
  {
    id: "recomposition",
    label: "Recomposición",
    detail: "Déficit suave, fuerza y músculo",
  },
  {
    id: "hypertrophy",
    label: "Hipertrofia",
    detail: "Superávit controlado",
  },
  {
    id: "health",
    label: "Salud general",
    detail: "Mantenimiento y adherencia",
  },
]

export const EXCLUSION_OPTIONS: ExclusionOption[] = [
  { id: "gluten", label: "Gluten" },
  { id: "lactosa", label: "Lactosa" },
  { id: "huevo", label: "Huevo" },
  { id: "frutos secos", label: "Frutos secos" },
  { id: "pescado", label: "Pescado" },
  { id: "marisco", label: "Marisco" },
  { id: "soja", label: "Soja" },
  { id: "cerdo", label: "Cerdo" },
  { id: "vegetariano", label: "Vegetariano" },
  { id: "vegano", label: "Vegano" },
]

export const SHOP_CATEGORIES: Array<{
  id: ShopCategory
  label: string
  hint: string
}> = [
  {
    id: "proteinas",
    label: "Proteínas / Carnicería",
    hint: "Carnes, pescados, huevos y proteína en polvo",
  },
  {
    id: "fruteria",
    label: "Frutería / Verdulería",
    hint: "Frutas, verduras y hortalizas",
  },
  {
    id: "carbohidratos",
    label: "Carbohidratos / Despensa",
    hint: "Arroz, pasta, patata, pan y legumbres",
  },
  {
    id: "grasas",
    label: "Grasas / Lácteos",
    hint: "Aceite, frutos secos, aguacate y lácteos",
  },
]

const MEAL_TEMPLATES: Record<MealsPerDay, MealTemplate[]> = {
  3: [
    {
      id: "breakfast",
      title: "Desayuno",
      time: "08:00",
      kind: "breakfast",
      share: 0.3,
      icon: "sun",
    },
    {
      id: "lunch",
      title: "Comida",
      time: "13:30",
      kind: "main",
      share: 0.4,
      icon: "leaf",
    },
    {
      id: "dinner",
      title: "Cena",
      time: "20:30",
      kind: "main",
      share: 0.3,
      icon: "moon",
    },
  ],
  4: [
    {
      id: "breakfast",
      title: "Desayuno",
      time: "08:00",
      kind: "breakfast",
      share: 0.25,
      icon: "sun",
    },
    {
      id: "lunch",
      title: "Comida",
      time: "13:30",
      kind: "main",
      share: 0.35,
      icon: "leaf",
    },
    {
      id: "snack",
      title: "Merienda",
      time: "17:30",
      kind: "snack",
      share: 0.15,
      icon: "sparkles",
    },
    {
      id: "dinner",
      title: "Cena",
      time: "20:30",
      kind: "main",
      share: 0.25,
      icon: "moon",
    },
  ],
  5: [
    {
      id: "breakfast",
      title: "Desayuno",
      time: "08:00",
      kind: "breakfast",
      share: 0.22,
      icon: "sun",
    },
    {
      id: "mid-morning",
      title: "Media mañana",
      time: "11:00",
      kind: "snack",
      share: 0.13,
      icon: "clock",
    },
    {
      id: "lunch",
      title: "Comida",
      time: "13:30",
      kind: "main",
      share: 0.3,
      icon: "leaf",
    },
    {
      id: "snack",
      title: "Merienda",
      time: "17:30",
      kind: "snack",
      share: 0.12,
      icon: "sparkles",
    },
    {
      id: "dinner",
      title: "Cena",
      time: "20:30",
      kind: "main",
      share: 0.23,
      icon: "moon",
    },
  ],
  6: [
    {
      id: "breakfast",
      title: "Desayuno",
      time: "08:00",
      kind: "breakfast",
      share: 0.2,
      icon: "sun",
    },
    {
      id: "mid-morning",
      title: "Media mañana",
      time: "11:00",
      kind: "snack",
      share: 0.1,
      icon: "clock",
    },
    {
      id: "lunch",
      title: "Comida",
      time: "13:30",
      kind: "main",
      share: 0.27,
      icon: "leaf",
    },
    {
      id: "snack",
      title: "Merienda",
      time: "17:30",
      kind: "snack",
      share: 0.11,
      icon: "sparkles",
    },
    {
      id: "dinner",
      title: "Cena",
      time: "20:30",
      kind: "main",
      share: 0.22,
      icon: "moon",
    },
    {
      id: "late",
      title: "Recena",
      time: "22:30",
      kind: "recena",
      share: 0.1,
      icon: "moon",
    },
  ],
}

function f(
  id: string,
  name: string,
  category: FoodCategory,
  shop: ShopCategory,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  slots: MealSlot[],
  tags: string[] = [],
  unit?: FoodUnit,
  step = 5,
): Food {
  return {
    id,
    name,
    category,
    shop,
    per100: { kcal, protein, carbs, fat },
    tags,
    slots,
    unit,
    step,
  }
}

/**
 * Catálogo base. Los valores son por 100 g de alimento en crudo o cocido
 * según el nombre, y salen de tablas de composición habituales. No pretende
 * sustituir a un dietista: es la base con la que el generador monta el menú.
 */
export const FOODS: Food[] = [
  // Proteínas
  f(
    "pollo",
    "Pechuga de pollo",
    "protein",
    "proteinas",
    165,
    31,
    0,
    3.6,
    ["main"],
    ["carne"],
  ),
  f(
    "pavo",
    "Pechuga de pavo",
    "protein",
    "proteinas",
    135,
    29,
    0,
    1.6,
    ["main"],
    ["carne"],
  ),
  f(
    "ternera",
    "Ternera magra",
    "protein",
    "proteinas",
    187,
    26,
    0,
    9,
    ["main"],
    ["carne"],
  ),
  f(
    "cerdo",
    "Lomo de cerdo",
    "protein",
    "proteinas",
    143,
    26,
    0,
    3.5,
    ["main"],
    ["carne", "cerdo"],
  ),
  f("salmon", "Salmón", "protein", "proteinas", 208, 20, 0, 13, ["main"], [
    "pescado",
  ]),
  f("merluza", "Merluza", "protein", "proteinas", 86, 17, 0, 1.8, ["main"], [
    "pescado",
  ]),
  f(
    "atun",
    "Atún al natural",
    "protein",
    "proteinas",
    132,
    28,
    0,
    1.3,
    ["main"],
    ["pescado"],
  ),
  f("bacalao", "Bacalao", "protein", "proteinas", 82, 18, 0, 0.7, ["main"], [
    "pescado",
  ]),
  f("gambas", "Gambas", "protein", "proteinas", 99, 24, 0.2, 0.3, ["main"], [
    "marisco",
  ]),
  f(
    "huevo",
    "Huevo",
    "protein",
    "proteinas",
    143,
    13,
    0.7,
    9.5,
    ["breakfast", "main", "recena"],
    ["huevo"],
    { grams: 60, singular: "huevo", plural: "huevos" },
  ),
  f(
    "tofu",
    "Tofu firme",
    "protein",
    "proteinas",
    76,
    8,
    1.9,
    4.8,
    ["main", "breakfast"],
    ["soja"],
  ),
  f("tempeh", "Tempeh", "protein", "proteinas", 192, 20, 7.6, 11, ["main"], [
    "soja",
  ]),
  f(
    "lentejas",
    "Lentejas cocidas",
    "protein",
    "carbohidratos",
    116,
    9,
    20,
    0.4,
    ["main"],
    [],
  ),
  f(
    "garbanzos",
    "Garbanzos cocidos",
    "protein",
    "carbohidratos",
    164,
    8.9,
    27,
    2.6,
    ["main"],
    [],
  ),
  f(
    "yogur",
    "Yogur griego natural",
    "protein",
    "grasas",
    59,
    10,
    3.6,
    0.4,
    ["breakfast", "snack", "recena"],
    ["lactosa"],
  ),
  f(
    "queso",
    "Queso fresco batido",
    "protein",
    "grasas",
    98,
    11,
    3.4,
    4.3,
    ["breakfast", "snack"],
    ["lactosa"],
  ),
  f(
    "whey",
    "Proteína de suero",
    "protein",
    "proteinas",
    380,
    80,
    8,
    5,
    ["breakfast", "snack", "recena"],
    ["lactosa"],
  ),
  f("seitan", "Seitán", "protein", "proteinas", 141, 25, 14, 2, ["main"], [
    "gluten",
  ]),

  // Carbohidratos
  f(
    "arroz",
    "Arroz blanco cocido",
    "carb",
    "carbohidratos",
    130,
    2.7,
    28,
    0.3,
    ["main"],
  ),
  f(
    "arroz-integral",
    "Arroz integral cocido",
    "carb",
    "carbohidratos",
    123,
    2.7,
    26,
    1,
    ["main"],
  ),
  f(
    "pasta",
    "Pasta cocida",
    "carb",
    "carbohidratos",
    158,
    5.8,
    31,
    0.9,
    ["main"],
    ["gluten"],
  ),
  f("patata", "Patata cocida", "carb", "carbohidratos", 87, 2, 20, 0.1, [
    "main",
    "recena",
  ]),
  f("boniato", "Boniato", "carb", "carbohidratos", 86, 1.6, 20, 0.1, ["main"]),
  f(
    "avena",
    "Copos de avena",
    "carb",
    "carbohidratos",
    379,
    13,
    67,
    6.5,
    ["breakfast"],
    ["gluten"],
  ),
  f(
    "pan",
    "Pan integral",
    "carb",
    "carbohidratos",
    247,
    13,
    41,
    3.4,
    ["breakfast", "recena"],
    ["gluten"],
    { grams: 30, singular: "rebanada", plural: "rebanadas" },
  ),
  f("quinoa", "Quinoa cocida", "carb", "carbohidratos", 120, 4.4, 21, 1.9, [
    "main",
  ]),
  f(
    "cuscus",
    "Cuscús cocido",
    "carb",
    "carbohidratos",
    112,
    3.8,
    23,
    0.2,
    ["main"],
    ["gluten"],
  ),
  f("tortitas", "Tortitas de maíz", "carb", "carbohidratos", 387, 8, 78, 3, [
    "breakfast",
    "snack",
  ]),
  f(
    "platano",
    "Plátano",
    "carb",
    "fruteria",
    89,
    1.1,
    23,
    0.3,
    ["breakfast", "snack", "recena"],
    [],
    { grams: 120, singular: "plátano", plural: "plátanos" },
  ),
  f(
    "manzana",
    "Manzana",
    "carb",
    "fruteria",
    52,
    0.3,
    14,
    0.2,
    ["breakfast", "snack"],
    [],
    { grams: 180, singular: "manzana", plural: "manzanas" },
  ),
  f("arandanos", "Arándanos", "carb", "fruteria", 57, 0.7, 14, 0.3, [
    "breakfast",
    "snack",
    "recena",
  ]),
  f(
    "naranja",
    "Naranja",
    "carb",
    "fruteria",
    47,
    0.9,
    12,
    0.1,
    ["breakfast", "snack"],
    [],
    { grams: 180, singular: "naranja", plural: "naranjas" },
  ),
  f("datiles", "Dátiles", "carb", "fruteria", 282, 2.5, 75, 0.4, [
    "breakfast",
    "snack",
  ]),

  // Grasas
  f(
    "aceite",
    "Aceite de oliva virgen extra",
    "fat",
    "grasas",
    884,
    0,
    0,
    100,
    ["main", "breakfast"],
    [],
    undefined,
    1,
  ),
  f(
    "aguacate",
    "Aguacate",
    "fat",
    "grasas",
    160,
    2,
    8.5,
    14.7,
    ["breakfast", "main"],
    [],
  ),
  f(
    "almendras",
    "Almendras",
    "fat",
    "grasas",
    579,
    21,
    22,
    50,
    ["breakfast", "snack", "recena"],
    ["frutos secos"],
  ),
  f(
    "nueces",
    "Nueces",
    "fat",
    "grasas",
    654,
    15,
    14,
    65,
    ["breakfast", "snack"],
    ["frutos secos"],
  ),
  f("cacahuetes", "Cacahuetes", "fat", "grasas", 567, 26, 16, 49, ["snack"], [
    "frutos secos",
  ]),
  f(
    "crema-cacahuete",
    "Crema de cacahuete",
    "fat",
    "grasas",
    588,
    25,
    20,
    50,
    ["breakfast", "snack", "recena"],
    ["frutos secos"],
  ),
  f("chia", "Semillas de chía", "fat", "grasas", 486, 17, 42, 31, [
    "breakfast",
    "snack",
  ]),
  f("aceitunas", "Aceitunas", "fat", "grasas", 115, 0.8, 6, 11, [
    "main",
    "snack",
  ]),
  f(
    "mantequilla",
    "Mantequilla",
    "fat",
    "grasas",
    717,
    0.9,
    0.1,
    81,
    ["breakfast"],
    ["lactosa"],
    undefined,
    1,
  ),

  // Verduras y hortalizas (el comodín de micronutrientes)
  f("brocoli", "Brócoli", "veg", "fruteria", 34, 2.8, 7, 0.4, ["main"]),
  f("espinaca", "Espinaca", "veg", "fruteria", 23, 2.9, 3.6, 0.4, ["main"]),
  f("calabacin", "Calabacín", "veg", "fruteria", 17, 1.2, 3.1, 0.3, ["main"]),
  f("pimiento", "Pimiento", "veg", "fruteria", 31, 1, 6, 0.3, ["main"]),
  f("tomate", "Tomate", "veg", "fruteria", 18, 0.9, 3.9, 0.2, ["main"]),
  f("lechuga", "Lechuga", "veg", "fruteria", 15, 1.4, 2.9, 0.2, ["main"]),
  f("zanahoria", "Zanahoria", "veg", "fruteria", 41, 0.9, 10, 0.2, ["main"]),
  f("judias-verdes", "Judías verdes", "veg", "fruteria", 31, 1.8, 7, 0.1, [
    "main",
  ]),
  f("champinones", "Champiñones", "veg", "fruteria", 22, 3.1, 3.3, 0.3, [
    "main",
  ]),
  f("cebolla", "Cebolla", "veg", "fruteria", 40, 1.1, 9, 0.1, ["main"]),
]

export const PROTEIN_FOODS = FOODS.filter((food) => food.category === "protein")
export const CARB_FOODS = FOODS.filter((food) => food.category === "carb")
export const FAT_FOODS = FOODS.filter((food) => food.category === "fat")
export const VEG_FOODS = FOODS.filter((food) => food.category === "veg")

const ZERO: Macro = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function roundTo(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value / step) * step
}

function scale(per100: Macro, grams: number): Macro {
  const ratio = grams / 100
  return {
    kcal: Math.round(per100.kcal * ratio),
    protein: round1(per100.protein * ratio),
    carbs: round1(per100.carbs * ratio),
    fat: round1(per100.fat * ratio),
  }
}

function add(a: Macro, b: Macro): Macro {
  return {
    kcal: a.kcal + b.kcal,
    protein: round1(a.protein + b.protein),
    carbs: round1(a.carbs + b.carbs),
    fat: round1(a.fat + b.fat),
  }
}

function subtract(a: Macro, b: Macro): Macro {
  return {
    kcal: a.kcal - b.kcal,
    protein: a.protein - b.protein,
    carbs: a.carbs - b.carbs,
    fat: a.fat - b.fat,
  }
}

function normalizeGoal(goal?: string | null): Goal {
  if (goal === "fat-loss" || goal === "recomposition" || goal === "health") {
    return goal
  }
  return "hypertrophy"
}

export function activityFromAvailability(availability?: string): ActivityLevel {
  const days = Number.parseInt(availability ?? "", 10)
  if (!Number.isFinite(days)) return "moderate"
  if (days <= 2) return "sedentary"
  if (days === 3) return "light"
  if (days === 4) return "moderate"
  if (days === 5) return "high"
  return "athlete"
}

function normalizeActivity(value: unknown): ActivityLevel {
  return ACTIVITY_OPTIONS.some((option) => option.id === value)
    ? value as ActivityLevel
    : "moderate"
}

function normalizeMeals(value: unknown): MealsPerDay {
  return value === 3 || value === 4 || value === 5 || value === 6 ? value : 4
}

function listOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const clean = value.filter((item): item is string => typeof item === "string")
  return clean.length > 0 ? clean : fallback
}

export function preferenciasPorDefecto(profile: PlanProfile): PlanPreferences {
  return {
    goal: normalizeGoal(profile.goal),
    activity: activityFromAvailability(profile.availability),
    mealsPerDay: 4,
    proteins: ["pollo", "huevo", "salmon", "yogur", "lentejas"],
    carbs: ["arroz", "avena", "patata", "pan", "platano"],
    fats: ["aceite", "aguacate", "almendras"],
    exclusions: [],
    variant: 0,
  }
}

export function cargarPreferencias(profile: PlanProfile): PlanPreferences {
  const base = preferenciasPorDefecto(profile)
  try {
    if (typeof window === "undefined") return base
    const raw = window.localStorage.getItem(PLAN_KEY)
    if (!raw) return base
    const stored = JSON.parse(raw) as Partial<PlanPreferences>
    return {
      ...base,
      goal: normalizeGoal(stored.goal),
      activity: normalizeActivity(stored.activity),
      mealsPerDay: normalizeMeals(stored.mealsPerDay),
      proteins: listOr(stored.proteins, base.proteins),
      carbs: listOr(stored.carbs, base.carbs),
      fats: listOr(stored.fats, base.fats),
      exclusions: Array.isArray(stored.exclusions)
        ? stored.exclusions.filter((item) => typeof item === "string")
        : base.exclusions,
      variant:
        typeof stored.variant === "number" && Number.isFinite(stored.variant)
          ? stored.variant
          : 0,
    }
  } catch {
    return base
  }
}

export function guardarPreferencias(prefs: PlanPreferences): void {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(PLAN_KEY, JSON.stringify(prefs))
  } catch {
    // Si el almacenamiento está bloqueado, el plan sigue funcionando en memoria.
  }
}

function isAllowed(food: Food, exclusions: string[]): boolean {
  if (exclusions.includes("vegetariano")) {
    if (
      food.tags.includes("carne") ||
      food.tags.includes("pescado") ||
      food.tags.includes("marisco")
    ) {
      return false
    }
  }
  if (exclusions.includes("vegano")) {
    if (
      food.tags.includes("carne") ||
      food.tags.includes("pescado") ||
      food.tags.includes("marisco") ||
      food.tags.includes("lactosa") ||
      food.tags.includes("huevo")
    ) {
      return false
    }
  }
  return !food.tags.some((tag) => exclusions.includes(tag))
}

function goalAdjustment(goal: Goal, tdee: number): number {
  if (goal === "fat-loss") {
    return -Math.round(Math.min(500, Math.max(250, tdee * 0.2)) / 10) * 10
  }
  if (goal === "recomposition") {
    return -Math.round(Math.min(250, Math.max(100, tdee * 0.08)) / 10) * 10
  }
  if (goal === "hypertrophy") {
    return Math.round(Math.min(400, Math.max(200, tdee * 0.1)) / 10) * 10
  }
  return 0
}

function goalLabel(goal: Goal): string {
  return (
    GOAL_OPTIONS.find((option) => option.id === goal)?.label ?? "Hipertrofia"
  )
}

const PROTEIN_FACTOR: Record<Goal, number> = {
  "fat-loss": 2.4,
  recomposition: 2.3,
  hypertrophy: 2.1,
  health: 1.7,
}

export function analizarPerfil(
  profile: PlanProfile,
  prefs: PlanPreferences,
): PlanAnalysis {
  const weight = clamp(profile.weight || 63.2, 35, 250)
  const height = clamp(profile.height || 168, 140, 230)
  const age = clamp(profile.age || 29, 16, 90)
  const bodyFat =
    typeof profile.bodyFat === "number" &&
    profile.bodyFat >= 3 &&
    profile.bodyFat <= 70
      ? clamp(profile.bodyFat, 3, 70)
      : null
  const leanMass = bodyFat !== null ? weight * (1 - bodyFat / 100) : null
  const formula = leanMass !== null ? "katch" : "mifflin"
  const bmr =
    leanMass !== null
      ? 370 + 21.6 * leanMass
      : 10 * weight +
        6.25 * height -
        5 * age +
        (profile.sex === "male" ? 5 : -161)

  const activity =
    ACTIVITY_OPTIONS.find((option) => option.id === prefs.activity) ??
    ACTIVITY_OPTIONS[2]!
  const tdee = bmr * activity.factor
  const adjustment = goalAdjustment(prefs.goal, tdee)
  const calories = Math.max(1200, Math.round((tdee + adjustment) / 10) * 10)

  const proteinBase = leanMass ?? weight
  const proteinFactor = PROTEIN_FACTOR[prefs.goal]
  let protein = Math.round(
    Math.min(proteinBase * proteinFactor, (calories * 0.4) / 4),
  )
  protein = Math.max(Math.round(weight * 0.9), protein)

  let fat = Math.round(
    Math.min(
      weight * (prefs.goal === "fat-loss" ? 0.8 : 1),
      (calories * 0.35) / 9,
    ),
  )
  fat = Math.max(Math.round(weight * 0.55), fat)

  let carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))
  if (carbs < 40) {
    fat = Math.max(
      Math.round(weight * 0.5),
      Math.round((calories - protein * 4 - 40 * 4) / 9),
    )
    carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))
  }
  if (carbs < 20) {
    protein = Math.max(
      Math.round(weight * 1.2),
      Math.round((calories - fat * 9 - 20 * 4) / 4),
    )
    carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))
  }

  const macroKcal = protein * 4 + carbs * 4 + fat * 9
  const proteinPct =
    macroKcal > 0 ? Math.round((protein * 4 * 100) / macroKcal) : 0
  const carbsPct = macroKcal > 0 ? Math.round((carbs * 4 * 100) / macroKcal) : 0
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct)

  const waistHip =
    typeof profile.waist === "number" &&
    typeof profile.hips === "number" &&
    profile.hips > 0
      ? round1((profile.waist / profile.hips) * 100) / 100
      : null

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    adjustment,
    protein,
    carbs,
    fat,
    proteinKcal: protein * 4,
    carbsKcal: carbs * 4,
    fatKcal: fat * 9,
    proteinPct,
    carbsPct,
    fatPct,
    bmi: round1(weight / Math.pow(height / 100, 2)),
    bodyFat,
    leanMass: leanMass !== null ? round1(leanMass) : null,
    waistHip,
    waterMl: Math.round(clamp(weight * 35 + 500, 1500, 4000) / 250) * 250,
    formula,
    goalLabel: goalLabel(prefs.goal),
    activityLabel: activity.label,
    activityFactor: activity.factor,
  }
}

function solve3x3(a: number[][], b: number[]): number[] | null {
  const a00 = a[0]![0]!
  const a01 = a[0]![1]!
  const a02 = a[0]![2]!
  const a10 = a[1]![0]!
  const a11 = a[1]![1]!
  const a12 = a[1]![2]!
  const a20 = a[2]![0]!
  const a21 = a[2]![1]!
  const a22 = a[2]![2]!

  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20)
  if (Math.abs(det) < 1e-9) return null

  const detX =
    b[0]! * (a11 * a22 - a12 * a21) -
    a01 * (b[1]! * a22 - a12 * b[2]!) +
    a02 * (b[1]! * a21 - a11 * b[2]!)

  const detY =
    a00 * (b[1]! * a22 - a12 * b[2]!) -
    b[0]! * (a10 * a22 - a12 * a20) +
    a02 * (a10 * b[2]! - b[1]! * a20)

  const detZ =
    a00 * (a11 * b[2]! - b[1]! * a21) -
    a01 * (a10 * b[2]! - b[1]! * a20) +
    b[0]! * (a10 * a21 - a11 * a20)

  return [detX / det, detY / det, detZ / det]
}

type PortionGrams = {
  proteinGrams: number
  carbGrams: number
  fatGrams: number
}

type ShoppingAccumulator = {
  food: Food
  grams: number
}

function solvePortions(
  protein: Food,
  carb: Food,
  fat: Food,
  target: Macro,
): PortionGrams {
  const matrix = [
    [protein.per100.protein, carb.per100.protein, fat.per100.protein],
    [protein.per100.carbs, carb.per100.carbs, fat.per100.carbs],
    [protein.per100.fat, carb.per100.fat, fat.per100.fat],
  ]
  const solved = solve3x3(matrix, [target.protein, target.carbs, target.fat])
  if (solved) {
    const [p, c, f] = solved
    if (
      Number.isFinite(p) &&
      Number.isFinite(c) &&
      Number.isFinite(f) &&
      p >= 25 &&
      p <= 350 &&
      c >= 0 &&
      c <= 500 &&
      f >= 0 &&
      f <= 120
    ) {
      return { proteinGrams: p, carbGrams: c, fatGrams: f }
    }
  }

  // Cuando el sistema no da una solución física (por ejemplo, porque el
  // carbohidrato elegido ya aporta bastante proteína), se refinan las tres
  // porciones a la vez: cada pasada corrige el macro que más se desvía con el
  // alimento que lo aporta. Así el plato no se queda corto ni se pasa de
  // proteína solo porque el pan o la avena también cuentan.
  const proteinRate = protein.per100.protein / 100
  const carbRate = carb.per100.carbs / 100
  const fatRate = fat.per100.fat / 100
  let grams: PortionGrams = {
    proteinGrams: clamp(target.protein / Math.max(0.01, proteinRate), 25, 350),
    carbGrams: clamp(target.carbs / Math.max(0.01, carbRate), 0, 500),
    fatGrams: clamp(target.fat / Math.max(0.01, fatRate), 0, 120),
  }

  for (let pass = 0; pass < 12; pass += 1) {
    const p = grams.proteinGrams
    const c = grams.carbGrams
    const f = grams.fatGrams
    const proteinNow =
      p * proteinRate +
      (c * carb.per100.protein) / 100 +
      (f * fat.per100.protein) / 100
    const carbsNow =
      (p * protein.per100.carbs) / 100 +
      c * carbRate +
      (f * fat.per100.carbs) / 100
    const fatNow =
      (p * protein.per100.fat) / 100 + (c * carb.per100.fat) / 100 + f * fatRate
    grams = {
      proteinGrams: clamp(
        p + (target.protein - proteinNow) / Math.max(0.01, proteinRate),
        25,
        350,
      ),
      carbGrams: clamp(
        c + (target.carbs - carbsNow) / Math.max(0.01, carbRate),
        0,
        500,
      ),
      fatGrams: clamp(
        f + (target.fat - fatNow) / Math.max(0.01, fatRate),
        0,
        120,
      ),
    }
  }

  return grams
}

function currentKcal(grams: number, food: Food): number {
  return (food.per100.kcal * grams) / 100
}

function adjustToKcal(
  protein: Food,
  carb: Food,
  fat: Food,
  grams: PortionGrams,
  targetKcal: number,
): PortionGrams {
  const total =
    currentKcal(grams.proteinGrams, protein) +
    currentKcal(grams.carbGrams, carb) +
    currentKcal(grams.fatGrams, fat)
  const diff = targetKcal - total
  if (Math.abs(diff) < targetKcal * 0.04) return grams
  const carbKcalPerGram = carb.per100.kcal / 100
  if (carbKcalPerGram <= 0) return grams
  return {
    ...grams,
    carbGrams: clamp(grams.carbGrams + diff / carbKcalPerGram, 0, 500),
  }
}

function formatGrams(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000)
      .toLocaleString("es-ES", { maximumFractionDigits: 2 })
      .replace(".", ",")} kg`
  }
  return `${Math.round(grams)} g`
}

export function formatearCantidad(food: Food, grams: number): string {
  if (food.unit && food.unit.grams > 0) {
    const units = Math.max(1, Math.round(grams / food.unit.grams))
    return `${units} ${
      units === 1 ? food.unit.singular : food.unit.plural
    } · ${formatGrams(grams)}`
  }
  return formatGrams(grams)
}

function formatearCompra(food: Food, grams: number): string {
  const total = Math.max(5, Math.round(grams / 5) * 5)
  if (food.unit && food.unit.grams > 0) {
    const units = Math.max(1, Math.round(total / food.unit.grams))
    return `${units} ${
      units === 1 ? food.unit.singular : food.unit.plural
    } · ${formatGrams(total)}`
  }
  return formatGrams(total)
}

function buildMealFood(food: Food, grams: number): PlanMealFood {
  return {
    id: food.id,
    name: food.name,
    grams,
    quantity: formatearCantidad(food, grams),
    macros: scale(food.per100, grams),
    per100: food.per100,
  }
}

function pickFood(pool: Food[], kind: MealSlot, offset: number): Food {
  const suitable = pool.filter((food) => food.slots.includes(kind))
  const list = suitable.length > 0 ? suitable : pool
  return list[Math.abs(offset) % list.length]!
}

function dishName(foods: PlanMealFood[]): string {
  const names = foods.map((food) => {
    const name = food.name.toLowerCase()
    return name.charAt(0).toUpperCase() + name.slice(1)
  })
  if (names.length === 0) return "Plato libre"
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} con ${names[1]}`
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`
}

function buildMeal(
  template: MealTemplate,
  analysis: PlanAnalysis,
  picks: {
    protein: Food
    carb: Food
    fat: Food
    veg: Food | null
  },
): PlanMeal {
  const target: Macro = {
    kcal: analysis.calories * template.share,
    protein: analysis.protein * template.share,
    carbs: analysis.carbs * template.share,
    fat: analysis.fat * template.share,
  }
  const vegGrams = picks.veg ? (template.kind === "main" ? 150 : 0) : 0
  const vegMacros = picks.veg ? scale(picks.veg.per100, vegGrams) : ZERO
  const remaining = subtract(target, vegMacros)

  let grams = solvePortions(picks.protein, picks.carb, picks.fat, remaining)
  grams = adjustToKcal(
    picks.protein,
    picks.carb,
    picks.fat,
    grams,
    remaining.kcal,
  )

  const proteinGrams = Math.max(
    picks.protein.step,
    roundTo(grams.proteinGrams, picks.protein.step),
  )
  const carbGrams = roundTo(grams.carbGrams, picks.carb.step)
  const fatGrams = roundTo(grams.fatGrams, picks.fat.step)

  const foods: PlanMealFood[] = [buildMealFood(picks.protein, proteinGrams)]
  if (carbGrams > 0) {
    foods.push(buildMealFood(picks.carb, carbGrams))
  }
  if (fatGrams > 0) {
    foods.push(buildMealFood(picks.fat, fatGrams))
  }
  if (picks.veg && vegGrams > 0) {
    foods.push(buildMealFood(picks.veg, vegGrams))
  }

  const macros = foods.reduce<Macro>(
    (totals, food) => add(totals, food.macros),
    ZERO,
  )

  return {
    id: template.id,
    title: template.title,
    dish: dishName(foods),
    time: template.time,
    kind: template.kind,
    icon: template.icon,
    macros,
    foods,
  }
}

export function generarPlan(
  profile: PlanProfile,
  prefs: PlanPreferences,
  extraFoods: Food[] = [],
): NutritionPlan {
  const analysis = analizarPerfil(profile, prefs)
  const warnings = new Set<string>()
  const allowed = (food: Food) => isAllowed(food, prefs.exclusions)

  // Los favoritos de la biblioteca se suman al catálogo base. Si comparten id
  // con un alimento del plan, manda el del plan para no duplicar la compra.
  const extras = extraFoods.filter(
    (food) => !FOODS.some((base) => base.id === food.id),
  )
  const allFoods = [...FOODS, ...extras]

  function poolFor(category: FoodCategory, ids: string[]): Food[] {
    const selected = allFoods.filter(
      (food) =>
        food.category === category && ids.includes(food.id) && allowed(food),
    )
    const favorites = extras.filter(
      (food) => food.category === category && allowed(food),
    )
    // Los favoritos entran en la rotación aunque no estén marcados en los
    // chips: el usuario los ha elegido desde la biblioteca.
    const withFavorites = [
      ...favorites,
      ...selected.filter((food) => !favorites.some((f) => f.id === food.id)),
    ]
    if (withFavorites.length > 0) return withFavorites
    const fallback = allFoods.filter(
      (food) => food.category === category && allowed(food),
    )
    if (fallback.length > 0) {
      const label =
        category === "protein"
          ? "proteínas"
          : category === "carb"
            ? "carbohidratos"
            : "grasas"
      warnings.add(
        `Con tus exclusiones no quedaban ${label} en tu selección; se han usado alternativas permitidas.`,
      )
    }
    return fallback
  }

  const proteins = poolFor("protein", prefs.proteins)
  const carbs = poolFor("carb", prefs.carbs)
  const fats = poolFor("fat", prefs.fats)
  const veggies = allFoods.filter(
    (food) => food.category === "veg" && allowed(food),
  )

  if (proteins.length === 0 || carbs.length === 0 || fats.length === 0) {
    warnings.add(
      "No hay alimentos suficientes con esas exclusiones. Quita alguna para generar el menú.",
    )
  }

  const meals: PlanMeal[] = []
  const templates = MEAL_TEMPLATES[prefs.mealsPerDay]
  templates.forEach((template, index) => {
    if (proteins.length === 0 || carbs.length === 0 || fats.length === 0) {
      return
    }
    const offset = prefs.variant + index
    const protein = pickFood(proteins, template.kind, offset)
    const carb = pickFood(carbs, template.kind, offset + 1)
    const fat = pickFood(fats, template.kind, offset + 2)
    const veg =
      template.kind === "main" && veggies.length > 0
        ? pickFood(veggies, "main", offset + 3)
        : null
    meals.push(buildMeal(template, analysis, { protein, carb, fat, veg }))
  })

  const totals = meals.reduce<Macro>((sum, meal) => add(sum, meal.macros), ZERO)

  const shoppingMap = new Map<string, ShoppingAccumulator>()
  for (const meal of meals) {
    for (const item of meal.foods) {
      const food = allFoods.find((candidate) => candidate.id === item.id)
      if (!food) continue
      const previous = shoppingMap.get(food.id)
      shoppingMap.set(food.id, {
        food,
        grams: (previous?.grams ?? 0) + item.grams,
      })
    }
  }

  const shopping: ShoppingGroup[] = SHOP_CATEGORIES.map((category) => ({
    ...category,
    items: [...shoppingMap.values()]
      .filter(({ food }) => food.shop === category.id)
      .sort((a, b) => a.food.name.localeCompare(b.food.name, "es"))
      .map(({ food, grams }) => ({
        id: food.id,
        name: food.name,
        grams: Math.round(grams * 7),
        quantity: formatearCompra(food, grams * 7),
      })),
  })).filter((group) => group.items.length > 0)

  return {
    analysis,
    meals,
    totals,
    shopping,
    warnings: [...warnings],
  }
}
