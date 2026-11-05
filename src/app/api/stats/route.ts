import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || (session.role !== 'driver' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Drivers only see their assigned restaurants; admins see everything.
  const mine = session.role === 'admin' ? {} : { restaurant: { assignedDriverId: session.id } }

  const deliveries = await db.delivery.findMany({
    where: { ...mine, status: 'DELIVERED' },
    include: { restaurant: { select: { name: true } } },
    orderBy: { deliveredAt: 'desc' },
  })

  const completed = deliveries.filter((d) => d.deliveredAt && d.requestedAt)
  const totalServices = completed.length
  const totalMs = completed.reduce(
    (acc, d) => acc + (new Date(d.deliveredAt!).getTime() - new Date(d.requestedAt).getTime()),
    0,
  )
  const avgMs = totalServices > 0 ? Math.round(totalMs / totalServices) : 0

  // Per-restaurant breakdown
  const byRestaurantMap = new Map<string, { name: string; count: number; totalMs: number }>()
  for (const d of completed) {
    const key = d.restaurantId
    const entry = byRestaurantMap.get(key) || { name: d.restaurant.name, count: 0, totalMs: 0 }
    entry.count += 1
    entry.totalMs += new Date(d.deliveredAt!).getTime() - new Date(d.requestedAt).getTime()
    byRestaurantMap.set(key, entry)
  }
  const byRestaurant = Array.from(byRestaurantMap.entries())
    .map(([id, v]) => ({
      restaurantId: id,
      restaurantName: v.name,
      count: v.count,
      totalMs: v.totalMs,
      avgMs: v.count > 0 ? Math.round(v.totalMs / v.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Last 14 days trend (services per day)
  const trendMap = new Map<string, number>()
  for (const d of completed) {
    const day = new Date(d.deliveredAt!).toISOString().slice(0, 10)
    trendMap.set(day, (trendMap.get(day) || 0) + 1)
  }
  const today = new Date()
  const trend: { date: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    trend.push({ date: key, count: trendMap.get(key) || 0 })
  }

  // Pending/active count
  const active = await db.delivery.count({
    where: { ...mine, status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] } },
  })
  const pendingCount = await db.delivery.count({ where: { ...mine, status: 'PENDING' } })

  return NextResponse.json({
    totals: {
      services: totalServices,
      totalMs,
      avgMs,
      active,
      pending: pendingCount,
    },
    byRestaurant,
    trend,
  })
}
