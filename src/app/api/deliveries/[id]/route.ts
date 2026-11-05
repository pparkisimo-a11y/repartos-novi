import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'
import { realtimeEmit } from '@/lib/realtime'
import { serializeDelivery, DELIVERY_RESTAURANT_INCLUDE, type DeliveryStatus } from '@/lib/delivery'

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['DELIVERED'],
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const nextStatus = String(body.status || '').toUpperCase() as DeliveryStatus

  const delivery = await db.delivery.findUnique({
    where: { id },
    include: DELIVERY_RESTAURANT_INCLUDE,
  })
  if (!delivery) {
    return NextResponse.json({ error: 'Reparto no encontrado' }, { status: 404 })
  }

  const allowed = VALID_TRANSITIONS[delivery.status] || []
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      { error: `No se puede pasar de ${delivery.status} a ${nextStatus}` },
      { status: 400 },
    )
  }

  const assignedDriverId = delivery.restaurant.assignedDriver?.id ?? null

  // Permission checks
  if (nextStatus === 'CANCELLED') {
    // Only the owning restaurant (or the assigned driver for accepted) can cancel
    if (session.role !== 'restaurant' || session.id !== delivery.restaurantId) {
      const isAssignedDriver = session.role === 'driver' && session.id === assignedDriverId
      if (!(isAssignedDriver && delivery.status === 'ACCEPTED')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }
  } else {
    // ACCEPTED / REJECTED / PICKED_UP / DELIVERED -> driver only, and only the
    // driver assigned to this restaurant (fallback: any driver if unassigned,
    // so a request never gets stuck without an owner).
    if (session.role !== 'driver') {
      return NextResponse.json({ error: 'Solo el repartidor puede cambiar este estado' }, { status: 403 })
    }
    if (assignedDriverId && session.id !== assignedDriverId) {
      return NextResponse.json(
        { error: 'Este reparto pertenece a otro repartidor' },
        { status: 403 },
      )
    }
  }

  const now = new Date()
  const data: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'ACCEPTED') data.acceptedAt = now
  if (nextStatus === 'REJECTED') data.rejectedAt = now
  if (nextStatus === 'PICKED_UP') data.pickedUpAt = now
  if (nextStatus === 'DELIVERED') data.deliveredAt = now

  const updated = await db.delivery.update({
    where: { id },
    data,
    include: DELIVERY_RESTAURANT_INCLUDE,
  })

  const dto = serializeDelivery(updated)

  // Notify the restaurant in real time
  await realtimeEmit({
    event: 'delivery:update',
    room: `restaurant:${updated.restaurantId}`,
    payload: dto,
  })
  // Notify every driver (assigned one + anyone watching the "all" view)
  await realtimeEmit({
    event: 'delivery:update',
    room: 'driver',
    payload: dto,
  })

  return NextResponse.json({ delivery: dto })
}
