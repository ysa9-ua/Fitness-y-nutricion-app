import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react"
import Icon, { type IconName } from "./Icon"

export type AppTab = "dashboard" | "nutrition" | "workouts" | "progress"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
  icon?: IconName
  fullWidth?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  children,
  variant = "primary",
  icon,
  fullWidth = false,
  className = "",
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`app-button app-button--${variant} ${
        fullWidth ? "app-button--full" : ""
      } ${className}`}
      ref={ref}
      type="button"
      {...props}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  )
}

export function Logo({
  compact = false,
  label = "FORMA",
}: {
  compact?: boolean
  label?: string
}) {
  return (
    <div
      aria-label={label}
      className={`brand ${compact ? "brand--compact" : ""}`}
      role="img"
    >
      <span className="brand__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact ? <span className="brand__wordmark">{label}</span> : null}
    </div>
  )
}

type ScreenHeaderProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  onBack?: () => void
  action?: {
    label: string
    icon: IconName
    onClick: () => void
  }
  avatar?: boolean
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  action,
  avatar = false,
}: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header__leading">
        {onBack ? (
          <button
            className="icon-button"
            onClick={onBack}
            aria-label="Volver"
            type="button"
          >
            <Icon name="arrow-left" size={20} />
          </button>
        ) : null}
        <div className="screen-header__copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {action ? (
        <button
          className="icon-button icon-button--bordered"
          onClick={action.onClick}
          aria-label={action.label}
          type="button"
        >
          <Icon name={action.icon} size={19} />
        </button>
      ) : avatar ? (
        <button
          className="avatar avatar--small"
          type="button"
          aria-label="Abrir mi perfil"
        >
          <span>LM</span>
          <i className="status-dot" />
        </button>
      ) : null}
    </header>
  )
}

type BottomNavProps = {
  active: AppTab
  onChange: (tab: AppTab) => void
}

const navItems: Array<{
  id: AppTab
  label: string
  icon: IconName
}> = [
  { id: "dashboard", label: "Inicio", icon: "home" },
  { id: "nutrition", label: "Diario", icon: "book" },
  { id: "workouts", label: "Entrenos", icon: "dumbbell" },
  { id: "progress", label: "Progreso", icon: "chart" },
]

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {navItems.map((item) => (
        <button
          aria-current={active === item.id ? "page" : undefined}
          className={`bottom-nav__item ${
            active === item.id ? "is-active" : ""
          }`}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          <span className="bottom-nav__icon">
            <Icon name={item.icon} size={21} />
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

type SideNavProps = BottomNavProps & {
  onOpenProfile: () => void
  onOpenSettings: () => void
}

/** Navegación lateral de escritorio y tablet. En móvil manda `BottomNav`. */
export function SideNav({
  active,
  onChange,
  onOpenProfile,
  onOpenSettings,
}: SideNavProps) {
  return (
    <aside className="side-nav" aria-label="Navegación principal">
      <div className="side-nav__brand">
        <Logo />
        <span>Tu plan, en un solo sitio</span>
      </div>

      <nav className="side-nav__nav">
        <span className="side-nav__label">Principal</span>
        {navItems.map((item) => (
          <button
            aria-current={active === item.id ? "page" : undefined}
            className={`side-nav__item ${
              active === item.id ? "is-active" : ""
            }`}
            key={item.id}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <span className="side-nav__icon">
              <Icon name={item.icon} size={19} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <nav className="side-nav__nav side-nav__nav--secondary">
        <span className="side-nav__label">Cuenta</span>
        <button
          className="side-nav__item"
          onClick={onOpenProfile}
          type="button"
        >
          <span className="side-nav__icon">
            <Icon name="user" size={19} />
          </span>
          <span>Mi perfil</span>
        </button>
        <button
          className="side-nav__item"
          onClick={onOpenSettings}
          type="button"
        >
          <span className="side-nav__icon">
            <Icon name="settings" size={19} />
          </span>
          <span>Ajustes</span>
        </button>
      </nav>

      <div className="side-nav__footer">
        <span className="status-dot" />
        <div>
          <strong>Sincronizado</strong>
          <small>Tus datos se guardan en la nube</small>
        </div>
      </div>
    </aside>
  )
}

type ProgressRingProps = {
  value: number
  max: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children: ReactNode
  className?: string
  label?: string
}

export function ProgressRing({
  value,
  max,
  size = 142,
  stroke = 11,
  color = "var(--green)",
  track = "var(--surface-3)",
  children,
  className = "",
  label = "Progreso",
}: ProgressRingProps) {
  const progress = Math.min(1, Math.max(0, max > 0 ? value / max : 0))
  const style = {
    "--ring-progress": `${progress * 360}deg`,
    "--ring-size": `${size}px`,
    "--ring-stroke": `${stroke}px`,
    "--ring-color": color,
    "--ring-track": track,
  } as CSSProperties

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={Math.round(value * 10) / 10}
      className={`progress-ring ${className}`}
      role="progressbar"
      style={style}
    >
      <div className="progress-ring__center">{children}</div>
    </div>
  )
}

type SectionTitleProps = {
  title: string
  action?: string
  onAction?: () => void
  icon?: IconName
}

export function SectionTitle({
  title,
  action,
  onAction,
  icon,
}: SectionTitleProps) {
  return (
    <div className="section-title">
      <h2>
        {icon ? <Icon name={icon} size={17} /> : null}
        {title}
      </h2>
      {action && onAction ? (
        <button onClick={onAction} type="button">
          {action}
          <Icon name="chevron-right" size={14} />
        </button>
      ) : null}
    </div>
  )
}

type ToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  const id = useId()
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`
  return (
    <div className="setting-row">
      <div className="setting-row__copy" id={labelId}>
        <strong>{label}</strong>
        {description ? <span id={descriptionId}>{description}</span> : null}
      </div>
      <button
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={labelId}
        className={`toggle ${checked ? "is-on" : ""}`}
        id={id}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  )
}

type PhotoSlotProps = {
  label: string
  hint: string
  value?: string
  onChange: (value?: string) => void
}

export function PhotoSlot({ label, hint, value, onChange }: PhotoSlotProps) {
  const inputId = useId()
  const [isLoading, setIsLoading] = useState(false)

  const handleFile = (file?: File) => {
    if (!file) return
    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      onChange(typeof reader.result === "string" ? reader.result : undefined)
      setIsLoading(false)
    }
    reader.onerror = () => setIsLoading(false)
    reader.readAsDataURL(file)
  }

  return (
    <div className={`photo-slot ${value ? "has-photo" : ""}`}>
      <input
        accept="image/*"
        capture="environment"
        id={inputId}
        onChange={(event) => handleFile(event.target.files?.[0])}
        type="file"
      />
      <label htmlFor={inputId}>
        {value ? (
          <>
            {/* A user-selected image is rendered below the placeholder accent. */}
            <img alt={`Foto de ${label}`} src={value} />
            <span className="photo-slot__edit">
              <Icon name="camera" size={15} />
              Cambiar
            </span>
          </>
        ) : (
          <>
            <span className="photo-slot__icon">
              <Icon name={isLoading ? "refresh" : "camera"} size={22} />
            </span>
            <strong>{isLoading ? "Procesando..." : label}</strong>
            <small>{hint}</small>
          </>
        )}
      </label>
    </div>
  )
}

type ToastProps = {
  message: string
  visible: boolean
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div
      aria-live="polite"
      className={`toast ${visible ? "is-visible" : ""}`}
      role="status"
    >
      <span>
        <Icon name="check" size={15} />
      </span>
      {message}
    </div>
  )
}
