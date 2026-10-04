// Marca de Hive: una celda de panal (hexágono) con otra celda rellena dentro.
// Usa `currentColor`, así que toma el color de donde se coloque (p. ej. el
// primario de la sala en la pantalla de inicio). Los iconos de la app
// (favicon.svg, icon-*.png) usan la misma geometría sobre fondo color miel.
export default function HiveLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon
        points="12,2.5 20.23,7.25 20.23,16.75 12,21.5 3.77,16.75 3.77,7.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon points="12,8 15.46,10 15.46,14 12,16 8.54,14 8.54,10" fill="currentColor" />
    </svg>
  )
}
