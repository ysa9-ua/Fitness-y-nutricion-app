/**
 * Credenciales del usuario de demostración.
 *
 * El web app precarga el correo y la contraseña en la pantalla de acceso para
 * que la demo se recorra rápido. Antes ponía `lucia@forma.fit`, que no existe
 * en la base de datos: el seed 04 crea `demo@forma.test`. Con lo anterior, la
 * pantalla venía rellena con un correo que nunca podía iniciar sesión.
 *
 * La contraseña es la del entorno local. En un despliegue real estas credenciales
 * no deberían existir, y por eso `VITE_SUPABASE_*` deja el hueco preparado para
 * inyectarlas desde el entorno en lugar de tenerlas escritas aquí.
 */
export const demoEmail: string =
  import.meta.env.VITE_SUPABASE_DEMO_EMAIL as string | undefined ??
  "demo@forma.test"

export const demoPassword: string =
  import.meta.env.VITE_SUPABASE_DEMO_PASSWORD as string | undefined ??
  "forma2026"
