'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Receipt,
  Store,
  Bike,
  Euro,
  Package,
  Loader2,
  Info,
  Settings,
  Wallet,
  PiggyBank,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
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
 * Para cada importe se muestra también la comisión de la plataforma y el
 * neto que va a recibir cada repartidor (bruto - comisión).
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
      <CommissionCard />

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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
                  <PiggyBank className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">Comisión app</p>
                  <p className="text-xl font-bold leading-tight tabular-nums text-primary sm:text-2xl">
                    {formatEur(data.totals.commissionEur)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 sm:h-12 sm:w-12">
                  <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">A repartidores</p>
                  <p className="text-xl font-bold leading-tight tabular-nums text-amber-600 sm:text-2xl">
                    {formatEur(data.totals.netEur)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 sm:h-12 sm:w-12">
                  <Package className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">Repartos</p>
                  <p className="text-xl font-bold leading-tight tabular-nums sm:text-2xl">
                    {data.totals.count}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reparto del dinero: repartidores vs app */}
          {data.totals.totalEur > 0 && (
            <Card className="border-border bg-muted/30">
              <CardContent className="space-y-2.5 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="font-semibold">Cómo se reparte el dinero del mes</span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                      Repartidores {formatEur(data.totals.netEur)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                      App {formatEur(data.totals.commissionEur)}
                    </span>
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-amber-500"
                    style={{
                      width: `${(data.totals.netEur / data.totals.totalEur) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${(data.totals.commissionEur / data.totals.totalEur) * 100}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resumen por repartidor */}
          {data.byDriver.length > 0 ? (
            <Card className="overflow-hidden p-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bike className="h-4 w-4 text-primary" />
                  Lo que va a recibir cada repartidor
                </CardTitle>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Todos los locales juntos en {monthLabel(data.month)}: generado, comisión de la
                  app ({data.commissionPct}%) y neto a recibir.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {/* Móvil: filas apiladas (sin scroll horizontal) */}
                <div className="divide-y divide-border md:hidden">
                  {data.byDriver.map((dr) => (
                    <div
                      key={dr.driverId ?? 'none'}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Bike className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{dr.driverName}</p>
                          <p className="text-xs text-muted-foreground">
                            {dr.count} reparto{dr.count === 1 ? '' : 's'} · generado{' '}
                            <span className="font-semibold text-foreground">
                              {formatEur(dr.totalEur)}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold leading-tight tabular-nums text-amber-600">
                          {formatEur(dr.netEur)}
                        </p>
                        <p className="text-[11px] leading-tight text-muted-foreground">
                          a recibir
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Escritorio: tabla completa */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/80 backdrop-blur">
                      <tr className="text-left uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 font-semibold">Repartidor</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Repartos</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Generado</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Comisión app</th>
                        <th className="px-5 py-2.5 text-right font-semibold">A recibir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDriver.map((dr) => (
                        <tr key={dr.driverId ?? 'none'} className="border-t border-border">
                          <td className="px-5 py-3 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <Bike className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              {dr.driverName}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                            {dr.count}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">
                            {formatEur(dr.totalEur)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-muted-foreground">
                            {formatEur(dr.commissionEur)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums text-amber-600">
                            {formatEur(dr.netEur)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Cómo se calcula */}
          <Card className="border-border bg-muted/30">
            <CardContent className="flex items-start gap-3 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground sm:text-sm">
                <strong className="text-foreground">Tarifa por reparto:</strong>{' '}
                {feeExplanation()}. La tarifa se guarda con cada pedido al
                recogerlo (distancia del local a la dirección de entrega). Se
                suman los repartos <strong className="text-foreground">entregados</strong> del
                mes y sobre cada tarifa se descuenta el{' '}
                <strong className="text-foreground">{data.commissionPct}%</strong> de comisión:
                el resto es lo que recibe el repartidor.
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
                  <CardHeader className="space-y-1 bg-muted/50 px-4 py-4 sm:px-5">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Store className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{r.restaurantName}</span>
                    </CardTitle>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-xs text-muted-foreground">
                        {r.count} reparto{r.count === 1 ? '' : 's'} ·{' '}
                        <span className="text-primary">
                          app {formatEur(r.commissionEur)}
                        </span>
                      </span>
                      <span className="text-sm">
                        <span className="font-bold tabular-nums text-emerald-600">
                          {formatEur(r.totalEur)}
                        </span>{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          · a repartidores {formatEur(r.netEur)}
                        </span>
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Móvil: filas apiladas (sin scroll horizontal) */}
                    <div className="divide-y divide-border sm:hidden">
                      {r.byDriver.map((dr) => (
                        <div
                          key={dr.driverId ?? 'none'}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Bike className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{dr.driverName}</p>
                              <p className="text-xs text-muted-foreground">
                                {dr.count} reparto{dr.count === 1 ? '' : 's'} · generado{' '}
                                <span className="font-semibold text-foreground">
                                  {formatEur(dr.totalEur)}
                                </span>
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-amber-600">
                            {formatEur(dr.netEur)}
                          </p>
                        </div>
                      ))}
                      {r.byDriver.length > 1 && (
                        <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Total · {r.count} repartos
                          </p>
                          <p className="text-sm">
                            <span className="font-bold tabular-nums text-emerald-600">
                              {formatEur(r.totalEur)}
                            </span>{' '}
                            <span className="text-xs text-muted-foreground">
                              → {formatEur(r.netEur)}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Escritorio: tabla completa */}
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2.5 font-semibold lg:px-4">Repartidor</th>
                            <th className="whitespace-nowrap px-2 py-2.5 text-right font-semibold lg:px-4">Repartos</th>
                            <th className="whitespace-nowrap px-2 py-2.5 text-right font-semibold lg:px-4">Generado</th>
                            <th className="whitespace-nowrap px-2 py-2.5 text-right font-semibold lg:px-4">A recibir</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.byDriver.map((dr) => (
                            <tr
                              key={dr.driverId ?? 'none'}
                              className="border-b border-border/60 last:border-0"
                            >
                              <td className="px-3 py-2.5 lg:px-4">
                                <span className="inline-flex items-center gap-1.5">
                                  <Bike className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{dr.driverName}</span>
                                </span>
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground lg:px-4">
                                {dr.count}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums lg:px-4">
                                {formatEur(dr.totalEur)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right font-bold tabular-nums text-amber-600 lg:px-4">
                                {formatEur(dr.netEur)}
                              </td>
                            </tr>
                          ))}
                          {/* Suma de todos los repartidores = total del local */}
                          {r.byDriver.length > 1 && (
                            <tr className="border-t-2 border-border bg-muted/40">
                              <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:px-4">
                                Total
                              </td>
                              <td className="px-2 py-2.5 text-right font-semibold tabular-nums lg:px-4">
                                {r.count}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right font-bold tabular-nums text-emerald-600 lg:px-4">
                                {formatEur(r.totalEur)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right font-bold tabular-nums text-amber-600 lg:px-4">
                                {formatEur(r.netEur)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
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

/**
 * Comisión de la plataforma: porcentaje que el admin descuenta de cada
 * reparto. El admin ve la tarifa real; repartidores y restaurantes ven la
 * tarifa ya descontada (lo que cobran / lo que pagan).
 */
function CommissionCard() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState('')

  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.adminGetSettings(),
  })
  const commissionPct = data?.commissionPct ?? 0

  function startEdit() {
    setValue(String(commissionPct))
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('La comisión debe ser un porcentaje entre 0 y 100')
      return
    }
    setSaving(true)
    try {
      await api.adminSetCommission(n)
      toast.success('Comisión actualizada', {
        description:
          n > 0
            ? `Se descuenta el ${n}% de cada reparto para los repartidores. El restaurante y el admin ven la tarifa real.`
            : 'Comisión desactivada: todos ven la tarifa real.',
      })
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      // Los repartos en curso también cambian (la tarifa neta depende de la comisión)
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary sm:h-12 sm:w-12">
            <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
              Comisión de la plataforma
            </p>
            {editing ? (
              <form onSubmit={handleSave} className="mt-1 flex items-center gap-2">
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                  className="h-9 w-20"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">% por reparto</span>
              </form>
            ) : (
              <p className="text-xl font-bold leading-tight tabular-nums sm:text-2xl">
                {commissionPct}%{' '}
                <span className="text-sm font-normal text-muted-foreground">de comisión</span>
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Se descuenta del reparto para los repartidores. El restaurante y
              el admin ven siempre la tarifa real.
            </p>
          </div>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Cambiar
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
