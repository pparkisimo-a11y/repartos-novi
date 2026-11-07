import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { updateRestaurantPassword, deleteRestaurant, updateRestaurantAssignment, updateRestaurantFees, updateRestaurantSchedule } from '@/lib/admin-restaurants'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminFromRequest(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'reset-password') {
      const res = await updateRestaurantPassword(id, String(body.password || ''))
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ ok: true })
    }

    if (action === 'assign') {
      // Lista de repartidores asignados (un local puede tener varios)
      const raw = body.assignedDriverIds
      const driverIds = Array.isArray(raw)
        ? raw.map((v: unknown) => String(v)).filter(Boolean)
        : body.assignedDriverId
          ? [String(body.assignedDriverId)]
          : []
      const res = await updateRestaurantAssignment(id, driverIds)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ restaurant: res.restaurant })
    }

    if (action === 'update-fees') {
      const res = await updateRestaurantFees(id, {
        feeBaseEur: body.feeBaseEur,
        feeThresholdKm: body.feeThresholdKm,
        feePerExtraKmEur: body.feePerExtraKmEur,
      })
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ restaurant: res.restaurant })
    }

    if (action === 'update-schedule') {
      const res = await updateRestaurantSchedule(id, {
        scheduleDays: body.scheduleDays,
        scheduleStart: body.scheduleStart,
        scheduleEnd: body.scheduleEnd,
      })
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ restaurant: res.restaurant })
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminFromRequest(req)
    const { id } = await params
    const res = await deleteRestaurant(id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
