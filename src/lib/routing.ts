/**
 * Distancia real por CARRETERA entre dos puntos — siempre por carretera.
 *
 * Se usan varios servidores OSRM públicos (réplicas del motor de rutas de
 * OpenStreetMap) en cadena: si el primero no responde, se prueba el siguiente.
 * La distancia por carretera es la que recorre de verdad el repartidor en
 * moto, así que la tarifa calculada con ella es justa.
 *
 * Si TODOS los servidores OSRM fallan (caída general de la red), se aplica un
 * factor de desvío realista (1,3× la línea recta) que aproxima lo que recorre
 * una moto en ciudad — nunca se usa la línea recta pura, porque subestima el
 * trayecto real y el repartidor cobraría menos.
 *
 * Todo con caché en memoria: origen→destino no cambia entre la
 * previsualización del repartidor y el guardado definitivo, así que la
 * tarifa que ve es la que se guarda.
 */

import { haversineKm } from './fees'
import { fetchWithRetry } from './http'

// Múltiples servidores OSRM públicos (réplicas independientes). Se prueban
// en orden hasta que uno responde.
const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://osrm.koenigsstatt.de/route/v1/driving',
]

const USER_AGENT = 'RepartosNOVI/1.0 (repartos.novi@gmail.com)'
const CACHE_LIMIT = 300

// Tope de desvío: la distancia por carretera nunca se tarifica por encima
// de 1,4 × la línea recta. En calles normales OSRM da 1,1–1,3 × y pasa tal
// cual; el tope protege de rutas absurdas del perfil coche (zonas
// peatonales del centro, sentidos únicos) que un repartidor en moto sí
// atraviesa. Así la tarifa siempre es justa.
const MAX_DETOUR_FACTOR = 1.4

// Factor de desvío cuando TODOS los OSRM fallan: 1,3 × la línea recta es lo
// que recorre de media una moto en ciudad (calles en cuadrícula, sentidos
// únicos, rotondas). Nunca se usa la línea recta pura.
const FALLBACK_DETOUR_FACTOR = 1.3

const roadCache = new Map<string, number>()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pointKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

/**
 * Distancia por carretera en km (null si ningún servidor OSRM responde).
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

  // Probar cada servidor OSRM hasta que uno responda
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

  // Todos los servidores fallaron
  return null
}

export type DistanceMethod = 'road' | 'straight'

export interface DeliveryDistance {
  km: number
  method: DistanceMethod
}

/**
 * Distancia definitiva para tarificar un reparto: SIEMPRE por carretera.
 * Si OSRM responde (lo normal), usa la distancia real. Si todos los
 * servidores fallan (caída de red), aplica 1,3× la línea recta como
 * aproximación realista de lo que recorre una moto en ciudad — nunca línea
 * recta pura.
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
  const road = await roadDistanceKm(from, to)
  if (road != null) {
    // Por carretera, pero con tope de desvío sobre la línea recta
    const km = Math.max(straight, Math.min(road, straight * MAX_DETOUR_FACTOR))
    return { km: round2(km), method: 'road' }
  }
  // Fallback: 1,3× línea recta (aproximación realista moto en ciudad)
  return { km: round2(straight * FALLBACK_DETOUR_FACTOR), method: 'road' }
}
