import { NextResponse } from 'next/server'
import { requireDriverFromRequest } from '@/lib/session'
import { convertLead } from '@/lib/admin-leads'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDriverFromRequest(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const res = await convertLead(id, body)
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status })
    }
    return NextResponse.json(
      { lead: res.lead, restaurant: res.restaurant },
      { status: 201 },
    )
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
