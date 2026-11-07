/**
 * Distancia real por CARRETERA entre dos puntos — igual que Google Maps.
 *
 * MOTOR PRINCIPAL: Mapbox Directions API. Usa el motor de rutas de Mapbox
 * (mismo tipo de datos que Google Maps) con el perfil "driving" (coche). La
 * distancia es muy precisa y coincide con la que muestra Google Maps.
 * Requiere una API key (MAPBOX_ACCESS_TOKEN en .env). Plan gratuito:
 * 100.000 consultas/mes — de sobra para el volumen de repartos.
 *
 * RESPALDO: si no hay token de Mapbox o Mapbox no responde, se usan varios
 * servidores OSRM (réplicas de OpenStreetMap). La distancia de OSRM puede
 * diferir ligeramente (~2-3%), pero es la mejor alternativa gratuita.
 *
 * Si TODOS los servicios fallan, se aplica 1,3× la línea recta como
 * aproximación realista de moto en ciudad — nunca línea recta pura.
 *
 * Caché en memoria: origen→destino no cambia entre la previsualización del
 * repartidor y el guardado, así que la tarifa que ve es la que se guarda.
 */

import { haversineKm } from './fees'
import { fetchWithRetry } from './http'

// Mapbox Directions API (requiere token en .env)
const MAPBOX_DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving'
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || ''

// Múltiples servidores OSRM públicos como respaldo.
const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
]

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
 * Distancia por Mapbox Directions API. Devuelve km o null si no hay token o
 * Mapbox no responde. Solo se cachean los éxitos.
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
    // Mapbox usa formato lng,lat (longitud primero)
    const url = `${MAPBOX_DIRECTIONS}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false&annotations=distance&access_token=${MAPBOX_TOKEN}`
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
 * Distancia por carretera con OSRM (respaldo si no hay Mapbox). Devuelve km
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
 * 1. Mapbox Directions API (motor principal, muy preciso)
 * 2. OSRM (respaldo gratuito)
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

  // 1. Mapbox (motor principal)
  const mapbox = await mapboxDistanceKm(from, to)
  if (mapbox != null) return { km: mapbox, method: 'road' }

  // 2. OSRM (respaldo)
  const road = await osrmDistanceKm(from, to)
  if (road != null) return { km: road, method: 'road' }

  // 3. Fallback: 1,3× línea recta (moto en ciudad)
  return { km: round2(straight * FALLBACK_DETOUR_FACTOR), method: 'road' }
}
