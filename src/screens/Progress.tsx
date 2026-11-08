import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { Button, SectionTitle } from "../components/UI"
import {
  entrenamientoDisponible,
  progresoFuerza,
  type ProgresoFuerza,
} from "../lib/training"
import type { OnboardingData } from "./Onboarding"
import type { Workout } from "../types/trainingPlan"
import { leerEstadoLocal } from "../lib/planLocal"
import { useAppData, type WeightEntry } from "../lib/appData"

type ProgressScreenProps = {
  onOpenCheckIn: () => void
  onOpenProfile: () => void
  profile: OnboardingData
}

type ChartPoint = {
  label: string
  value: number
}

type RangeKey = "1M" | "3M" | "6M" | "1A"

const RANGES: RangeKey[] = ["1M", "3M", "6M", "1A"]

const RANGE_MONTHS: Record<RangeKey, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1A": 12,
}

function parseISO(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function formatearLabelFecha(iso: string): string {
  try {
    const date = parseISO(iso)
    return date
      .toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
      .replace(".", "")
  } catch {
    return iso
  }
}

function formatearFechaLarga(iso: string): string {
  try {
    return parseISO(iso)
      .toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(".", "")
  } catch {
    return iso
  }
}

function WeightChart({
  data,
  currentWeight,
}: {
  data: ChartPoint[]
  currentWeight: number
}) {
  const [activeIndex, setActiveIndex] = useState(data.length - 1)
  const width = 310
  const height = 144
  const paddingX = 16
  const paddingY = 18
  const values = data.map((point) => point.value)
  const min = Math.min(...values) - 0.6
  const max = Math.max(...values) + 0.6
  const range = Math.max(0.1, max - min)
  const points = data.map((point, index) => ({
    ...point,
    x:
      paddingX +
      (index / Math.max(1, data.length - 1)) * (width - paddingX * 2),
    y: paddingY + ((max - point.value) / range) * (height - paddingY * 2),
  }))
  const line = points.map((point) => `${point.x},${point.y}`).join(" ")
  const area = `${paddingX},${height - paddingY} ${line} ${width - paddingX},${height - paddingY}`
  const safeIndex = Math.min(activeIndex, Math.max(0, points.length - 1))
  const active = points[safeIndex] ?? points[points.length - 1]
  const first = points[0]?.value ?? currentWeight
  const last = points[points.length - 1]?.value ?? currentWeight
  const delta = last - first

  return (
    <div className="weight-chart">
      <div
        className="weight-chart__tooltip"
        style={{
          left: `${Math.min(86, Math.max(14, (active.x / width) * 100))}%`,
        }}
      >
        <strong>{active.value.toFixed(1).replace(".", ",")} kg</strong>
        <span>{active.label}</span>
      </div>
      <svg
        aria-label="Gráfica de evolución de peso"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="weightArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((position) => (
          <line
            className="weight-chart__grid"
            key={position}
            x1="0"
            x2={width}
            y1={height * position}
            y2={height * position}
          />
        ))}
        <polygon fill="url(#weightArea)" points={area} />
        <polyline className="weight-chart__glow" points={line} />
        <polyline className="weight-chart__line" points={line} />
        {points.map((point, index) => (
          <g key={`${point.label}-${point.value}`}>
            <circle
              aria-label={`${point.value.toFixed(1).replace(".", ",")} kilos, ${point.label}`}
              className="weight-chart__hit"
              cx={point.x}
              cy={point.y}
              onClick={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              r="13"
              role="button"
              tabIndex={0}
            />
            {index === safeIndex ? (
              <circle
                className="weight-chart__point"
                cx={point.x}
                cy={point.y}
                r="4.5"
              />
            ) : null}
          </g>
        ))}
      </svg>
      <div className="weight-chart__labels">
        {points.map((point) => (
          <span
            className={points.indexOf(point) === safeIndex ? "is-active" : ""}
            key={`${point.label}-${point.value}`}
          >
            {point.label}
          </span>
        ))}
      </div>
      <div
        className={`weight-chart__delta ${delta <= 0 ? "is-down" : "is-up"}`}
      >
        <Icon name="arrow-right" size={15} />
        {delta > 0 ? "+" : ""}
        {delta.toFixed(1).replace(".", ",")} kg desde el inicio del periodo
      </div>
    </div>
  )
}

function BodyPlaceholder({
  view,
  date,
  src,
}: {
  view: "front" | "back"
  date: string
  src?: string
}) {
  return (
    <div className={`body-photo body-photo--${view} ${src ? "has-image" : ""}`}>
      {src ? (
        <img alt={`Foto de referencia del ${date.toLowerCase()}`} src={src} />
      ) : null}
      <svg
        aria-label={`Foto ${
          view === "front" ? "frontal" : "posterior"
        } del ${date}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        viewBox="0 0 100 150"
      >
        <defs>
          <linearGradient id={`photoBg-${view}`} x1="0" x2="1" y1="0" y2="1">
            <stop
              offset="0"
              stopColor={view === "front" ? "#3a4242" : "#2a3038"}
            />
            <stop offset="1" stopColor="#111316" />
          </linearGradient>
          <linearGradient id={`body-${view}`} x1="0" x2="1">
            <stop offset="0" stopColor="#b2a49c" />
            <stop offset="0.5" stopColor="#e0d3cb" />
            <stop offset="1" stopColor="#978b84" />
          </linearGradient>
        </defs>
        <rect fill={`url(#photoBg-${view})`} height="150" width="100" />
        <ellipse cx="50" cy="145" fill="#000" opacity="0.25" rx="28" ry="4" />
        {view === "front" ? (
          <>
            <path d="M50 16a9 9 0 1 1 0 .1" fill="url(#body-front)" />
            <path
              d="M39 29c-7 3-9 12-8 22l4 29-3 51h10l4-39 4-14 4 14 4 39h10l-3-51 4-29c1-10-1-19-8-22-4 3-14 3-18 0Z"
              fill="url(#body-front)"
            />
            <path d="M42 30h16l-1 16H43Z" fill="#7e746f" opacity="0.35" />
          </>
        ) : (
          <>
            <circle cx="50" cy="22" fill="url(#body-back)" r="9" />
            <path
              d="M39 31c-8 4-9 13-8 25l5 25-4 49h10l4-36 4-17 4 17 4 36h10l-4-49 5-25c1-12 0-21-8-25-4 3-14 3-18 0Z"
              fill="url(#body-back)"
            />
            <path
              d="M39 34c2 9 4 14 11 14s9-5 11-14"
              fill="none"
              stroke="#8b807a"
              strokeWidth="2"
            />
          </>
        )}
        <path
          d="M14 150h72"
          stroke="var(--green)"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
      </svg>
      <span>{date}</span>
      <i>{view === "front" ? "FRONTAL" : "POSTERIOR"}</i>
    </div>
  )
}

function weightPoints(
  weights: WeightEntry[],
  range: RangeKey,
  profile: OnboardingData,
): ChartPoint[] {
  const baseline = profile.initialWeight ?? weights[0]?.weight ?? profile.weight
  const current =
    weights.length > 0 ? weights[weights.length - 1]!.weight : profile.weight
  if (weights.length === 0) {
    return [
      { label: "Inicio", value: baseline },
      { label: "Hoy", value: current },
    ]
  }
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range])
  const filtered = weights.filter((entry) => parseISO(entry.date) >= cutoff)
  const chosen = filtered.length > 0 ? filtered : weights.slice(-1)
  const points = chosen.map((entry) => ({
    label: formatearLabelFecha(entry.date),
    value: entry.weight,
  }))
  if (points.length === 1) {
    points.unshift({ label: "Inicio", value: baseline })
  }
  return points
}

export default function ProgressScreen({
  onOpenCheckIn,
  onOpenProfile,
  profile,
}: ProgressScreenProps) {
  const [range, setRange] = useState<RangeKey>("3M")
  const [photoFilter, setPhotoFilter] = useState<"day1" | "latest">("latest")
  const [localWorkouts, setLocalWorkouts] = useState<Workout[]>([])
  const data = useAppData()

  useEffect(() => {
    if (entrenamientoDisponible()) return
    const st = leerEstadoLocal()
    if (st) {
      setLocalWorkouts(
        (st.workouts || [])
          .slice()
          .sort((a, b) => (a.start || 0) - (b.start || 0)),
      )
    }
  }, [])

  const points = useMemo(
    () => weightPoints(data.weights, range, profile),
    [data.weights, range, profile],
  )

  const latest = data.weights[data.weights.length - 1]
  const first = data.weights[0]
  const baseline = profile.initialWeight ?? first?.weight ?? profile.weight
  const pesoActual = latest?.weight ?? profile.weight
  const variacionPeso = pesoActual - baseline
  const formatearPeso = (valor: number) => valor.toFixed(1).replace(".", ",")
  const lastDateLabel = latest
    ? formatearFechaLarga(latest.date).toUpperCase()
    : "HOY"
  const startDateLabel = first
    ? formatearFechaLarga(first.date).toUpperCase()
    : "INICIO"
  const photoDate = photoFilter === "latest" ? lastDateLabel : startDateLabel

  const lastMeasure = useMemo(() => {
    for (let index = data.weights.length - 1; index >= 0; index -= 1) {
      const entry = data.weights[index]
      if (entry && typeof entry.waist === "number") return entry
    }
    return null
  }, [data.weights])
  const firstWaist = data.weights.find(
    (entry) => typeof entry.waist === "number",
  )?.waist
  const waist = lastMeasure?.waist ?? profile.waist
  const waistDelta =
    typeof waist === "number" && typeof firstWaist === "number"
      ? waist - firstWaist
      : null

  const [fuerza, setFuerza] = useState<ProgresoFuerza | null>(null)

  useEffect(() => {
    if (entrenamientoDisponible()) {
      let vivo = true
      const hasta = new Date()
      const desde = new Date(hasta)
      desde.setMonth(desde.getMonth() - 3)
      void (async () => {
        const datos = await progresoFuerza(desde, hasta)
        if (vivo) setFuerza(datos)
      })()
      return () => {
        vivo = false
      }
    }

    // Demo: el volumen y las sesiones salen del historial local (últimos 3 meses).
    if (localWorkouts.length === 0) return
    const hasta = new Date()
    const desde = new Date(hasta)
    desde.setMonth(desde.getMonth() - 3)
    const recent = localWorkouts.filter((w) => {
      const d = new Date(w.d)
      return d >= desde && d <= hasta
    })
    const prevDesde = new Date(desde)
    prevDesde.setMonth(prevDesde.getMonth() - 3)
    const previous = localWorkouts.filter((w) => {
      const d = new Date(w.d)
      return d >= prevDesde && d < desde
    })
    const vol = recent.reduce((s, w) => s + (w.vol || 0), 0)
    const volPrev = previous.reduce((s, w) => s + (w.vol || 0), 0)
    const variacion = volPrev > 0 ? ((vol - volPrev) / volPrev) * 100 : null
    setFuerza({
      volumenKg: vol,
      sesiones: recent.length,
      volumenAnteriorKg: volPrev,
      sesionesAnteriores: previous.length,
      variacionPct: variacion,
    })
  }, [localWorkouts])

  const variacion = fuerza?.variacionPct ?? null
  const fuerzaTexto =
    variacion === null
      ? "—"
      : `${variacion > 0 ? "+" : ""}${variacion.toFixed(1).replace(".", ",")}%`
  const fuerzaNota =
    fuerza && fuerza.sesiones > 0
      ? `${fuerza.sesiones} ${fuerza.sesiones === 1 ? "sesión" : "sesiones"}`
      : "sin datos"

  const entrenamientosCompletadosUltimos7 = useMemo(() => {
    const ahora = new Date()
    const hace7 = new Date(ahora)
    hace7.setDate(hace7.getDate() - 7)
    return localWorkouts.filter((w) => {
      const d = new Date(w.d)
      return d >= hace7 && d <= ahora
    }).length
  }, [localWorkouts])

  const waistText =
    typeof waist === "number" ? `${formatearPeso(waist)} cm` : "Sin dato"
  const waistDeltaText =
    waistDelta === null
      ? "—"
      : `${waistDelta > 0 ? "+" : "−"}${formatearPeso(Math.abs(waistDelta))} cm`

  return (
    <main className="progress-screen screen-stack">
      <header className="progress-header">
        <div>
          <span className="eyebrow">TU EVOLUCIÓN</span>
          <h1>Progreso</h1>
        </div>
        <button
          className="avatar avatar--small"
          onClick={onOpenProfile}
          type="button"
          aria-label="Abrir mi perfil"
        >
          <span>LM</span>
          <i className="status-dot" />
        </button>
      </header>

      <section className="screen-body progress-screen__body">
        <div className="progress-summary">
          <div>
            <span className="eyebrow">PESO ACTUAL</span>
            <strong>
              {formatearPeso(pesoActual)} <small>kg</small>
            </strong>
            <p>
              {data.weights.length > 0 ? (
                <>
                  <b>
                    {variacionPeso >= 0 ? "+" : "−"}
                    {formatearPeso(Math.abs(variacionPeso))} kg
                  </b>{" "}
                  desde el inicio
                </>
              ) : (
                <>
                  <b>Sin mediciones</b> todavía
                </>
              )}
            </p>
          </div>
          <div className="progress-summary__badge">
            <Icon name="target" size={19} />
            {entrenamientoDisponible() ? (
              <span>
                <small>RACHA</small>
                <strong>16 días</strong>
              </span>
            ) : (
              <span>
                <small>ESTA SEMANA</small>
                <strong>
                  {entrenamientosCompletadosUltimos7}{" "}
                  {entrenamientosCompletadosUltimos7 === 1
                    ? "entreno"
                    : "entrenos"}
                </strong>
              </span>
            )}
          </div>
        </div>

        <section className="chart-card">
          <div className="chart-card__header">
            <div>
              <span className="eyebrow">EVOLUCIÓN DE PESO</span>
              <h2>
                {range === "1M"
                  ? "Último mes"
                  : range === "3M"
                    ? "Últimos 3 meses"
                    : range === "6M"
                      ? "Últimos 6 meses"
                      : "Último año"}
              </h2>
            </div>
            <button aria-label="Más opciones de la gráfica" type="button">
              <Icon name="more" size={19} />
            </button>
          </div>
          <div
            className="range-tabs"
            role="group"
            aria-label="Periodo de la gráfica"
          >
            {RANGES.map((item) => (
              <button
                aria-pressed={range === item}
                className={range === item ? "is-active" : ""}
                key={item}
                onClick={() => setRange(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <WeightChart currentWeight={pesoActual} data={points} />
        </section>

        <div className="metric-cards">
          <div>
            <span className="metric-cards__icon metric-cards__icon--purple">
              <Icon name="activity" size={18} />
            </span>
            <p>
              <small>GRASA</small>
              <strong>{profile.bodyFat.toFixed(1).replace(".", ",")}%</strong>
              <em>perfil</em>
            </p>
          </div>
          <div>
            <span className="metric-cards__icon metric-cards__icon--yellow">
              <Icon name="target" size={18} />
            </span>
            <p>
              <small>CINTURA</small>
              <strong>{waistText}</strong>
              <em>{waistDeltaText}</em>
            </p>
          </div>
          <div>
            <span className="metric-cards__icon metric-cards__icon--blue">
              <Icon name="dumbbell" size={18} />
            </span>
            <p>
              <small>FUERZA</small>
              <strong>{fuerzaTexto}</strong>
              <em>{fuerzaNota}</em>
            </p>
          </div>
        </div>

        <SectionTitle title="Comparativa visual" icon="image" />
        <section className="photo-comparison">
          <div className="photo-comparison__filters">
            <div className="segmented-control">
              <button
                className={photoFilter === "day1" ? "is-active" : ""}
                onClick={() => setPhotoFilter("day1")}
                type="button"
              >
                Día 1
              </button>
              <button
                className={photoFilter === "latest" ? "is-active" : ""}
                onClick={() => setPhotoFilter("latest")}
                type="button"
              >
                Actual
              </button>
            </div>
            <select
              aria-label="Filtrar fotos por fecha"
              onChange={(event) =>
                setPhotoFilter(event.target.value as "day1" | "latest")
              }
              value={photoFilter}
            >
              <option value="latest">{lastDateLabel.toLowerCase()}</option>
              <option value="day1">{startDateLabel.toLowerCase()}</option>
            </select>
          </div>
          <div className="photo-comparison__grid">
            <figure>
              <BodyPlaceholder
                date={startDateLabel}
                src={profile.photos?.[0]}
                view="front"
              />
              <figcaption>
                <span>ANTES</span>
                <strong>
                  {first
                    ? `${formatearPeso(first.weight)} kg`
                    : `${formatearPeso(baseline)} kg`}
                </strong>
              </figcaption>
            </figure>
            <figure>
              <BodyPlaceholder date={photoDate} view="front" />
              <figcaption>
                <span>AHORA</span>
                <strong>{formatearPeso(pesoActual)} kg</strong>
              </figcaption>
              <i>
                {variacionPeso >= 0 ? "+" : "−"}
                {formatearPeso(Math.abs(variacionPeso))} kg
              </i>
            </figure>
          </div>
          <button className="photo-comparison__more" type="button">
            <Icon name="image" size={16} /> Ver las 6 fotos{" "}
            <Icon name="chevron-right" size={14} />
          </button>
        </section>

        <section className="checkin-reminder">
          <span>
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <strong>Check-in semanal</strong>
            <p>Actualiza tus medidas para que el algoritmo ajuste el plan.</p>
          </div>
          <button onClick={onOpenCheckIn} type="button">
            Actualizar
          </button>
        </section>

        <Button fullWidth icon="weight" onClick={onOpenCheckIn}>
          Registrar nueva medición
        </Button>
      </section>
    </main>
  )
}
