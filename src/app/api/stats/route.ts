import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session || (session.role !== 'driver' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Repartidor: SUS repartos completados (los que él aceptó y entregó).
  // Admin: todos.
  const mine = session.role === 'admin' ? {} : { driverId: session.id }

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
  const totalEur = completed.reduce((acc, d) => acc + (d.fee ?? 0), 0)

  // Per-restaurant breakdown
  const byRestaurantMap = new Map<
    string,
    { name: string; count: number; totalMs: number; totalEur: number }
  >()
  for (const d of completed) {
    const key = d.restaurantId
    const entry =
      byRestaurantMap.get(key) || { name: d.restaurant.name, count: 0, totalMs: 0, totalEur: 0 }
    entry.count += 1
    entry.totalMs += new Date(d.deliveredAt!).getTime() - new Date(d.requestedAt).getTime()
    entry.totalEur += d.fee ?? 0
    byRestaurantMap.set(key, entry)
  }
  const byRestaurant = Array.from(byRestaurantMap.entries())
    .map(([id, v]) => ({
      restaurantId: id,
      restaurantName: v.name,
      count: v.count,
      totalMs: v.totalMs,
      avgMs: v.count > 0 ? Math.round(v.totalMs / v.count) : 0,
      totalEur: Math.round(v.totalEur * 100) / 100,
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

  // Pending/active count (mis restaurantes: peticiones sin tomar + mías en curso)
  const activeWhere =
    session.role === 'admin'
      ? { status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] as string[] } }
      : {
          OR: [
            { driverId: session.id },
            {
              driverId: null,
              restaurant: { drivers: { some: { driverId: session.id } } },
            },
          ],
          status: { in: ['PENDING', 'ACCEPTED', 'PICKED_UP'] as string[] },
        }
  const active = await db.delivery.count({ where: activeWhere })
  const pendingCount = await db.delivery.count({
    where: { ...activeWhere, status: 'PENDING' },
  })

  return NextResponse.json({
    totals: {
      services: totalServices,
      totalMs,
      avgMs,
      active,
      pending: pendingCount,
      totalEur: Math.round(totalEur * 100) / 100,
    },
    byRestaurant,
    trend,
  })
}
