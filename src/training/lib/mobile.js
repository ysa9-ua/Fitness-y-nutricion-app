// Stub web de la capa móvil del entrenamiento.
//
// La versión de escritorio usaba una build "mobile" (Capacitor) en la que el
// estado se espejaba a un fichero del dispositivo y los recordatorios eran
// notificaciones nativas. En FORMA no hay Capacitor: MOBILE es siempre
// `false` y estas funciones quedan como no-ops.
//
// Se mantiene la misma firma que el módulo original para no tocar el resto de
// ficheros (Settings, sheets, useStore, Home, Plan…).

export const MOBILE = false

export async function nativeLoad() {
  return null
}

export async function nativeSave() {
  // Sin espejo en fichero: el estado ya vive en localStorage.
}

export async function syncReminder() {
  // Sin notificaciones nativas.
  return true
}

// La exportación de copias de seguridad en la build móvil usa la hoja de
// compartir del sistema. En web se descarga directamente.
export async function shareExport(json, filename) {
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
