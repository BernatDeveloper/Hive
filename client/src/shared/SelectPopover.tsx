import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './popover.css'
import { usePopover } from './usePopover'

export interface SelectOption<T> {
  value: T
  label: string
}

interface Props<T> {
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  // Etiqueta accesible del botón disparador (lo que lee un lector de
  // pantalla al enfocarlo, no el texto visible).
  triggerLabel: string
  // Con listas largas (zona horaria: cientos de IANA) añade un buscador
  // arriba del todo; con listas cortas (hora, recordatorio) no hace falta.
  searchable?: boolean
  searchPlaceholder?: string
}

const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

// Desplegable de selección única como popup (mismo lenguaje visual que
// ColorPickerPopover, sin el anillo de color): disparador con la opción
// actual, lista vertical con check en la seleccionada. Genérico en el tipo
// del valor para servir tanto a listas de string (hora, zona horaria) como
// de number | null (recordatorio).
export default function SelectPopover<T>({ options, value, onChange, triggerLabel, searchable, searchPlaceholder }: Props<T>) {
  const [query, setQuery] = useState('')
  const resetQuery = useCallback(() => setQuery(''), [])
  const { open, pos, wrapRef, listRef, toggle, closePopover } = usePopover(resetQuery)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const current = options.find(o => o.value === value)
  const filtered = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div className="popover" ref={wrapRef}>
      <button
        type="button"
        className="popover-trigger"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={triggerLabel}
      >
        <span className="popover-trigger-label">{current?.label ?? '—'}</span>
        <IconChevron />
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          className="popover-list"
          role="listbox"
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            ...pos.vars,
          } as React.CSSProperties}
        >
          {searchable && (
            <input
              type="text"
              className="popover-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? 'Buscar…'}
              autoFocus
            />
          )}
          {filtered.length === 0 && <p className="popover-empty">Sin resultados</p>}
          {filtered.map(o => {
            const isOn = o.value === value
            return (
              <button
                type="button"
                key={String(o.value)}
                ref={isOn ? selectedRef : undefined}
                role="option"
                aria-selected={isOn}
                className={`popover-item${isOn ? ' popover-item--on' : ''}`}
                onClick={() => { onChange(o.value); closePopover() }}
              >
                <span className="popover-item-label">{o.label}</span>
                {isOn && <span className="popover-check"><IconCheck /></span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
