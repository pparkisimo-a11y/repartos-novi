import { applyCommission } from '@/lib/settings'

export type DeliveryStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

export const ACTIVE_STATUSES: DeliveryStatus[] = ['PENDING', 'ACCEPTED', 'PICKED_UP']

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status)
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  PICKED_UP: 'Recogido',
  DELIVERED: 'Entregado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

export const STATUS_ORDER: DeliveryStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PICKED_UP',
  'DELIVERED',
]

export interface DeliveryDTO {
  id: string
  status: DeliveryStatus
  restaurantId: string
  restaurantName: string
  restaurantAddress: string
  lat: number
  lng: number
  requestedAt: string
  acceptedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  rejectedAt: string | null
  totalMs: number | null
  /** Repartidores asignados al restaurante: a quiénes llega la petición. */
  assignedDriverIds: string[]
  assignedDriverNames: string[]
  /** Repartidor que aceptó el reparto (null hasta que alguien lo tome). */
  driverId: string | null
  driverName: string | null
  /** Nombre/anotación del pedido (opcional, la pone el restaurante al solicitar). */
  customerName: string | null
  /** Datos de la entrega, rellenados por el repartidor al recoger. */
  dropoffAddress: string | null
  distanceKm: number | null
  fee: number | null
  /** Tarifa del restaurante que aplica a este reparto (para previsualizar). */
  feeBaseEur: number
  feeThresholdKm: number
  feePerExtraKmEur: number
  /** Comisión (%) de la plataforma descuentada de la tarifa para el repartidor. */
  commissionPct: number
}

/** Shape devuelto por Prisma al incluir restaurante (+repartores) y repartidor. */
interface DeliveryWithRestaurant {
  id: string
  status: string
  requestedAt: Date
  acceptedAt: Date | null
  pickedUpAt: Date | null
  deliveredAt: Date | null
  rejectedAt: Date | null
  customerName: string | null
  driverId: string | null
  dropoffAddress: string | null
  distanceKm: number | null
  fee: number | null
  restaurantId: string
  restaurant: {
    name: string
    address: string
    lat: number
    lng: number
    feeBaseEur: number
    feeThresholdKm: number
    feePerExtraKmEur: number
    drivers?: Array<{ driverId: string; driver?: { name: string } | null }>
  }
  driver?: { id: string; name: string } | null
}

/**
 * Serializador central compartido por todas las rutas de deliveries.
 * `includeLocation` oculta las coordenadas exactas a los restaurantes
 * (ya las conocen).
 *
 * `commissionPct` (para el repartidor) descuenta la comisión de la plataforma
 * de la tarifa mostrada: el repartidor ve el importe neto. El admin y el
 * restaurante ven la tarifa real (se llama con comisión 0). El campo
 * commissionPct viaja siempre en el DTO para que la UI pueda previsualizar.
 */
export function serializeDelivery(
  d: DeliveryWithRestaurant,
  includeLocation = true,
  commissionPct = 0,
): DeliveryDTO {
  const totalMs =
    d.requestedAt && d.deliveredAt
      ? new Date(d.deliveredAt).getTime() - new Date(d.requestedAt).getTime()
      : null
  const assignments = d.restaurant.drivers ?? []
  return {
    id: d.id,
    status: d.status as DeliveryStatus,
    restaurantId: d.restaurantId,
    restaurantName: d.restaurant.name,
    restaurantAddress: includeLocation ? d.restaurant.address : '',
    lat: includeLocation ? d.restaurant.lat : 0,
    lng: includeLocation ? d.restaurant.lng : 0,
    requestedAt: d.requestedAt.toISOString(),
    acceptedAt: d.acceptedAt?.toISOString() ?? null,
    pickedUpAt: d.pickedUpAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    rejectedAt: d.rejectedAt?.toISOString() ?? null,
    totalMs,
    assignedDriverIds: assignments.map((a) => a.driverId),
    assignedDriverNames: assignments.map((a) => a.driver?.name ?? '—'),
    driverId: d.driver?.id ?? d.driverId ?? null,
    driverName: d.driver?.name ?? null,
    customerName: d.customerName ?? null,
    dropoffAddress: d.dropoffAddress ?? null,
    distanceKm: d.distanceKm ?? null,
    fee: applyCommission(d.fee, commissionPct),
    feeBaseEur: d.restaurant.feeBaseEur,
    feeThresholdKm: d.restaurant.feeThresholdKm,
    feePerExtraKmEur: d.restaurant.feePerExtraKmEur,
    commissionPct,
  }
}

/** Prisma `include` que proporciona todo lo que `serializeDelivery` necesita. */
export const DELIVERY_RESTAURANT_INCLUDE = {
  restaurant: {
    select: {
      name: true,
      address: true,
      lat: true,
      lng: true,
      feeBaseEur: true,
      feeThresholdKm: true,
      feePerExtraKmEur: true,
      drivers: { select: { driverId: true, driver: { select: { name: true } } } },
    },
  },
  driver: { select: { id: true, name: true } },
} as const
