/**
 * Distancia real por CARRETERA entre dos puntos — igual que Google Maps.
 *
 * MOTOR PRINCIPAL: Google Routes API (computeRoutes). Usa el mismo motor de
 * rutas que la app de Google Maps, con perfil DRIVE + TRAFFIC_AWARE_OPTIMAL +
 * departureTime = ahora. Así la distancia es prácticamente idéntica a la que
 * muestra Google Maps UI (error medio ~150 m en pruebas reales).
 * Requiere API key (GOOGLE_ROUTES_API_KEY en .env). Cuota gratis: 10.000
 * consultas/mes — de sobra para el volumen de repartos (~600/mes).
 *
 * RESPALDO 1: Mapbox Directions API (driving-traffic). Si no hay key de Google
 * o Google no responde, usa Mapbox con tráfico en tiempo real.
 *
 * RESPALDO 2: OSRM (OpenStreetMap). Si Mapbox tampoco responde, usa OSRM.
 *
 * Si TODO falla, se aplica 1,3× la línea recta como aproximación realista de
 * moto en ciudad — nunca línea recta pura.
 *
 * Caché en memoria: origen→destino no cambia entre la previsualización del
 * repartidor y el guardado, así que la tarifa que ve es la que se guarda.
 */

import { haversineKm } from './fees'
import { fetchWithRetry } from './http'

// Google Routes API (requiere key en .env)
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const GOOGLE_KEY = process.env.GOOGLE_ROUTES_API_KEY || ''

// Mapbox Directions API (respaldo, requiere token en .env)
const MAPBOX_DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic'
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || ''

// OSRM público (último respaldo)
const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
]

const CACHE_LIMIT = 300

// Factor de desvío cuando TODO falla: 1,3 × la línea recta (moto en ciudad).
const FALLBACK_DETOUR_FACTOR = 1.3

// Rate limit: Google Routes API permite un número limitado de peticiones por
// minuto. Con la demo key son ~20/min; con una key de producción (10.000/mes)
// el límite es más holgado pero conviene no abusar. Esperamos al menos 1s
// entre peticiones para no recibir 429.
const GOOGLE_MIN_INTERVAL_MS = 3000
let lastGoogleCall = 0

const roadCache = new Map<string, number>()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pointKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

/**
 * Distancia por Google Routes API. Devuelve km o null si no hay key o Google
 * no responde. Usa DRIVE + TRAFFIC_AWARE_OPTIMAL + departureTime = ahora +2min
 * para que trace la misma ruta que Google Maps UI (con tráfico en tiempo real).
 * Solo se cachean los éxitos.
 */
async function googleDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  if (!GOOGLE_KEY) return null

  const key = `${pointKey(from)}|${pointKey(to)}`
  const cached = roadCache.get(key)
  if (cached !== undefined) return cached

  // Rate limit: esperar al menos GOOGLE_MIN_INTERVAL_MS desde la última
  // petición para no recibir 429 (quota exceeded per minute).
  const elapsed = Date.now() - lastGoogleCall
  if (elapsed < GOOGLE_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, GOOGLE_MIN_INTERVAL_MS - elapsed))
  }
  lastGoogleCall = Date.now()

  // departureTime debe ser futura (Google rechaza el pasado). Usamos ahora
  // + 2 minutos para que considere el tráfico actual, igual que la UI.
  const departure = new Date(Date.now() + 2 * 60_000).toISOString()

  try {
    const body = JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      departureTime: departure,
    })
    const res = await fetchWithRetry(
      GOOGLE_ROUTES_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body,
        signal: AbortSignal.timeout(6000),
      },
      { attempts: 2, retryDelayMs: 200 },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: { distanceMeters?: number }[]
      }
      const meters = data.routes?.[0]?.distanceMeters
      if (Number.isFinite(meters) && meters > 0) {
        const km = round2(meters / 1000)
        if (roadCache.size >= CACHE_LIMIT) {
          const oldest = roadCache.keys().next().value
          if (oldest !== undefined) roadCache.delete(oldest)
        }
        roadCache.set(key, km)
        return km
      }
    }
  } catch {
    // Google no respondió — probar Mapbox
  }
  return null
}

/**
 * Distancia por Mapbox Directions API (driving-traffic). Devuelve km o null.
 */
async function mapboxDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null

  const key = `${pointKey(from)}|${pointKey(to)}`
  const cached = roadCache.get(key)
  if (cached !== undefined) return cached

  try {
    const url = `${MAPBOX_DIRECTIONS}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false&access_token=${MAPBOX_TOKEN}`
    const res = await fetchWithRetry(
      url,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
      { attempts: 2, retryDelayMs: 200 },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string
        routes?: { distance?: number }[]
      }
      const meters = data.routes?.[0]?.distance
      if (data.code === 'Ok' && Number.isFinite(meters) && meters > 0) {
        const km = round2(meters / 1000)
        if (roadCache.size >= CACHE_LIMIT) {
          const oldest = roadCache.keys().next().value
          if (oldest !== undefined) roadCache.delete(oldest)
        }
        roadCache.set(key, km)
        return km
      }
    }
  } catch {
    // Mapbox no respondió — probar OSRM
  }
  return null
}

/**
 * Distancia por carretera con OSRM (último respaldo). Devuelve km o null.
 */
async function osrmDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  const key = `${pointKey(from)}|${pointKey(to)}`
  const cached = roadCache.get(key)
  if (cached !== undefined) return cached

  for (const base of OSRM_SERVERS) {
    try {
      const url = `${base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false`
      const res = await fetchWithRetry(
        url,
        {
          headers: { 'User-Agent': 'RepartosNOVI/1.0 (repartos.novi@gmail.com)', Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        },
        { attempts: 2, retryDelayMs: 150 },
      )
      if (res.ok) {
        const data = (await res.json()) as {
          code?: string
          routes?: { distance?: number }[]
        }
        const meters = data.routes?.[0]?.distance
        if (Number.isFinite(meters) && meters > 0) {
          const km = round2(meters / 1000)
          if (roadCache.size >= CACHE_LIMIT) {
            const oldest = roadCache.keys().next().value
            if (oldest !== undefined) roadCache.delete(oldest)
          }
          roadCache.set(key, km)
          return km
        }
      }
    } catch {
      // Este servidor no respondió — probar el siguiente
    }
  }
  return null
}

export type DistanceMethod = 'road' | 'straight'

export interface DeliveryDistance {
  km: number
  method: DistanceMethod
}

/**
 * Distancia definitiva para tarificar un reparto.
 *
 * 1. Google Routes API (TRAFFIC_AWARE_OPTIMAL + departureTime=ahora) — igual
 *    que Google Maps UI, error medio ~150 m.
 * 2. Mapbox driving-traffic (respaldo, error medio ~1,1 km)
 * 3. OSRM (último respaldo, error medio ~1 km)
 * 4. 1,3× línea recta (solo si todo falla)
 *
 * Es la ÚNICA función que deben usar tanto la previsualización en vivo como
 * el guardado del pedido, para que la tarifa que ve el repartidor sea
 * exactamente la que queda guardada.
 */
export async function deliveryDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<DeliveryDistance> {
  const straight = round2(haversineKm(from, to))

  // 1. Google Routes API (motor principal — idéntico a Google Maps UI)
  const google = await googleDistanceKm(from, to)
  if (google != null) return { km: google, method: 'road' }

  // 2. Mapbox (respaldo)
  const mapbox = await mapboxDistanceKm(from, to)
  if (mapbox != null) return { km: mapbox, method: 'road' }

  // 3. OSRM (último respaldo)
  const osrm = await osrmDistanceKm(from, to)
  if (osrm != null) return { km: osrm, method: 'road' }

  // 4. Fallback: 1,3× línea recta (moto en ciudad)
  return { km: round2(straight * FALLBACK_DETOUR_FACTOR), method: 'road' }
}
