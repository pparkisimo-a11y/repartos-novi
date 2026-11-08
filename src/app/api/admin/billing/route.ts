import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionPct, applyCommission } from '@/lib/settings'

/**
 * Liquidación mensual para el administrador:
 *
 *   - Total de repartos y tarifa de CADA local (bruto)
 *   - Desglose por repartidor: lo que ha GENERADO (tarifa real), la COMISIÓN
 *     que se queda la plataforma y lo que VA A RECIBIR (bruto - comisión)
 *   - Comisión total del mes = ingresos de la app
 *   - Resumen global por repartidor (todos los locales juntos)
 *
 * Se calcula sobre los repartos ENTREGADOS (status DELIVERED) usando la
 * tarifa guardada en cada pedido al recogerlo (Delivery.fee). El neto se
 * calcula reparto a reparto con applyCommission para coincidir EXACTAMENTE
 * con lo que el repartidor ve en su panel.
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

    const commissionPct = await getCommissionPct()

    const deliveries = await db.delivery.findMany({
      where: { status: 'DELIVERED', deliveredAt: { gte: from, lt: to } },
      include: {
        restaurant: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    })

    const round2 = (n: number) => Math.round(n * 100) / 100

    interface DriverAgg {
      driverId: string | null
      driverName: string
      count: number
      totalEur: number // bruto generado
      commissionEur: number // comisión de la plataforma
      netEur: number // lo que recibe el repartidor
    }
    interface RestaurantAgg {
      restaurantId: string
      restaurantName: string
      count: number
      totalEur: number
      commissionEur: number
      netEur: number
      byDriver: Map<string, DriverAgg>
    }

    const restaurantsMap = new Map<string, RestaurantAgg>()
    const globalDriversMap = new Map<string, DriverAgg>()

    let totalCount = 0
    let grandTotalEur = 0
    let grandCommissionEur = 0
    let grandNetEur = 0

    for (const d of deliveries) {
      const gross = d.fee ?? 0
      // Mismo cálculo que ve el repartidor en su panel (redondeo por reparto)
      const net = applyCommission(d.fee, commissionPct) ?? 0
      const commission = round2(gross - net)

      // --- Agregado global ---
      totalCount += 1
      grandTotalEur += gross
      grandCommissionEur += commission
      grandNetEur += net

      // --- Por restaurante ---
      const rKey = d.restaurant.id
      const entry =
        restaurantsMap.get(rKey) ||
        {
          restaurantId: d.restaurant.id,
          restaurantName: d.restaurant.name,
          count: 0,
          totalEur: 0,
          commissionEur: 0,
          netEur: 0,
          byDriver: new Map(),
        }
      entry.count += 1
      entry.totalEur += gross
      entry.commissionEur += commission
      entry.netEur += net

      // --- Por repartidor dentro del restaurante ---
      const dKey = d.driverId ?? '__none__'
      const driverEntry =
        entry.byDriver.get(dKey) ||
        {
          driverId: d.driverId,
          driverName: d.driver?.name ?? 'Sin repartidor',
          count: 0,
          totalEur: 0,
          commissionEur: 0,
          netEur: 0,
        }
      driverEntry.count += 1
      driverEntry.totalEur += gross
      driverEntry.commissionEur += commission
      driverEntry.netEur += net
      entry.byDriver.set(dKey, driverEntry)

      // --- Resumen global por repartidor (todos los locales) ---
      const globalEntry =
        globalDriversMap.get(dKey) ||
        {
          driverId: d.driverId,
          driverName: d.driver?.name ?? 'Sin repartidor',
          count: 0,
          totalEur: 0,
          commissionEur: 0,
          netEur: 0,
        }
      globalEntry.count += 1
      globalEntry.totalEur += gross
      globalEntry.commissionEur += commission
      globalEntry.netEur += net
      globalDriversMap.set(dKey, globalEntry)

      restaurantsMap.set(rKey, entry)
    }

    const sortDrivers = (a: DriverAgg, b: DriverAgg) => b.netEur - a.netEur || b.totalEur - a.totalEur

    const restaurants = Array.from(restaurantsMap.values())
      .map((r) => ({
        restaurantId: r.restaurantId,
        restaurantName: r.restaurantName,
        count: r.count,
        totalEur: round2(r.totalEur),
        commissionEur: round2(r.commissionEur),
        netEur: round2(r.netEur),
        byDriver: Array.from(r.byDriver.values())
          .map((dr) => ({
            ...dr,
            totalEur: round2(dr.totalEur),
            commissionEur: round2(dr.commissionEur),
            netEur: round2(dr.netEur),
          }))
          .sort(sortDrivers),
      }))
      .sort((a, b) => b.totalEur - a.totalEur)

    const byDriver = Array.from(globalDriversMap.values())
      .map((dr) => ({
        ...dr,
        totalEur: round2(dr.totalEur),
        commissionEur: round2(dr.commissionEur),
        netEur: round2(dr.netEur),
      }))
      .sort(sortDrivers)

    return NextResponse.json({
      month: monthKey,
      commissionPct,
      totals: {
        count: totalCount,
        totalEur: round2(grandTotalEur),
        commissionEur: round2(grandCommissionEur),
        netEur: round2(grandNetEur),
      },
      restaurants,
      byDriver,
    })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
