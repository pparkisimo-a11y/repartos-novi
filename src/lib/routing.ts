/**
 * Distancia real por CARRETERA entre dos puntos.
 *
 * Se usa OSRM (router.project-osrm.org, el demo público del motor de rutas
 * de OpenStreetMap): gratis y sin API key. La distancia por carretera es la
 * que recorre de verdad el repartidor, así que la tarifa calculada con ella
 * es más justa que la línea recta (haversine).
 *
 * Fiabilidad: el host de OSRM es dual-stack y en redes con IPv6 roto falla
 * una fracción de las conexiones, así que cada consulta se reintenta. Si a
 * pesar de todo OSRM no responde, un "circuit breaker" desactiva las
 * consultas durante 60 s (la app pasa a línea recta al instante) y la
 * distancia se toma con haversine.
 *
 * Todo con caché en memoria: origen→destino no cambia entre la
 * previsualización del repartidor y el guardado definitivo, así que la
 * tarifa que ve es la que se guarda.
 */

import { haversineKm } from './fees'
import { fetchWithRetry } from './http'

const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving'
const USER_AGENT = 'RepartosNOVI/1.0 (repartos.novi@gmail.com)'
const CACHE_LIMIT = 300

// Tope de desvío: la distancia por carretera nunca se tarifica por encima
// de 1,4 × la línea recta. En calles normales OSRM da 1,1–1,3 × y pasa tal
// cual; el tope protege de rutas absurdas del perfil coche (zonas
// peatonales del centro, sentidos únicos) que un repartidor en moto sí
// atraviesa. Así la tarifa siempre es justa.
const MAX_DETOUR_FACTOR = 1.4

// Circuit breaker: tras 3 fallos seguidos, 60 s sin molestar a OSRM
const BREAKER_TRIP_AFTER = 3
const BREAKER_COOLDOWN_MS = 60_000
let consecutiveFailures = 0
let breakerBlockedUntil = 0

const roadCache = new Map<string, number>()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pointKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

/**
 * Distancia por carretera en km (null si OSRM no responde).
 * Solo se cachean los éxitos: un fallo transitorio no debe dejar
 * "envenenada" la caché para el guardado definitivo.
 */
export async function roadDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  const key = `${pointKey(from)}|${pointKey(to)}`
  const cached = roadCache.get(key)
  if (cached !== undefined) return cached

  // Circuit breaker abierto → línea recta sin esperar
  if (Date.now() < breakerBlockedUntil) return null

  let km: number | null = null
  try {
    const url = `${OSRM_ROUTE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false`
    const res = await fetchWithRetry(
      url,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      },
      { attempts: 4, retryDelayMs: 200 },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string
        routes?: { distance?: number }[]
      }
      const meters = data.routes?.[0]?.distance
      if (Number.isFinite(meters) && meters > 0) km = round2(meters / 1000)
    }
  } catch {
    km = null
  }

  if (roadCache.size >= CACHE_LIMIT) {
    const oldest = roadCache.keys().next().value
    if (oldest !== undefined) roadCache.delete(oldest)
  }

  if (km != null) {
    roadCache.set(key, km)
    consecutiveFailures = 0
  } else {
    consecutiveFailures++
    if (consecutiveFailures >= BREAKER_TRIP_AFTER) {
      breakerBlockedUntil = Date.now() + BREAKER_COOLDOWN_MS
      consecutiveFailures = 0
      console.warn('[OSRM] sin respuesta: se usa línea recta durante 60 s')
    }
  }

  return km
}

export type DistanceMethod = 'road' | 'straight'

export interface DeliveryDistance {
  km: number
  method: DistanceMethod
}

/**
 * Distancia definitiva para tarificar un reparto: por carretera si OSRM
 * responde, y si no, línea recta. Es la ÚNICA función que deben usar tanto
 * la previsualización en vivo como el guardado del pedido, para que la
 * tarifa que ve el repartidor sea exactamente la que queda guardada.
 */
export async function deliveryDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<DeliveryDistance> {
  const straight = round2(haversineKm(from, to))
  const road = await roadDistanceKm(from, to)
  if (road != null) {
    // Por carretera, pero con tope de desvío sobre la línea recta
    const km = Math.max(straight, Math.min(road, straight * MAX_DETOUR_FACTOR))
    return { km: round2(km), method: 'road' }
  }
  return { km: straight, method: 'straight' }
}
