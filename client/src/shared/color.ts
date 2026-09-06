// Luminancia percibida (ITU-R BT.601) < 128 → color oscuro.
// Se usa para derivar bordes/superficies de la sala y el color de texto de
// los eventos según su color de fondo.
export function isColorDark(hex: string | null | undefined): boolean {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

// Color de texto legible (blanco u oscuro) sobre un fondo dado.
export function readableTextColor(bgHex: string): string {
  return isColorDark(bgHex) ? '#FFFFFF' : '#1D1D1F'
}
