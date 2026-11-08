import { useEffect, useId, useState, type FormEvent } from "react"
import Icon from "../components/Icon"
import { Button, Logo } from "../components/UI"
import { demoEmail, demoPassword } from "../lib/demo"

export type AuthMode = "login" | "register"

type SplashScreenProps = {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setIsReady(true), 420)
    const completeTimer = window.setTimeout(onComplete, 1350)
    return () => {
      window.clearTimeout(readyTimer)
      window.clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <main className="auth-screen splash-screen">
      <div className="splash-screen__halo" />
      <div className="splash-screen__content">
        <Logo />
        <p>Entrena. Mide. Evoluciona.</p>
      </div>
      <div className={`splash-loader ${isReady ? "is-ready" : ""}`}>
        <span />
        <small>Preparando tu experiencia</small>
      </div>
    </main>
  )
}

type AuthCredentials = {
  mode: AuthMode
  email: string
  password: string
  name: string
}

type AuthScreenProps = {
  mode: AuthMode
  /** Devuelve `null` si fue bien, o el mensaje de error a mostrar. */
  onAuthenticate: (credentials: AuthCredentials) => Promise<string | null>
  onGoogle: () => void
  onModeChange: (mode: AuthMode) => void
}

export function AuthScreen({
  mode,
  onAuthenticate,
  onGoogle,
  onModeChange,
}: AuthScreenProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState(mode === "login" ? demoEmail : "")
  const [password, setPassword] = useState(mode === "login" ? demoPassword : "")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordId = useId()

  useEffect(() => {
    setEmail(mode === "login" ? demoEmail : "")
    setPassword(mode === "login" ? demoPassword : "")
    setName("")
    setError(null)
  }, [mode])
  const isLogin = mode === "login"

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    const message = await onAuthenticate({ mode, email, password, name })
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <main className="auth-screen auth-screen--form">
      <header className="auth-brand-row">
        <Logo />
        <button
          className="text-button"
          onClick={() => onModeChange(isLogin ? "register" : "login")}
          type="button"
        >
          {isLogin ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </header>

      <div className="auth-intro">
        <span className="eyebrow">
          {isLogin ? "BIENVENIDO DE NUEVO" : "EMPIEZA HOY"}
        </span>
        <h1>
          {isLogin ? "Supera tu última marca." : "Tu plan empieza contigo."}
        </h1>
        <p>
          {isLogin
            ? "Entra y continúa donde dejaste tu progreso."
            : "Crea tu perfil y recibe un plan adaptado a ti."}
        </p>
      </div>

      <button className="google-button" onClick={onGoogle} type="button">
        <Icon name="google" size={19} />
        Continuar con Google
      </button>

      <div className="auth-divider">
        <span>o con tu correo</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isLogin ? (
          <label className="form-field">
            <span>Nombre completo</span>
            <div className="input-shell">
              <Icon name="user" size={18} />
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                required
                value={name}
              />
            </div>
          </label>
        ) : null}

        <label className="form-field">
          <span>Correo electrónico</span>
          <div className="input-shell">
            <Icon name="mail" size={18} />
            <input
              autoCapitalize="none"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@correo.com"
              required
              type="email"
              value={email}
            />
          </div>
        </label>

        <div className="form-field">
          <label htmlFor={passwordId}>Contraseña</label>
          <div className="input-shell">
            <Icon name="lock" size={18} />
            <input
              autoComplete={isLogin ? "current-password" : "new-password"}
              id={passwordId}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              aria-pressed={showPassword}
              className="input-action"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
        </div>

        {isLogin ? (
          <div className="auth-form__meta">
            <label className="check-label">
              <input defaultChecked type="checkbox" />
              <span>
                <Icon name="check" size={12} />
              </span>
              Recordarme
            </label>
            <button className="link-button" type="button">
              Olvidé mi contraseña
            </button>
          </div>
        ) : (
          <div className="check-label check-label--terms">
            <input required type="checkbox" />
            <span>
              <Icon name="check" size={12} />
            </span>
            <p>
              Acepto los <button type="button">términos y condiciones</button>
            </p>
          </div>
        )}

        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <Button disabled={busy} fullWidth type="submit">
          {busy
            ? "Comprobando…"
            : isLogin
              ? "Iniciar sesión"
              : "Crear mi cuenta"}
        </Button>
      </form>

      <p className="auth-switch-copy">
        {isLogin ? "¿Primera vez en FORMA?" : "¿Ya tienes una cuenta?"}{" "}
        <button
          onClick={() => onModeChange(isLogin ? "register" : "login")}
          type="button"
        >
          {isLogin ? "Empieza gratis" : "Inicia sesión"}
        </button>
      </p>
    </main>
  )
}

type DisclaimerScreenProps = {
  onAccept: () => void
  onBack: () => void
}

export function DisclaimerScreen({ onAccept, onBack }: DisclaimerScreenProps) {
  const [accepted, setAccepted] = useState(false)

  return (
    <main className="disclaimer-screen screen-stack">
      <header className="simple-header">
        <button
          className="icon-button"
          onClick={onBack}
          type="button"
          aria-label="Volver"
        >
          <Icon name="arrow-left" size={20} />
        </button>
        <span>Paso 1 de 3</span>
        <span className="simple-header__step">01</span>
      </header>

      <div className="step-progress" aria-label="Paso 1 de 3">
        <span className="is-active" />
        <span />
        <span />
      </div>

      <section className="disclaimer-hero">
        <span className="disclaimer-hero__icon">
          <Icon name="shield" size={28} />
        </span>
        <span className="eyebrow">ANTES DE EMPEZAR</span>
        <h1>Tu salud es una decisión personal.</h1>
        <p>Lee y acepta nuestro aviso de exención de responsabilidad.</p>
      </section>

      <section className="legal-card">
        <div className="legal-card__title">
          <Icon name="info" size={18} />
          <strong>Aviso importante</strong>
        </div>
        <p>
          FORMA ofrece información y herramientas de bienestar con fines
          educativos. No somos un servicio médico y no proporcionamos
          diagnóstico, tratamiento ni consejo profesional.
        </p>
        <p>
          Las rutinas, objetivos y estimaciones nutricional se generan a partir
          de los datos que facilitas. Antes de comenzar, consulta con un
          profesional sanitario si tienes alguna condición médica, Tome
          medicación o realizas ejercicio por primera vez.
        </p>
        <p>
          Si experimentas dolor, mareo, falta de aire o cualquier malestar,
          detén la actividad y busca asistencia médica cualificada.
        </p>
        <button className="legal-card__link" type="button">
          Leer exención completa <Icon name="chevron-right" size={15} />
        </button>
      </section>

      <label className={`disclaimer-check ${accepted ? "is-checked" : ""}`}>
        <input
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          type="checkbox"
        />
        <span>
          <Icon name="check" size={13} />
        </span>
        <p>He leído y acepto el aviso de exención de responsabilidad médica.</p>
      </label>

      <div className="screen-footer">
        <Button disabled={!accepted} fullWidth onClick={onAccept}>
          Aceptar y continuar
        </Button>
        <p>
          <Icon name="lock" size={12} /> Tus datos de salud se mantienen
          privados.
        </p>
      </div>
    </main>
  )
}
