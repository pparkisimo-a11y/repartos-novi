import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { autocompleteAddresses } from '@/lib/geocode'

// Rate limit en memoria: el autocomplete dispara una petición por tanda de
// tecleo (con debounce en el cliente), así que el límite es más generoso
// que el de geocodificación simple: 90 búsquedas por IP y minuto.
const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 90
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list)
    return true
  }
  list.push(now)
  hits.set(ip, list)
  return false
}

/**
 * Sugerencias de dirección (estilo Google Maps) para el desplegable del
 * repartidor mientras escribe la dirección de entrega. Cada sugerencia
 * trae sus coordenadas: al seleccionarla se calcula la distancia y la
 * tarifa con precisión.
 */
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || (session.role !== 'driver' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().slice(0, 200)
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  // Sesgo geográfico: la posición del restaurante prioriza resultados
  // cercanos (los repartos son urbanos).
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const bias =
    Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : undefined

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Demasiadas búsquedas' }, { status: 429 })
  }

  const suggestions = await autocompleteAddresses(q, bias)
  return NextResponse.json({ suggestions })
}
