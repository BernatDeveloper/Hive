import { createPortal } from 'react-dom'
import './popover.css'
import { usePopover } from './usePopover'

export interface ColorOption {
  value: string | null
  name: string
}

interface Props {
  options: ColorOption[]
  value: string | null
  onChange: (value: string | null) => void
  // Etiqueta accesible del botón disparador (lo que lee un lector de
  // pantalla al enfocarlo, no el texto visible).
  triggerLabel: string
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

// Selector de color como desplegable: un anillo + nombre por opción, con
// marca de verificación en la seleccionada — mismo patrón visual en los tres
// sitios donde se elige "un color de una lista corta" (identidad, evento).
// Comparte la CSS base (.popover*) con SelectPopover; aquí se añade el
// anillo de color (.popover-color-dot) que el genérico no necesita.
export default function ColorPickerPopover({ options, value, onChange, triggerLabel }: Props) {
  const { open, pos, wrapRef, listRef, toggle, closePopover } = usePopover()

  const current = options.find(o => o.value === value) ?? options[0]

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
        <span className="popover-color-dot" style={{ borderColor: current?.value ?? 'var(--primary)' }} />
        <span className="popover-trigger-label">{current?.name ?? 'Color'}</span>
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
          {options.map(o => (
            <button
              type="button"
              key={o.value ?? '__default'}
              role="option"
              aria-selected={o.value === value}
              className={`popover-item${o.value === value ? ' popover-item--on' : ''}`}
              onClick={() => { onChange(o.value); closePopover() }}
            >
              <span className="popover-color-dot" style={{ borderColor: o.value ?? 'var(--primary)' }} />
              <span className="popover-item-label">{o.name}</span>
              {o.value === value && <span className="popover-check"><IconCheck /></span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
