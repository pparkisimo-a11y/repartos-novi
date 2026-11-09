import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionPct, applyCommission } from '@/lib/settings'

/**
 * Liquidación para el administrador (mes natural o periodo personalizado):
 *
 *   GET /api/admin/billing?month=YYYY-MM
 *   GET /api/admin/billing?from=<ISO UTC>&to=<ISO UTC>
 *   (ej. de jueves 19:00 a viernes 13:00, para pagar por turnos)
 *
 *   - Total de repartos y tarifa de CADA local (bruto)
 *   - Desglose por repartidor: lo que ha GENERADO (tarifa real), la COMISIÓN
 *     que se queda la plataforma y lo que VA A RECIBIR (bruto - comisión)
 *   - Comisión total del periodo = ingresos de la app
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
    const fromParam = searchParams.get('from') || ''
    const toParam = searchParams.get('to') || ''

    const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000
    let from: Date
    let to: Date
    let mode: 'month' | 'custom' = 'month'
    let monthKey: string | null = null

    if (fromParam || toParam) {
      // Periodo personalizado (p. ej. un turno: jue 19:00 → vie 13:00).
      // El cliente envía instantes UTC (toISOString) para evitar depender
      // de la zona horaria del servidor.
      const fromD = new Date(fromParam)
      const toD = new Date(toParam)
      if (
        !fromParam ||
        !toParam ||
        Number.isNaN(fromD.getTime()) ||
        Number.isNaN(toD.getTime())
      ) {
        return NextResponse.json({ error: 'Periodo no válido' }, { status: 400 })
      }
      if (fromD >= toD) {
        return NextResponse.json(
          { error: 'La fecha de inicio debe ser anterior a la de fin' },
          { status: 400 },
        )
      }
      if (toD.getTime() - fromD.getTime() > MAX_PERIOD_MS) {
        return NextResponse.json(
          { error: 'El periodo no puede abarcar más de un año' },
          { status: 400 },
        )
      }
      mode = 'custom'
      from = fromD
      to = toD
    } else {
      // Mes natural: validar YYYY-MM; por defecto, el mes actual
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
      monthKey = `${year}-${String(month).padStart(2, '0')}`
      from = new Date(Date.UTC(year, month - 1, 1))
      to = new Date(Date.UTC(year, month, 1))
    }

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
    // Resumen global por repartidor: añade el detalle reparto a reparto
    // (para el desglose día a día del admin)
    interface GlobalDriverAgg extends DriverAgg {
      deliveries: {
        id: string
        deliveredAt: Date
        restaurantName: string
        dropoffAddress: string | null
        distanceKm: number | null
        grossEur: number
        commissionEur: number
        netEur: number
      }[]
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
    const globalDriversMap = new Map<string, GlobalDriverAgg>()
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
          deliveries: [],
        }
      globalEntry.count += 1
      globalEntry.totalEur += gross
      globalEntry.commissionEur += commission
      globalEntry.netEur += net
      // Detalle para el desglose día a día (solo en el resumen global)
      globalEntry.deliveries.push({
        id: d.id,
        deliveredAt: d.deliveredAt as Date,
        restaurantName: d.restaurant.name,
        dropoffAddress: d.dropoffAddress,
        distanceKm: d.distanceKm,
        grossEur: gross,
        commissionEur: commission,
        netEur: net,
      })
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
      period: {
        mode,
        from: mode === 'custom' ? from.toISOString() : null,
        to: mode === 'custom' ? to.toISOString() : null,
      },
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
