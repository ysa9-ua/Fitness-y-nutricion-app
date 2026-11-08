import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import Icon from "../components/Icon"
import {
  Button,
  ScreenHeader,
  SectionTitle,
  Toast,
  Toggle,
} from "../components/UI"
import { demoEmail } from "../lib/demo"

type Theme = "dark" | "light"

type SettingsScreenProps = {
  onBack: () => void
  onLogout: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  notifications: boolean
  onNotificationsChange: (enabled: boolean) => void
}

type AccountDraft = {
  name: string
  email: string
  password: string
}

const THEMES: Array<{
  id: Theme
  label: string
  icon: "moon" | "sun"
}> = [
  { id: "dark", label: "Oscuro", icon: "moon" },
  { id: "light", label: "Claro", icon: "sun" },
]

const PRIVACY_ROWS = [
  {
    id: "health",
    icon: "activity" as const,
    title: "Datos de salud",
    value: "Cifrados",
    detail: "Solo tú puedes verlos",
  },
  {
    id: "photos",
    icon: "image" as const,
    title: "Fotos de progreso",
    value: "Privadas",
    detail: "Nunca se comparten",
  },
  {
    id: "ai",
    icon: "sparkles" as const,
    title: "Análisis con IA",
    value: "Activo",
    detail: "Procesado en tu dispositivo",
  },
]

const FAQ = [
  {
    question: "¿Cómo se calcula mi plan?",
    answer:
      "Partimos de tu peso, altura, edad y perímetro de cintura para estimar tu gasto. Después ajustamos calorías según tu objetivo y recalculamos cargas con los datos de cada check-in semanal.",
  },
  {
    question: "¿Puedo usar FORMA sin conexión?",
    answer:
      "Puedes registrar comidas, pesos y series de forma local. Solo necesitas conexión para sincronizar tu historial entre dispositivos.",
  },
  {
    question: "¿Qué pasa si me salto días?",
    answer:
      "El algoritmo reduce el volumen de la semana siguiente en lugar de acumular carga. Tu racha se reinicia, pero tu progreso no se pierde.",
  },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsScreen({
  onBack,
  onLogout,
  theme,
  onThemeChange,
  notifications,
  onNotificationsChange,
}: SettingsScreenProps) {
  const faqBaseId = useId()
  const emailId = useId()
  const [isEditing, setIsEditing] = useState(false)
  const [account, setAccount] = useState<AccountDraft>({
    name: "Lucía Martínez",
    email: demoEmail,
    password: "",
  })
  const [error, setError] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [dataRequest, setDataRequest] = useState("")
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false)
  const confirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isSaved) return
    const timer = window.setTimeout(() => setIsSaved(false), 2600)
    return () => window.clearTimeout(timer)
  }, [isSaved])

  useEffect(() => {
    if (isConfirmingLogout) confirmRef.current?.focus()
  }, [isConfirmingLogout])

  // El aviso de cierre se puede cancelar con Escape sin perder la sesión.
  useEffect(() => {
    if (!isConfirmingLogout) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsConfirmingLogout(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isConfirmingLogout])

  const handleAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (account.name.trim().length < 2) {
      setError("Escribe un nombre válido.")
      return
    }
    if (!EMAIL_PATTERN.test(account.email.trim())) {
      setError("Revisa el correo electrónico.")
      return
    }
    if (account.password && account.password.length < 6) {
      setError("La contraseña necesita al menos 6 caracteres.")
      return
    }
    setAccount((current) => ({ ...current, password: "" }))
    setError("")
    setIsEditing(false)
    setIsSaved(true)
  }

  return (
    <main className="settings-screen screen-stack">
      <ScreenHeader eyebrow="PREFERENCIAS" onBack={onBack} title="Ajustes" />

      <div className="screen-body settings-body">
        <section className="settings-section">
          <SectionTitle icon="user" title="Cuenta" />
          <div className="account-card">
            <div className="account-card__row">
              <span className="avatar avatar--small">
                <span>LM</span>
                <i className="status-dot" />
              </span>
              <div>
                <strong>{account.name}</strong>
                <small>{account.email}</small>
              </div>
              <button
                className="icon-button icon-button--bordered"
                onClick={() => setIsEditing((value) => !value)}
                aria-label="Editar cuenta"
                type="button"
              >
                <Icon name="edit" size={17} />
              </button>
            </div>

            {isEditing ? (
              <form
                className="account-form"
                noValidate
                onSubmit={handleAccountSubmit}
              >
                <label className="form-field">
                  <span>Nombre completo</span>
                  <div className="input-shell">
                    <Icon name="user" size={17} />
                    <input
                      autoComplete="name"
                      onChange={(event) =>
                        setAccount((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      type="text"
                      value={account.name}
                    />
                  </div>
                </label>
                <label className="form-field">
                  <span>Correo electrónico</span>
                  <div className="input-shell">
                    <Icon name="mail" size={17} />
                    <input
                      autoCapitalize="none"
                      autoComplete="email"
                      id={emailId}
                      onChange={(event) =>
                        setAccount((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      type="email"
                      value={account.email}
                    />
                  </div>
                </label>
                <label className="form-field">
                  <span>Nueva contraseña (opcional)</span>
                  <div className="input-shell">
                    <Icon name="lock" size={17} />
                    <input
                      autoComplete="new-password"
                      minLength={6}
                      onChange={(event) =>
                        setAccount((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      placeholder="Mínimo 6 caracteres"
                      type="password"
                      value={account.password}
                    />
                  </div>
                </label>
                {error ? (
                  <p className="form-error" role="alert">
                    <Icon name="info" size={14} /> {error}
                  </p>
                ) : null}
                <div className="account-form__actions">
                  <Button onClick={() => setIsEditing(false)} variant="ghost">
                    Cancelar
                  </Button>
                  <Button fullWidth type="submit">
                    Guardar cambios
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <SectionTitle icon="sun" title="Apariencia" />
          <div
            className="theme-selector"
            role="radiogroup"
            aria-label="Tema de la aplicación"
          >
            {THEMES.map((option) => (
              <button
                aria-checked={theme === option.id}
                className={theme === option.id ? "is-active" : ""}
                key={option.id}
                onClick={() => onThemeChange(option.id)}
                role="radio"
                type="button"
              >
                <Icon name={option.icon} size={17} />
                {option.label}
              </button>
            ))}
          </div>
          <p className="settings-hint">
            <Icon name="info" size={13} /> El modo oscuro reduce el brillo en
            entrenamientos de noche.
          </p>
        </section>

        <section className="settings-section">
          <SectionTitle icon="bell" title="Notificaciones" />
          <div className="settings-card">
            <Toggle
              checked={notifications}
              description="Te avisamos 30 minutos antes de cada rutina programada."
              label="Recordatorios de entrenamiento"
              onChange={onNotificationsChange}
            />
            <div className="settings-row">
              <span className="settings-row__icon">
                <Icon name="calendar" size={17} />
              </span>
              <div>
                <strong>Check-in semanal</strong>
                <small>Todos los lunes a las 08:00</small>
              </div>
              <span className="badge">Activo</span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <SectionTitle icon="shield" title="Privacidad" />
          <div className="settings-card">
            {PRIVACY_ROWS.map((row) => (
              <div className="settings-row" key={row.id}>
                <span className="settings-row__icon">
                  <Icon name={row.icon} size={17} />
                </span>
                <div>
                  <strong>{row.title}</strong>
                  <small>{row.detail}</small>
                </div>
                <span className="badge">{row.value}</span>
              </div>
            ))}
            <button
              className="settings-link"
              onClick={() =>
                setDataRequest(
                  "Solicitud registrada. Te la enviaremos por correo en 24 h.",
                )
              }
              type="button"
            >
              <Icon name="trash" size={17} />
              <span>Solicitar copia de mis datos</span>
              <Icon name="chevron-right" size={16} />
            </button>
            {dataRequest ? (
              <p className="success-note" role="status">
                <Icon name="check" size={14} /> {dataRequest}
              </p>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <SectionTitle icon="info" title="Ayuda" />
          <div className="settings-card">
            <ul className="faq-list">
              {FAQ.map((item, index) => {
                const isOpen = openFaq === index
                const buttonId = `${faqBaseId}-pregunta-${index}`
                const panelId = `${faqBaseId}-respuesta-${index}`
                return (
                  <li
                    className={`faq-item ${isOpen ? "is-open" : ""}`}
                    key={item.question}
                  >
                    <button
                      aria-controls={panelId}
                      aria-expanded={isOpen}
                      id={buttonId}
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      type="button"
                    >
                      {item.question}
                      <Icon
                        name={isOpen ? "chevron-down" : "chevron-right"}
                        size={16}
                      />
                    </button>
                    <div
                      aria-labelledby={buttonId}
                      className="faq-item__answer"
                      hidden={!isOpen}
                      id={panelId}
                      role="region"
                    >
                      <p>{item.answer}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <a className="settings-link" href="mailto:soporte@forma.fit">
              <Icon name="mail" size={17} />
              <span>Contactar con soporte</span>
              <Icon name="arrow-right" size={16} />
            </a>
          </div>
        </section>

        <section className="settings-section settings-section--danger">
          <SectionTitle icon="logout" title="Sesión" />
          {isConfirmingLogout ? (
            <div
              aria-labelledby={`${faqBaseId}-logout`}
              className="confirm-dialog"
              ref={confirmRef}
              role="alertdialog"
              tabIndex={-1}
            >
              <span className="confirm-dialog__icon">
                <Icon name="logout" size={20} />
              </span>
              <strong id={`${faqBaseId}-logout`}>¿Cerrar sesión?</strong>
              <p>
                Se guardará tu progreso, pero tendrás que volver a entrar para
                continuar.
              </p>
              <div className="confirm-dialog__actions">
                <Button
                  fullWidth
                  onClick={() => setIsConfirmingLogout(false)}
                  variant="ghost"
                >
                  Cancelar
                </Button>
                <Button fullWidth onClick={onLogout} variant="danger">
                  Cerrar sesión
                </Button>
              </div>
            </div>
          ) : (
            <Button
              fullWidth
              icon="logout"
              onClick={() => setIsConfirmingLogout(true)}
              variant="danger"
            >
              Cerrar sesión
            </Button>
          )}
          <p className="privacy-note">
            <Icon name="lock" size={12} /> Tus datos de salud se mantienen
            privados y cifrados.
          </p>
        </section>
      </div>

      <Toast message="Cuenta actualizada correctamente" visible={isSaved} />
    </main>
  )
}
