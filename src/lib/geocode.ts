/**
 * Geocodificación y autocompletado de direcciones (dirección → coordenadas).
 *
 * MOTOR PRINCIPAL: ArcGIS World Geocoder de Esri — servicio público sin API
 * key dentro de un uso justo. Es un geocoder comercial (el mismo tipo de
 * datos que usa Google Maps) y, a diferencia de OpenStreetMap, resuelve el
 * PORTAL exacto: "Calle Trevenque 17, 18320 Santa Fe, Granada" devuelve las
 * coordenadas del edificio, no el centroide de una calle de 1 km. Cubre
 * toda España y entiende la localidad escrita en la propia consulta
 * ("calle trevenque 17 santa fe" → Santa Fe, aunque el restaurante esté en
 * Madrid).
 *
 * COMPLEMENTO Y RESPALDO (OpenStreetMap, gratis y sin key):
 *  - Photon (komoot.io): consultas parciales mientras se teclea ("calle
 *    trev" — ArcGIS no sugiere con prefijos incompletos), POIs con nombre
 *    propio y respaldo inmediato si ArcGIS no responde.
 *  - Nominatim + interpolación de portales: segunda línea de respaldo si
 *    ArcGIS está caído (con caja de búsqueda cerrada a la zona de reparto).
 *
 * Sesgo geográfico: al buscar se pasa la posición del RESTAURANTE como
 * referencia. ArcGIS la recibe como `location` + `distance` (prioriza la
 * zona SIN excluir el resto de España); Photon/Nominatim usan bbox/viewbox
 * duros porque su ranking a pelo devuelve homónimos de otras provincias.
 *
 * Volumen esperado: decenas de repartos por noche más el tecleo del
 * autocomplete (con debounce en el cliente y caché aquí) — de sobra dentro
 * del uso justo de estos servicios.
 */

import type { AddressSuggestion } from './types'
import { fetchWithRetry } from './http'

export interface GeoPoint {
  lat: number
  lng: number
  /** Dirección normalizada que devuelve el geocoder. */
  label?: string
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const PHOTON_API = 'https://photon.komoot.io/api/'
const ARCGIS_FIND =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
const ARCGIS_SUGGEST =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest'
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

/* ------------------------------------------------------------------ *
 * ARCGIS WORLD GEOCODER (Esri) — motor principal.
 *
 * `findAddressCandidates` con `singleLine` acepta la dirección tal cual la
 * escribe la gente ("calle trevenque 17 santa fe") y devuelve candidatos
 * con coordenadas de PORTAL (Addr_type PointAddress/StreetAddress), calle
 * (StreetName), POI o localidad (Locality). El ranking interno ya prioriza
 * la zona del `location` y respeta localidades explícitas de la consulta.
 * ------------------------------------------------------------------ */

// Radio de priorización alrededor del restaurante (metros). NO es un filtro
// duro: si lo tecleado solo existe lejos, ArcGIS lo devuelve igual.
const ARCGIS_BIAS_RADIUS_M = 80000
const ARCGIS_TIMEOUT_MS = 3500

interface ArcCandidate {
  address?: string
  location?: { x?: number; y?: number }
  score?: number
  attributes?: {
    Addr_type?: string
    City?: string
    Postal?: string
    Subregion?: string
    Region?: string
  }
}

// Tipos de resultado útiles para un reparto: portal (PointAddress /
// StreetAddress), calle (StreetName), POI y localidad. Se descarta el ruido
// administrativo puro (Comunidad autónoma, provincia, país, CP suelto…).
const ARCGIS_KEEP_TYPES = new Set([
  'PointAddress',
  'StreetAddress',
  'StreetAddressExt',
  'StreetName',
  'POI',
  'Locality',
])

/** Candidato de ArcGIS → sugerencia de 2 líneas estilo Google Maps:
 *  main "Calle Trevenque 17" · secondary "18320 Santa Fe, Granada". */
function arcgisToSuggestion(c: ArcCandidate): RichSuggestion | null {
  const { x, y } = c.location ?? {}
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  const a = c.attributes ?? {}
  const parts = (c.address || '').split(',').map((s) => s.trim()).filter(Boolean)
  const main = parts[0] || 'Dirección'
  const city = a.City || ''
  const postal = /^\d{5}$/.test(a.Postal || '') ? a.Postal! : ''
  const cityLine = [postal, city].filter(Boolean).join(' ')
  const sub = a.Subregion || ''
  const region = a.Region || ''
  const type = a.Addr_type || ''
  const kind: RichSuggestion['kind'] =
    type === 'POI' ? 'poi' : type === 'Locality' ? 'place' : 'street'

  let secondary: string
  if (city && deaccent(main) === deaccent(city)) {
    // Localidad: main ES la ciudad → "Santa Fe | Granada"
    secondary = sub && deaccent(sub) !== deaccent(city) ? sub : region
  } else {
    const prov = sub && deaccent(sub) !== deaccent(city) ? sub : ''
    secondary = [cityLine, prov].filter(Boolean).join(', ')
  }
  if (!secondary && parts.length > 1) secondary = parts.slice(1).join(', ')

  // "Calle Trevenque 17" → streetText "Calle Trevenque" + portal 17
  const pm = main.match(/^(.+?)\s+(\d{1,4}\s?[a-z]?)$/i)
  const streetText = kind === 'street' ? (pm ? pm[1] : main) : undefined
  const portalNum = pm ? Number.parseInt(pm[2].replace(/\s+/g, ''), 10) : NaN

  return {
    lat: y,
    lng: x,
    main,
    secondary: secondary.replace(/^,\s*/, ''),
    label: [main, secondary].filter(Boolean).join(', '),
    portal: Number.isFinite(portalNum) ? portalNum : undefined,
    streetText,
    cityLine: cityLine || undefined,
    kind,
  }
}

/** Sugerencia del endpoint `suggest` de ArcGIS (solo texto + magicKey:
 *  las coordenadas se resuelven aparte con `resolveArcGISMagic`). */
interface ArcSuggestItem {
  text: string
  magicKey: string
}

/** `suggest` está diseñado para AUTOCOMPLETAR con prefijos incompletos
 *  ("calle trev" → Treviso, Trevenque, Trevélez…), justo lo que
 *  `findAddressCandidates` no cubre. Devuelve etiquetas con magicKey. */
async function searchArcGISSuggest(
  q: string,
  bias?: { lat: number; lng: number },
): Promise<ArcSuggestItem[]> {
  const url = new URL(ARCGIS_SUGGEST)
  url.searchParams.set('text', q)
  url.searchParams.set('f', 'json')
  url.searchParams.set('maxSuggestions', '6')
  url.searchParams.set('sourceCountry', 'ESP')
  if (bias) {
    url.searchParams.set('location', `${bias.lng},${bias.lat}`)
    url.searchParams.set('distance', String(ARCGIS_BIAS_RADIUS_M))
  }
  const res = await fetchWithRetry(
    url,
    {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(ARCGIS_TIMEOUT_MS),
    },
    { attempts: 1 },
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    suggestions?: Array<{ text?: string; magicKey?: string; isCollection?: boolean }>
  }
  return (data.suggestions ?? [])
    .filter((s) => s.text && s.magicKey && !s.isCollection)
    .map((s) => ({ text: s.text!, magicKey: s.magicKey! }))
}

/** Resuelve el magicKey de una sugerencia a un candidato con coordenadas
 *  exactas (1 petición por sugerencia, se hacen en paralelo). */
async function resolveArcGISMagic(
  text: string,
  magicKey: string,
): Promise<RichSuggestion | null> {
  const url = new URL(ARCGIS_FIND)
  url.searchParams.set('singleLine', text)
  url.searchParams.set('magicKey', magicKey)
  url.searchParams.set('f', 'json')
  url.searchParams.set('maxLocations', '1')
  url.searchParams.set('sourceCountry', 'ESP')
  url.searchParams.set('outFields', 'Addr_type,City,Postal,Subregion,Region')
  const res = await fetchWithRetry(
    url,
    {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    },
    { attempts: 1 },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { candidates?: ArcCandidate[] }
  const c = data.candidates?.[0]
  return c ? arcgisToSuggestion(c) : null
}

/** Búsqueda en ArcGIS (solo España) con sesgo hacia la zona del reparto.
 *  Devuelve sugerencias ricas en el orden de relevancia del motor. */
async function searchArcGIS(
  q: string,
  bias?: { lat: number; lng: number },
): Promise<RichSuggestion[]> {
  const url = new URL(ARCGIS_FIND)
  url.searchParams.set('singleLine', q)
  url.searchParams.set('f', 'json')
  url.searchParams.set('maxLocations', '8')
  url.searchParams.set('sourceCountry', 'ESP')
  url.searchParams.set('outFields', 'Addr_type,City,Postal,Subregion,Region')
  if (bias) {
    // location=lng,lat · distance en metros (prioriza la zona, no filtra)
    url.searchParams.set('location', `${bias.lng},${bias.lat}`)
    url.searchParams.set('distance', String(ARCGIS_BIAS_RADIUS_M))
  }
  const res = await fetchWithRetry(
    url,
    {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(ARCGIS_TIMEOUT_MS),
    },
    { attempts: 1 },
  )
  if (!res.ok) return []
  const data = (await res.json()) as { candidates?: ArcCandidate[] }
  return (data.candidates ?? [])
    .filter(
      (c) => !c.attributes?.Addr_type || ARCGIS_KEEP_TYPES.has(c.attributes.Addr_type),
    )
    .map(arcgisToSuggestion)
    .filter((s): s is RichSuggestion => s !== null)
}

/**
 * Convierte una dirección en coordenadas.
 *
 * 1. ArcGIS: si la dirección trae número, resuelve el EDIFICIO concreto
 *    (mismo motor que el autocomplete, así el km/tarifa no baila entre la
 *    sugerencia seleccionada y la confirmación del reparto).
 * 2. Respaldo Nominatim: primero acotado a la zona del restaurante (elige
 *    el candidato más cercano), luego España, luego todo el mundo.
 *
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

  // 1. ArcGIS (portal a nivel de edificio)
  try {
    const arc = await searchArcGIS(q, bias)
    const hit =
      arc.find((s) => s.kind === 'street' && s.portal !== undefined) ??
      arc.find((s) => s.kind === 'street') ??
      arc[0]
    if (hit) result = { lat: hit.lat, lng: hit.lng, label: hit.label }
  } catch {
    /* a la cadena Nominatim */
  }

  // 2. Respaldo Nominatim
  if (!result) {
    try {
      if (bias) {
        // Acotado al entorno del restaurante: el más cercano de los candidatos
        const candidates = await searchNominatim(q, { countrycodes: 'es', bias, limit: 5 })
        if (candidates.length > 0) {
          result = candidates.reduce((best, c) =>
            distanceKm(bias, c) < distanceKm(bias, best) ? c : best,
          )
        }
      }
      if (!result) {
        const es = await searchNominatim(q, { countrycodes: 'es' })
        result = es[0] ?? null
      }
      if (!result) {
        const global = await searchNominatim(q)
        result = global[0] ?? null
      }
    } catch {
      result = null // red caída / timeout → el repartidor puede meter los km a mano
    }
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
 * Flujo por cada tanda de tecleo (con debounce en el cliente):
 *
 *  1. EN PARALELO:
 *     - ArcGIS (España, sesgo del restaurante): portales exactos, calles,
 *       POIs y localidades. Es la fuente que manda cuando devuelve algo.
 *     - Photon acotado a la zona (bbox duro): cubre prefijos parciales
 *       ("calle trev", que ArcGIS no sugiere) y POIs locales.
 *  2. Si ArcGIS devuelve resultados: se colapsan sus duplicados (el mismo
 *     portal suele venir como PointAddress y StreetAddress), se quita el
 *     ruido que no encaja con lo tecleado y se completan con POIs/lugares
 *     de Photon que ArcGIS no listara.
 *  3. Si ArcGIS no responde (parcial / caído): cadena OpenStreetMap —
 *     Photon de zona → Nominatim acotado → Photon abierto → interpolación
 *     de portales entre vecinos indexados (véase «Relevancia» abajo).
 * ------------------------------------------------------------------ */

// Caché propia del autocomplete (las consultas parciales cambian rápido,
// así que guardamos solo un número reducido de resultados).
const acCache = new Map<string, AddressSuggestion[]>()
const AC_CACHE_LIMIT = 200
const AC_MIN_QUERY_LEN = 3
const AC_MAX_RESULTS = 4

// Zona de reparto para el autocomplete de Photon/Nominatim: cuadro "duro"
// alrededor del restaurante (±0.2° ≈ ±22 km). Los resultados FUERA de este
// cuadro solo se buscan si dentro no hay nada decente.
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

/** Sugerencia con metadatos internos para el ranking y la fusión de
 *  fuentes: viajan en la respuesta (inofensivos para el cliente) y permiten
 *  saber si una dirección trae número real y de qué tipo de sitio se trata. */
interface RichSuggestion extends AddressSuggestion {
  /** Número de portal real si la dirección/POI lo trae. */
  portal?: number
  /** Nombre de la calle sin el número ("Calle Elvira"). */
  streetText?: string
  /** Línea de ciudad ("18010 Granada"). */
  cityLine?: string
  /** El portal es una posición estimada por interpolación. */
  approximate?: boolean
  /** street = calle/portal · poi = punto con nombre propio y dirección ·
   *  place = lugar o localidad sin calle ("Puerta del Sol", "Santa Fe"). */
  kind?: 'street' | 'poi' | 'place'
}

/** Convierte una feature de Photon en sugerencia de 2 líneas. */
function photonToSuggestion(f: PhotonFeature): RichSuggestion | null {
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
  let kind: RichSuggestion['kind'] = 'street'
  if (p.name && streetLine && p.name !== streetLine) {
    // POI con nombre propio: "Museo del Prado" / "Calle Ruiz de Alarcón 23, 28014 Madrid"
    main = p.name
    secondary = [streetLine, cityLine].filter(Boolean).join(', ') + country
    kind = 'poi'
  } else if (!streetLine && p.name) {
    // Lugar/POI sin calle: "Puerta del Sol", "Santa Fe"
    main = p.name
    secondary = cityLine + country
    kind = 'place'
  } else {
    main = streetLine || p.name || cityLine || p.country || 'Sin nombre'
    secondary = cityLine + country
    kind = streetLine ? 'street' : 'place'
  }

  const portal = p.housenumber ? Number.parseInt(p.housenumber, 10) : NaN

  return {
    lat,
    lng,
    main,
    secondary: secondary.replace(/^,\s*/, ''),
    label: [main, secondary].filter(Boolean).join(', '),
    portal: Number.isFinite(portal) ? portal : undefined,
    streetText: p.street || undefined,
    cityLine: cityLine || undefined,
    kind,
  }
}

/** Llamada cruda a Photon (features completas, para sondear portales). */
async function fetchPhoton(
  q: string,
  bias?: { lat: number; lng: number },
  opts: { zoneOnly?: boolean } = {},
): Promise<PhotonFeature[]> {
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
  return data.features || []
}

async function searchPhoton(
  q: string,
  bias?: { lat: number; lng: number },
  opts: { zoneOnly?: boolean } = {},
): Promise<RichSuggestion[]> {
  const feats = await fetchPhoton(q, bias, opts)
  return feats
    .map(photonToSuggestion)
    .filter((s): s is RichSuggestion => s !== null)
}

/** display_name de Nominatim → sugerencia corta y legible.
 *
 * "Calle Mayor, Barrio de la Latina, Palacio, Centro, Madrid, Comunidad de
 * Madrid, 28013, España" → main "Calle Mayor" / secondary "Centro, 28013
 * Madrid". Los PORTAL de Nominatim vienen como "25, Calle Mayor, …" y se
 * normalizan a "Calle Mayor 25". La etiqueta corta es la que queda escrita
 * en el input y guardada en el pedido. */
function nominatimToSuggestion(r: GeoPoint): RichSuggestion {
  let parts = (r.label || '').split(',').map((s) => s.trim()).filter(Boolean)
  let streetText: string | undefined
  // Portal de Nominatim: "25, Calle Mayor, Barrio, …" → "Calle Mayor 25"
  if (parts.length > 1 && /^\d{1,4}\s*[a-z]?$/i.test(parts[0])) {
    streetText = parts[1]
    parts = [`${parts[1]} ${parts[0]}`, ...parts.slice(2)]
  }
  const main = parts[0] || r.label || 'Dirección'
  let secondary = parts.slice(1, 3).join(', ')
  let cityLine = ''
  const iPC = parts.findIndex((p) => /^\d{5}$/.test(p))
  if (iPC >= 3) {
    const city = parts[iPC - 2] || ''
    const district = parts[iPC - 3] || ''
    cityLine = [parts[iPC], city].filter(Boolean).join(' ')
    secondary = [district, cityLine].filter(Boolean).join(', ')
  }
  const portalMatch = main.match(/(\d{1,4})\s*[a-z]?$/i)
  return {
    lat: r.lat,
    lng: r.lng,
    main,
    secondary,
    label: [main, secondary].filter(Boolean).join(', '),
    portal: portalMatch ? Number(portalMatch[1]) : undefined,
    streetText: streetText ?? (portalMatch ? undefined : main),
    cityLine: cityLine || undefined,
    kind: 'street',
  }
}

/** Respaldo/enriquecimiento con Nominatim (mismo proveedor de datos, otro
 *  servicio). Su punto fuerte: si el PORTAL "Calle Mayor 25" no existe en
 *  OSM, devuelve la propia CALLE de la zona en vez de portales con el mismo
 *  nombre de otras localidades (que es lo que hace Photon). */
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
  const seen: AddressSuggestion[] = []
  for (const s of list) {
    // Clave de colapso: calle + número SIN código postal, municipio, ni
    // artículos ("de", "la", "del"). Así "Calle de Recogidas 40, 18101
    // Vegas del Genil" y "Calle Recogidas 40, 18002 Granada" colapsan si
    // están cerca (mismo portal en municipios colindantes).
    const baseLabel = deaccent(s.label)
      .replace(/\b\d{5}\b/g, '') // quita CP
      .replace(/\b(de|la|del|el|las|los|y)\b/g, ' ') // quita artículos
      .replace(/\s+/g, ' ')
      .trim()

    const isDup = seen.some((existing) => {
      const exLabel = deaccent(existing.label)
        .replace(/\b\d{5}\b/g, '')
        .replace(/\b(de|la|del|el|las|los|y)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (exLabel === baseLabel) return true
      // Coordenadas muy cercanas (< 300 m): mismo portal o tramo de calle
      const dist = distanceKm(existing, s)
      if (dist < 0.3) return true
      return false
    })
    if (!isDup) seen.push(s)
  }
  return seen
}

/* ------------------- Relevancia de las sugerencias ------------------- *
 *
 * Puntuar cada sugerencia contra lo tecleado. Se usa para:
 *  - quitar de los resultados de ArcGIS el ruido que no encaja
 *    ("Calle Vía 1" cuando se buscaba "gran vía 1"),
 *  - decidir qué POIs de Photon complementan la lista,
 *  - y ordenar/filtrar en la cadena de respaldo OSM (Photon + Nominatim).
 *
 * Reglas: los tokens de calle deben encajar por palabra completa ("mayor"
 * NO encaja en "mayorazgo"), el número de portal suma, y la coincidencia
 * por prefijo ("Gran Vía 1" empieza por "gran vía") manda sobre la
 * dispersa ("…de la Gran Vía del Este").
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
      // exactos pero lejanos.
      const nearBonus = raw >= 2 && bias && dist < 2 ? 1 : 0
      return { s, i, score: raw + nearBonus, dist }
    })
    .sort((a, b) => b.score - a.score || a.dist - b.dist || a.i - b.i)
  // Si algo encaja con lo tecleado, el ruido sobra; y si NADA encaja (ni de
  // lejos) mejor no ofrecer nada: el repartidor puede poner los km a mano.
  if (!ranked.some((r) => r.score >= 1)) return []
  return ranked
    .filter((r) => r.score >= 1)
    .slice(0, AC_MAX_RESULTS)
    .map((r) => r.s)
}

/** Interpola la posición del portal `target` a lo largo de la calle a partir
 *  de los portales vecinos indexados (misma acera primero — pares e impares
 *  van en aceras opuestas). Devuelve null si no hay referencias fiables. */
function interpolatePortal(
  anchors: Array<{ num: number; lat: number; lng: number }>,
  target: number,
): { lat: number; lng: number } | null {
  if (anchors.length === 0) return null
  const sameSide = anchors.filter((a) => (a.num % 2) === (target % 2))
  const pool = (sameSide.length > 0 ? sameSide : anchors).slice().sort((a, b) => a.num - b.num)
  const below = pool.filter((a) => a.num <= target).pop()
  const above = pool.find((a) => a.num >= target)
  if (below && above) {
    if (below.num === above.num) return { lat: below.lat, lng: below.lng }
    const t = (target - below.num) / (above.num - below.num)
    return {
      lat: below.lat + (above.lat - below.lat) * t,
      lng: below.lng + (above.lng - below.lng) * t,
    }
  }
  // Fuera del rango conocido: si hay un vecino cercano en numeración se
  // usa; si está lejano (calle con huecos) mejor no inventar.
  const nearest = below ?? above
  if (nearest && Math.abs(nearest.num - target) <= 4) return { lat: nearest.lat, lng: nearest.lng }
  return null
}

/** Palabras "de tipo de vía" y artículos que se ignoran al comparar nombres
 *  de calle: "Calle de la Elvira" ≡ "Calle Elvira", pero ninguna equivale a
 *  "Calle Vista Elvira" (el falso positivo clásico de Atarfe). */
const STREET_NOISE_WORDS = new Set([
  'calle', 'avenida', 'avda', 'av', 'camino', 'paseo', 'plaza', 'glorieta',
  'carretera', 'ctra', 'via', 'vial', 'travesia', 'calleja', 'cuesta',
  'bajada', 'subida', 'pasaje', 'puente', 'ronda', 'urbanizacion',
  'poligono', 'sector', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en',
])

function streetTokenSet(text: string): Set<string> {
  return new Set(
    deaccent(text)
      .split(/[^a-z0-9ñ]+/)
      .filter((t) => t.length >= 2 && !STREET_NOISE_WORDS.has(t) && !/^\d+$/.test(t)),
  )
}

/** ¿Los dos nombres de calle son la MISMA calle? (comparación por palabras
 *  completas, ignorando tipo de vía y artículos). */
function sameStreet(a: string, b: string): boolean {
  const ta = streetTokenSet(a)
  const tb = streetTokenSet(b)
  if (ta.size === 0 || tb.size === 0 || ta.size !== tb.size) return false
  for (const t of ta) if (!tb.has(t)) return false
  return true
}

/** Quita de la frase de calle las palabras que son ciudad (sacadas del
 *  cityLine de la propia sugerencia: "18001 Granada") para poder comparar
 *  solo el nombre de calle. OJO: nunca del `secondary` completo, que en los
 *  POI incluye la propia dirección y vacaría el nombre. */
function stripCityWords(phrase: string, street: RichSuggestion): string {
  const cityWords = new Set(
    deaccent(street.cityLine ?? '')
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 3 && !STREET_NOISE_WORDS.has(w) && !/^\d+$/.test(w)),
  )
  return deaccent(phrase)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 2 && !cityWords.has(t))
    .join(' ')
}

/** Sondea Photon con los números vecinos de la calle para localizar los
 *  portales indexados alrededor del buscado. Cada sondeo se valida: el
 *  número debe ser exacto, la calle la MISMA (por palabras) y estar a menos
 *  de 3 km de la calle que se está interpolando. */
async function probePhotonAnchors(
  streetQuery: string,
  streetPos: { lat: number; lng: number },
  target: number,
  bias?: { lat: number; lng: number },
): Promise<Array<{ num: number; lat: number; lng: number }>> {
  const probes = [
    ...new Set([target - 6, target - 4, target - 2, target + 2, target + 4, target + 6, target - 1, target + 1]),
  ].filter((n) => n >= 1 && n <= 9999)
  const results = await Promise.all(
    probes.map(async (n): Promise<{ num: number; lat: number; lng: number } | null> => {
      try {
        const feats = await fetchPhoton(`${streetQuery} ${n}`, bias)
        for (const f of feats) {
          const p = f.properties ?? {}
          const hn = p.housenumber ? Number.parseInt(p.housenumber, 10) : NaN
          if (!Number.isFinite(hn) || hn !== n) continue
          if (!p.street || !sameStreet(p.street, streetQuery)) continue
          const c = f.geometry?.coordinates
          const lat = c?.[1]
          const lng = c?.[0]
          if (typeof lat !== 'number' || typeof lng !== 'number') continue
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
          // Debe estar junto a la calle que interpolamos: evita homónimos
          // de otras localidades ("Calle Vista Elvira" en Atarfe, a 8 km).
          if (distanceKm(streetPos, { lat, lng }) > 3) continue
          return { num: n, lat, lng }
        }
        return null
      } catch {
        return null
      }
    }),
  )
  return results.filter((a): a is { num: number; lat: number; lng: number } => a !== null)
}

/* --------------------- Fusión de resultados ArcGIS --------------------- *
 *
 * ArcGIS devuelve a veces el mismo sitio dos veces: el portal como
 * PointAddress y como StreetAddress, o el mismo POI repetido. Se colapsan
 * quedándose con la versión que trae número de portal.
 * ------------------------------------------------------------------- */

function isArcDuplicate(a: RichSuggestion, b: RichSuggestion): boolean {
  if (distanceKm(a, b) > 0.5) return false
  const sameCity = deaccent(a.cityLine ?? '') === deaccent(b.cityLine ?? '')
  if (a.kind !== b.kind) return false
  if (a.kind === 'poi' || a.kind === 'place') {
    return deaccent(a.main) === deaccent(b.main)
  }
  if (!a.streetText || !b.streetText) {
    return deaccent(a.main) === deaccent(b.main) && sameCity
  }
  if (!sameStreet(a.streetText, b.streetText) || !sameCity) return false
  // Misma calle y ciudad: si ambos traen número son el mismo sitio solo si
  // coincide; si uno no lo trae, la calle "pelada" sobra frente al portal.
  if (a.portal !== undefined && b.portal !== undefined) return a.portal === b.portal
  return true
}

function mergeArcCandidates(list: RichSuggestion[]): RichSuggestion[] {
  const out: RichSuggestion[] = []
  for (const s of list) {
    const i = out.findIndex((o) => isArcDuplicate(o, s))
    if (i < 0) {
      out.push(s)
      continue
    }
    // Quedarse con la versión que trae portal (posición del edificio)
    if (out[i].portal === undefined && s.portal !== undefined) out[i] = s
  }
  return out
}

/** Añade a los resultados de ArcGIS lo que Photon hace mejor: POIs y
 *  lugares con nombre propio que ArcGIS no listó. Las CALLES de Photon
 *  solo se añaden si ArcGIS trajo menos de 3 resultados (query parcial). */
function complementWithPhoton(
  base: RichSuggestion[],
  photon: RichSuggestion[],
  match: QueryMatch,
): RichSuggestion[] {
  if (photon.length === 0) return base
  const dupOfBase = (p: RichSuggestion) =>
    base.some((b) => distanceKm(b, p) < 0.35 || deaccent(b.main) === deaccent(p.main))
  const extras = photon.filter(
    (p) =>
      (p.kind === 'poi' || p.kind === 'place') &&
      scoreSuggestion(p, match) >= 2 &&
      !dupOfBase(p),
  )
  const streets =
    base.length < 3
      ? photon.filter(
          (p) => p.kind === 'street' && scoreSuggestion(p, match) >= 3 && !dupOfBase(p),
        )
      : []
  return [...base, ...extras, ...streets]
}

/* ------------------------ Cadena de respaldo OSM ------------------------ *
 *
 * Solo se usa si ArcGIS no devuelve nada (consultas parciales o servicio
 * caído). `photonZone` ya se trajo en paralelo: Nominatim acotado → Photon
 * abierto → interpolación del portal entre vecinos indexados.
 * ------------------------------------------------------------------- */

async function fallbackSuggestions(
  q: string,
  photonZone: RichSuggestion[],
  bias?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  const match = matchOf(q)
  const portalNum = match.portal ? Number.parseInt(match.portal, 10) : NaN
  const hasGood = (list: RichSuggestion[]) =>
    list.some((s) => scoreSuggestion(s, match) >= 2)
  // Portal exacto = el número Y la MISMA calle (comparación estricta por
  // palabras completas): "Calle Vista Elvira 15" de Atarfe NO es el portal 15
  // de "Calle Elvira" de Granada, aunque comparta la palabra "elvira".
  const isExactPortal = (s: RichSuggestion) =>
    Number.isFinite(portalNum) &&
    s.portal === portalNum &&
    s.streetText !== undefined &&
    sameStreet(s.streetText, stripCityWords(match.phrase, s))
  const hasExactPortal = (list: RichSuggestion[]) => list.some(isExactPortal)

  const collected: RichSuggestion[] = [...photonZone]

  // 1. Nominatim acotado: SIEMPRE que la consulta traiga número de portal
  //    sin resolver por Photon y también si Photon no encontró nada decente.
  if (!hasExactPortal(collected) && (match.portal || !hasGood(collected))) {
    try {
      if (await takeNominatimSlot()) {
        collected.push(...(await searchNominatimSuggestions(q, bias)))
      }
    } catch {
      /* sin respaldo: seguimos con lo que haya */
    }
  }

  // 2. Abrir la búsqueda (solo si con bias había zona cerrada)
  if (!hasGood(collected) && bias) {
    try {
      collected.push(...(await searchPhoton(q, bias)))
    } catch {
      /* sin más opciones */
    }
  }

  // 3. Portal a nivel de edificio: número exacto → entrada "plana";
  //    número sin indexar → posición interpolada entre portales vecinos.
  if (Number.isFinite(portalNum) && portalNum >= 1) {
    const exact = collected.find(isExactPortal)
    if (exact) {
      // El portal vino en un POI ("Hotel X | Calle Gran Vía 25"): añadir
      // también la dirección llana, que es lo que espera seleccionar.
      if (exact.streetText && scoreSuggestion(exact, match) < 4) {
        const main = `${exact.streetText} ${match.portal}`
        const secondary = exact.cityLine ?? exact.secondary
        collected.unshift({
          ...exact,
          main,
          secondary,
          label: [main, secondary].filter(Boolean).join(', '),
        })
      }
    } else {
      // Buscar la entrada de CALLE pura (sin portal, mismo nombre) sobre la
      // que interpolar la posición del número pedido.
      const streetPick = collected
        .filter(
          (s) =>
            scoreSuggestion(s, match) >= 2 &&
            !s.approximate &&
            s.portal === undefined &&
            s.streetText &&
            sameStreet(s.streetText, stripCityWords(match.phrase, s)),
        )
        .sort(
          (a, b) =>
            scoreSuggestion(b, match) - scoreSuggestion(a, match) ||
            (bias ? distanceKm(bias, a) - distanceKm(bias, b) : 0),
        )[0]
      if (streetPick) {
        const streetQuery = stripCityWords(match.phrase, streetPick)
        const anchors = await probePhotonAnchors(streetQuery, streetPick, portalNum, bias)
        const pos = interpolatePortal(anchors, portalNum)
        if (pos) {
          const main = `${streetPick.main} ${match.portal}`.replace(/\s+/g, ' ')
          const cityLine = streetPick.cityLine ?? ''
          const secondary = [cityLine, 'portal estimado'].filter(Boolean).join(' · ')
          collected.unshift({
            lat: pos.lat,
            lng: pos.lng,
            main,
            secondary,
            label: [main, cityLine].filter(Boolean).join(', '),
            portal: portalNum,
            streetText: streetPick.streetText,
            cityLine: streetPick.cityLine,
            approximate: true,
          })
        }
      }
    }
  }

  return rankSuggestions(dedupeSuggestions(collected), match, bias)
}

/**
 * Sugerencias de dirección para el desplegable del repartidor (máx. 6).
 * Véase el diagrama al inicio de la sección AUTOCOMPLETE.
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

  // Motor principal (ArcGIS) y complemento (Photon) en paralelo.
  const [arcSettled, photonSettled] = await Promise.allSettled([
    searchArcGIS(q, bias),
    bias ? searchPhoton(q, bias, { zoneOnly: true }) : searchPhoton(q),
  ])
  const arc = arcSettled.status === 'fulfilled' ? arcSettled.value : []
  const photon = photonSettled.status === 'fulfilled' ? photonSettled.value : []

  let final: AddressSuggestion[] | null = null
  if (arc.length > 0) {
    // 1. Colapsar duplicados de ArcGIS y quitar el ruido que no encaja con
    //    lo tecleado (si nada encaja, se confía en el ranking del motor).
    let base = mergeArcCandidates(arc)
    const kept = base.filter((s) => scoreSuggestion(s, match) > 0)
    if (kept.length > 0) base = kept
    // 2. Complementar con POIs/lugares de Photon y recortar al límite.
    final = dedupeSuggestions(complementWithPhoton(base, photon, match))
    // 3. Si hay bias (posición del restaurante), filtrar los que estén a más
    //    de 30 km — un reparto nocturno de kebab no va a otra provincia.
    //    Luego ordenar por cercanía para que el más próximo salga primero.
    //    (ArcGIS prioriza la zona pero no excluye; esto limpia homónimos.)
    if (bias) {
      final = final
        .map((s) => ({ s, d: distanceKm(s, bias) }))
        .filter((x) => x.d <= 30)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.s)
    }
    final = final.slice(0, AC_MAX_RESULTS)
  } else if (photon.length === 0) {
    // Consulta PARCIAL ("calle trev"): findAddressCandidates no sugiere con
    // prefijos y Photon tampoco encontró nada. El endpoint `suggest` de
    // ArcGIS sí está hecho para esto; cada sugerencia se resuelve a
    // coordenadas con su magicKey (en paralelo).
    try {
      const sugs = await searchArcGISSuggest(q, bias)
      const resolved = (
        await Promise.all(sugs.slice(0, 5).map((s) => resolveArcGISMagic(s.text, s.magicKey)))
      ).filter((s): s is RichSuggestion => s !== null)
      if (resolved.length > 0) {
        final = dedupeSuggestions(mergeArcCandidates(resolved)).slice(0, AC_MAX_RESULTS)
      }
    } catch {
      /* a la cadena de respaldo OSM */
    }
  }
  if (final === null) {
    // Respaldo OpenStreetMap (Photon ya traído en paralelo).
    final = await fallbackSuggestions(q, photon, bias)
  }

  if (acCache.size >= AC_CACHE_LIMIT) {
    const oldest = acCache.keys().next().value
    if (oldest !== undefined) acCache.delete(oldest)
  }
  acCache.set(cacheKey, final)

  return final
}
