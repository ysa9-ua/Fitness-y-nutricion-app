import { useEffect, useState } from "react"
import {
  FIGURE_MUSCLE_LABEL,
  FIGURE_MUSCLE_ZONE,
  FIGURE_MUSCLES,
  MUSCLE_ZONES,
  ZONE_FIGURE_MUSCLES,
  type FigureMuscle,
  type MuscleZoneId,
} from "../lib/muscles"
import Icon from "./Icon"

type Props = {
  /** Grupo muscular seleccionado (null = sin filtro). */
  value: MuscleZoneId | null
  onChange: (zone: MuscleZoneId | null) => void
  /** Ejercicios por grupo, para los contadores de la leyenda. */
  counts: Partial<Record<MuscleZoneId, number>>
}

// Una vista de la figura: un viewBox y las rutas de cada parte del cuerpo.
type FigureView = {
  vb: string
  p: Record<string, string[]>
}

type BodyPaths = {
  male: {
    front: FigureView
    back: FigureView
  }
}

// Partes que se dibujan como silueta y nunca se resaltan: no son músculos que
// se pueda trabajar (cabeza, pelo, manos, pies, rodillas y tobillos).
const SILHOUETTE = ["head", "hair", "hands", "feet", "knees", "ankles"]

// La geometría son ~100 KB de paths, así que se pide la primera vez que se abre
// la biblioteca en vez de viajar en el bundle principal. Hasta que llega, la
// figura mantiene su alto y nada de lo de abajo da un salto.
let CACHE: BodyPaths | null = null
let PENDING: Promise<BodyPaths> | null = null

function useBodyPaths() {
  const [paths, setPaths] = useState<BodyPaths | null>(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    const pending =
      PENDING ||
      (PENDING = import("../training/lib/body-paths.js").then((m) => {
        const loaded = m.default as BodyPaths
        CACHE = loaded
        return loaded
      }))
    pending
      .then((p) => {
        if (alive) setPaths(p)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return paths
}

type FigureProps = {
  view: FigureView
  /** Músculos del grupo seleccionado, para resaltarlos. */
  active: FigureMuscle[] | null
  onPick: (zone: MuscleZoneId) => void
  label: string
}

function Figure({ view, active, onPick, label }: FigureProps) {
  return (
    <figure className="bm-fig">
      <svg className="bm-v" viewBox={view.vb} role="img" aria-label={label}>
        {SILHOUETTE.map((slug) =>
          (view.p[slug] || []).map((d, i) => (
            <path key={slug + i} className="bm-sil" d={d} />
          )),
        )}
        {FIGURE_MUSCLES.map((slug) =>
          (view.p[slug] || []).map((d, i) => {
            const on = active ? active.includes(slug) : false
            const dim = active !== null && !on
            return (
              <path
                key={slug + i}
                className={
                  "bm-m" + (on ? " is-sel" : "") + (dim ? " is-dim" : "")
                }
                d={d}
                onClick={() => onPick(FIGURE_MUSCLE_ZONE[slug])}
              >
                <title>{FIGURE_MUSCLE_LABEL[slug]}</title>
              </path>
            )
          }),
        )}
      </svg>
      <figcaption className="bm-cap">{label}</figcaption>
    </figure>
  )
}

export default function BodyMap({ value, onChange, counts }: Props) {
  const paths = useBodyPaths()
  const active = value ? ZONE_FIGURE_MUSCLES[value] : null
  const label = value ? MUSCLE_ZONES.find((z) => z.id === value)?.label : null
  const total = value ? (counts[value] ?? 0) : 0

  const pick = (zone: MuscleZoneId) => onChange(zone === value ? null : zone)

  return (
    <div className="bodymap">
      <div className="bodymap__badge" aria-live="polite">
        {label ? (
          <>
            <strong>{label}</strong>
            <span>
              {total} {total === 1 ? "ejercicio" : "ejercicios"}
            </span>
          </>
        ) : (
          <>
            <strong>Todos los grupos</strong>
            <span>Toca el músculo que quieras trabajar</span>
          </>
        )}
      </div>

      <div className="bodymap__stage">
        {paths ? (
          <div className="bm-figs">
            <Figure
              view={paths.male.front}
              active={active}
              onPick={pick}
              label="Vista frontal"
            />
            <Figure
              view={paths.male.back}
              active={active}
              onPick={pick}
              label="Vista trasera"
            />
          </div>
        ) : (
          <div className="bm-ph" aria-hidden="true" />
        )}
      </div>

      <p className="bodymap__tip">
        <Icon name="info" size={13} />
        <span>
          Toca un músculo de la figura para filtrar por ese grupo. El cardio no
          tiene zona en el cuerpo.
        </span>
      </p>

      <div
        className="bodymap__legend"
        role="group"
        aria-label="Grupos musculares"
      >
        <button
          type="button"
          className={`tp-chip${value === null ? " is-on" : ""}`}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          Todos
        </button>
        {MUSCLE_ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={`tp-chip${value === zone.id ? " is-on" : ""}`}
            aria-pressed={value === zone.id}
            onClick={() => onChange(value === zone.id ? null : zone.id)}
          >
            {zone.label}
            <em>{counts[zone.id] ?? 0}</em>
          </button>
        ))}
      </div>
    </div>
  )
}
