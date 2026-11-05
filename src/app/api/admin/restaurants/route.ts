import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/session'
import { listRestaurants, createRestaurant } from '@/lib/admin-restaurants'

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const restaurants = await listRestaurants()
    return NextResponse.json({ restaurants })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = await req.json().catch(() => ({}))
    const res = await createRestaurant(body)
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status })
    }
    return NextResponse.json({ restaurant: res.restaurant }, { status: 201 })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
