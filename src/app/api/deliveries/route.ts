import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'
import { realtimeEmit } from '@/lib/realtime'
import { sendPush } from '@/lib/push'
import {
  serializeDelivery,
  DELIVERY_RESTAURANT_INCLUDE,
  isActiveStatus,
} from '@/lib/delivery'
import { getCommissionEur } from '@/lib/settings'

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') // 'active' | 'recent' | undefined
  // For drivers: 'mine' (default) limits to their deliveries + their
  // restaurants' untaken requests; 'all' shows everything.
  const view = searchParams.get('view') === 'all' ? 'all' : 'mine'

  if (session.role === 'driver' || session.role === 'admin') {
    const where: Record<string, unknown> = {}
    if (view === 'mine' && session.role === 'driver') {
      // Mis repartos (los que acepté) + peticiones sin tomar de mis restaurantes
      where.OR = [
        { driverId: session.id },
        {
          driverId: null,
          restaurant: { drivers: { some: { driverId: session.id } } },
        },
      ]
    }
    if (scope === 'active') {
      where.status = { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] }
    }
    const deliveries = await db.delivery.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: scope === 'active' ? 50 : 200,
      include: DELIVERY_RESTAURANT_INCLUDE,
    })
    // El admin ve la tarifa real (sin comisión); el repartidor ve el neto.
    const commission = session.role === 'admin' ? 0 : await getCommissionEur()
    return NextResponse.json({ deliveries: deliveries.map((d) => serializeDelivery(d, true, commission)) })
  }

  // Restaurant: only own deliveries. Location already known to them.
  const where = scope === 'active'
    ? { restaurantId: session.id, status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] } }
    : { restaurantId: session.id }
  const deliveries = await db.delivery.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: scope === 'active' ? 20 : 200,
    include: DELIVERY_RESTAURANT_INCLUDE,
  })
  const commission = await getCommissionEur()
  return NextResponse.json({ deliveries: deliveries.map((d) => serializeDelivery(d, false, commission)) })
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'restaurant') {
    return NextResponse.json({ error: 'Solo los restaurantes pueden solicitar reparto' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  // Nombre/anotación opcional del pedido (p. ej. el nombre del cliente)
  const customerName = String(body.customerName || '').trim().slice(0, 60) || null

  const restaurant = await db.restaurant.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
      drivers: { select: { driverId: true, driver: { select: { id: true, name: true } } } },
    },
  })
  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  }

  const assignedDrivers = restaurant.drivers.map((a) => a.driver)
  if (assignedDrivers.length === 0) {
    return NextResponse.json(
      {
        error: 'Tu local todavía no tiene repartidores asignados. Avisa a tu repartidor para que te asigne desde la administración.',
      },
      { status: 409 },
    )
  }

  // Un restaurante puede tener varias solicitudes en curso a la vez:
  // cada pedido es independiente (varios clientes, varios repartidores).

  const delivery = await db.delivery.create({
    data: {
      restaurantId: session.id,
      status: 'PENDING',
      requestedAt: new Date(),
      customerName,
    },
    include: DELIVERY_RESTAURANT_INCLUDE,
  })

  // El restaurante ve la tarifa neta (con comisión descuentada)
  const commission = await getCommissionEur()
  const dto = serializeDelivery(delivery, false, commission)

  // Notify all drivers; each client beeps only when the delivery is routed to
  // them (payload.assignedDriverIds) and silently refreshes otherwise.
  await realtimeEmit({
    event: 'delivery:new',
    room: 'driver',
    payload: dto,
  })
  // Also notify the restaurant's own room (other tabs) that a new active delivery exists
  await realtimeEmit({
    event: 'delivery:created',
    room: `restaurant:${session.id}`,
    payload: dto,
  })

  // Web Push a TODOS los repartidores asignados: llega aunque tengan la app
  // cerrada (clave en iPhone, donde solo el service worker puede mostrar avisos).
  await Promise.all(
    assignedDrivers.map((driver) =>
      sendPush(
        { role: 'driver', userId: driver.id },
        {
          title: 'Nueva solicitud de reparto',
          body: `${restaurant.name} necesita repartidor${customerName ? ` — ${customerName}` : ''}`,
          tag: `delivery-${delivery.id}`,
        },
      ),
    ),
  )

  return NextResponse.json({ delivery: dto }, { status: 201 })
}

export { isActiveStatus }
