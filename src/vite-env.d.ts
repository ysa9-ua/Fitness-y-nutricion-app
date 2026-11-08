/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de la API de Supabase. Ver `.env.example`. */
  readonly VITE_SUPABASE_URL?: string
  /** Clave publicable (antes "anon") del proyecto. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Cuenta de demostración precargada en la pantalla de acceso. */
  readonly VITE_SUPABASE_DEMO_EMAIL?: string
  readonly VITE_SUPABASE_DEMO_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
