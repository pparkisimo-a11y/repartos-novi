import { NextResponse } from 'next/server'
import { requireDriverFromRequest } from '@/lib/session'
import { updateRestaurantPassword, deleteRestaurant, updateRestaurantAssignment } from '@/lib/admin-restaurants'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDriverFromRequest(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'reset-password') {
      const res = await updateRestaurantPassword(id, String(body.password || ''))
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ ok: true })
    }

    if (action === 'assign') {
      const assignedDriverId = body.assignedDriverId ?? null
      const res = await updateRestaurantAssignment(
        id,
        typeof assignedDriverId === 'string' && assignedDriverId ? assignedDriverId : null,
      )
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
    await requireDriverFromRequest(req)
    const { id } = await params
    const res = await deleteRestaurant(id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
