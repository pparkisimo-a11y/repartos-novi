'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Receipt,
  Store,
  Bike,
  Euro,
  Package,
  Loader2,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api-client'
import { formatEur, feeExplanation } from '@/lib/fees'

/** Últimos N meses como opciones YYYY-MM (más reciente primero). */
function recentMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Liquidación mensual: total por local, desglose por repartidor y suma total
 * de cada restaurante (lo que debe pagar cada local a sus repartidores).
 */
export function BillingView() {
  const months = recentMonths(6)
  const [month, setMonth] = useState(months[0])

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'billing', month],
    queryFn: () => api.adminBilling(month),
    refetchInterval: 60000,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Liquidación</h2>
          <p className="text-sm text-muted-foreground">
            Totales de cada local del mes, desglosados por repartidor.
          </p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Mes de la liquidación">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <Card className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          {/* Totales del mes */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 sm:h-12 sm:w-12">
                  <Euro className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">Total del mes</p>
                  <p className="text-xl font-bold leading-tight tabular-nums text-emerald-600 sm:text-2xl">
                    {formatEur(data.totals.totalEur)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12">
                  <Package className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">Repartos entregados</p>
                  <p className="text-xl font-bold leading-tight tabular-nums sm:text-2xl">
                    {data.totals.count}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cómo se calcula */}
          <Card className="border-border bg-muted/30">
            <CardContent className="flex items-start gap-3 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground sm:text-sm">
                <strong className="text-foreground">Tarifa por reparto:</strong>{' '}
                {feeExplanation()}. La tarifa se guarda con cada pedido al
                recogerlo (distancia del local a la dirección de entrega) y aquí
                se suman los repartos <strong className="text-foreground">entregados</strong> del mes.
              </p>
            </CardContent>
          </Card>

          {/* Desglose por local */}
          {data.restaurants.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Sin repartos completados en {monthLabel(data.month)}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.restaurants.map((r) => (
                <Card key={r.restaurantId} className="overflow-hidden p-0 shadow-sm">
                  <CardHeader className="flex-row items-center justify-between space-y-0 bg-muted/50 px-5 py-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Store className="h-4 w-4 text-primary" />
                      {r.restaurantName}
                    </CardTitle>
                    <div className="text-right">
                      <p className="text-lg font-bold leading-tight tabular-nums text-emerald-600">
                        {formatEur(r.totalEur)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.count} reparto{r.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-5 py-2.5 font-semibold">Repartidor</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Repartos</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.byDriver.map((dr) => (
                          <tr key={dr.driverId ?? 'none'} className="border-b border-border/60 last:border-0">
                            <td className="px-5 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <Bike className="h-3.5 w-3.5 text-muted-foreground" />
                                {dr.driverName}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                              {dr.count}
                            </td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                              {formatEur(dr.totalEur)}
                            </td>
                          </tr>
                        ))}
                        {/* Suma de todos los repartidores = total del local */}
                        {r.byDriver.length > 1 && (
                          <tr className="border-t-2 border-border bg-muted/40">
                            <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Total {r.restaurantName}
                            </td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                              {r.count}
                            </td>
                            <td className="px-5 py-2.5 text-right font-bold tabular-nums text-emerald-600">
                              {formatEur(r.totalEur)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
