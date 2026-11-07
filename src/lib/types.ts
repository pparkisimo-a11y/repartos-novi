export type Role = 'restaurant' | 'driver' | 'admin'

export interface RestaurantUser {
  id: string
  name: string
  username: string
  address: string
  lat: number
  lng: number
  role: 'restaurant'
  scheduleDays: string
  scheduleStart: string
  scheduleEnd: string
}

export interface DriverUser {
  id: string
  name: string
  username: string
  role: 'driver'
  scheduleDays: string
  scheduleStart: string
  scheduleEnd: string
  isSuperDriver: boolean
}

export interface AdminUser {
  id: string
  name: string
  username: string
  role: 'admin'
}

export type AppUser = RestaurantUser | DriverUser | AdminUser

export type DeliveryStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

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
  /** Repartidor al que se le ofrece ahora (asignación secuencial). */
  currentAssigneeId: string | null
  currentAssigneeName: string | null
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

/** Sugerencia de dirección del autocomplete (estilo Google Maps) que usa el
 *  repartidor al recoger el pedido. `main` es la línea principal ("Calle
 *  Mayor 5") y `secondary` el contexto ("28013 Madrid"). */
export interface AddressSuggestion {
  lat: number
  lng: number
  main: string
  secondary: string
  /** Dirección completa normalizada, la que se guarda en el pedido. */
  label: string
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  PICKED_UP: 'Recogido',
  DELIVERED: 'Entregado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

export interface StatsResponse {
  totals: {
    services: number
    totalMs: number
    avgMs: number
    active: number
    pending: number
    totalEur: number
  }
  byRestaurant: {
    restaurantId: string
    restaurantName: string
    count: number
    totalMs: number
    avgMs: number
    totalEur: number
  }[]
  trend: { date: string; count: number }[]
}
