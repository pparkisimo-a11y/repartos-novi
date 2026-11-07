import type { AddressSuggestion, AppUser, DeliveryDTO, StatsResponse } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// --- Bearer token management (localStorage) ---
// The app runs inside a cross-site iframe preview where third-party cookies are
// blocked, so we authenticate with a bearer token in the Authorization header.
const TOKEN_KEY = 'kebab_token'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore (private mode / blocked storage)
  }
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(url, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(data?.error || 'Error inesperado', res.status)
  }
  return data as T
}

export interface AdminRestaurant {
  id: string
  name: string
  username: string
  address: string
  lat: number
  lng: number
  createdAt: string
  services: number
  assignedDriverIds: string[]
  assignedDriverNames: string[]
  feeBaseEur: number
  feeThresholdKm: number
  feePerExtraKmEur: number
}

export interface AdminDriver {
  id: string
  username: string
  name: string
  createdAt: string
  restaurants: number
  services: number
}

export type LeadStatus = 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'

export interface BillingDriverRow {
  driverId: string | null
  driverName: string
  count: number
  totalEur: number
}

export interface BillingRestaurantRow {
  restaurantId: string
  restaurantName: string
  count: number
  totalEur: number
  byDriver: BillingDriverRow[]
}

export interface BillingResponse {
  month: string
  totals: { count: number; totalEur: number }
  restaurants: BillingRestaurantRow[]
}

export interface Lead {
  id: string
  restaurantName: string
  contactName: string | null
  phone: string | null
  message: string | null
  status: LeadStatus
  notes: string | null
  createdAt: string
  contactedAt: string | null
  convertedAt: string | null
  convertedRestaurantId: string | null
  convertedRestaurantName: string | null
}

export const api = {
  me: () => request<{ user: AppUser | null }>('/api/auth/me'),
  login: (username: string, password: string) =>
    request<{ user?: AppUser; token?: string; error?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }).then((res) => {
      if (res.token) setAuthToken(res.token)
      return res
    }),
  logout: async () => {
    try {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
    } finally {
      clearAuthToken()
    }
  },

  listDeliveries: (scope?: 'active' | 'recent', view?: 'mine' | 'all') => {
    const qs = new URLSearchParams()
    if (scope) qs.set('scope', scope)
    if (view) qs.set('view', view)
    const q = qs.toString()
    return request<{ deliveries: DeliveryDTO[] }>(`/api/deliveries${q ? `?${q}` : ''}`)
  },
  createDelivery: (customerName?: string) =>
    request<{ delivery: DeliveryDTO }>('/api/deliveries', {
      method: 'POST',
      body: JSON.stringify({ customerName: customerName?.trim() || undefined }),
    }),
  updateDelivery: (
    id: string,
    status: string,
    extra?: {
      customerName?: string
      dropoffAddress?: string
      dropoffLat?: number
      dropoffLng?: number
      distanceKm?: number
    },
  ) =>
    request<{ delivery: DeliveryDTO }>(`/api/deliveries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...extra }),
    }),

  /** Geocodificación (dirección → coordenadas) para previsualizar tarifa.
   *  `bias` (posición del restaurante) acota la búsqueda a su entorno. */
  geocode: (q: string, bias?: { lat: number; lng: number }) => {
    const qs = new URLSearchParams({ q })
    if (bias) {
      qs.set('lat', String(bias.lat))
      qs.set('lng', String(bias.lng))
    }
    return request<{ result: { lat: number; lng: number; label?: string } | null }>(
      `/api/util/geocode?${qs.toString()}`,
    )
  },

  /** Sugerencias de dirección (estilo Google Maps) mientras el repartidor
   *  escribe. `bias` (posición del restaurante) prioriza resultados cercanos. */
  autocomplete: (q: string, bias?: { lat: number; lng: number }) => {
    const qs = new URLSearchParams({ q })
    if (bias) {
      qs.set('lat', String(bias.lat))
      qs.set('lng', String(bias.lng))
    }
    return request<{ suggestions: AddressSuggestion[] }>(
      `/api/util/autocomplete?${qs.toString()}`,
    )
  },

  /** Distancia del reparto (por carretera si es posible) entre el
   *  restaurante y el destino seleccionado. Misma función que usa el
   *  servidor al guardar, así la tarifa previsualizada es la definitiva. */
  routeDistance: (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ) => {
    const qs = new URLSearchParams({
      flat: String(from.lat),
      flng: String(from.lng),
      tlat: String(to.lat),
      tlng: String(to.lng),
    })
    return request<{ km: number; method: 'road' | 'straight' }>(
      `/api/util/route-distance?${qs.toString()}`,
    )
  },

  stats: () => request<StatsResponse>('/api/stats'),
  restaurants: () =>
    request<{ restaurants: { id: string; name: string; address: string; lat: number; lng: number }[] }>(
      '/api/restaurants',
    ),

  // Push notifications (PWA)
  pushSubscribe: (subscription: PushSubscriptionJSON, role: string, userId: string) =>
    request<{ ok: boolean }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, role, userId }),
    }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: boolean }>('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),


  // Admin (driver-only) restaurant management
  adminListRestaurants: () =>
    request<{ restaurants: AdminRestaurant[] }>('/api/admin/restaurants'),
  adminCreateRestaurant: (data: {
    name: string
    username: string
    password: string
    address: string
    lat: number
    lng: number
    assignedDriverIds?: string[]
  }) =>
    request<{ restaurant: AdminRestaurant }>('/api/admin/restaurants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminResetRestaurantPassword: (id: string, password: string) =>
    request<{ ok: boolean }>(`/api/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reset-password', password }),
    }),
  adminAssignRestaurant: (id: string, assignedDriverIds: string[]) =>
    request<{ restaurant: AdminRestaurant }>(`/api/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'assign', assignedDriverIds }),
    }),
  adminUpdateRestaurantFees: (
    id: string,
    fees: { feeBaseEur: number; feeThresholdKm: number; feePerExtraKmEur: number },
  ) =>
    request<{ restaurant: AdminRestaurant }>(`/api/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update-fees', ...fees }),
    }),
  adminDeleteRestaurant: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/restaurants/${id}`, {
      method: 'DELETE',
    }),

  // Admin (driver-only) driver management
  adminListDrivers: () =>
    request<{ drivers: AdminDriver[] }>('/api/admin/drivers'),
  adminCreateDriver: (data: { username: string; name: string; password: string }) =>
    request<{ driver: AdminDriver }>('/api/admin/drivers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminResetDriverPassword: (id: string, password: string) =>
    request<{ ok: boolean }>(`/api/admin/drivers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reset-password', password }),
    }),
  adminDeleteDriver: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/drivers/${id}`, {
      method: 'DELETE',
    }),

  // Admin platform settings (commission per delivery)
  adminGetSettings: () =>
    request<{ commissionEur: number }>('/api/admin/settings'),
  adminSetCommission: (commissionEur: number) =>
    request<{ commissionEur: number }>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ commissionEur }),
    }),

  // Public contact form (leads)
  submitLead: (data: {
    restaurantName: string
    contactName?: string
    phone: string
    message?: string
    website?: string
  }) =>
    request<{ ok: boolean; lead: Lead }>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Admin (driver-only) lead management
  adminListLeads: () => request<{ leads: Lead[] }>('/api/admin/leads'),
  adminUpdateLead: (id: string, data: { status?: string; notes?: string }) =>
    request<{ lead: Lead }>(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  adminConvertLead: (
    id: string,
    data: {
      name?: string
      username: string
      password: string
      address?: string
      lat: number
      lng: number
      assignedDriverIds?: string[]
    },
  ) =>
    request<{ lead: Lead; restaurant: { id: string; name: string; username: string } }>(
      `/api/admin/leads/${id}/convert`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),

  // Liquidación mensual (admin): totales por local y por repartidor
  adminBilling: (month: string) =>
    request<BillingResponse>(`/api/admin/billing?month=${encodeURIComponent(month)}`),
}
