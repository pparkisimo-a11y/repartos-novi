import { cn } from '@/lib/utils'
import type { DeliveryStatus } from '@/lib/types'

const TONES: Record<DeliveryStatus, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  ACCEPTED: {
    label: 'En camino',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  PICKED_UP: {
    label: 'En reparto',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  DELIVERED: {
    label: 'Entregado',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Rechazado',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    dot: 'bg-zinc-400',
  },
}

export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: DeliveryStatus
  className?: string
  showDot?: boolean
}) {
  const tone = TONES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tone.className,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone.dot,
            status === 'PENDING' && 'animate-pulse',
          )}
        />
      )}
      {tone.label}
    </span>
  )
}
