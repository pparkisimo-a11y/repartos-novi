/**
 * Geocodificación de direcciones (dirección → coordenadas).
 *
 * Usa el servicio público Nominatim de OpenStreetMap. Solo se llama desde el
 * servidor (API routes) con un User-Agent identificado, como exige su política
 * de uso, y con caché en memoria para no repetir consultas (y respetar su
 * límite de ~1 petición/segundo). Volumen esperado: decenas de repartos por
 * noche — de sobra dentro del uso justo.
 *
 * Sesgo geográfico: al geocodificar la dirección de entrega de un reparto se
 * pasa la posición del RESTAURANTE como referencia. La búsqueda se acota a un
 * cuadro de ~±17 km a su alrededor (viewbox + bounded de Nominatim) y de los
 * resultados se elige el MÁS CERCANO al restaurante. Esto evita matches
 * absurdos como una "Calle Mayor" de otra localidad cuando el reparto es
 * urbano. Si no hay resultado en el cuadro, se abre la búsqueda.
 */

export interface GeoPoint {
  lat: number
  lng: number
  /** Dirección normalizada que devuelve Nominatim (display_name). */
  label?: string
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'RepartosNOVI/1.0 (repartos.novi@gmail.com)'
const CACHE_LIMIT = 500
const MIN_QUERY_LEN = 4
// Cuadro de búsqueda alrededor del restaurante (grados): ±0.15° ≈ ±17 km
const BIAS_BOX_DEG = 0.15

// Caché en memoria: clave → resultado (null = no encontrada, también se cachea
// para no repetir búsquedas fallidas).
const cache = new Map<string, GeoPoint | null>()

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Distancia haversine en km (para elegir el candidato más cercano). */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function searchNominatim(
  query: string,
  opts: { countrycodes?: string; bias?: { lat: number; lng: number }; limit?: number } = {},
): Promise<GeoPoint[]> {
  const url = new URL(NOMINATIM_SEARCH)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(opts.limit ?? 1))
  url.searchParams.set('q', query)
  if (opts.countrycodes) url.searchParams.set('countrycodes', opts.countrycodes)
  if (opts.bias) {
    const { lat, lng } = opts.bias
    const box = `${lng - BIAS_BOX_DEG},${lat + BIAS_BOX_DEG},${lng + BIAS_BOX_DEG},${lat - BIAS_BOX_DEG}`
    url.searchParams.set('viewbox', box)
    url.searchParams.set('bounded', '1')
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return []
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>
  return (data || [])
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

/**
 * Convierte una dirección en coordenadas. Si se pasa `bias` (la posición del
 * restaurante), primero busca SOLO en un cuadro de ~17 km a su alrededor y
 * elige el candidato más cercano — los repartos son cortos y esto evita
 * matches de otras localidades. Si no hay resultado, abre la búsqueda a
 * España y luego a todo el mundo.
 * Devuelve null si no se encuentra o si falla la red.
 */
export async function geocodeAddress(
  address: string,
  bias?: { lat: number; lng: number },
): Promise<GeoPoint | null> {
  const q = normalizeQuery(address)
  if (q.length < MIN_QUERY_LEN) return null

  const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : 'none'
  const cacheKey = `${q}|${biasKey}`
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null

  let result: GeoPoint | null = null
  try {
    if (bias) {
      // 1. Acotado al entorno del restaurante: el más cercano de los candidatos
      const candidates = await searchNominatim(q, { countrycodes: 'es', bias, limit: 5 })
      if (candidates.length > 0) {
        result = candidates.reduce((best, c) =>
          distanceKm(bias, c) < distanceKm(bias, best) ? c : best,
        )
      }
    }
    // 2. Abierta a España
    if (!result) {
      const es = await searchNominatim(q, { countrycodes: 'es' })
      result = es[0] ?? null
    }
    // 3. Abierta a todo el mundo
    if (!result) {
      const global = await searchNominatim(q)
      result = global[0] ?? null
    }
  } catch {
    result = null // red caída / timeout → el repartidor puede meter los km a mano
  }

  // Cachear (con límite de tamaño, FIFO)
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(cacheKey, result)

  return result
}
