'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, Bike, Clock, Timer, TrendingUp, Store, BarChart3 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import { formatDuration, formatDateShort } from '@/lib/format'

export function StatsView() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.stats(),
    refetchInterval: 30000,
  })

  if (isLoading || !data) {
    return (
      <Card className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  const { totals, byRestaurant, trend } = data

  const kpis = [
    {
      label: 'Pedidos hoy',
      value: String(totals.services),
      icon: Bike,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: 'Tiempo total',
      value: formatDuration(totals.totalMs),
      icon: Clock,
      tone: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Tiempo medio',
      value: formatDuration(totals.avgMs),
      icon: Timer,
      tone: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'En curso',
      value: String(totals.active),
      icon: TrendingUp,
      tone: 'bg-violet-100 text-violet-600',
    },
  ]

  const chartData = trend.map((t) => ({
    date: formatDateShort(t.date),
    count: t.count,
  }))

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Estadísticas</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-5">
                <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${k.tone}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="truncate text-2xl font-bold">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Trend chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Repartos por día (últimos 14 días)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#1F2937',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelStyle={{ color: '#6B7280' }}
                  cursor={{ fill: '#F3F4F6' }}
                />
                <Bar dataKey="count" name="Repartos" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-restaurant breakdown */}
      <Card className="overflow-hidden p-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4 text-primary" />
            Desglose por restaurante
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byRestaurant.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Aún no hay datos por restaurante
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Restaurante</th>
                    <th className="px-5 py-3 text-right font-semibold">Servicios</th>
                    <th className="px-5 py-3 text-right font-semibold">Tiempo total</th>
                    <th className="px-5 py-3 text-right font-semibold">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {byRestaurant.map((r) => (
                    <tr key={r.restaurantId} className="border-t border-border">
                      <td className="px-5 py-3 font-medium">{r.restaurantName}</td>
                      <td className="px-5 py-3 text-right font-semibold">{r.count}</td>
                      <td className="px-5 py-3 text-right font-mono">{formatDuration(r.totalMs)}</td>
                      <td className="px-5 py-3 text-right font-mono">{formatDuration(r.avgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
