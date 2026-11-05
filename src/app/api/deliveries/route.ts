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

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') // 'active' | 'recent' | undefined
  // For drivers: 'mine' (default) limits to their assigned restaurants, 'all' shows everything
  const view = searchParams.get('view') === 'all' ? 'all' : 'mine'

  if (session.role === 'driver' || session.role === 'admin') {
    const where: Record<string, unknown> = {}
    // Drivers default to their assigned restaurants; admins always see all.
    if (view === 'mine' && session.role === 'driver') {
      where.restaurant = { assignedDriverId: session.id }
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
    return NextResponse.json({ deliveries: deliveries.map((d) => serializeDelivery(d)) })
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
  return NextResponse.json({ deliveries: deliveries.map((d) => serializeDelivery(d, false)) })
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'restaurant') {
    return NextResponse.json({ error: 'Solo los restaurantes pueden solicitar reparto' }, { status: 403 })
  }

  const restaurant = await db.restaurant.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, address: true, lat: true, lng: true, assignedDriver: { select: { id: true, name: true } } },
  })
  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  }

  if (!restaurant.assignedDriver) {
    return NextResponse.json(
      { error: 'Tu local todavía no tiene repartidor asignado. Avisa a tu repartidor para que te asigne desde su consola.' },
      { status: 409 },
    )
  }

  // Prevent duplicate active requests
  const active = await db.delivery.findFirst({
    where: { restaurantId: session.id, status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] } },
  })
  if (active) {
    return NextResponse.json(
      {
        error: 'Ya tienes una solicitud de reparto en curso',
        delivery: serializeDelivery({
          ...active,
          restaurant: {
            name: restaurant.name,
            address: restaurant.address,
            lat: restaurant.lat,
            lng: restaurant.lng,
            assignedDriver: restaurant.assignedDriver,
          },
        }, false),
      },
      { status: 409 },
    )
  }

  const delivery = await db.delivery.create({
    data: {
      restaurantId: session.id,
      status: 'PENDING',
      requestedAt: new Date(),
    },
    include: DELIVERY_RESTAURANT_INCLUDE,
  })

  const dto = serializeDelivery(delivery)

  // Notify all drivers; each client beeps only when the delivery is routed to
  // them (payload.assignedDriverId) and silently refreshes otherwise.
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

  // Web Push al repartidor asignado: llega aunque tenga la app cerrada
  // (clave en iPhone, donde solo el service worker puede mostrar avisos).
  await sendPush(
    { role: 'driver', userId: restaurant.assignedDriver.id },
    {
      title: 'Nueva solicitud de reparto',
      body: `${restaurant.name} necesita repartidor`,
      tag: `delivery-${delivery.id}`,
    },
  )

  return NextResponse.json({ delivery: dto }, { status: 201 })
}

export { isActiveStatus }
