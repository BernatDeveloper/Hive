import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopoverPosition {
  left: number
  width: number
  maxHeight: number
  // Exactamente uno de los dos: ancla por arriba (debajo del disparador) o
  // por abajo (encima del disparador, cuando no cabe hacia abajo).
  top?: number
  bottom?: number
  // Valor resuelto de los tokens de color/tema en el punto del DOM donde
  // vive el disparador — ver nota sobre el portal más abajo.
  vars: Record<string, string>
}

const PREFERRED_MAX_HEIGHT = 320
const MIN_USABLE_HEIGHT = 160
const VIEWPORT_MARGIN = 8
const GAP = 6

// Los tokens que de verdad usa popover.css — se vuelven a declarar como
// custom properties inline en la lista portada (ver más abajo) para que
// resuelvan al valor correcto sin depender de dónde cuelgue en el DOM.
const THEME_VARS = [
  '--surface', '--surface-2', '--border', '--text', '--muted', '--primary',
  '--radius-sm', '--radius-md', '--shadow-sm', '--shadow-md', '--shadow-lg',
  '--transition-fast',
]

// Estado + posicionamiento compartido por los desplegables tipo popup
// (SelectPopover, ColorPickerPopover): abierto/cerrado, click fuera, Escape,
// y la posición de la lista.
//
// La lista se renderiza vía portal en <body> (ver uso de createPortal en los
// componentes), posicionada con `position: fixed` y coordenadas calculadas
// aquí a partir del disparador. Dos motivos para no dejarla como hijo normal
// con `position: absolute`:
// 1. Dentro de un modal con `overflow-y: auto`, un hijo `absolute` que se
//    sale del modal todavía cuenta como contenido desbordado y hace que el
//    modal entero "crezca" (más scroll) para encajarlo.
// 2. `.modal-overlay` tiene `backdrop-filter`, que crea un containing block
//    para descendientes `fixed` — sin portal, un `position: fixed` interno
//    quedaría posicionado respecto a ese overlay (con su padding) en vez de
//    respecto al viewport, descuadrando las coordenadas de getBoundingClientRect.
// `listRef` se sigue necesitando para el click-fuera: al vivir en <body>, ya
// no es descendiente de `wrapRef` en el DOM.
//
// Ese mismo salto a <body> tiene una contrapartida: los colores de la sala
// (--surface, --text, ...) se fijan como custom properties inline en
// `.dashboard` (ver useRoomStyle), así que un elemento portado a <body> deja
// de heredarlos y cae a los valores por defecto de `:root` en index.css —
// se veía como un desplegable blanco con texto oscuro en una sala con tema
// oscuro. Por eso `measure()` lee con `getComputedStyle` el valor YA
// RESUELTO de cada token en el propio disparador (que sigue colgado en su
// sitio real del árbol) y la lista los vuelve a declarar como custom
// properties inline sobre sí misma — queda correcto sin importar dónde
// cuelgue, incluso fuera de una sala con tema (p. ej. IdentityForm, antes de
// entrar a ninguna sala, donde simplemente no hay overrides que leer y se
// resuelven los valores por defecto de `:root` igualmente).
export function usePopover(onClose?: () => void) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPosition | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Se abre hacia abajo salvo que no quepa un alto mínimo usable ahí y haya
  // más sitio hacia arriba — en ambos casos el alto máximo se recorta al
  // espacio real disponible, para que nunca queden opciones inalcanzables
  // por debajo del borde de la pantalla (ver "DE/A" en EventModal: con el
  // selector de hora cerca del final del formulario, un alto fijo de 320px
  // se salía del viewport y las últimas horas/minutos no se podían tocar).
  function measure(): PopoverPosition | null {
    const el = wrapRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const width = Math.max(r.width, 160)
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - VIEWPORT_MARGIN
    )
    const spaceBelow = window.innerHeight - r.bottom - GAP - VIEWPORT_MARGIN
    const spaceAbove = r.top - GAP - VIEWPORT_MARGIN

    const cs = getComputedStyle(el)
    const vars: Record<string, string> = {}
    for (const name of THEME_VARS) {
      const v = cs.getPropertyValue(name).trim()
      if (v) vars[name] = v
    }

    if (spaceBelow >= MIN_USABLE_HEIGHT || spaceBelow >= spaceAbove) {
      return { left, width, vars, top: r.bottom + GAP, maxHeight: Math.max(MIN_USABLE_HEIGHT, Math.min(PREFERRED_MAX_HEIGHT, spaceBelow)) }
    }
    return { left, width, vars, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.max(MIN_USABLE_HEIGHT, Math.min(PREFERRED_MAX_HEIGHT, spaceAbove)) }
  }

  function openPopover() {
    setPos(measure())
    setOpen(true)
  }

  const closePopover = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  function toggle() {
    if (open) closePopover()
    else openPopover()
  }

  useEffect(() => {
    if (!open) return
    function reposition() { setPos(measure()) }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return
      closePopover()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePopover()
    }
    window.addEventListener('resize', reposition)
    document.addEventListener('scroll', reposition, true)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', reposition)
      document.removeEventListener('scroll', reposition, true)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closePopover])

  return { open, pos, wrapRef, listRef, toggle, closePopover }
}
