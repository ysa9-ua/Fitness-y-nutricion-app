import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { markNativeShell } from "./lib/native"
import "./index.css"

// En la app nativa de Android la web tiene que ocupar toda la pantalla, sin
// el marco de telefono de la vista de escritorio. Se marca antes de pintar
// para que no haya un parpadeo con el marco en el primer fotograma.
markNativeShell()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// El service worker convierte la web en PWA instalable, que es la unica
// via de entrega en iOS sin macOS. Se registra solo en builds web de
// produccion: en desarrollo estorbaria al HMR, y en la build de Android
// el WebView ya empaqueta los assets, asi que un cache serviria contenido
// viejo tras actualizar la app desde la tienda.
if (import.meta.env.PROD && import.meta.env.MODE !== "android") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker no registrado:", error)
    })
  })
}
