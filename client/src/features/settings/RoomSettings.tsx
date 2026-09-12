import { useEffect, useState } from 'react'
import '../../shared/modal.css'
import './room-settings.css'
import { socket, emitWrite } from '../../socket'
import { subscribeToPush, getCurrentSubscription } from '../../push'
import type { Room } from '../../types'

interface Props {
  room: Room
  onClose: () => void
  onLeave: () => void
}

const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
)

const IconLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

const PRESETS = {
  light: {
    primary_color: '#0071E3',
    background_color: '#F5F5F7',
    text_color: '#1D1D1F',
    sidebar_color: '#FFFFFF',
  },
  dark: {
    primary_color: '#0A84FF',
    background_color: '#000000',
    text_color: '#F5F5F7',
    sidebar_color: '#1C1C1E',
  },
}

const MAX_EVENT_COLORS = 8
// Colores que propone "+ Añadir" antes de que el usuario los ajuste.
const SUGGESTED_COLORS = ['#0071e3', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#ff453a', '#64d2ff', '#ffd60a']

// `Intl.supportedValuesOf` no existe en navegadores muy antiguos (Safari
// < 15.4): si falta, al menos se ofrece la zona actual del dispositivo.
const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
})()

export default function RoomSettings({ room, onClose, onLeave }: Props) {
  const [colors, setColors] = useState({
    primary_color: room.primary_color ?? PRESETS.light.primary_color,
    background_color: room.background_color ?? PRESETS.light.background_color,
    text_color: room.text_color ?? PRESETS.light.text_color,
    sidebar_color: room.sidebar_color ?? PRESETS.light.sidebar_color,
  })

  const [eventColors, setEventColors] = useState<string[]>(room.event_colors ?? [])
  const [timezone, setTimezone] = useState(room.timezone)

  function change(key: keyof typeof colors, value: string) {
    setColors(prev => ({ ...prev, [key]: value }))
  }

  function applyPreset(preset: 'light' | 'dark') {
    setColors({ ...PRESETS[preset] })
  }

  function changeEventColor(index: number, value: string) {
    setEventColors(prev => prev.map((c, i) => (i === index ? value.toLowerCase() : c)))
  }

  function removeEventColor(index: number) {
    setEventColors(prev => prev.filter((_, i) => i !== index))
  }

  function addEventColor() {
    setEventColors(prev => [...prev, SUGGESTED_COLORS[prev.length % SUGGESTED_COLORS.length]])
  }

  function save() {
    emitWrite('update-room-style', { name: room.name, styles: { ...colors, event_colors: eventColors } })
    // Evento propio (no se mezcla con update-room-style): solo se emite si
    // realmente cambió, para no generar tráfico/broadcast de más.
    if (timezone !== room.timezone) {
      emitWrite('update-room-timezone', { name: room.name, timezone })
    }
    onClose()
  }

  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushDenied, setPushDenied] = useState(() => 'Notification' in window && Notification.permission === 'denied')
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentSubscription().then(sub => {
      if (!cancelled) setPushEnabled(!!sub)
    })
    return () => { cancelled = true }
  }, [])

  async function togglePush() {
    setPushLoading(true)
    try {
      if (pushEnabled) {
        const sub = await getCurrentSubscription()
        if (sub) {
          await sub.unsubscribe()
          socket.emit('unsubscribe-push', { endpoint: sub.endpoint })
        }
        setPushEnabled(false)
      } else {
        const sub = await subscribeToPush()
        if (sub) {
          socket.emit('subscribe-push', { room: room.name, subscription: sub.toJSON() })
          setPushEnabled(true)
        }
        if ('Notification' in window) setPushDenied(Notification.permission === 'denied')
      }
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <h3>Ajustes de sala — {room.name}</h3>

        <div className="settings-presets">
          <span className="settings-presets-label">Presets</span>
          <div className="settings-presets-btns">
            <button className="settings-preset-btn" onClick={() => applyPreset('light')}>
              <span className="preset-swatch preset-swatch--light" />
              Claro
            </button>
            <button className="settings-preset-btn" onClick={() => applyPreset('dark')}>
              <span className="preset-swatch preset-swatch--dark" />
              Oscuro
            </button>
          </div>
        </div>

        <div className="settings-colors">
          {([
            ['primary_color', 'Color primario'],
            ['background_color', 'Fondo'],
            ['text_color', 'Texto'],
            ['sidebar_color', 'Superficie'],
          ] as const).map(([key, label]) => (
            <div key={key} className="color-picker-item">
              <label>{label}</label>
              <div className="color-picker-control">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={e => change(key, e.target.value)}
                />
                <span className="color-value">{colors[key]}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-section">
          <div className="settings-event-colors-head">
            <span className="settings-presets-label">Colores de eventos</span>
            {eventColors.length < MAX_EVENT_COLORS && (
              <button type="button" className="settings-preset-btn" onClick={addEventColor}>+ Añadir</button>
            )}
          </div>
          {eventColors.length === 0 ? (
            <p className="settings-notify-text" style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              Sin colores. Los eventos usarán el color primario de la sala.
            </p>
          ) : (
            <div className="settings-event-colors">
              {eventColors.map((c, i) => (
                <div key={i} className="settings-event-color">
                  <input
                    type="color"
                    value={c}
                    onChange={e => changeEventColor(i, e.target.value)}
                    aria-label={`Color de evento ${i + 1}`}
                  />
                  <button
                    type="button"
                    className="settings-event-color-remove"
                    onClick={() => removeEventColor(i)}
                    aria-label={`Quitar color ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-presets-label" htmlFor="room-timezone">Zona horaria de la sala</label>
          <select id="room-timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <p className="settings-notify-text" style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
            Gobierna a qué hora llegan los avisos de recordatorio — no cambia cómo se ven las horas en el calendario.
          </p>
        </div>

        <div
          className="settings-preview"
          style={{
            background: colors.background_color,
            color: colors.text_color,
          }}
        >
          <div style={{ background: colors.sidebar_color, padding: '8px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem' }}>
            Panel / Superficie
          </div>
          <button style={{ background: colors.primary_color, color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '8px', cursor: 'default', fontSize: '0.9rem' }}>
            Botón primario
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-notify-row">
            <div className="settings-notify-text">
              <strong>Avisos en este dispositivo</strong>
              <p>Recibe un aviso cuando un evento esté a punto de empezar, aunque la app esté cerrada.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              className={`toggle-switch${pushEnabled ? ' toggle-switch--on' : ''}`}
              onClick={togglePush}
              disabled={pushLoading || pushDenied}
              aria-label="Activar avisos en este dispositivo"
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
          {pushDenied && (
            <p className="settings-notify-denied">
              Bloqueaste las notificaciones para este sitio. Actívalas desde los ajustes del navegador para recibir avisos.
            </p>
          )}
        </div>

        <div className="settings-list">
          <button type="button" className="settings-row" onClick={() => applyPreset('light')}>
            <span>Restablecer</span>
            <IconRefresh />
          </button>
          <button type="button" className="settings-row settings-row--danger" onClick={onLeave}>
            <span>Salir de la sala</span>
            <IconLogOut />
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
