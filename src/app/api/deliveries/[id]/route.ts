import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'
import { realtimeEmit } from '@/lib/realtime'
import { sendPush } from '@/lib/push'
import { geocodeAddress } from '@/lib/geocode'
import { feeForDistanceKm } from '@/lib/fees'
import { deliveryDistanceKm } from '@/lib/routing'
import { serializeDelivery, DELIVERY_RESTAURANT_INCLUDE, type DeliveryStatus } from '@/lib/delivery'
import { getCommissionPct } from '@/lib/settings'

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
  const action = String(body.action || '')

  const delivery = await db.delivery.findUnique({
    where: { id },
    include: DELIVERY_RESTAURANT_INCLUDE,
  })
  if (!delivery) {
    return NextResponse.json({ error: 'Reparto no encontrado' }, { status: 404 })
  }

  // ¿Es súper repartidor? (puede robar pedidos)
  let isSuperDriver = false
  if (session.role === 'driver') {
    const d = await db.driver.findUnique({ where: { id: session.id }, select: { isSuperDriver: true } })
    isSuperDriver = !!d?.isSuperDriver
  }
  const now = new Date()

  // ---------- ROBAR: el súper repartidor se queda un pedido de otro ----------
  // Se procesa ANTES de la validación de transiciones (no usa nextStatus).
  if (action === 'steal') {
    if (session.role !== 'driver' || !isSuperDriver) {
      return NextResponse.json({ error: 'Solo un súper repartidor puede robar pedidos' }, { status: 403 })
    }
    // Se puede robar/tomar cualquier PENDING o ACCEPTED (incluso sin asignar)
    if (!['PENDING', 'ACCEPTED'].includes(delivery.status)) {
      return NextResponse.json({ error: 'Este pedido ya no se puede robar (está recogido o entregado)' }, { status: 409 })
    }
    const previousDriverId = delivery.driverId
    const wasAccepted = delivery.status === 'ACCEPTED'
    const stealData: Record<string, unknown> = {
      driverId: session.id,
      currentAssigneeId: null,
      acceptedAt: delivery.acceptedAt || now,
      status: 'ACCEPTED',
    }
    await db.delivery.update({ where: { id }, data: stealData })
    const stolen = await db.delivery.findUnique({ where: { id }, include: DELIVERY_RESTAURANT_INCLUDE })
    const commissionPct = await getCommissionPct()
    const dtoStolen = serializeDelivery(stolen!, true, commissionPct)
    // Notificar al restaurante (tarifa real) y a TODOS los repartidores (neto)
    await realtimeEmit({ event: 'delivery:update', room: `restaurant:${delivery.restaurantId}`, payload: serializeDelivery(stolen!, false, 0) })
    await realtimeEmit({ event: 'delivery:update', room: 'driver', payload: dtoStolen })
    // Avisar al repartidor original (si lo había) de que le han quitado el pedido
    if (wasAccepted && previousDriverId && previousDriverId !== session.id) {
      await sendPush(
        { role: 'driver', userId: previousDriverId },
        {
          title: 'Pedido reasignado',
          body: `${session.name} se ha hecho cargo del pedido #${id.slice(-6).toUpperCase()} de ${delivery.restaurant.name}.`,
          tag: `delivery-${id}`,
        },
      )
    }
    return NextResponse.json({ delivery: dtoStolen })
  }

  const allowed = VALID_TRANSITIONS[delivery.status] || []
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      { error: `No se puede pasar de ${delivery.status} a ${nextStatus}` },
      { status: 400 },
    )
  }

  const assignedDriverIds = delivery.restaurant.drivers?.map((a) => a.driverId) ?? []
  // ¿Es el repartidor al que se le ofrece ahora (asignación secuencial)?
  const isCurrentAssignee = delivery.currentAssigneeId === session.id
  const isAcceptor = delivery.driverId === session.id

  // ---------- ACEPTAR: el repartidor actual (o súper) se lo lleva ----------
  if (nextStatus === 'ACCEPTED') {
    if (session.role !== 'driver') {
      return NextResponse.json({ error: 'Solo el repartidor puede aceptar' }, { status: 403 })
    }
    // Puede aceptar: el currentAssignee, o un súper (robando), o fallback si
    // nadie está asignado (currentAssigneeId null por BD vieja).
    if (!isCurrentAssignee && !isSuperDriver && delivery.currentAssigneeId !== null) {
      return NextResponse.json(
        { error: 'Este reparto se le ha ofrecido a otro repartidor' },
        { status: 403 },
      )
    }
    // Actualización condicional: solo gana si sigue PENDING.
    const won = await db.delivery.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: now, driverId: session.id, currentAssigneeId: null },
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
      // Solo el currentAssignee puede rechazar
      if (!isCurrentAssignee) {
        return NextResponse.json(
          { error: 'Este reparto se le ha ofrecido a otro repartidor' },
          { status: 403 },
        )
      }
      // ¿Es el último de la rotación? No puede rechazar.
      const order = delivery.assigneeOrder ? delivery.assigneeOrder.split(',').filter(Boolean) : []
      if (delivery.assigneeIndex >= order.length - 1) {
        return NextResponse.json(
          { error: 'Eres el último repartidor disponible: no puedes rechazar este pedido' },
          { status: 403 },
        )
      }
      // Avanzar al siguiente repartidor: el pedido sigue PENDING, no se rechaza
      const nextIndex = delivery.assigneeIndex + 1
      const nextAssigneeId = order[nextIndex] ?? null
      await db.delivery.update({
        where: { id },
        data: { assigneeIndex: nextIndex, currentAssigneeId: nextAssigneeId },
      })
      // Notificar al siguiente repartidor
      if (nextAssigneeId) {
        const nextDto = serializeDelivery(
          await db.delivery.findUnique({ where: { id }, include: DELIVERY_RESTAURANT_INCLUDE })!,
          true,
          await getCommissionPct(),
        )
        await realtimeEmit({ event: 'delivery:new', room: `driver:${nextAssigneeId}`, payload: nextDto })
        await sendPush(
          { role: 'driver', userId: nextAssigneeId },
          {
            title: 'Nueva solicitud de reparto',
            body: `${delivery.restaurant.name} necesita repartidor${delivery.customerName ? ` — ${delivery.customerName}` : ''}`,
            tag: `delivery-${id}`,
          },
        )
      }
      // Devolver el estado actual (sigue PENDING, no REJECTED)
      const stillPending = await db.delivery.findUnique({ where: { id }, include: DELIVERY_RESTAURANT_INCLUDE })
      return NextResponse.json({ delivery: serializeDelivery(stillPending!, true, await getCommissionPct()) })
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

  // El admin ve la tarifa real; el restaurante también (lo que paga);
  // el repartidor ve el neto (real menos comisión %).
  const commissionPct = session.role === 'driver' ? await getCommissionPct() : 0
  const dtoForRequester = serializeDelivery(updated, session.role !== 'restaurant', commissionPct)
  // El restaurante siempre ve la tarifa real, venga quien venga la petición
  const dtoForRestaurant = serializeDelivery(updated, false, 0)
  // El repartidor siempre ve el neto
  const commissionForDriver = await getCommissionPct()
  const dtoForDriver = serializeDelivery(updated, true, commissionForDriver)

  // Notify the restaurant in real time (tarifa real)
  await realtimeEmit({
    event: 'delivery:update',
    room: `restaurant:${updated.restaurantId}`,
    payload: dtoForRestaurant,
  })
  // Notify every driver (net fee)
  await realtimeEmit({
    event: 'delivery:update',
    room: 'driver',
    payload: dtoForDriver,
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

    // Notificar al admin: pedido aceptado, recogido o entregado
    const adminPush: Record<string, { title: string; body: string }> = {
      ACCEPTED: {
        title: 'Pedido aceptado',
        body: `${session.name} ha aceptado el pedido de ${updated.restaurant.name}.`,
      },
      PICKED_UP: {
        title: 'Pedido recogido',
        body: `${session.name} ha recogido el pedido de ${updated.restaurant.name}.`,
      },
      DELIVERED: {
        title: 'Reparto completado',
        body: `${session.name} ha entregado el pedido de ${updated.restaurant.name}.`,
      },
    }
    const adminNotif = adminPush[nextStatus]
    if (adminNotif) {
      const admins = await db.admin.findMany({ select: { id: true } })
      await Promise.all(
        admins.map((a) =>
          sendPush({ role: 'admin', userId: a.id }, { ...adminNotif, tag }),
        ),
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

  return NextResponse.json({ delivery: dtoForRequester })
}
