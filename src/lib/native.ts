// Puente con el contenedor nativo (WebView de Android). El shell expone
// `FORMA_NATIVE` mediante addJavascriptInterface, asi que su presencia
// delata que la web corre dentro de la app instalada y no en un navegador.

export type FormaNative = {
  setCanGoBack: (value: boolean) => void
}

export type FormaWindow = Window & {
  FORMA_NATIVE?: FormaNative
  __formaBack?: () => boolean
}

/**
 * El shell nativo inserta el puente en el contexto de la pagina antes de
 * cargar el documento, asi que esta disponible desde el primer script.
 */
export function nativeBridge(): FormaNative | undefined {
  if (typeof window === "undefined") return undefined
  return (window as FormaWindow).FORMA_NATIVE
}

export function isNativeShell(): boolean {
  return Boolean(nativeBridge())
}

/**
 * Marca el documento como app nativa. El CSS usa este atributo para quitar
 * el marco de telefono de la vista de escritorio y ocupar toda la pantalla.
 * Un breakpoint por ancho no sirve: el viewport del WebView depende de la
 * densidad del dispositivo (1080 px fisicos a 356 dpi dan 485 px CSS, por
 * encima de cualquier breakpoint de movil tipico).
 */
export function markNativeShell(): void {
  if (!isNativeShell()) return
  document.documentElement.dataset.shell = "native"
}
