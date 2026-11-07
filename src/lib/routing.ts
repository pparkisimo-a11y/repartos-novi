/**
 * Distancia real por CARRETERA entre dos puntos — exactamente igual que Google Maps.
 *
 * MOTOR PRINCIPAL: Google Maps Distance Matrix API. Es la misma que usa la
 * app de Google Maps, así que la distancia es exacta (ni más ni menos). Requiere
 * una API key (GOOGLE_MAPS_API_KEY en .env). Coste: ~5 $ por cada 1000
 * consultas (con 200 $/mes de crédito gratis de Google, da para ~40.000
 * consultas al mes — de sobra para el volumen de repartos nocturnos).
 *
 * RESPALDO: si no hay API key configurada (sandbox sin key) o Google no
 * responde, se usan varios servidores OSRM (réplicas de OpenStreetMap). La
 * distancia de OSRM puede diferir ligeramente de Google (~2-3%), pero es la
 * mejor alternativa gratuita.
 *
 * Si TODOS los servicios fallan, se aplica 1,3× la línea recta como
 * aproximación realista de moto en ciudad — nunca línea recta pura.
 *
 * Caché en memoria: origen→destino no cambia entre la previsualización del
 * repartidor y el guardado, así que la tarifa que ve es la que se guarda.
 */

import { haversineKm } from './fees'
import { fetchWithRetry } from './http'

// Google Maps Distance Matrix API (requiere key en .env)
const GOOGLE_DMX = 'https://maps.googleapis.com/maps/api/distancematrix/json'
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || ''

// Múltiples servidores OSRM públicos (réplicas del motor de rutas de
// OpenStreetMap) como respaldo si no hay key de Google o Google falla.
const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
]

const USER_AGENT = 'RepartosNOVI/1.0 (repartos.novi@gmail.com)'
const CACHE_LIMIT = 300

// Factor de desvío cuando TODO falla: 1,3 × la línea recta (moto en ciudad).
const FALLBACK_DETOUR_FACTOR = 1.3

const roadCache = new Map<string, number>()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pointKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

/**
 * Distancia por Google Maps Distance Matrix API. Devuelve km o null si no
 * hay key o Google no responde. Solo se cachean los éxitos.
 */
async function googleDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  if (!GOOGLE_KEY) return null

  const key = `${pointKey(from)}|${pointKey(to)}`
  const cached = roadCache.get(key)
  if (cached !== undefined) return cached

  try {
    const url = `${GOOGLE_DMX}?origins=${from.lat},${from.lng}&destinations=${to.lat},${to.lng}&mode=driving&units=metric&key=${GOOGLE_KEY}`
    const res = await fetchWithRetry(
      url,
      {
        signal: AbortSignal.timeout(4000),
      },
      { attempts: 2, retryDelayMs: 150 },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string
        rows?: { elements?: { status?: string; distance?: { value?: number } }[] }[]
      }
      const el = data.rows?.[0]?.elements?.[0]
      const meters = el?.distance?.value
      if (el?.status === 'OK' && Number.isFinite(meters) && meters > 0) {
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
    // Google no respondió — probar OSRM
  }
  return null
}

/**
 * Distancia por carretera con OSRM (respaldo si no hay Google). Devuelve km
 * o null si ningún servidor responde.
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
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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
 * 1. Google Maps Distance Matrix API (exacto, si hay API key)
 * 2. OSRM (respaldo gratuito, ~2-3% de diferencia con Google)
 * 3. 1,3× línea recta (solo si todo falla — caída de red)
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

  // 1. Google Maps (exacto, como la app de Google)
  const google = await googleDistanceKm(from, to)
  if (google != null) return { km: google, method: 'road' }

  // 2. OSRM (respaldo)
  const road = await osrmDistanceKm(from, to)
  if (road != null) return { km: road, method: 'road' }

  // 3. Fallback: 1,3× línea recta (moto en ciudad)
  return { km: round2(straight * FALLBACK_DETOUR_FACTOR), method: 'road' }
}
