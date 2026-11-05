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
  /** Driver this delivery is routed to (from the restaurant's assignment). */
  assignedDriverId: string | null
  assignedDriverName: string | null
}

/** Shape returned by Prisma when including the delivery's restaurant (+driver). */
interface DeliveryWithRestaurant {
  id: string
  status: string
  requestedAt: Date
  acceptedAt: Date | null
  pickedUpAt: Date | null
  deliveredAt: Date | null
  rejectedAt: Date | null
  restaurantId: string
  restaurant: {
    name: string
    address: string
    lat: number
    lng: number
    assignedDriverId?: string | null
    assignedDriver?: { id: string; name: string } | null
  }
}

/**
 * Central serializer shared by every deliveries API route. `includeLocation`
 * hides the exact coordinates from restaurants (they already know them).
 */
export function serializeDelivery(d: DeliveryWithRestaurant, includeLocation = true): DeliveryDTO {
  const totalMs =
    d.requestedAt && d.deliveredAt
      ? new Date(d.deliveredAt).getTime() - new Date(d.requestedAt).getTime()
      : null
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
    assignedDriverId: d.restaurant.assignedDriver?.id ?? d.restaurant.assignedDriverId ?? null,
    assignedDriverName: d.restaurant.assignedDriver?.name ?? null,
  }
}

/** Prisma `include` that provides everything `serializeDelivery` needs. */
export const DELIVERY_RESTAURANT_INCLUDE = {
  restaurant: {
    select: {
      name: true,
      address: true,
      lat: true,
      lng: true,
      assignedDriver: { select: { id: true, name: true } },
    },
  },
} as const
