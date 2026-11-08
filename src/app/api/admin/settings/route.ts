import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionPct, setCommissionPct } from '@/lib/settings'

/** GET /api/admin/settings → { commissionPct } */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const commissionPct = await getCommissionPct()
    return NextResponse.json({ commissionPct })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}

/** PATCH /api/admin/settings → { commissionPct: number } body → { commissionPct } */
export async function PATCH(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = await req.json().catch(() => ({}))
    const value = Number(body.commissionPct)
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json(
        { error: 'La comisión debe ser un porcentaje entre 0 y 100' },
        { status: 400 },
      )
    }
    await setCommissionPct(value)
    return NextResponse.json({ commissionPct: value })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
