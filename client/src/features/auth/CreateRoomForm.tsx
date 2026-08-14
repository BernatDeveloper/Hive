import { useState } from 'react'

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
    if (password.length < 4) return setLocalError('La contraseña debe tener al menos 4 caracteres')
    if (password !== confirm) return setLocalError('Las contraseñas no coinciden')
    setLocalError('')
    onSubmit(name.trim(), password)
  }

  const errorMessage = localError || error

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
              maxLength={30}
              autoFocus
            />
          </label>
          <label className="auth-label">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres"
            />
          </label>
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
