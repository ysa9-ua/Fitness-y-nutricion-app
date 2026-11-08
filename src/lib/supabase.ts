/**
 * FORMA · Cliente de Supabase del web app.
 *
 * La URL y la clave publicable salen del entorno (`VITE_SUPABASE_URL` y
 * `VITE_SUPABASE_PUBLISHABLE_KEY`); no hay valores por defecto en el código, así
 * que si faltan la app no intenta conectar contra el sitio equivocado.
 *
 * El shell `index.html` importa este módulo. La sesión se persiste en
 * `localStorage` bajo una clave fija (`storageKey`) para compartirla entre las
 * pantallas y el resto del código de FORMA, que es del mismo
 * origen.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Las variables se leen de `import.meta.env` (Vite) y, si no existe, de
 * `process.env`. Lo segundo no lo usa la app: permite que el mismo módulo se
 * importe desde un script de Node para probar la sincronización contra una pila
 * local (ver `scripts/`).
 */
const env: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ??
  (typeof process !== "undefined" ? process.env : {})

const url = env.VITE_SUPABASE_URL
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY

/** `true` cuando el entorno trae credenciales con las que hablar con Supabase. */
export const isSupabaseConfigured = Boolean(url && publishableKey)

/**
 * El cliente, o `null` si el entorno no está configurado.
 *
 * Que sea `null` es deliberado: la app puede arrancar sin backend y quedarse en
 * el modo local/demo, sin lanzar una excepción en el módulo (que tumbaría toda
 * la app antes de pintar nada).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, publishableKey as string, {
      auth: {
        // Misma clave en ambos bundles: la sesión abierta en el shell la ve el
        // iframe de entrenamiento, y al revés.
        storageKey: "forma-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
