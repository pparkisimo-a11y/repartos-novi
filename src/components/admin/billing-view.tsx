'use client'

import { Fragment, useState } from 'react'
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
  ChevronDown,
  FileDown,
  CalendarDays,
  MapPin,
  MoveRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  api,
  ApiError,
  getAuthToken,
  type BillingDriverDetail,
  type BillingPeriodQuery,
} from '@/lib/api-client'
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

/** Modo del selector de periodo: mes natural o rango personalizado. */
type PeriodMode = 'month' | 'custom'

/** Fecha/hora local → valor para <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** El turno típico: del jueves a las 19:00 al viernes a las 13:00
 *  (el más reciente; si está en marcha, hasta ahora). */
function lastShiftRange(): [Date, Date] {
  const now = new Date()
  const from = startOfLocalDay(now)
  from.setDate(from.getDate() - ((from.getDay() + 7 - 4) % 7)) // último jueves
  from.setHours(19, 0, 0, 0)
  if (from > now) from.setDate(from.getDate() - 7) // hoy todavía no eran las 19:00
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  to.setHours(13, 0, 0, 0)
  return [from, to > now ? new Date(now) : to]
}

/** Etiqueta corta de un rango: "jue, 12 nov 19:00 → vie, 13 nov 13:00". */
function customRangeLabel(from: Date, to: Date): string {
  const fd = from.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  const td = to.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  const ft = from.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const tt = to.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${fd} ${ft} → ${td} ${tt}`
}

type PresetKind = 'shift' | 'today' | 'yesterday' | 'week' | 'monthStart'

const PERIOD_PRESETS: { label: string; kind: PresetKind; hint: string }[] = [
  { label: 'Último turno', kind: 'shift', hint: 'Del jueves 19:00 al viernes 13:00 (el más reciente)' },
  { label: 'Hoy', kind: 'today', hint: 'Desde las 00:00 de hoy' },
  { label: 'Ayer', kind: 'yesterday', hint: 'Ayer de 00:00 a 24:00' },
  { label: 'Últimos 7 días', kind: 'week', hint: 'Desde hace una semana' },
  { label: 'Este mes', kind: 'monthStart', hint: 'Desde el día 1 del mes' },
]

/**
 * Liquidación: total por local, desglose por repartidor y suma total de
 * cada restaurante (lo que debe pagar cada local a sus repartidores).
 * Se puede consultar el mes natural o un periodo personalizado (p. ej.
 * un turno: del jueves 19:00 al viernes 13:00).
 */
export function BillingView() {
  const months = recentMonths(6)
  const [month, setMonth] = useState(months[0])
  const [mode, setMode] = useState<PeriodMode>('month')
  // Rango personalizado (valores de <input type="datetime-local">):
  // por defecto HOY (de 00:00 hasta ahora)
  const [fromDt, setFromDt] = useState(() => toLocalInputValue(startOfLocalDay(new Date())))
  const [toDt, setToDt] = useState(() => toLocalInputValue(new Date()))
  // Repartidores con el desglose día a día expandido (múltiples a la vez)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // driverId cuyo PDF se está generando (para el spinner del botón)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const customFrom = fromDt ? new Date(fromDt) : null
  const customTo = toDt ? new Date(toDt) : null
  const rangeOk =
    !!customFrom &&
    !!customTo &&
    !Number.isNaN(customFrom.getTime()) &&
    !Number.isNaN(customTo.getTime()) &&
    customFrom < customTo

  const periodQuery: BillingPeriodQuery =
    mode === 'custom' && rangeOk && customFrom && customTo
      ? { from: customFrom.toISOString(), to: customTo.toISOString() }
      : mode === 'custom'
        ? {}
        : { month }

  const periodLabel =
    mode === 'custom' && rangeOk && customFrom && customTo
      ? customRangeLabel(customFrom, customTo)
      : monthLabel(month)

  const setPresetRange = (kind: PresetKind) => {
    const now = new Date()
    let from: Date
    let to: Date
    if (kind === 'shift') {
      ;[from, to] = lastShiftRange()
    } else if (kind === 'today') {
      from = startOfLocalDay(now)
      to = now
    } else if (kind === 'yesterday') {
      from = startOfLocalDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      to = startOfLocalDay(now)
    } else if (kind === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      to = now
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = now
    }
    setFromDt(toLocalInputValue(from))
    setToDt(toLocalInputValue(to))
  }

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** Descarga la liquidación del repartidor en PDF (fetch + blob para que
   *  funcione también en iframes, donde la cookie httpOnly no llega). */
  async function downloadPdf(dr: BillingDriverDetail) {
    if (!dr.driverId) return
    setPdfBusy(dr.driverId)
    try {
      const token = getAuthToken()
      const res = await fetch(api.adminDriverBillingPdfUrl(dr.driverId, periodQuery), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.error || 'No se pudo generar el PDF', res.status)
      }
      const blob = await res.blob()
      // Nombre de archivo: del Content-Disposition del servidor, o generado
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="(.+)"/)
      const filename =
        match?.[1] ??
        `liquidacion-${dr.driverName.toLowerCase().replace(/\s+/g, '-')}-${periodLabel}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Liquidación en PDF descargada', {
        description: `${dr.driverName} · ${periodLabel}`,
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al generar el PDF')
    } finally {
      setPdfBusy(null)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'billing', mode, periodQuery.month ?? '', periodQuery.from ?? '', periodQuery.to ?? ''],
    queryFn: () => api.adminBilling(periodQuery),
    enabled: mode === 'month' || rangeOk,
    refetchInterval: 60000,
  })

  return (
    <div className="space-y-6">
      <CommissionCard />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Liquidación</h2>
          <p className="text-sm text-muted-foreground">
            {mode === 'custom'
              ? 'Totales de cada local del periodo, desglosados por repartidor.'
              : 'Totales de cada local del mes, desglosados por repartidor.'}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => {
              if (v === 'month' || v === 'custom') setMode(v)
            }}
            aria-label="Tipo de periodo de la liquidación"
            className="max-w-full"
          >
            <ToggleGroupItem
              value="month"
              className="flex-none whitespace-nowrap px-3 text-xs sm:text-sm"
            >
              Mes
            </ToggleGroupItem>
            <ToggleGroupItem
              value="custom"
              className="flex-none whitespace-nowrap px-3 text-xs sm:text-sm"
            >
              Periodo personalizado
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === 'month' && (
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
          )}
        </div>
      </div>

      {mode === 'custom' && (
        <Card className="shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end lg:gap-2">
              <div>
                <Label htmlFor="liq-from">Desde</Label>
                <Input
                  id="liq-from"
                  type="datetime-local"
                  value={fromDt}
                  onChange={(e) => setFromDt(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <MoveRight
                className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground lg:block lg:translate-y-2"
                aria-hidden="true"
              />
              <div>
                <Label htmlFor="liq-to">Hasta</Label>
                <Input
                  id="liq-to"
                  type="datetime-local"
                  value={toDt}
                  onChange={(e) => setToDt(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Atajos:</span>
              {PERIOD_PRESETS.map((p) => (
                <Button
                  key={p.kind}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  title={p.hint}
                  onClick={() => setPresetRange(p.kind)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {fromDt && toDt && !rangeOk && (
              <p className="text-sm text-destructive" role="alert">
                La fecha de inicio debe ser anterior a la de fin.
              </p>
            )}
            {rangeOk && (
              <p className="text-xs text-muted-foreground sm:text-sm">
                Periodo:{' '}
                <span className="font-medium text-foreground">{periodLabel}</span> · se suman
                los repartos entregados en ese intervalo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading || !data ? (
        <Card className="flex h-40 items-center justify-center">
          {mode === 'custom' && fromDt && toDt && !rangeOk ? (
            <p className="px-6 text-center text-sm text-muted-foreground">
              Corrige el periodo (la fecha de inicio debe ser anterior a la de fin) para ver la
              liquidación.
            </p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
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
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {mode === 'custom' ? 'Total del periodo' : 'Total del mes'}
                  </p>
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
                  <span className="font-semibold">Cómo se reparte el dinero del periodo</span>
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

          {/* Resumen por repartidor (expandible: detalle día a día) */}
          {data.byDriver.length > 0 ? (
            <Card className="overflow-hidden p-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bike className="h-4 w-4 text-primary" />
                  Lo que va a recibir cada repartidor
                </CardTitle>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Todos los locales juntos en {periodLabel}: generado, comisión de la
                  app ({data.commissionPct}%) y neto a recibir. Pulsa en un repartidor para ver su
                  desglose día a día o descarga su liquidación en PDF.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {/* Móvil: filas apiladas expandibles (sin scroll horizontal) */}
                <div className="divide-y divide-border md:hidden">
                  {data.byDriver.map((dr) => (
                    <DriverMobileRow
                      key={dr.driverId ?? 'none'}
                      dr={dr}
                      periodLabel={periodLabel}
                      expanded={expanded.has(dr.driverId ?? 'none')}
                      onToggle={() => toggleExpanded(dr.driverId ?? 'none')}
                      onPdf={() => downloadPdf(dr)}
                      pdfBusy={pdfBusy === (dr.driverId ?? 'none')}
                    />
                  ))}
                </div>
                {/* Escritorio: tabla completa expandible */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/80 backdrop-blur">
                      <tr className="text-left uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 font-semibold">Repartidor</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Repartos</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Generado</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Comisión app</th>
                        <th className="px-5 py-2.5 text-right font-semibold">A recibir</th>
                        <th className="px-5 py-2.5 text-right font-semibold">
                          <span className="sr-only">Liquidación PDF</span>
                          PDF
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDriver.map((dr) => {
                        const key = dr.driverId ?? 'none'
                        return (
                          <Fragment key={key}>
                            <tr
                              className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
                              onClick={() => toggleExpanded(key)}
                            >
                              <td className="px-5 py-3 font-medium">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 text-left"
                                  aria-expanded={expanded.has(key)}
                                  aria-label={`Ver desglose de ${dr.driverName}`}
                                >
                                  <Bike className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{dr.driverName}</span>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                                      expanded.has(key) ? 'rotate-180' : ''
                                    }`}
                                  />
                                </button>
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
                              <td className="px-5 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 px-2.5"
                                  disabled={pdfBusy === key || !dr.driverId}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    downloadPdf(dr)
                                  }}
                                  aria-label={`Descargar liquidación en PDF de ${dr.driverName}`}
                                >
                                  {pdfBusy === key ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileDown className="h-3.5 w-3.5" />
                                  )}
                                  PDF
                                </Button>
                              </td>
                            </tr>
                            {expanded.has(key) && (
                              <tr className="border-t border-border/60 bg-muted/20">
                                <td colSpan={6} className="px-5 py-4">
                                  <DriverDayBreakdown dr={dr} periodLabel={periodLabel} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
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
                periodo consultado y sobre cada tarifa se descuenta el{' '}
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
                  Sin repartos completados en {periodLabel}
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

/* ------------------------------------------------------------------ */
/* Desglose día a día de un repartidor (contenido expandido)           */
/* ------------------------------------------------------------------ */

interface DayGroup {
  key: string
  label: string
  rows: BillingDriverDetail['deliveries']
  grossEur: number
  netEur: number
}

/** Agrupa los repartos de un repartidor por día de entrega (día LOCAL,
 *  para que un reparto de madrugada cuente en el día correcto). */
function groupByDay(deliveries: BillingDriverDetail['deliveries']): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const d of deliveries) {
    const date = new Date(d.deliveredAt)
    const p = (n: number) => String(n).padStart(2, '0')
    const key = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        label: date.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        rows: [],
        grossEur: 0,
        netEur: 0,
      }
      map.set(key, g)
    }
    g.rows.push(d)
    g.grossEur += d.grossEur
    g.netEur += d.netEur
  }
  return Array.from(map.values())
}

function DriverDayBreakdown({ dr, periodLabel }: { dr: BillingDriverDetail; periodLabel: string }) {
  const days = groupByDay(dr.deliveries)
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day.key} className="overflow-hidden rounded-lg border border-border bg-card">
          {/* Cabecera del día: fecha + subtotal */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-muted/60 px-3 py-2 sm:px-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>{day.label.charAt(0).toUpperCase() + day.label.slice(1)}</span>
              <span className="font-normal normal-case">
                · {day.rows.length} reparto{day.rows.length === 1 ? '' : 's'}
              </span>
            </p>
            <p className="text-xs sm:text-sm">
              <span className="font-semibold tabular-nums text-emerald-600">
                {formatEur(day.grossEur)}
              </span>{' '}
              <span className="text-muted-foreground">
                generado · <span className="font-bold tabular-nums text-amber-600">{formatEur(day.netEur)}</span> a
                recibir
              </span>
            </p>
          </div>
          {/* Repartos del día */}
          <div className="divide-y divide-border/70">
            {day.rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(r.deliveredAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {' '}{r.restaurantName}
                  </p>
                  {r.dropoffAddress && (
                    <p className="mt-0.5 flex min-w-0 items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="truncate">{r.dropoffAddress}</span>
                      {r.distanceKm != null && (
                        <span className="shrink-0">
                          {' '}
                          ({r.distanceKm.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km)
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <p className="shrink-0 whitespace-nowrap text-sm sm:text-right">
                  <span className="font-semibold tabular-nums text-emerald-600">
                    {formatEur(r.grossEur)}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    − {formatEur(r.commissionEur)} ={' '}
                  </span>
                  <span className="font-bold tabular-nums text-amber-600">
                    {formatEur(r.netEur)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* Total del mes (cierra el desglose) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border bg-muted/40 px-3 py-2.5 sm:px-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Total de {periodLabel}
        </p>
        <p className="text-sm">
          <span className="font-bold tabular-nums text-emerald-600">{formatEur(dr.totalEur)}</span>
          <span className="text-muted-foreground">
            {' '}
            generado − {formatEur(dr.commissionEur)} ={' '}
          </span>
          <span className="text-base font-bold tabular-nums text-amber-600">
            {formatEur(dr.netEur)}
          </span>
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fila móvil de repartidor (expandible)                               */
/* ------------------------------------------------------------------ */

function DriverMobileRow({
  dr,
  periodLabel,
  expanded,
  onToggle,
  onPdf,
  pdfBusy,
}: {
  dr: BillingDriverDetail
  periodLabel: string
  expanded: boolean
  onToggle: () => void
  onPdf: () => void
  pdfBusy: boolean
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Bike className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{dr.driverName}</p>
            <p className="text-xs text-muted-foreground">
              {dr.count} reparto{dr.count === 1 ? '' : 's'} · generado{' '}
              <span className="font-semibold text-foreground">{formatEur(dr.totalEur)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold leading-tight tabular-nums text-amber-600">
              {formatEur(dr.netEur)}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">a recibir</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3">
          <DriverDayBreakdown dr={dr} periodLabel={periodLabel} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={pdfBusy || !dr.driverId}
            onClick={onPdf}
          >
            {pdfBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Descargar liquidación PDF
          </Button>
        </div>
      )}
    </div>
  )
}
