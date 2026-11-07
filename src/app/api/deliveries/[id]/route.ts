import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'
import { realtimeEmit } from '@/lib/realtime'
import { sendPush } from '@/lib/push'
import { geocodeAddress } from '@/lib/geocode'
import { feeForDistanceKm } from '@/lib/fees'
import { deliveryDistanceKm } from '@/lib/routing'
import { serializeDelivery, DELIVERY_RESTAURANT_INCLUDE, type DeliveryStatus } from '@/lib/delivery'

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['DELIVERED'],
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  const assignedDriverIds = delivery.restaurant.drivers?.map((a) => a.driverId) ?? []
  // Fallback: si el local no tiene repartidores asignados, cualquier
  // repartidor puede tomar la petición (que nunca quede huérfana).
  const isAssigned = assignedDriverIds.includes(session.id) || assignedDriverIds.length === 0
  const isAcceptor = delivery.driverId === session.id

  const now = new Date()

  // ---------- ACEPTAR: el primero que pulsa se lo lleva ----------
  if (nextStatus === 'ACCEPTED') {
    if (session.role !== 'driver') {
      return NextResponse.json({ error: 'Solo el repartidor puede aceptar' }, { status: 403 })
    }
    if (!isAssigned) {
      return NextResponse.json(
        { error: 'Este reparto pertenece a otros repartidores' },
        { status: 403 },
      )
    }
    // Actualización condicional: solo gana si sigue PENDING. Si otro
    // repartidor la aceptó antes, count === 0 y devolvemos 409.
    const won = await db.delivery.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: now, driverId: session.id },
    })
    if (won.count === 0) {
      return NextResponse.json(
        { error: 'Otro repartidor ya ha aceptado este pedido' },
        { status: 409 },
      )
    }
  } else if (nextStatus === 'CANCELLED') {
    // Only the owning restaurant (or the accepting driver) can cancel
    if (session.role !== 'restaurant' || session.id !== delivery.restaurantId) {
      if (!(session.role === 'driver' && isAcceptor && delivery.status === 'ACCEPTED')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }
  } else {
    // REJECTED / PICKED_UP / DELIVERED -> driver only
    if (session.role !== 'driver') {
      return NextResponse.json({ error: 'Solo el repartidor puede cambiar este estado' }, { status: 403 })
    }
    if (nextStatus === 'REJECTED') {
      if (!isAssigned) {
        return NextResponse.json(
          { error: 'Este reparto pertenece a otros repartidores' },
          { status: 403 },
        )
      }
    } else {
      // PICKED_UP / DELIVERED: solo el repartidor que aceptó el pedido
      if (!isAcceptor) {
        return NextResponse.json(
          { error: 'Solo el repartidor que aceptó este pedido puede actualizarlo' },
          { status: 403 },
        )
      }
    }
  }

  // ---------- Datos de la recogida (nombre + dirección → tarifa) ----------
  const data: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'ACCEPTED') data.acceptedAt = now
  if (nextStatus === 'REJECTED') data.rejectedAt = now
  if (nextStatus === 'DELIVERED') data.deliveredAt = now

  if (nextStatus === 'PICKED_UP') {
    data.pickedUpAt = now

    // Nombre del cliente/anotación (opcional, puede venir del restaurante)
    if (body.customerName !== undefined) {
      data.customerName = String(body.customerName || '').trim().slice(0, 60) || null
    }

    // Dirección de entrega
    const dropoffAddress = String(body.dropoffAddress || '').trim().slice(0, 200) || null
    data.dropoffAddress = dropoffAddress

    // Distancia: prioridad → km manuales > coordenadas del destino
    // (seleccionadas en el autocomplete) > geocodificar la dirección.
    // Con coordenadas se usa la distancia POR CARRETERA (OSRM) — la misma
    // que previsualiza el repartidor al elegir la dirección.
    let distanceKm: number | null = null
    let dropoffLat: number | null = null
    let dropoffLng: number | null = null

    const manualKm = Number(body.distanceKm)
    const lat = Number(body.dropoffLat)
    const lng = Number(body.dropoffLng)
    const restaurantPos = { lat: delivery.restaurant.lat, lng: delivery.restaurant.lng }

    if (Number.isFinite(manualKm) && manualKm > 0 && manualKm <= 100) {
      distanceKm = round2(manualKm)
    } else if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      dropoffLat = lat
      dropoffLng = lng
      distanceKm = (await deliveryDistanceKm(restaurantPos, { lat, lng })).km
    } else if (dropoffAddress) {
      // Geocodificación en el servidor, sesgada al entorno del restaurante
      const geo = await geocodeAddress(dropoffAddress, restaurantPos)
      if (geo) {
        dropoffLat = geo.lat
        dropoffLng = geo.lng
        distanceKm = (await deliveryDistanceKm(restaurantPos, geo)).km
      }
    }

    if (distanceKm != null) {
      data.distanceKm = distanceKm
      // Tarifa definitiva según la configuración del restaurante del reparto
      data.fee = feeForDistanceKm(distanceKm, {
        baseEur: delivery.restaurant.feeBaseEur,
        thresholdKm: delivery.restaurant.feeThresholdKm,
        perExtraKmEur: delivery.restaurant.feePerExtraKmEur,
      })
    }
    if (dropoffLat != null && dropoffLng != null) {
      data.dropoffLat = dropoffLat
      data.dropoffLng = dropoffLng
    }
  }

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
  // Notify every driver (assigned ones + anyone watching the "all" view)
  await realtimeEmit({
    event: 'delivery:update',
    room: 'driver',
    payload: dto,
  })

  // --- Web Push (avisos con la app cerrada) ---
  const tag = `delivery-${updated.id}`
  if (session.role === 'driver') {
    // El repartidor actualizó el estado → avisar al restaurante
    const restaurantPush: Record<string, { title: string; body: string }> = {
      ACCEPTED: {
        title: '¡Repartidor aceptado!',
        body: `${session.name} ha aceptado tu solicitud y va camino de tu local.`,
      },
      PICKED_UP: {
        title: 'Pedido recogido',
        body: updated.fee != null
          ? `${session.name} ha recogido el pedido. Tarifa: ${updated.fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €.`
          : `${session.name} ha recogido el pedido.`,
      },
      DELIVERED: {
        title: 'Reparto completado',
        body: `${session.name} ha confirmado la entrega.`,
      },
      REJECTED: {
        title: 'Solicitud rechazada',
        body: 'El repartidor no pudo aceptar tu solicitud. Puedes volver a solicitarla.',
      },
      CANCELLED: {
        title: 'Solicitud cancelada',
        body: `${session.name} ha cancelado el reparto. Contacta con tu coordinador.`,
      },
    }
    const push = restaurantPush[nextStatus]
    if (push) {
      await sendPush(
        { role: 'restaurant', userId: updated.restaurantId },
        { ...push, tag },
      )
    }
  } else if (nextStatus === 'CANCELLED' && assignedDriverIds.length > 0) {
    // El restaurante canceló → avisar a TODOS los repartidores asignados
    await Promise.all(
      assignedDriverIds.map((driverId) =>
        sendPush(
          { role: 'driver', userId: driverId },
          {
            title: 'Pedido cancelado',
            body: `${updated.restaurant.name} ha cancelado la solicitud de reparto.`,
            tag,
          },
        ),
      ),
    )
  }

  return NextResponse.json({ delivery: dto })
}
