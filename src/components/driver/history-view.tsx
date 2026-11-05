'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, History, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { StatusBadge } from '@/components/status-badge'
import { ScopeToggle, type Scope } from './scope-toggle'
import { formatTime, formatDateTime, formatDuration } from '@/lib/format'

export function HistoryView() {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('mine')
  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', 'driver', 'history', scope],
    queryFn: () => api.listDeliveries(undefined, scope),
    refetchInterval: 30000,
  })

  const deliveries = data?.deliveries || []

  const filtered = useMemo(() => {
    if (!query.trim()) return deliveries
    const q = query.toLowerCase()
    return deliveries.filter(
      (d) =>
        d.restaurantName.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q),
    )
  }, [deliveries, query])

  if (isLoading) {
    return (
      <Card className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">Historial de repartos</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ScopeToggle scope={scope} onChange={setScope} allLabel="Todo el equipo" />
          <div className="relative sm:w-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por restaurante o nº…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <History className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {query ? 'No se encontraron repartos' : 'Aún no hay repartos registrados'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 shadow-sm">
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Pedido</th>
                    <th className="px-5 py-3 font-semibold">Restaurante</th>
                    {scope === 'all' && <th className="px-5 py-3 font-semibold">Repartidor</th>}
                    <th className="px-5 py-3 font-semibold">Solicitado</th>
                    <th className="px-5 py-3 font-semibold">Aceptado</th>
                    <th className="px-5 py-3 font-semibold">Recogido</th>
                    <th className="px-5 py-3 font-semibold">Entregado</th>
                    <th className="px-5 py-3 font-semibold">Tiempo total</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-border hover:bg-muted/30"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-primary">
                        #{d.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-5 py-3 font-medium">{d.restaurantName}</td>
                      {scope === 'all' && (
                        <td className="px-5 py-3 text-muted-foreground">
                          {d.assignedDriverName || '—'}
                        </td>
                      )}
                      <td className="px-5 py-3 text-muted-foreground">{formatDateTime(d.requestedAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(d.acceptedAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(d.pickedUpAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(d.deliveredAt)}</td>
                      <td className="px-5 py-3 font-mono font-semibold">{formatDuration(d.totalMs)}</td>
                      <td className="px-5 py-3"><StatusBadge status={d.status} showDot={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3 scrollbar-thin md:hidden">
            {filtered.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs font-semibold text-primary">
                    #{d.id.slice(-6).toUpperCase()} · {d.restaurantName}
                  </p>
                  <StatusBadge status={d.status} showDot={false} />
                </div>
                {scope === 'all' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Repartidor: {d.assignedDriverName || '—'}
                  </p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Solicitado: {formatDateTime(d.requestedAt)}</span>
                  <span>Aceptado: {formatTime(d.acceptedAt)}</span>
                  <span>Recogido: {formatTime(d.pickedUpAt)}</span>
                  <span>Entregado: {formatTime(d.deliveredAt)}</span>
                  <span className="col-span-2 font-mono font-semibold text-foreground">
                    Tiempo total: {formatDuration(d.totalMs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
