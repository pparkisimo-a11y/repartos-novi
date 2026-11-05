import { NextResponse } from 'next/server'
import { requireDriverFromRequest } from '@/lib/session'
import { listDrivers, createDriver } from '@/lib/admin-drivers'

export async function GET(req: Request) {
  try {
    await requireDriverFromRequest(req)
    const drivers = await listDrivers()
    return NextResponse.json({ drivers })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}

export async function POST(req: Request) {
  try {
    await requireDriverFromRequest(req)
    const body = await req.json().catch(() => ({}))
    const res = await createDriver(body)
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status })
    }
    return NextResponse.json({ driver: res.driver }, { status: 201 })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
