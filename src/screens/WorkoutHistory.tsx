import { useEffect, useMemo, useState } from "react"
import Icon from "../components/Icon"
import { ScreenHeader, SectionTitle } from "../components/UI"
import {
  deISO,
  entrenamientoDisponible,
  historialSesiones,
  type SesionEntrenamiento,
} from "../lib/training"
import { leerEstadoLocal } from "../lib/planLocal"

type WorkoutHistoryScreenProps = {
  onBack: () => void
}

// Traduce un entreno del plan local (forma de FORMA) a la sesión que pinta
// esta pantalla, para que el historial funcione también sin backend.
function aSesionLocal(entreno: {
  id: string
  d: string
  start?: number
  end?: number
  routineId?: string
  name?: string
  vol?: number
  prs?: string[]
  entries?: Array<{ sets?: Array<{ done?: boolean }> }>
}): SesionEntrenamiento {
  const series = (entreno.entries ?? []).flatMap((e) => e.sets ?? [])
  const completadas = series.filter((s) => s.done).length
  const inicio = entreno.start ?? 0
  const fin = entreno.end ?? inicio
  const duracionSeg = inicio
    ? Math.max(0, Math.round((fin - inicio) / 1000))
    : 0
  return {
    id: entreno.id,
    rutinaId: entreno.routineId ?? null,
    nombre: entreno.name || "Entrenamiento",
    fecha: entreno.d,
    iniciadaAt: inicio ? new Date(inicio).toISOString() : null,
    finalizadaAt: entreno.end ? new Date(entreno.end).toISOString() : null,
    duracionSeg,
    seriesTotales: series.length,
    seriesCompletadas: completadas,
    volumenTotalKg: entreno.vol ?? 0,
    nuevosRecords: entreno.prs?.length ?? 0,
    kcalEstimadas: 0,
    estado: "finalizada",
    ejercicios: [],
  }
}

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const formatoHora = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
})

function fechaLarga(sesion: SesionEntrenamiento): string {
  const base = deISO(sesion.fecha)
  const fecha = formatoFecha.format(base)
  return sesion.iniciadaAt
    ? `${fecha} · ${formatoHora.format(new Date(sesion.iniciadaAt))}`
    : fecha
}

function duracion(segundos: number): string {
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${minutos % 60} min`
}

function numero(valor: number): string {
  return Math.round(valor).toLocaleString("es-ES")
}

export default function WorkoutHistoryScreen({
  onBack,
}: WorkoutHistoryScreenProps) {
  const [sesiones, setSesiones] = useState<SesionEntrenamiento[] | null>(null)

  useEffect(() => {
    if (!entrenamientoDisponible()) {
      const estado = leerEstadoLocal()
      const locales = (estado?.workouts ?? [])
        .map((entreno) => aSesionLocal(entreno))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      setSesiones(locales)
      return
    }
    let vivo = true
    void (async () => {
      const datos = await historialSesiones()
      if (vivo) setSesiones(datos)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const resumen = useMemo(() => {
    const lista = sesiones ?? []
    return {
      total: lista.length,
      volumen: lista.reduce((total, item) => total + item.volumenTotalKg, 0),
      minutos: Math.round(
        lista.reduce((total, item) => total + item.duracionSeg, 0) / 60,
      ),
    }
  }, [sesiones])

  return (
    <main className="history-screen screen-stack">
      <ScreenHeader
        eyebrow="TU REGISTRO"
        onBack={onBack}
        subtitle="Sesiones terminadas"
        title="Historial"
      />

      <section className="screen-body history-screen__body">
        {sesiones === null ? (
          <p className="history-empty">
            <Icon name="timer" size={18} /> Cargando tus sesiones…
          </p>
        ) : sesiones.length === 0 ? (
          <p className="history-empty">
            <Icon name="dumbbell" size={18} /> Aún no hay entrenamientos
            guardados. Empieza una rutina y aparecerán aquí.
          </p>
        ) : (
          <>
            <div className="history-summary">
              <div>
                <small>SESIONES</small>
                <strong>{resumen.total}</strong>
              </div>
              <div>
                <small>VOLUMEN</small>
                <strong>
                  {numero(resumen.volumen)} <em>kg</em>
                </strong>
              </div>
              <div>
                <small>TIEMPO</small>
                <strong>
                  {resumen.minutos} <em>min</em>
                </strong>
              </div>
            </div>

            <SectionTitle icon="book" title="Sesiones" />

            <ul className="history-list">
              {sesiones.map((sesion) => {
                const completadas = sesion.seriesCompletadas
                const totales = sesion.seriesTotales
                const porcentaje =
                  totales > 0 ? Math.round((completadas / totales) * 100) : 0
                return (
                  <li className="history-item" key={sesion.id}>
                    <span
                      className={`history-item__icon ${
                        sesion.estado === "abandonada" ? "is-muted" : ""
                      }`}
                    >
                      <Icon name="dumbbell" size={18} />
                    </span>
                    <div className="history-item__copy">
                      <div className="history-item__head">
                        <strong>{sesion.nombre}</strong>
                        <small>{fechaLarga(sesion)}</small>
                      </div>
                      <div className="history-item__meta">
                        <span>
                          <Icon name="clock" size={13} />{" "}
                          {duracion(sesion.duracionSeg)}
                        </span>
                        <span>
                          <Icon name="check" size={13} /> {completadas}/
                          {totales} series
                        </span>
                        <span>
                          <Icon name="weight" size={13} />{" "}
                          {numero(sesion.volumenTotalKg)} kg
                        </span>
                      </div>
                      {sesion.nuevosRecords > 0 ? (
                        <span className="history-item__record">
                          <Icon name="sparkles" size={13} />{" "}
                          {sesion.nuevosRecords}{" "}
                          {sesion.nuevosRecords === 1 ? "récord" : "récords"}
                        </span>
                      ) : null}
                      <progress
                        aria-label={`Series completadas: ${completadas} de ${totales}`}
                        className="history-item__progress"
                        max={Math.max(1, totales)}
                        value={completadas}
                      />
                    </div>
                    <span className="history-item__score">{porcentaje}%</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}
