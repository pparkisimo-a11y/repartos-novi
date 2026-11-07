import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { geocodeAddress } from '@/lib/geocode'

// Rate limit simple en memoria: 30 búsquedas por IP y minuto.
const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 30
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
 * Geocodificación para la UI del repartidor: convierte la dirección de
 * entrega en coordenadas para previsualizar distancia y tarifa al recoger
 * el pedido. El cálculo definitivo de la tarifa lo hace el servidor al
 * guardar la recogida (PATCH /api/deliveries/[id]).
 */
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || (session.role !== 'driver' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().slice(0, 200)
  if (q.length < 4) {
    return NextResponse.json({ result: null })
  }

  // Sesgo geográfico opcional: la posición del restaurante acota la búsqueda
  // a su entorno (~28 km) para evitar matches de otras localidades.
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

  const result = await geocodeAddress(q, bias)
  return NextResponse.json({ result })
}
