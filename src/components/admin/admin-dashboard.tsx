'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  UserPlus,
  Store,
  Users,
  ClipboardList,
  BarChart3,
  Bike,
  Clock,
  Timer,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Inbox,
  Receipt,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import type { AdminUser, DeliveryDTO } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'
import { ManageLeads } from '@/components/admin/manage-leads'
import { ManageRestaurants } from '@/components/admin/manage-restaurants'
import { ManageDrivers } from '@/components/admin/manage-drivers'
import { BillingView } from '@/components/admin/billing-view'
import { HistoryView } from '@/components/shared/history-view'
import { StatsView } from '@/components/shared/stats-view'
import { AppShell, type NavItem } from '@/components/layout/app-shell'
import { formatTime, formatDuration } from '@/lib/format'
import { formatEur } from '@/lib/fees'

type View = 'resumen' | 'solicitudes' | 'restaurantes' | 'repartidores' | 'liquidacion' | 'historial' | 'estadisticas'

/**
 * Panel de administración: gestión de locales captados (leads), restaurantes,
 * repartidores y visión global de actividad y estadísticas.
 * Los repartidores ya no tienen acceso a estas funciones.
 */
export function AdminDashboard({
  user,
  onLogout,
}: {
  user: Extract<AdminUser, { role: 'admin' }>
  onLogout: () => void
}) {
  const [view, setView] = useState<View>('resumen')

  const { data: leadsData } = useQuery({
    queryKey: ['admin', 'leads'],
    queryFn: () => api.adminListLeads(),
    refetchInterval: 60000,
  })
  const pendingLeads = (leadsData?.leads || []).filter((l) => l.status === 'PENDING').length

  const { data: driversData } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers(),
    refetchInterval: 60000,
  })
  const driverCount = driversData?.drivers.length || 0

  const navItems: NavItem[] = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'solicitudes', label: 'Solicitudes', icon: UserPlus, badge: pendingLeads },
    { id: 'restaurantes', label: 'Restaurantes', icon: Store },
    { id: 'repartidores', label: 'Repartidores', icon: Users },
    { id: 'liquidacion', label: 'Liquidación', icon: Receipt },
    { id: 'historial', label: 'Historial', icon: ClipboardList },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  ]

  const header = (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {user.name} · gestión de locales, equipo y captación
        </p>
      </div>
    </div>
  )

  return (
    <AppShell
      navItems={navItems}
      activeView={view}
      onChangeView={(v) => setView(v as View)}
      onLogout={onLogout}
      header={header}
    >
      {view === 'resumen' && <ResumenView pendingLeads={pendingLeads} driverCount={driverCount} />}
      {view === 'solicitudes' && <ManageLeads />}
      {view === 'restaurantes' && <ManageRestaurants />}
      {view === 'repartidores' && <ManageDrivers />}
      {view === 'liquidacion' && <BillingView />}
      {view === 'historial' && <HistoryView fixedScope="all" />}
      {view === 'estadisticas' && <StatsView />}
    </AppShell>
  )
}

function ResumenView({
  pendingLeads,
  driverCount,
}: {
  pendingLeads: number
  driverCount: number
}) {
  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.stats(),
    refetchInterval: 30000,
  })
  const { data: activeData } = useQuery({
    queryKey: ['deliveries', 'admin', 'active'],
    queryFn: () => api.listDeliveries('active', 'all'),
    refetchInterval: 30000,
  })
  const { data: restaurantsData } = useQuery({
    queryKey: ['admin', 'restaurants'],
    queryFn: () => api.adminListRestaurants(),
    refetchInterval: 60000,
  })

  const totals = statsData?.totals
  const active = activeData?.deliveries || []
  const inProgress = active.filter((d) => ['ACCEPTED', 'PICKED_UP'].includes(d.status))
  const restaurantCount = restaurantsData?.restaurants.length || 0

  const kpis = [
    {
      label: 'Servicios completados',
      value: loadingStats ? '…' : String(totals?.services ?? 0),
      icon: Bike,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: 'Tiempo medio',
      value: loadingStats ? '…' : formatDuration(totals?.avgMs ?? 0),
      icon: Timer,
      tone: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'En curso ahora',
      value: String(inProgress.length),
      icon: TrendingUp,
      tone: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Restaurantes',
      value: String(restaurantCount),
      icon: Store,
      tone: 'bg-rose-100 text-rose-600',
    },
    {
      label: 'Repartidores',
      value: String(driverCount),
      icon: Users,
      tone: 'bg-violet-100 text-violet-600',
    },
    {
      label: 'Solicitudes nuevas',
      value: String(pendingLeads),
      icon: UserPlus,
      tone: 'bg-sky-100 text-sky-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className="shadow-sm">
              <CardContent className="flex flex-col gap-2.5 p-4">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${k.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight tabular-nums sm:text-2xl">
                    {k.value}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Actividad en tiempo real */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Clock className="h-5 w-5 text-primary" />
                  Repartos activos
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {active.length} en total
                </span>
              </div>
              {active.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Inbox className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No hay repartos activos ahora mismo
                  </p>
                </div>
              ) : (
                <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                  {active.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          d.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {d.status === 'PENDING' ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Bike className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {d.restaurantName}
                          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                            #{d.id.slice(-6).toUpperCase()}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.driverName
                            ? `${d.driverName} · ${formatTime(d.requestedAt)}`
                            : d.status === 'PENDING'
                              ? `Pendiente de aceptar · ${formatTime(d.requestedAt)}`
                              : formatTime(d.requestedAt)}
                        </p>
                      </div>
                      <StatusBadge status={d.status} showDot={false} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Últimos completados */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Últimos completados
              </h2>
              {loadingStats ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <RecentCompleted />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function RecentCompleted() {
  const { data } = useQuery({
    queryKey: ['deliveries', 'admin', 'recent'],
    queryFn: () => api.listDeliveries(undefined, 'all'),
    refetchInterval: 60000,
  })
  const completed = (data?.deliveries || [])
    .filter((d: DeliveryDTO) => d.status === 'DELIVERED')
    .slice(0, 6)

  if (completed.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Aún no hay repartos completados
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {completed.map((d: DeliveryDTO) => (
        <li key={d.id} className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{d.restaurantName}</p>
            <p className="text-xs text-muted-foreground">
              {d.driverName || '—'} · {formatDuration(d.totalMs)}
              {d.fee != null && ` · ${formatEur(d.fee)}`} · {formatTime(d.deliveredAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
