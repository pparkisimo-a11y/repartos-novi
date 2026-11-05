import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { listLeads } from '@/lib/admin-leads'

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const leads = await listLeads()
    return NextResponse.json({ leads })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
