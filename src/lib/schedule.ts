/**
 * Horario negociado de cada restaurante.
 *
 * El admin fija con cada local qué días y en qué franja horaria puede pedir
 * reparto. Fuera de ese horario, el botón "Solicitar repartidor" se bloquea.
 *
 * Representación (en la BD, en Restaurant):
 *   scheduleDays  → "1,2,3,4,5,6" (0=domingo … 6=sábado, separados por comas)
 *   scheduleStart → "22:00" (HH:MM, hora local del restaurante)
 *   scheduleEnd   → "05:00" (HH:MM; si es menor que start, cruza medianoche)
 *
 * Si scheduleDays está vacío, el local está abierto 24/7 (sin restricción).
 */

export interface Schedule {
  /** Días activos como array de números (0=dom … 6=sáb). Vacío = todos los días. */
  days: number[]
  /** Hora de inicio "HH:MM". */
  start: string
  /** Hora de fin "HH:MM". Si < start, la franja cruza medianoche. */
  end: string
}

export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Parsea los campos de la BD a un objeto Schedule. */
export function parseSchedule(
  days: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): Schedule {
  return {
    days: (days || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d !== '')
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    start: start || '',
    end: end || '',
  }
}

/** ¿El horario está vacío (no configurado)? El admin debe negociarlo. */
export function isScheduleEmpty(s: Schedule): boolean {
  return s.days.length === 0 && !s.start && !s.end
}

/** Convierte "HH:MM" a minutos desde medianoche. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * ¿El restaurante está abierto AHORA según su horario negociado?
 * Si el horario está vacío (no configurado), está CERRADO: el admin debe
 * negociar el horario con el local antes de que pueda pedir reparto.
 */
export function isRestaurantOpen(s: Schedule, now: Date = new Date()): boolean {
  if (isScheduleEmpty(s)) return false
  const day = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()

  // Sin días configurados → cualquier día vale
  const dayOk = s.days.length === 0 || s.days.includes(day)
  if (!dayOk) return false

  // Sin franja horaria → cualquier hora vale (solo filtra por día)
  if (!s.start || !s.end) return true

  const start = toMin(s.start)
  const end = toMin(s.end)
  if (start <= end) {
    // Franja normal: 18:00 → 23:00
    return minutes >= start && minutes < end
  }
  // Franja que cruza medianoche: 22:00 → 05:00.
  // La madrugada (00:00–05:00) cuenta como parte del día ANTERIOR: para que
  // un viernes nocturno (22:00 vie → 05:00 sáb) cuente como "viernes",
  // comprobamos también el día anterior cuando estamos antes de `end`.
  if (minutes >= start || minutes < end) {
    // Si estamos en la franja de madrugada (antes de end), el día negociado
    // es el anterior al actual.
    if (minutes < end) {
      const prevDay = (day + 6) % 7
      return s.days.length === 0 || s.days.includes(prevDay)
    }
    return true
  }
  return false
}

/** Descripción legible del horario para la UI. */
export function scheduleLabel(s: Schedule): string {
  if (isScheduleEmpty(s)) return 'Sin horario configurado'
  const days =
    s.days.length === 0
      ? 'Todos los días'
      : s.days
          .slice()
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
          .map((d) => DAY_SHORT[d])
          .join(', ')
  const time = s.start && s.end ? `${s.start}–${s.end}` : 'todo el día'
  return `${days} · ${time}`
}
