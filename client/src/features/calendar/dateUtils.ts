// Helpers de fecha puros de EventModal, extraídos para poder testearlos sin
// renderizar el componente. Esta zona ha tenido bugs históricos (cambio de
// mes, día completo vs con hora, fin exclusivo de FullCalendar).

// "YYYY-MM-DD" a partir de los componentes LOCALES de un Date (no UTC).
// Compartido por los helpers de abajo y por Calendar.tsx (para formatear las
// fechas que devuelve FullCalendar al navegar/arrastrar).
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayDateStr(): string {
  return formatLocalDate(new Date())
}

export function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return formatLocalDate(date)
}

// Un evento con hora se guarda como instante UTC (ISO con "Z"); estas dos
// funciones lo vuelven a expresar en fecha/hora locales para los inputs.
export function isoToLocalDate(iso: string): string {
  return formatLocalDate(new Date(iso))
}

export function isoToLocalTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "Día local" de un event.start: con hora es un instante UTC ("...Z") que hay
// que convertir; de día completo ya es "YYYY-MM-DD" flotante, se usa tal cual.
export function localDateKey(start: string): string {
  return start.includes('T') ? isoToLocalDate(start) : start
}

export function dayOfWeekName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' })
}

export function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

export interface BuildEventDatesInput {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  showTime: boolean
  isRecurring: boolean
}

// Calcula `start`/`end` finales a partir del estado del formulario.
// Con hora: instante real en UTC (ISO con "Z"). Día completo: fecha flotante,
// sin convertir. El input de "Fecha fin" es inclusivo (el último día real del
// evento), pero FullCalendar guarda/pinta el fin de los eventos de día
// completo como fecha EXCLUSIVA (el día siguiente); sumamos uno solo en ese
// caso. Las series recurrentes ignoran `endDate` (la duración la fija
// `generateRecurrenceInstances` en el servidor a partir de start/end del
// evento base) y usan `startDate` + `endTime` para el fin de cada instancia.
export function buildEventDates({ startDate, endDate, startTime, endTime, showTime, isRecurring }: BuildEventDatesInput): { start: string; end: string } {
  const build = (date: string, time: string) => showTime ? new Date(`${date}T${time}`).toISOString() : date
  const start = build(startDate, startTime)
  const end = isRecurring
    ? build(startDate, endTime)
    : showTime
      ? build(endDate, endTime)
      : addDaysToDateStr(endDate, 1)
  return { start, end }
}

// ── Borrador de evento (móvil, vista día) ──
// Al tocar un hueco se propone un bloque de DRAFT_DURATION_MIN minutos que
// empieza en el tramo de DRAFT_SNAP_MIN más cercano por debajo; el usuario lo
// ajusta antes de abrir el formulario.
export const DRAFT_SNAP_MIN = 30
export const DRAFT_DURATION_MIN = 60

// Nunca cruza la medianoche: la vista día solo muestra un día, así que un
// bloque que empezara a las 23:30 se acorta (acaba a las 24:00).
export function defaultDraftRange(clicked: Date): { start: Date; end: Date } {
  const start = new Date(clicked)
  start.setMinutes(Math.floor(start.getMinutes() / DRAFT_SNAP_MIN) * DRAFT_SNAP_MIN, 0, 0)
  const end = new Date(start.getTime() + DRAFT_DURATION_MIN * 60_000)
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  return { start, end: end > midnight ? midnight : end }
}

// "10:00 – 11:00" (hora local).
export function formatTimeRange(start: Date, end: Date): string {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${hhmm(start)} – ${hhmm(end)}`
}
