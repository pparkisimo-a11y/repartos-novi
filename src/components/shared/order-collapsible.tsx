'use client'

/**
 * Tarjeta de pedido con TAMAÑO SEGÚN LA ATENCIÓN QUE PIDE.
 *
 * - PENDING (el caller la marca como no plegable): se muestra GRANDE como
 *   siempre — cabecera naranja, todo el contenido a la vista, sin chevron.
 *   Es un pedido que espera una decisión.
 * - Estados en curso (ACCEPTED / PICKED_UP): la tarjeta se MINIMIZA sola en
 *   una fila compacta y calmada (cabecera neutra) con una línea de resumen
 *   con lo importante de un vistazo y, opcionalmente, el botón de acción
 *   principal en versión compacta — se puede seguir trabajando sin abrir.
 *   Un toque en la cabecera la vuelve a expandir a la tarjeta grande de
 *   siempre: la cabecera se "enciende" (naranja) y el cuerpo se despliega.
 *
 * El plegado se anima con la rejilla CSS (0fr ↔ 1fr) y los colores con
 * transition-colors, así el momento "acepto el pedido → la tarjeta se
 * minimiza" queda fluido y se entiende sin explicaciones.
 */
import { Fragment, type ReactNode } from 'react'
import { ChevronDown, Clock, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useNow } from '@/hooks/use-now'

export function CollapsibleOrderCard({
  icon: Icon,
  orderId,
  requestedAt,
  collapsible,
  open,
  onToggle,
  summary,
  collapsedAction,
  children,
}: {
  /** Icono de la cabecera (campana, bici, paquete…). */
  icon: LucideIcon
  /** Id del pedido: se muestra como "Pedido #XXXXXX". */
  orderId: string
  /** Momento de la solicitud — el contador de minutos corre en vivo. */
  requestedAt: string
  /** true en los estados que se pliegan (aceptado / en reparto). */
  collapsible: boolean
  open: boolean
  onToggle: () => void
  /** Línea de resumen siempre visible (solo para plegables). */
  summary?: ReactNode
  /** Acción principal compacta, visible solo con la tarjeta plegada. */
  collapsedAction?: ReactNode
  /** Cuerpo completo: el contenido grande de la tarjeta de siempre. */
  children: ReactNode
}) {
  const now = useNow(1000)
  const elapsedMin = Math.max(
    0,
    Math.round((now - new Date(requestedAt).getTime()) / 60000),
  )
  const expanded = !collapsible || open
  const shortId = orderId.slice(-6).toUpperCase()

  const headerInner = (
    <>
      <span className="flex min-w-0 items-center gap-2 font-bold">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">Pedido #{shortId}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
        <Clock className="h-4 w-4" />
        <span
          className={`hidden sm:inline ${expanded ? 'text-white/80' : 'text-muted-foreground'}`}
        >
          Tiempo:{' '}
        </span>
        <span className="font-bold tabular-nums">{elapsedMin} min</span>
        {collapsible && (
          <ChevronDown
            className={`ml-1 h-4 w-4 transition-transform duration-300 ${
              open ? 'rotate-180' : ''
            } ${expanded ? 'text-white' : 'text-muted-foreground'}`}
            aria-hidden
          />
        )}
      </span>
    </>
  )

  const headerCls = `flex w-full items-center justify-between gap-2 overflow-hidden px-4 py-3.5 text-left transition-colors duration-300 sm:gap-3 sm:px-5 ${
    expanded ? 'bg-primary text-white' : 'bg-card text-foreground hover:bg-muted/40'
  }`

  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      {/* Cabecera = botón de plegado. Naranja cuando está expandida
          (¡mírame!), neutra y calmada cuando está plegada (está en marcha). */}
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`Pedido #${shortId}: ${open ? 'contraer' : 'expandir'}`}
          className={headerCls}
        >
          {headerInner}
        </button>
      ) : (
        <div className={headerCls}>{headerInner}</div>
      )}

      {/* Resumen siempre visible: lo importante de un vistazo sin abrir */}
      {collapsible && summary && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 overflow-hidden bg-muted/30 px-4 py-2.5 sm:px-5">
          {summary}
        </div>
      )}

      {/* Cuerpo completo: se pliega/despliega animando la rejilla (0fr↔1fr).
          Queda montado (pero inerte al plegar) para que la animación funcione
          también al contraer. */}
      <div
        className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden" inert={!expanded}>
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </div>

      {/* Acción compacta: solo con la tarjeta plegada (animación inversa a
          la del cuerpo, así el botón grande "sustituye" al compacto). */}
      {collapsible && collapsedAction && (
        <div
          className={`grid transition-all duration-300 ease-in-out ${
            expanded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          }`}
        >
          <div className="overflow-hidden" inert={expanded}>
            <div className="px-4 pb-3.5 sm:px-5">{collapsedAction}</div>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Mini indicador de progreso de puntos para la línea de resumen. */
export function MiniStepper({
  total,
  current,
}: {
  total: number
  /** Índice del paso en curso (los anteriores, completados). */
  current: number
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span
              className={`h-px w-3 sm:w-4 ${i <= current ? 'bg-primary/60' : 'bg-border'}`}
            />
          )}
          <span
            className={`h-2 w-2 rounded-full ${
              i < current
                ? 'bg-primary'
                : i === current
                  ? 'animate-pulse bg-primary ring-2 ring-primary/25'
                  : 'bg-border'
            }`}
          />
        </Fragment>
      ))}
    </span>
  )
}

/** Etiqueta de sección con contador y línea al ras (separa lo que pide
 *  decisión de lo que ya está en marcha). */
export function OrdersSectionLabel({
  icon: Icon,
  label,
  count,
}: {
  icon: LucideIcon
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
        {count}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}
