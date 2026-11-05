import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { updateDriverPassword, updateDriverName, deleteDriver } from '@/lib/admin-drivers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdminFromRequest(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'reset-password') {
      const res = await updateDriverPassword(id, String(body.password || ''))
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ ok: true })
    }

    if (action === 'rename') {
      const res = await updateDriverName(id, String(body.name || ''))
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      return NextResponse.json({ ok: true })
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
    const session = await requireAdminFromRequest(req)
    const { id } = await params
    const res = await deleteDriver(id, session)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
