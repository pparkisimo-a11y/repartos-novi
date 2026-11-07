import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionEur, setCommissionEur } from '@/lib/settings'

/** GET /api/admin/settings → { commissionEur } */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const commissionEur = await getCommissionEur()
    return NextResponse.json({ commissionEur })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}

/** PATCH /api/admin/settings → { commissionEur: number } body → { commissionEur } */
export async function PATCH(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = await req.json().catch(() => ({}))
    const value = Number(body.commissionEur)
    if (!Number.isFinite(value) || value < 0 || value > 50) {
      return NextResponse.json(
        { error: 'La comisión debe ser un número entre 0 y 50 €' },
        { status: 400 },
      )
    }
    await setCommissionEur(value)
    return NextResponse.json({ commissionEur: value })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
