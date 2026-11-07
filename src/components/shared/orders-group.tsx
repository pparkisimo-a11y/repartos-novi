'use client'

/**
 * Grupo expandible de pedidos.
 *
 * Cuando un mismo origen tiene VARIOS pedidos activos — un restaurante con
 * varios repartos en la vista del repartidor, o un repartidor con varios
 * pedidos en la vista del local — las tarjetas se contraen en esta cabecera
 * compacta para no llenar la pantalla. Un toque la expande.
 *
 * Los grupos de UN solo pedido no usan este componente: se muestra la
 * tarjeta normal de siempre.
 */
import type { ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'

export type GroupChipTone = 'amber' | 'primary' | 'violet' | 'muted'

const CHIP_TONES: Record<GroupChipTone, string> = {
  amber: 'bg-amber-100 text-amber-700',
  primary: 'bg-primary/10 text-primary',
  violet: 'bg-violet-100 text-violet-700',
  muted: 'bg-muted text-muted-foreground',
}

export function OrdersGroup({
  icon: Icon,
  title,
  ordersCount,
  chips = [],
  open,
  onToggle,
  children,
}: {
  /** Icono del origen del grupo (restaurante o repartidor). */
  icon: LucideIcon
  /** Nombre del restaurante o del repartidor. */
  title: string
  /** Nº de pedidos dentro del grupo. */
  ordersCount: number
  /** Resumen de estado que se ve sin expandir ("2 pendientes"…). */
  chips?: Array<{ label: string; tone: GroupChipTone }>
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${title}: ${ordersCount} ${ordersCount === 1 ? 'pedido' : 'pedidos'}${open ? ', contraer' : ', expandir'}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 sm:px-5"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-bold">{title}</span>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">
              {ordersCount} {ordersCount === 1 ? 'pedido' : 'pedidos'}
            </span>
          </span>
          {chips.length > 0 && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_TONES[c.tone]}`}
                >
                  {c.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {/* Despliegue suave: la fila de la rejilla pasa de 0fr a 1fr. El
          contenido queda montado (inerte) para que la animación funcione
          también al contraer. */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="space-y-4 border-t border-border p-4">{children}</div>
        </div>
      </div>
    </Card>
  )
}
