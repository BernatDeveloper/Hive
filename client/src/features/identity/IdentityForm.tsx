import { useState } from 'react'
import '../auth/auth.css'
import ColorPickerPopover from '../../shared/ColorPickerPopover'
import { IDENTITY_COLORS, IDENTITY_COLOR_NAMES, randomIdentityColor } from './identity'
import type { Identity } from './identity'

const IDENTITY_COLOR_OPTIONS = IDENTITY_COLORS.map(c => ({ value: c, name: IDENTITY_COLOR_NAMES[c] ?? c }))

interface Props {
  onDone: (identity: Identity) => void
}

// Alta de identidad de dispositivo: solo se muestra una vez (antes de crear
// o unirse a la primera sala). Sin cuentas — es solo un nombre + color para
// que el resto de la sala sepa quién hizo qué.
export default function IdentityForm({ onDone }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(randomIdentityColor)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onDone({ name: name.trim() || 'Invitado', color })
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-form-header">
          <h1>¿Cómo te llamamos?</h1>
          <p>Así te verán las demás personas de tus salas. Puedes cambiarlo cuando quieras desde Ajustes.</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">
            Tu nombre
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Invitado"
              maxLength={40}
              autoFocus
            />
          </label>
          <ColorPickerPopover
            options={IDENTITY_COLOR_OPTIONS}
            value={color}
            onChange={c => setColor(c ?? randomIdentityColor())}
            triggerLabel="Elegir tu color"
          />
          <button type="submit" className="btn-primary">Continuar</button>
        </form>
      </div>
    </div>
  )
}
