/**
 * FORMA · Consultas al backend de Supabase desde el shell.
 *
 * Espeja una parte mínima del `Repositorio` de Flutter
 * (`forma/lib/data/repositorio.dart`): lo que la app web necesita para reflejar
 * el perfil real del usuario. El entrenamiento tiene su propio puente en
 * `src/training/lib/supabaseSync.js`, porque vive en otro bundle.
 *
 * Igual que en Flutter, aquí no se lanza una excepción si falta la conexión: los
 * métodos devuelven `null` (o el valor vacío que corresponda) y la pantalla
 * decide qué enseña.
 */

import { supabase } from "./supabase"

export type Perfil = {
  auth_id: string
  nombre_completo: string | null
  sexo: string | null
  edad: number | null
  altura_cm: number | null
  peso_kg: number | null
  peso_inicial_kg: number | null
  grasa_corporal_pct: number | null
  cuello_cm: number | null
  cintura_cm: number | null
  cadera_cm: number | null
  nivel_experiencia: string | null
  deporte_principal: string | null
  disponibilidad: string | null
  objetivo: string | null
  calorias_objetivo: number | null
  onboarding_completado: boolean
}

/** El usuario de Auth de la sesión actual, o `null` si no hay sesión. */
export async function getSessionUser() {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user ?? null
  } catch {
    return null
  }
}

/** La fila de `perfiles` del usuario actual, o `null` si aún no existe. */
export async function perfil(): Promise<Perfil | null> {
  if (!supabase) return null
  const user = await getSessionUser()
  if (!user) return null
  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("auth_id", user.id)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data as Perfil
  } catch {
    return null
  }
}

/**
 * Los campos de `perfiles` que encajan en el perfil que pinta el shell.
 *
 * No se copia la fila entera: `OnboardingData` tiene otro nombre para casi todo
 * (`peso_kg` → `weight`, `objetivo` → `goal`…) y el perfil local sigue mandando
 * sobre los valores que la base no guarda (por ejemplo, las fotos). Las columnas
 * `numeric` pueden llegar como número o como cadena; se normalizan aquí.
 */
export function perfilAOnboarding(perfil: Perfil) {
  const salida: Record<string, string | number> = {}
  const poner = (clave: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== "")
      salida[clave] = valor
  }
  const num = (v: number | string | null | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  poner("age", num(perfil.edad))
  poner("weight", num(perfil.peso_kg))
  poner("initialWeight", num(perfil.peso_inicial_kg))
  poner("height", num(perfil.altura_cm))
  poner("bodyFat", num(perfil.grasa_corporal_pct))
  poner("neck", num(perfil.cuello_cm))
  poner("waist", num(perfil.cintura_cm))
  poner("hips", num(perfil.cadera_cm))
  poner(
    "sex",
    perfil.sexo === "masculino"
      ? "male"
      : perfil.sexo === "femenino"
        ? "female"
        : undefined,
  )
  poner("calories", num(perfil.calorias_objetivo))
  poner("experience", perfil.nivel_experiencia)
  poner("sport", perfil.deporte_principal)
  poner("availability", perfil.disponibilidad)
  poner("goal", perfil.objetivo)
  return salida
}

export type PerfilEscritura = {
  nombre_completo?: string
  sexo?: "masculino" | "femenino"
  edad?: number
  altura_cm?: number
  peso_kg?: number
  peso_inicial_kg?: number
  grasa_corporal_pct?: number
  cuello_cm?: number
  cintura_cm?: number
  cadera_cm?: number
  nivel_experiencia?: string
  deporte_principal?: string
  disponibilidad?: string
  objetivo?: string
  calorias_objetivo?: number
  onboarding_completado?: boolean
}

/**
 * Guarda el perfil del usuario actual.
 *
 * Es un upsert sobre `auth_id`: el onboarding crea la fila y el check-in la
 * actualiza con las medidas nuevas. Sin sesión devuelve `false` y la app sigue
 * con la copia local, igual que el resto de consultas.
 */
export async function guardarPerfil(
  cambios: PerfilEscritura,
): Promise<boolean> {
  if (!supabase) return false
  const user = await getSessionUser()
  if (!user) return false
  try {
    const { error } = await supabase
      .from("perfiles")
      .upsert({ auth_id: user.id, ...cambios }, { onConflict: "auth_id" })
    return !error
  } catch {
    return false
  }
}

/** Traduce el formulario del onboarding al esquema de `perfiles`. */
export function onboardingAPerfil(
  datos: {
    age: number
    weight: number
    initialWeight?: number
    height: number
    bodyFat?: number
    sex?: "female" | "male"
    neck?: number
    waist?: number
    hips?: number
    experience: string
    sport: string
    availability: string
    goal: string
    calories: number
  },
  nombre?: string,
): PerfilEscritura {
  const salida: PerfilEscritura = {
    sexo: datos.sex === "male" ? "masculino" : "femenino",
    edad: Math.round(datos.age),
    altura_cm: Math.round(datos.height),
    peso_kg: datos.weight,
    nivel_experiencia: datos.experience,
    deporte_principal: datos.sport,
    disponibilidad: datos.availability,
    objetivo: datos.goal,
    calorias_objetivo: Math.round(datos.calories),
    onboarding_completado: true,
  }
  if (nombre) salida.nombre_completo = nombre
  if (datos.initialWeight) salida.peso_inicial_kg = datos.initialWeight
  if (datos.bodyFat) salida.grasa_corporal_pct = datos.bodyFat
  if (datos.neck) salida.cuello_cm = datos.neck
  if (datos.waist) salida.cintura_cm = datos.waist
  if (datos.hips) salida.cadera_cm = datos.hips
  return salida
}
