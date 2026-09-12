import { useState } from 'react'
import { MIN_PASSWORD, passwordStrength } from './password-strength'

const IconArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
)

interface Props {
  onBack: () => void
  onSubmit: (name: string, password: string) => void
  error: string
  loading: boolean
}

export default function CreateRoomForm({ onBack, onSubmit, error, loading }: Props) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setLocalError('El nombre de sala es obligatorio')
    if (password.length < MIN_PASSWORD) return setLocalError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
    if (password !== confirm) return setLocalError('Las contraseñas no coinciden')
    setLocalError('')
    onSubmit(name.trim(), password)
  }

  const errorMessage = localError || error
  const strength = passwordStrength(password)

  return (
    <div className="auth-container">
      <div className="auth-card">
        <button className="btn-ghost btn-icon btn-back" onClick={onBack} aria-label="Volver"><IconArrowLeft /></button>
        <div className="auth-form-header">
          <h1>Crear sala</h1>
          <p>Elige nombre y contraseña para tu sala privada</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Nombre de sala
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="mi-sala-familia"
              maxLength={60}
              autoFocus
            />
          </label>
          <label className="auth-label">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
            />
          </label>
          {password.length > 0 && (
            <div className={`pw-strength pw-strength--${strength.level}`}>
              <div className="pw-strength-bar">
                <span style={{ width: `${(strength.score / 5) * 100}%` }} />
              </div>
              <span className="pw-strength-label">Seguridad: {strength.level}</span>
            </div>
          )}
          <label className="auth-label">
            Confirmar contraseña
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
            />
          </label>
          {errorMessage && <p className="auth-error">{errorMessage}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creando sala…' : 'Crear sala'}
          </button>
        </form>
      </div>
    </div>
  )
}
