export type Role = 'restaurant' | 'driver' | 'admin'

export interface RestaurantUser {
  id: string
  name: string
  username: string
  address: string
  lat: number
  lng: number
  role: 'restaurant'
}

export interface DriverUser {
  id: string
  name: string
  role: 'driver'
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
  /** Driver this delivery is routed to (from the restaurant's assignment). */
  assignedDriverId: string | null
  assignedDriverName: string | null
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
  }
  byRestaurant: {
    restaurantId: string
    restaurantName: string
    count: number
    totalMs: number
    avgMs: number
  }[]
  trend: { date: string; count: number }[]
}
