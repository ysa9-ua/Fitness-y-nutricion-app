import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import "./index.css"

// FORMA: this entry is FORMA embedded as the training section. The service
// worker belongs to the host app (FORMA), not here, so it is not registered.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
