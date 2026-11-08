import { useEffect, useRef, useState } from "react"
import Icon from "../components/Icon"

type ScannerScreenProps = {
  onBack: () => void
  onFoodDetected: () => void
}

type CameraState = "idle" | "requesting" | "granted" | "denied"

export default function ScannerScreen({
  onBack,
  onFoodDetected,
}: ScannerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detectionTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const [cameraState, setCameraState] = useState<CameraState>("idle")
  const [isScanning, setIsScanning] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [tip, setTip] = useState("Encuadra la etiqueta nutricional")

  useEffect(
    () => () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (detectionTimerRef.current)
        window.clearTimeout(detectionTimerRef.current)
    },
    [],
  )

  const enableCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("denied")
      setTip("Cámara no disponible. Sube una imagen.")
      return
    }
    setCameraState("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState("granted")
      setTip("Alinea la tabla de información nutricional")
    } catch {
      setCameraState("denied")
      setTip("Permiso denegado. Puedes subir una foto.")
    }
  }

  const queueDetection = (delay: number) => {
    if (detectionTimerRef.current)
      window.clearTimeout(detectionTimerRef.current)
    detectionTimerRef.current = window.setTimeout(onFoodDetected, delay)
  }

  const toggleFlash = async () => {
    const nextValue = !flashOn
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      try {
        const advanced = [
          { torch: nextValue },
        ] as unknown as MediaTrackConstraintSet[]
        await track.applyConstraints({ advanced })
      } catch {
        setTip("Este dispositivo no permite controlar el flash.")
      }
    }
    setFlashOn(nextValue)
  }

  const detectFood = () => {
    if (isScanning) return
    setIsScanning(true)
    setTip("Analizando producto y macronutrientes...")
    queueDetection(1450)
  }

  const handleFile = (file?: File) => {
    if (!file) return
    setIsScanning(true)
    setTip("Analizando imagen...")
    queueDetection(1200)
  }

  return (
    <main className="scanner-screen">
      <video
        aria-label="Vista de la cámara"
        autoPlay
        className={cameraState === "granted" ? "is-visible" : ""}
        muted
        playsInline
        ref={videoRef}
      />

      <div
        className={`scanner-backdrop ${
          cameraState === "granted" ? "is-transparent" : ""
        }`}
      >
        <div className="scanner-noise" />
        <div className="scanner-food-shape scanner-food-shape--one" />
        <div className="scanner-food-shape scanner-food-shape--two" />
        <span className="scanner-brand-overlay">
          FORMA <i>SCAN</i>
        </span>
      </div>

      <div className="scanner-shade scanner-shade--top" />
      <div className="scanner-shade scanner-shade--bottom" />

      <header className="scanner-header">
        <button
          className="scanner-icon-button"
          onClick={onBack}
          type="button"
          aria-label="Cerrar escáner"
        >
          <Icon name="close" size={20} />
        </button>
        <div>
          <span>ESCÁNER DE ETIQUETAS</span>
          <strong>Modo alimento</strong>
        </div>
        <button
          className={`scanner-icon-button ${flashOn ? "is-active" : ""}`}
          onClick={toggleFlash}
          type="button"
          aria-label="Alternar flash"
        >
          <Icon name="sparkles" size={19} />
        </button>
      </header>

      <section className="scanner-stage">
        <div
          aria-busy={isScanning}
          className={`scan-frame ${isScanning ? "is-scanning" : ""}`}
        >
          <i className="scan-corner scan-corner--tl" />
          <i className="scan-corner scan-corner--tr" />
          <i className="scan-corner scan-corner--bl" />
          <i className="scan-corner scan-corner--br" />
          <div className="scan-label-ghost">
            <span>INFORMACIÓN NUTRICIONAL</span>
            <i />
            <i />
            <i />
            <i />
          </div>
          {isScanning ? <span className="scan-beam" /> : null}
        </div>
        <p aria-live="polite" className={isScanning ? "is-processing" : ""}>
          {isScanning ? (
            <span className="processing-spinner" />
          ) : (
            <Icon name="scan" size={16} />
          )}
          {tip}
        </p>
      </section>

      {cameraState === "idle" || cameraState === "requesting" ? (
        <button
          className="camera-permission-card"
          disabled={cameraState === "requesting"}
          onClick={enableCamera}
          type="button"
        >
          <span>
            <Icon name="camera" size={19} />
          </span>
          <div>
            <strong>
              {cameraState === "requesting"
                ? "Solicitando acceso..."
                : "Activar cámara"}
            </strong>
            <small>Permite usar la cámara para escanear</small>
          </div>
          <Icon name="chevron-right" size={16} />
        </button>
      ) : null}

      {cameraState === "denied" ? (
        <div className="camera-permission-card camera-permission-card--denied">
          <span>
            <Icon name="info" size={19} />
          </span>
          <div>
            <strong>Sin acceso a cámara</strong>
            <small>Sube una foto de la etiqueta para continuar</small>
          </div>
        </div>
      ) : null}

      <footer className="scanner-controls">
        <input
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            handleFile(event.target.files?.[0])
            event.target.value = ""
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          type="button"
          aria-label="Subir foto"
        >
          <span>
            <Icon name="image" size={20} />
          </span>
          <small>Galería</small>
        </button>
        <button
          className="shutter-button"
          disabled={isScanning}
          onClick={detectFood}
          type="button"
          aria-label="Escanear etiqueta"
        >
          <i />
        </button>
        <button
          onClick={() => setTip("Acerca la etiqueta y mantén estable")}
          type="button"
          aria-label="Ayuda"
        >
          <span>
            <Icon name="info" size={20} />
          </span>
          <small>Ayuda</small>
        </button>
      </footer>

      <p className="scanner-privacy">
        <Icon name="shield" size={12} /> La imagen se procesa de forma privada
      </p>
    </main>
  )
}
