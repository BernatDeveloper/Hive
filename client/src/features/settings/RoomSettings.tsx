import { useEffect, useState } from 'react'
import '../../shared/modal.css'
import './room-settings.css'
import { socket, emitWrite } from '../../socket'
import { subscribeToPush, getCurrentSubscription } from '../../push'
import type { Event, Room } from '../../types'
import {
  getIdentity, getRoomOverride, setGlobalIdentity, setRoomOverride, clearRoomOverride,
  IDENTITY_COLORS, IDENTITY_COLOR_NAMES,
} from '../identity/identity'
import { downloadICS } from '../calendar/ics'
import ColorPickerPopover from '../../shared/ColorPickerPopover'
import type { ColorOption } from '../../shared/ColorPickerPopover'
import { useSwipeToDismiss } from '../../shared/useSwipeToDismiss'
import SelectPopover from '../../shared/SelectPopover'

const IDENTITY_COLOR_OPTIONS: ColorOption[] = IDENTITY_COLORS.map(c => ({ value: c, name: IDENTITY_COLOR_NAMES[c] ?? c }))

interface Props {
  room: Room
  events: Event[]
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

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const PRESETS = {
  light: {
    primary_color: '#3B82F6',
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

// `Intl.supportedValuesOf` no existe en navegadores muy antiguos (Safari
// < 15.4): si falta, al menos se ofrece la zona actual del dispositivo.
const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
})()
const TIMEZONE_OPTIONS = TIMEZONES.map(tz => ({ value: tz, label: tz }))

export default function RoomSettings({ room, events, onClose, onLeave }: Props) {
  const swipe = useSwipeToDismiss(onClose)
  const [colors, setColors] = useState({
    primary_color: room.primary_color ?? PRESETS.light.primary_color,
    background_color: room.background_color ?? PRESETS.light.background_color,
    text_color: room.text_color ?? PRESETS.light.text_color,
    sidebar_color: room.sidebar_color ?? PRESETS.light.sidebar_color,
  })

  const [timezone, setTimezone] = useState(room.timezone)

  const currentIdentity = getIdentity(room.name)
  const [identityName, setIdentityName] = useState(currentIdentity.name)
  const [identityColor, setIdentityColor] = useState(currentIdentity.color)
  const [onlyThisRoom, setOnlyThisRoom] = useState(getRoomOverride(room.name) !== null)

  function change(key: keyof typeof colors, value: string) {
    setColors(prev => ({ ...prev, [key]: value }))
  }

  function applyPreset(preset: 'light' | 'dark') {
    setColors({ ...PRESETS[preset] })
  }

  function save() {
    emitWrite('update-room-style', { name: room.name, styles: colors })
    // Evento propio (no se mezcla con update-room-style): solo se emite si
    // realmente cambió, para no generar tráfico/broadcast de más.
    if (timezone !== room.timezone) {
      emitWrite('update-room-timezone', { name: room.name, timezone })
    }
    const identity = { name: identityName.trim() || 'Invitado', color: identityColor }
    if (onlyThisRoom) {
      setRoomOverride(room.name, identity)
    } else {
      setGlobalIdentity(identity)
      clearRoomOverride(room.name)
    }
    // Refresca la presencia en vivo (esta sala): sin esto, el nuevo nombre no
    // se ve en el header hasta el próximo join-room (p. ej. al recargar).
    emitWrite('update-identity', { name: room.name, identity })
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
      <div className="modal settings-modal" style={swipe.style} onClick={e => e.stopPropagation()}>
        <div className="modal-drag-handle" {...swipe.handleProps} />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Ajustes de sala — {room.name}</h3>

        <div className="settings-section">
          <span className="settings-presets-label">Colores de la sala</span>
          <div className="settings-presets-btns" style={{ marginTop: '0.55rem' }}>
            <button className="settings-preset-btn" onClick={() => applyPreset('light')}>
              <span className="preset-swatch preset-swatch--light" />
              Claro
            </button>
            <button className="settings-preset-btn" onClick={() => applyPreset('dark')}>
              <span className="preset-swatch preset-swatch--dark" />
              Oscuro
            </button>
          </div>
          <div className="room-colors-list">
            {([
              ['primary_color', 'Color primario'],
              ['background_color', 'Fondo'],
              ['text_color', 'Texto'],
              ['sidebar_color', 'Superficie'],
            ] as const).map(([key, label]) => (
              <label key={key} className="room-color-row">
                <span className="room-color-donut" style={{ borderColor: colors[key] }} aria-hidden="true" />
                <input
                  type="color"
                  className="room-color-input"
                  value={colors[key]}
                  onChange={e => change(key, e.target.value)}
                  aria-label={label}
                />
                <span className="room-color-text">
                  <span className="room-color-name">{label}</span>
                  <span className="room-color-hex">{colors[key].toUpperCase()}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <span className="settings-presets-label">Zona horaria de la sala</span>
          <div style={{ marginTop: '0.45rem' }}>
            <SelectPopover
              options={TIMEZONE_OPTIONS}
              value={timezone}
              onChange={setTimezone}
              triggerLabel="Zona horaria de la sala"
              searchable
              searchPlaceholder="Buscar zona horaria…"
            />
          </div>
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
          <span className="settings-presets-label">Tu identidad</span>
          <p className="settings-notify-text" style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: '0.35rem 0 0.65rem' }}>
            Nombre y color con los que te ven las demás personas de la sala — no es una cuenta, solo para identificarte.
          </p>
          <input
            type="text"
            value={identityName}
            onChange={e => setIdentityName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={40}
          />
          <div style={{ marginTop: '0.6rem' }}>
            <ColorPickerPopover
              options={IDENTITY_COLOR_OPTIONS}
              value={identityColor}
              onChange={c => setIdentityColor(c ?? IDENTITY_COLORS[0])}
              triggerLabel="Elegir tu color"
            />
          </div>
          <div className="settings-notify-row" style={{ marginTop: '0.7rem' }}>
            <div className="settings-notify-text">
              <strong>Solo en esta sala</strong>
              <p>Si lo desactivas, este nombre y color se usan en todas tus salas.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={onlyThisRoom}
              className={`toggle-switch${onlyThisRoom ? ' toggle-switch--on' : ''}`}
              onClick={() => setOnlyThisRoom(v => !v)}
              aria-label="Usar esta identidad solo en esta sala"
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
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
          <button
            type="button"
            className="settings-row"
            onClick={() => downloadICS(events, room.name)}
            disabled={events.length === 0}
          >
            <span>Exportar calendario (.ics)</span>
            <IconDownload />
          </button>
          <button type="button" className="settings-row" onClick={() => applyPreset('light')}>
            <span>Restablecer colores</span>
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
