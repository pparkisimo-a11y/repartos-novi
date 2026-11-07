import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { deliveryDistanceKm } from '@/lib/routing'

/**
 * Previsualización de la distancia del reparto para el repartidor:
 * dado el restaurante (from) y el destino seleccionado en el
 * autocomplete (to), devuelve la distancia (por carretera si OSRM
 * responde, si no línea recta) que luego se tarifica.
 *
 * El cálculo definitivo al guardar la recogida usa la misma función
 * (deliveryDistanceKm), así que la tarifa previsualizada y la guardada
 * coinciden.
 */
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || (session.role !== 'driver' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const flat = Number(searchParams.get('flat'))
  const flng = Number(searchParams.get('flng'))
  const tlat = Number(searchParams.get('tlat'))
  const tlng = Number(searchParams.get('tlng'))

  const valid = [flat, flng, tlat, tlng].every((n) => Number.isFinite(n))
  if (!valid || (flat === 0 && flng === 0) || (tlat === 0 && tlng === 0)) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
  }

  const result = await deliveryDistanceKm(
    { lat: flat, lng: flng },
    { lat: tlat, lng: tlng },
  )
  return NextResponse.json(result)
}
