import type { ColorOption } from '../../shared/ColorPickerPopover'

// Paleta fija de colores de evento — igual para todas las salas, sin
// personalización por sala (ver CLAUDE.md "Colores de evento"). Deliberadamente
// NO son los típicos rojo/verde/azul puros: tonos modernos, estilo pastel
// suave (claros, no desaturados del todo — ni chillones ni apagados), con
// cobertura amplia del círculo cromático. Dos tonos (claro/medio) por cada
// una de 15 familias de color, ordenados por matiz.
export const EVENT_COLORS: ColorOption[] = [
  { value: '#FDBA74', name: 'Mandarina claro' },
  { value: '#FB923C', name: 'Mandarina' },
  { value: '#FCD34D', name: 'Miel claro' },
  { value: '#FBBF24', name: 'Miel' },
  { value: '#FDE047', name: 'Limón claro' },
  { value: '#FACC15', name: 'Limón' },
  { value: '#BEF264', name: 'Lima claro' },
  { value: '#A3E635', name: 'Lima' },
  { value: '#86EFAC', name: 'Menta claro' },
  { value: '#4ADE80', name: 'Menta' },
  { value: '#6EE7B7', name: 'Esmeralda claro' },
  { value: '#34D399', name: 'Esmeralda' },
  { value: '#5EEAD4', name: 'Jade claro' },
  { value: '#2DD4BF', name: 'Jade' },
  { value: '#67E8F9', name: 'Aguamarina claro' },
  { value: '#22D3EE', name: 'Aguamarina' },
  { value: '#7DD3FC', name: 'Celeste claro' },
  { value: '#38BDF8', name: 'Celeste' },
  { value: '#93C5FD', name: 'Cielo claro' },
  { value: '#60A5FA', name: 'Cielo' },
  { value: '#A5B4FC', name: 'Índigo claro' },
  { value: '#818CF8', name: 'Índigo' },
  { value: '#C4B5FD', name: 'Violeta claro' },
  { value: '#A78BFA', name: 'Violeta' },
  { value: '#D8B4FE', name: 'Lavanda claro' },
  { value: '#C084FC', name: 'Lavanda' },
  { value: '#F0ABFC', name: 'Magenta claro' },
  { value: '#E879F9', name: 'Magenta' },
  { value: '#F9A8D4', name: 'Flamenco claro' },
  { value: '#F472B6', name: 'Flamenco' },
]
