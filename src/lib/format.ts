import type { DeliveryStatus } from './types'

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  })
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  // Clock skew (server ahead of client) or very recent → "justo ahora"
  if (diff < 10000) return 'justo ahora'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `hace ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export const STATUS_TONE: Record<
  DeliveryStatus,
  { label: string; className: string; dot: string }
> = {
  PENDING: {
    label: 'Pendiente',
    className:
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  ACCEPTED: {
    label: 'Aceptado',
    className:
      'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    dot: 'bg-sky-500',
  },
  PICKED_UP: {
    label: 'Recogido',
    className:
      'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
    dot: 'bg-violet-500',
  },
  DELIVERED: {
    label: 'Entregado',
    className:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Rechazado',
    className:
      'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    dot: 'bg-rose-500',
  },
  CANCELLED: {
    label: 'Cancelado',
    className:
      'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30',
    dot: 'bg-zinc-500',
  },
}
