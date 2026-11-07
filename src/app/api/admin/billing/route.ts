import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminFromRequest } from '@/lib/session'

/**
 * Liquidación mensual para el administrador:
 *
 *   - Total de repartos y de tarifa de CADA local
 *   - Si un local ha tenido varios repartidores: total de cada uno
 *   - Suma total de todos los repartos del local (lo que debe el local)
 *
 * Se calcula sobre los repartos ENTREGADOS (status DELIVERED) usando la
 * tarifa guardada en cada pedido al recogerlo (Delivery.fee).
 */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)

    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get('month') || ''

    // Validar YYYY-MM; por defecto, el mes actual
    let year: number
    let month: number // 1-12
    if (/^\d{4}-\d{2}$/.test(monthParam)) {
      year = Number(monthParam.slice(0, 4))
      month = Number(monthParam.slice(5, 7))
      if (month < 1 || month > 12 || year < 2020 || year > 2100) {
        return NextResponse.json({ error: 'Mes no válido' }, { status: 400 })
      }
    } else {
      const now = new Date()
      year = now.getUTCFullYear()
      month = now.getUTCMonth() + 1
    }
    const monthKey = `${year}-${String(month).padStart(2, '0')}`
    const from = new Date(Date.UTC(year, month - 1, 1))
    const to = new Date(Date.UTC(year, month, 1))

    const deliveries = await db.delivery.findMany({
      where: { status: 'DELIVERED', deliveredAt: { gte: from, lt: to } },
      include: {
        restaurant: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    })

    const round2 = (n: number) => Math.round(n * 100) / 100

    // Agrupar por restaurante → por repartidor
    const restaurantsMap = new Map<
      string,
      {
        restaurantId: string
        restaurantName: string
        count: number
        totalEur: number
        byDriver: Map<string, { driverId: string | null; driverName: string; count: number; totalEur: number }>
      }
    >()

    for (const d of deliveries) {
      const rKey = d.restaurant.id
      const entry =
        restaurantsMap.get(rKey) ||
        {
          restaurantId: d.restaurant.id,
          restaurantName: d.restaurant.name,
          count: 0,
          totalEur: 0,
          byDriver: new Map(),
        }
      entry.count += 1
      entry.totalEur += d.fee ?? 0

      const dKey = d.driverId ?? '__none__'
      const driverEntry =
        entry.byDriver.get(dKey) ||
        {
          driverId: d.driverId,
          driverName: d.driver?.name ?? 'Sin repartidor',
          count: 0,
          totalEur: 0,
        }
      driverEntry.count += 1
      driverEntry.totalEur += d.fee ?? 0
      entry.byDriver.set(dKey, driverEntry)

      restaurantsMap.set(rKey, entry)
    }

    const restaurants = Array.from(restaurantsMap.values())
      .map((r) => ({
        restaurantId: r.restaurantId,
        restaurantName: r.restaurantName,
        count: r.count,
        totalEur: round2(r.totalEur),
        byDriver: Array.from(r.byDriver.values())
          .map((dr) => ({ ...dr, totalEur: round2(dr.totalEur) }))
          .sort((a, b) => b.totalEur - a.totalEur),
      }))
      .sort((a, b) => b.totalEur - a.totalEur)

    const totalCount = deliveries.length
    const grandTotalEur = round2(deliveries.reduce((acc, d) => acc + (d.fee ?? 0), 0))

    return NextResponse.json({
      month: monthKey,
      totals: { count: totalCount, totalEur: grandTotalEur },
      restaurants,
    })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
