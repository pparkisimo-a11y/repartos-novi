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

import type { AddressSuggestion } from './types'
import { fetchWithRetry } from './http'

export interface GeoPoint {
  lat: number
  lng: number
  /** Dirección normalizada que devuelve Nominatim (display_name). */
  label?: string
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const PHOTON_API = 'https://photon.komoot.io/api/'
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
  opts: {
    countrycodes?: string
    bias?: { lat: number; lng: number }
    limit?: number
    boxDeg?: number
  } = {},
): Promise<GeoPoint[]> {
  const url = new URL(NOMINATIM_SEARCH)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(opts.limit ?? 1))
  url.searchParams.set('q', query)
  if (opts.countrycodes) url.searchParams.set('countrycodes', opts.countrycodes)
  if (opts.bias) {
    const { lat, lng } = opts.bias
    const boxDeg = opts.boxDeg ?? BIAS_BOX_DEG
    const box = `${lng - boxDeg},${lat + boxDeg},${lng + boxDeg},${lat - boxDeg}`
    url.searchParams.set('viewbox', box)
    url.searchParams.set('bounded', '1')
  }
  // Marca para el limitador del autocomplete (política de ~1 req/s)
  lastNominatimAt = Date.now()

  const res = await fetchWithRetry(url, {
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

/* ------------------------------------------------------------------ *
 * AUTOCOMPLETE (estilo Google Maps): sugerencias mientras se escribe.
 *
 * Fuentes (ambas de OpenStreetMap, gratis y sin API key):
 *  - Photon (komoot.io): typeahead rápido para consultas parciales.
 *  - Nominatim: respaldo con caja de búsqueda cerrada (viewbox+bounded),
 *    imprescindible para "calle + número" cuando el portal no está
 *    indexado: devuelve la propia CALLE de la zona en vez de portales
 *    homónimos de otras localidades.
 *
 * Con `bias` (posición del restaurante) la búsqueda se cierra a la zona de
 * reparto (bbox/viewbox duros); solo se abre si dentro no hay nada que
 * encaje con lo tecleado. Los resultados se puntúan contra la consulta
 * (tokens de calle + número de portal) y se ordenan por relevancia y
 * cercanía. Véase «Relevancia de las sugerencias» más abajo.
 * ------------------------------------------------------------------ */

// Caché propia del autocomplete (las consultas parciales cambian rápido,
// así que guardamos solo un número reducido de resultados).
const acCache = new Map<string, AddressSuggestion[]>()
const AC_CACHE_LIMIT = 200
const AC_MIN_QUERY_LEN = 3
const AC_MAX_RESULTS = 6

// Zona de reparto para el autocomplete: cuadro "duro" alrededor del
// restaurante (±0.2° ≈ ±22 km, cubre el área metropolitana). Los resultados
// FUERA de este cuadro solo se buscan si dentro no hay nada decente: evita
// el clásico "Calle Mayor 25" de Galapagar cuando repartimos por Madrid.
const AC_ZONE_BOX_DEG = 0.2

// Nominatim exige como máximo ~1 petición/segundo. El autocomplete es el
// único flujo "ráfaga" (una consulta por tanda de tecleo), así que sus
// llamadas esperan su turno; las de geocodeAddress (puntuales, al confirmar)
// pasan directamente pero también marcan el reloj.
const MIN_NOMINATIM_GAP_MS = 1100
let lastNominatimAt = 0

/** Espera (hasta `maxWaitMs`) el turno para llamar a Nominatim. */
async function takeNominatimSlot(maxWaitMs = 1300): Promise<boolean> {
  const started = Date.now()
  for (;;) {
    const wait = lastNominatimAt + MIN_NOMINATIM_GAP_MS - Date.now()
    if (wait <= 0) {
      lastNominatimAt = Date.now()
      return true
    }
    if (Date.now() - started + wait > maxWaitMs) return false
    await new Promise((r) => setTimeout(r, Math.min(wait, maxWaitMs)))
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    district?: string
    county?: string
    state?: string
    country?: string
  }
}

/** Convierte una feature de Photon en sugerencia de 2 líneas. */
function photonToSuggestion(f: PhotonFeature): AddressSuggestion | null {
  const coords = f.geometry?.coordinates
  if (!coords) return null
  const [lng, lat] = coords
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const p = f.properties ?? {}
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ')
  const city = p.city || p.district || p.county || p.state || ''
  const cityLine = [p.postcode, city].filter(Boolean).join(' ')
  // País solo si no es España (los repartos son locales; evita ruido)
  const country = p.country && !/espa|spain/i.test(p.country) ? `, ${p.country}` : ''

  let main: string
  let secondary: string
  if (p.name && streetLine && p.name !== streetLine) {
    // POI con nombre propio: "Museo del Prado" / "Calle Ruiz de Alarcón 23, 28014 Madrid"
    main = p.name
    secondary = [streetLine, cityLine].filter(Boolean).join(', ') + country
  } else {
    main = streetLine || p.name || cityLine || p.country || 'Sin nombre'
    secondary = cityLine + country
  }

  return {
    lat,
    lng,
    main,
    secondary: secondary.replace(/^,\s*/, ''),
    label: [main, secondary].filter(Boolean).join(', '),
  }
}

async function searchPhoton(
  q: string,
  bias?: { lat: number; lng: number },
  opts: { zoneOnly?: boolean } = {},
): Promise<AddressSuggestion[]> {
  const url = new URL(PHOTON_API)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '10')
  if (bias) {
    url.searchParams.set('lat', String(bias.lat))
    url.searchParams.set('lon', String(bias.lng))
    // bbox = FILTRO duro (minLon,minLat,maxLon,maxLat): a diferencia de
    // lat/lon (que solo sube puntos), excluye resultados de otras localidades.
    if (opts.zoneOnly) {
      const { lat, lng } = bias
      url.searchParams.set(
        'bbox',
        `${lng - AC_ZONE_BOX_DEG},${lat - AC_ZONE_BOX_DEG},${lng + AC_ZONE_BOX_DEG},${lat + AC_ZONE_BOX_DEG}`,
      )
    }
  }
  const res = await fetchWithRetry(
    url,
    {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    },
    { attempts: 2, retryDelayMs: 150 },
  )
  if (!res.ok) return []
  const data = (await res.json()) as { features?: PhotonFeature[] }
  return (data.features || [])
    .map(photonToSuggestion)
    .filter((s): s is AddressSuggestion => s !== null)
}

/** display_name de Nominatim → sugerencia corta y legible.
 *
 * "Calle Mayor, Barrio de la Latina, Palacio, Centro, Madrid, Comunidad de
 * Madrid, 28013, España" → main "Calle Mayor" / secondary "Centro, 28013
 * Madrid". La etiqueta corta es la que queda escrita en el input y guardada
 * en el pedido. */
function nominatimToSuggestion(r: GeoPoint): AddressSuggestion {
  const parts = (r.label || '').split(',').map((s) => s.trim()).filter(Boolean)
  const main = parts[0] || r.label || 'Dirección'
  let secondary = parts.slice(1, 3).join(', ')
  const iPC = parts.findIndex((p) => /^\d{5}$/.test(p))
  if (iPC >= 3) {
    const city = parts[iPC - 2] || ''
    const district = parts[iPC - 3] || ''
    secondary = [district, [parts[iPC], city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ')
  }
  return {
    lat: r.lat,
    lng: r.lng,
    main,
    secondary,
    label: [main, secondary].filter(Boolean).join(', '),
  }
}

/** Respaldo/enriquecimiento con Nominatim (mismo proveedor de datos, otro
 * servicio). Su punto fuerte: si el PORTAL "Calle Mayor 25" no existe en
 * OSM, devuelve la propia CALLE de la zona en vez de portales con el mismo
 * nombre de otras localidades (que es lo que hace Photon). */
async function searchNominatimSuggestions(
  q: string,
  bias?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  const results = await searchNominatim(q, {
    countrycodes: 'es',
    bias,
    limit: 8,
    boxDeg: AC_ZONE_BOX_DEG,
  })
  return results.map(nominatimToSuggestion)
}

function dedupeSuggestions(list: AddressSuggestion[]): AddressSuggestion[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    const key = s.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ------------------- Relevancia de las sugerencias ------------------- *
 *
 * Problema real: al teclear "calle mayor, 25", Photon prioriza el match
 * exacto de portal — y como el 25 de la Calle Mayor de Madrid no está
 * indexado en OSM, gana el "Calle Mayor 25" de Galapagar/Villaviciosa…
 * aunque el reparto sea urbano. La solución combina 4 cosas:
 *
 *  1. bbox de Photon = filtro DURO a la zona de reparto (no solo sesgo).
 *  2. Nominatim acotado como 2ª fuente SIEMPRE que la consulta trae
 *     número de portal (Photon es débil ahí) y también cuando no encuentra
 *     nada decente: devuelve la propia CALLE aunque el portal no exista.
 *  3. Puntuar cada sugerencia contra lo tecleado: los tokens de calle deben
 *    encajar por palabra completa ("mayor" ≠ "mayorazgo"), el número de
 *    portal suma, y la coincidencia por prefijo ("Gran Vía 1" empieza por
 *    "gran vía") manda sobre la dispersa ("…de la Gran Vía del Este").
 *  4. Ordenar: mejor puntuación, luego más cercano al restaurante; el
 *     ruido que no encaja se descarta si hay algo bueno.
 * ------------------------------------------------------------------- */

function deaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Palabras significativas de la consulta: sin números de portal ni
 *  artículos/preposiciones cortos ("de", "la", "del", "el", "25"…). */
function queryTokens(q: string): string[] {
  return deaccent(q)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t))
}

/** Número de portal tecleado ("calle mayor, 25" → "25"), si lo hay. */
function portalNumberOf(q: string): string | null {
  const m = deaccent(q).match(/\b(\d{1,4}\s*[a-z]?)\b/)
  return m ? m[1].replace(/\s+/g, '') : null
}

/** Frase de calle SIN el número, con sus artículos ("calle de la paloma
 *  25" → "calle de la paloma"): para el bonus de coincidencia inicial. */
function streetPhraseOf(q: string): string {
  return deaccent(q)
    .replace(/\b\d{1,4}\s*[a-z]?\b/g, ' ')
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 2)
    .join(' ')
}

interface QueryMatch {
  tokens: string[]
  portal: string | null
  phrase: string
}

function matchOf(q: string): QueryMatch {
  return { tokens: queryTokens(q), portal: portalNumberOf(q), phrase: streetPhraseOf(q) }
}

/** El token aparece como palabra completa ("mayor" NO encaja en
 *  "mayorazgo"), evitando falsos positivos de substring. */
function hasWord(token: string, haystack: string): boolean {
  return new RegExp(`(^|[^a-z0-9ñ])${token}([^a-z0-9ñ]|$)`).test(haystack)
}

/** 4 = prefijo de calle + portal · 3 = palabras + portal, o prefijo solo ·
 *  2 = palabras de calle · 1 = solo portal/sin calle · 0 = ruido. */
function scoreSuggestion(s: AddressSuggestion, m: QueryMatch): number {
  const main = deaccent(s.main)
  const all = deaccent(`${s.main} ${s.secondary}`)
  const portalOk =
    !m.portal || new RegExp(`(^|[^0-9])${m.portal}([^0-9]|$)`).test(all)

  if (m.tokens.length === 0) return portalOk ? 1 : 0
  const wordsInMain = m.tokens.every((t) => hasWord(t, main))
  if (!wordsInMain && !m.tokens.every((t) => hasWord(t, all))) return 0

  const prefix = m.phrase.length >= 3 && main.startsWith(m.phrase)
  if (prefix) return portalOk ? 4 : 3
  return portalOk ? 3 : 2
}

function rankSuggestions(
  list: AddressSuggestion[],
  m: QueryMatch,
  bias?: { lat: number; lng: number },
): AddressSuggestion[] {
  const ranked = list
    .map((s, i) => {
      const raw = scoreSuggestion(s, m)
      const dist = bias ? distanceKm(bias, s) : 0
      // Bonus de cercanía: un match real a <2 km del restaurante (donde
      // cae la gran mayoría de repartos) gana empates contra matches
      // exactos pero lejanos ("Plaza del Sol" de Alcorcón vs la Puerta
      // del Sol de Madrid al teclear "plaza del sol 3").
      const nearBonus = raw >= 2 && bias && dist < 2 ? 1 : 0
      return { s, i, score: raw + nearBonus, dist }
    })
    .sort((a, b) => b.score - a.score || a.dist - b.dist || a.i - b.i)
  // Si hay algo que encaja de verdad con lo tecleado, el ruido sobra.
  if (ranked.some((r) => r.score >= 2)) {
    return ranked
      .filter((r) => r.score >= 1)
      .slice(0, AC_MAX_RESULTS)
      .map((r) => r.s)
  }
  return ranked.slice(0, AC_MAX_RESULTS).map((r) => r.s)
}

/**
 * Sugerencias de dirección para el desplegable del repartidor.
 * Devuelve como máximo 6 resultados relevantes para lo tecleado y
 * cercanos al restaurante, en tres tandas (solo se amplía si hace falta):
 *
 *  1. Photon acotado a la zona de reparto (filtro duro por bbox + sesgo).
 *  2. Nominatim acotado: siempre que la consulta traiga número de portal
 *     (Photon es flojo ahí) o si nada de Photon encaja; devuelve la propia
 *     calle de la zona aunque el portal no esté en OSM.
 *  3. Si sigue sin haber nada decente: Photon sin bbox (entregas lejanas
 *     legítimas, p. ej. "calle mayor 2, alcalá de henares").
 */
export async function autocompleteAddresses(
  query: string,
  bias?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  const q = normalizeQuery(query)
  if (q.length < AC_MIN_QUERY_LEN) return []

  const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : 'none'
  const cacheKey = `${q}|${biasKey}`
  if (acCache.has(cacheKey)) return acCache.get(cacheKey) ?? []

  const match = matchOf(q)
  const hasGood = (list: AddressSuggestion[]) =>
    list.some((s) => scoreSuggestion(s, match) >= 2)

  const collected: AddressSuggestion[] = []

  // 1. Photon dentro de la zona de reparto
  try {
    collected.push(...(await searchPhoton(q, bias, { zoneOnly: true })))
  } catch {
    /* se intenta con las siguientes fuentes */
  }

  // 2. Nominatim acotado. SIEMPRE que la consulta traiga número de portal
  //    (Photon es flojo con "calle + número": portales sin indexar) y
  //    también si Photon no encontró nada que encaje.
  if (match.portal || !hasGood(collected)) {
    try {
      if (await takeNominatimSlot()) {
        collected.push(...(await searchNominatimSuggestions(q, bias)))
      }
    } catch {
      /* sin respaldo: seguimos con lo que haya */
    }
  }

  // 3. Abrir la búsqueda (solo si con bias había zona cerrada)
  if (!hasGood(collected) && bias) {
    try {
      collected.push(...(await searchPhoton(q, bias)))
    } catch {
      /* sin más opciones */
    }
  }

  const final = rankSuggestions(dedupeSuggestions(collected), match, bias)

  if (acCache.size >= AC_CACHE_LIMIT) {
    const oldest = acCache.keys().next().value
    if (oldest !== undefined) acCache.delete(oldest)
  }
  acCache.set(cacheKey, final)

  return final
}
