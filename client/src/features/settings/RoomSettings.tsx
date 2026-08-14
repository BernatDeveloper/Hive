import { useState } from 'react'
import '../../shared/modal.css'
import './room-settings.css'
import { socket } from '../../socket'
import type { Room } from '../../types'

interface Props {
  room: Room
  onClose: () => void
}

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

export default function RoomSettings({ room, onClose }: Props) {
  const [colors, setColors] = useState({
    primary_color: room.primary_color ?? PRESETS.light.primary_color,
    background_color: room.background_color ?? PRESETS.light.background_color,
    text_color: room.text_color ?? PRESETS.light.text_color,
    sidebar_color: room.sidebar_color ?? PRESETS.light.sidebar_color,
  })

  function change(key: keyof typeof colors, value: string) {
    setColors(prev => ({ ...prev, [key]: value }))
  }

  function applyPreset(preset: 'light' | 'dark') {
    setColors({ ...PRESETS[preset] })
  }

  function save() {
    socket.emit('update-room-style', { name: room.name, styles: colors })
    onClose()
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

        <div className="modal-actions">
          <button className="btn-ghost" onClick={() => applyPreset('light')}>Restablecer</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
