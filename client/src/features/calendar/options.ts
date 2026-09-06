import type { RecurrenceRule } from '../../types'

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  none:            'Sin repetición',
  daily:           'Cada día',
  weekly:          'Cada semana',
  monthly:         'Cada mes, mismo día',
  'monthly-first': 'Primer día del mes',
  'monthly-last':  'Último día del mes',
  annual:          'Cada año',
}

export const RECURRENCE_OPTIONS: Record<RecurrenceRule, { label: string; sub: string }> = {
  none:            { label: 'Sin repetición', sub: '' },
  daily:           { label: 'Diario',         sub: '1 año' },
  weekly:          { label: 'Semanal',        sub: '2 años' },
  monthly:         { label: 'Mensual',        sub: 'mismo día' },
  'monthly-first': { label: 'Primer día',     sub: 'del mes' },
  'monthly-last':  { label: 'Último día',     sub: 'del mes' },
  annual:          { label: 'Anual',          sub: '10 años' },
}

export const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Sin recordatorio', value: null },
  { label: '5 minutos antes',  value: 5 },
  { label: '15 minutos antes', value: 15 },
  { label: '30 minutos antes', value: 30 },
  { label: '1 hora antes',     value: 60 },
  { label: '2 horas antes',    value: 120 },
  { label: '1 día antes',      value: 1440 },
  { label: '2 días antes',     value: 2880 },
]
