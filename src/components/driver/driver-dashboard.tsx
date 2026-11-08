'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bike,
  Package,
  ClipboardList,
  BarChart3,
  Check,
  X,
  PackageCheck,
  CheckCircle2,
  Loader2,
  Inbox,
  Clock,
  Store,
  MapPin,
  Home,
  ArrowRight,
  Bell,
  User,
  Euro,
  Navigation,
  Search,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type { AddressSuggestion, AppUser, DeliveryDTO } from '@/lib/types'
import { MapView } from './map-view'
import { AddressAutocomplete } from './address-autocomplete'
import { StatsView } from '@/components/shared/stats-view'
import { HistoryView } from '@/components/shared/history-view'
import {
  CollapsibleOrderCard,
  OrdersSectionLabel,
} from '@/components/shared/order-collapsible'
import { AppShell, type NavItem } from '@/components/layout/app-shell'
import { useSocket } from '@/hooks/use-socket'
import { useNow } from '@/hooks/use-now'
import { formatTime } from '@/lib/format'
import { PushBell } from '@/components/pwa/push-bell'
import { feeForDistanceKm, haversineKm, formatEur, formatKm } from '@/lib/fees'

type View = 'pedidos' | 'historial' | 'estadisticas'

export function DriverDashboard({
  user,
  onLogout,
}: {
  user: Extract<AppUser, { role: 'driver' }>
  onLogout: () => void
}) {
  const qc = useQueryClient()
  const { status, subscribe } = useSocket(user)
  const beepRef = useRef<AudioContext | null>(null)
  const [view, setView] = useState<View>('pedidos')
  const [available, setAvailable] = useState(true)
  const [pickupTarget, setPickupTarget] = useState<DeliveryDTO | null>(null)

  // ¿Es un pedido «mío» (sección normal)? Si ya lo acepté (driverId = yo) o
  // se me ofrece ahora (currentAssigneeId = yo). Para datos viejos sin
  // currentAssignee, los repartidores normales ven los PENDING de sus
  // restaurantes; los súper NO (van a la sección de robo para que pueda
  // tomarlos ahí si quiere).
  const isMine = (d: DeliveryDTO) => {
    if (d.driverId === user.id) return true
    if (d.currentAssigneeId === user.id) return true
    if (
      !user.isSuperDriver &&
      d.currentAssigneeId == null &&
      (d.assignedDriverIds || []).includes(user.id) &&
      !d.driverId
    )
      return true
    return false
  }

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', 'driver', 'active'],
    queryFn: () => api.listDeliveries('active', 'mine'),
    refetchInterval: 15000,
  })

  const { data: recentData } = useQuery({
    queryKey: ['deliveries', 'driver', 'recent'],
    queryFn: () => api.listDeliveries(undefined, 'mine'),
    refetchInterval: 30000,
  })

  function playBeep() {
    try {
      if (!beepRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        beepRef.current = new Ctx()
      }
      const ctx = beepRef.current
      const now = ctx.currentTime
      const playTone = (start: number, freq: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.32)
      }
      playTone(now, 880)
      playTone(now + 0.18, 1175)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const onNew = (payload: unknown) => {
      const d = payload as DeliveryDTO
      if (isMine(d)) {
        qc.setQueryData(['deliveries', 'driver', 'active'], (old: { deliveries: DeliveryDTO[] } | undefined) => ({
          deliveries: [d, ...(old?.deliveries.filter((x) => x.id !== d.id) || [])],
        }))
        qc.invalidateQueries({ queryKey: ['deliveries', 'driver', 'recent'] })
        if (available) {
          playBeep()
          toast.success('Nueva solicitud de reparto', {
            description: `${d.restaurantName} solicita repartidor${d.customerName ? ` — ${d.customerName}` : ''}`,
            duration: 8000,
          })
          // La notificación de pantalla la muestra el service worker (push):
          // en iOS no se puede mostrar desde la página.
        }
      }
    }
    const onUpdate = (payload: unknown) => {
      const d = payload as DeliveryDTO
      if (isMine(d)) {
        const patch = (old: { deliveries: DeliveryDTO[] } | undefined) => {
          if (!old) return old
          const rest = old.deliveries.filter((x) => x.id !== d.id)
          if (['PENDING', 'ACCEPTED', 'PICKED_UP'].includes(d.status)) {
            return { deliveries: [d, ...rest] }
          }
          return { deliveries: rest }
        }
        qc.setQueryData(['deliveries', 'driver', 'active'], patch)
        qc.invalidateQueries({ queryKey: ['deliveries', 'driver', 'recent'] })
      }
      if (d.status === 'CANCELLED' && (d.assignedDriverIds || []).includes(user.id)) {
        toast.info('Solicitud cancelada', { description: `${d.restaurantName} canceló el reparto.` })
      }
    }
    const off1 = subscribe('delivery:new', onNew)
    const off2 = subscribe('delivery:update', onUpdate)
    return () => {
      off1()
      off2()
    }
  }, [subscribe, qc, available, user.id])

  const deliveries = data?.deliveries || []
  // Mis pedidos = los de mis restaurantes (isMine). El resto van a la sección
  // de robo si el repartidor es súper.
  const myDeliveries = deliveries.filter(isMine)
  const pending = myDeliveries.filter((d) => d.status === 'PENDING')
  const inProgress = myDeliveries.filter((d) => ['ACCEPTED', 'PICKED_UP'].includes(d.status))
  // Súper repartidor: pedidos que puede robar — de otros restaurantes o de
  // otros repartidores, incluyendo los no aceptados y los sin asignar.
  const stealable = user.isSuperDriver
    ? deliveries.filter(
        (d) =>
          !isMine(d) &&
          (d.status === 'PENDING' || d.status === 'ACCEPTED'),
      )
    : []

  const allDeliveries = recentData?.deliveries || []
  // Activity = most recent finished/in-progress, take 4
  const activity = [...allDeliveries]
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .slice(0, 4)

  /** Aplica una entrega actualizada a las queries locales (activo + reciente). */
  function applyDeliveryUpdate(d: DeliveryDTO) {
    qc.setQueryData(['deliveries', 'driver', 'active'], (old: { deliveries: DeliveryDTO[] } | undefined) => {
      if (!old) return old
      const rest = old.deliveries.filter((x) => x.id !== d.id)
      if (['PENDING', 'ACCEPTED', 'PICKED_UP'].includes(d.status)) {
        return { deliveries: [d, ...rest] }
      }
      return { deliveries: rest }
    })
    qc.invalidateQueries({ queryKey: ['deliveries', 'driver', 'recent'] })
  }

  async function handleAction(d: DeliveryDTO, status: string, label: string) {
    try {
      const res = await api.updateDelivery(d.id, status)
      applyDeliveryUpdate(res.delivery)
      toast.success(label)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      qc.invalidateQueries({ queryKey: ['deliveries', 'driver', 'active'] })
      toast.error(msg)
    }
  }

  /** Súper repartidor: roba un pedido de otro repartidor. */
  async function handleSteal(d: DeliveryDTO) {
    try {
      const res = await api.stealDelivery(d.id)
      applyDeliveryUpdate(res.delivery)
      toast.success('Pedido robado', {
        description: `Ahora llevas tú el pedido de ${d.restaurantName}.`,
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al robar el pedido')
      qc.invalidateQueries({ queryKey: ['deliveries', 'driver', 'active'] })
    }
  }

  const navItems: NavItem[] = [
    { id: 'pedidos', label: 'Mis pedidos', icon: Package, badge: pending.length },
    { id: 'historial', label: 'Historial', icon: ClipboardList },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  ]

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hola, {user.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Aquí tienes tus pedidos asignados
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PushBell role="driver" userId={user.id} />
        <OnlineToggle
          available={available}
          onToggle={() => setAvailable((v) => !v)}
          socketStatus={status}
        />
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
      {view === 'pedidos' && (
        <PedidosView
          isLoading={isLoading}
          pending={pending}
          inProgress={inProgress}
          activity={activity}
          isSuperDriver={!!user.isSuperDriver}
          stealable={stealable}
          allActive={deliveries}
          myDriverId={user.id}
          onAccept={(d) => handleAction(d, 'ACCEPTED', 'Solicitud aceptada')}
          onReject={(d) => handleAction(d, 'REJECTED', 'Solicitud rechazada')}
          onPickup={(d) => setPickupTarget(d)}
          onDeliver={(d) => handleAction(d, 'DELIVERED', 'Reparto completado')}
          onSteal={handleSteal}
          onViewHistory={() => setView('historial')}
        />
      )}
      {view === 'historial' && <HistoryView />}
      {view === 'estadisticas' && <StatsView />}

      {/* Diálogo de recogida: nombre + dirección → tarifa por distancia */}
      <PickupDialog
        delivery={pickupTarget}
        onOpenChange={(o) => !o && setPickupTarget(null)}
        onDone={(d) => {
          applyDeliveryUpdate(d)
          setPickupTarget(null)
        }}
      />
    </AppShell>
  )
}

function OnlineToggle({
  available,
  onToggle,
  socketStatus,
}: {
  available: boolean
  onToggle: () => void
  socketStatus: 'connecting' | 'connected' | 'disconnected'
}) {
  const connected = socketStatus === 'connected'
  const online = available && connected
  return (
    <div
      className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        online
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
        }`}
      />
      {online ? 'En línea' : available ? 'Conectando…' : 'En pausa'}
      <button
        type="button"
        role="switch"
        aria-checked={available}
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          available ? 'bg-emerald-500' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            available ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function PedidosView({
  isLoading,
  pending,
  inProgress,
  activity,
  isSuperDriver,
  stealable,
  allActive,
  myDriverId,
  onAccept,
  onReject,
  onPickup,
  onDeliver,
  onSteal,
  onViewHistory,
}: {
  isLoading: boolean
  pending: DeliveryDTO[]
  inProgress: DeliveryDTO[]
  activity: DeliveryDTO[]
  isSuperDriver: boolean
  stealable: DeliveryDTO[]
  allActive: DeliveryDTO[]
  myDriverId: string
  onAccept: (d: DeliveryDTO) => void
  onReject: (d: DeliveryDTO) => void
  onPickup: (d: DeliveryDTO) => void
  onDeliver: (d: DeliveryDTO) => void
  onSteal: (d: DeliveryDTO) => void
  onViewHistory: () => void
}) {
  const hasActive = pending.length > 0 || inProgress.length > 0

  // Súper repartidor: pestaña "Mis pedidos" | "Supervisión"
  const [superTab, setSuperTab] = useState<'mine' | 'supervision'>('mine')

  // Pedidos en curso abiertos (los PENDING van siempre grandes; los
  // aceptados se pliegan y se abren aquí al tocarlos).
  const [openOrders, setOpenOrders] = useState<ReadonlySet<string>>(new Set())
  const toggleOrder = (id: string) =>
    setOpenOrders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const orderCardProps = (d: DeliveryDTO, collapsible: boolean) => ({
    delivery: d,
    collapsible,
    open: openOrders.has(d.id),
    onToggle: () => toggleOrder(d.id),
    onAccept: () => onAccept(d),
    onReject: () => onReject(d),
    onPickup: () => onPickup(d),
    onDeliver: () => onDeliver(d),
  })

  // Si es súper y está en "supervisión", mostrar la vista de supervisión
  if (isSuperDriver && superTab === 'supervision') {
    return (
      <SuperSupervisionView
        allActive={allActive}
        myDriverId={myDriverId}
        onSteal={onSteal}
        onBackToMine={() => setSuperTab('mine')}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Selector de pestañas para súper repartidores */}
      {isSuperDriver && (
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setSuperTab('mine')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              superTab === 'mine' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Package className="mr-1.5 inline h-4 w-4" />
            Mis pedidos
            {hasActive && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${superTab === 'mine' ? 'bg-white/20' : 'bg-muted'}`}>
                {pending.length + inProgress.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSuperTab('supervision')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              superTab === 'supervision' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="mr-1.5 inline h-4 w-4" />
            Supervisión
            {stealable.length > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${superTab === 'supervision' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                {stealable.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: orders (2 cols) */}
        <div className="space-y-4 lg:col-span-2">
          {isLoading ? (
            <Card className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
          ) : !hasActive ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Inbox className="h-7 w-7" />
                </div>
                <p className="font-semibold">No tienes pedidos asignados</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Las nuevas solicitudes aparecerán aquí al instante
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Pendientes: GRANDES como siempre — esperan decisión */}
              {pending.length > 0 && (
                <OrdersSectionLabel
                  icon={Bell}
                  label="Nuevas solicitudes"
                  count={pending.length}
                />
              )}
              {pending.map((d) => (
                <OrderCard key={d.id} {...orderCardProps(d, false)} />
              ))}

              {/* En curso: se pliegan solos para no llenar la pantalla;
                  un toque los vuelve a expandir del todo. */}
              {inProgress.length > 0 && (
                <OrdersSectionLabel
                  icon={Bike}
                  label="En curso"
                  count={inProgress.length}
                />
              )}
              {inProgress.map((d) => (
                <OrderCard key={d.id} {...orderCardProps(d, true)} />
              ))}
            </>
          )}
        </div>

        {/* Right: activity */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-lg font-bold">Tu actividad</h2>
              {activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay actividad
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((d) => {
                    const done = d.status === 'DELIVERED'
                    const moving = d.status === 'ACCEPTED' || d.status === 'PICKED_UP'
                    const rejected = d.status === 'REJECTED' || d.status === 'CANCELLED'
                    return (
                      <li key={d.id} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            done
                              ? 'bg-emerald-100 text-emerald-600'
                              : rejected
                                ? 'bg-rose-100 text-rose-500'
                                : moving
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {done ? (
                            <Check className="h-4 w-4" />
                          ) : rejected ? (
                            <X className="h-4 w-4" />
                          ) : moving ? (
                            <Bike className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {done
                              ? 'Pedido entregado'
                              : rejected
                                ? 'Pedido rechazado'
                                : moving
                                  ? 'En camino'
                                  : 'Pendiente'}
                            {d.fee != null && done && (
                              <span className="ml-1.5 font-mono text-xs font-semibold text-emerald-600">
                                {formatEur(d.fee)}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.restaurantName}
                            {d.customerName ? ` — pedido para ${d.customerName}` : ''} · #{d.id.slice(-4).toUpperCase()}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(d.requestedAt)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              <button
                onClick={onViewHistory}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver historial completo
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Vista de supervisión del súper repartidor: ve TODOS los pedidos activos de
 * todos los locales (excepto los suyos propios) con cuánto tiempo lleva el
 * repartidor en cada fase. Puede robar los PENDING y ACCEPTED; los PICKED_UP
 * solo se muestran como información (no se pueden robar, pero así sabe si
 * alguien lleva mucho sin entregar y puede contactar con él).
 */
function SuperSupervisionView({
  allActive,
  myDriverId,
  onSteal,
  onBackToMine,
}: {
  allActive: DeliveryDTO[]
  myDriverId: string
  onSteal: (d: DeliveryDTO) => void
  onBackToMine: () => void
}) {
  const now = useNow(30000) // refresca cada 30s para los tiempos

  /** Calcula los minutos transcurridos desde un timestamp ISO. */
  function elapsedMin(iso: string | null): number | null {
    if (!iso) return null
    return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  }

  /** Etiqueta de tiempo legible: "5 min", "1 h 20 min". */
  function fmtMin(m: number | null): string {
    if (m == null) return '—'
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest > 0 ? `${h} h ${rest} min` : `${h} h`
  }

  // Excluir los pedidos propios (ya están en "Mis pedidos") y ordenar por
  // antigüedad (los que más tiempo llevan primero — más urgente supervisar).
  const sorted = allActive
    .filter((d) => d.driverId !== myDriverId && d.currentAssigneeId !== myDriverId)
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Shield className="h-5 w-5 text-primary" />
            Supervisión de repartos
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Todos los pedidos activos. Roba los que fallan; en los que ya están
            repartiendo, vigila el tiempo y contacta si tardan demasiado.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBackToMine}>
          <Package className="mr-1.5 h-3.5 w-3.5" />
          Mis pedidos
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No hay pedidos activos en este momento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((d) => {
            const isUnassigned = !d.driverId && !d.currentAssigneeName
            const canSteal = d.status === 'PENDING' || d.status === 'ACCEPTED'
            const driverLabel = d.driverName ?? d.currentAssigneeName ?? null

            // Tiempo según la fase:
            // PENDING → desde requestedAt ("sin aceptar")
            // ACCEPTED → desde acceptedAt ("sin recoger")
            // PICKED_UP → desde pickedUpAt ("sin entregar")
            let phaseLabel = ''
            let phaseTime: number | null = null
            let phaseColor = 'text-muted-foreground'
            if (d.status === 'PENDING') {
              phaseTime = elapsedMin(d.requestedAt)
              phaseLabel = isUnassigned ? 'Sin repartidor asignado' : `sin aceptar`
              if (isUnassigned) phaseColor = 'text-amber-600'
            } else if (d.status === 'ACCEPTED') {
              phaseTime = elapsedMin(d.acceptedAt)
              phaseLabel = 'sin recoger'
            } else if (d.status === 'PICKED_UP') {
              phaseTime = elapsedMin(d.pickedUpAt)
              phaseLabel = 'sin entregar'
            }

            // Alerta visual si lleva mucho tiempo
            const isSlow = phaseTime != null && phaseTime >= 15
            const isVerySlow = phaseTime != null && phaseTime >= 30

            return (
              <Card
                key={d.id}
                className={`p-0 shadow-sm ${
                  isVerySlow
                    ? 'border-rose-300'
                    : isSlow
                      ? 'border-amber-300'
                      : 'border-border'
                }`}
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {d.restaurantName}
                        {d.customerName && (
                          <span className="font-normal text-muted-foreground"> — pedido para <strong className="text-foreground">{d.customerName}</strong></span>
                        )}
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        #{d.id.slice(-6).toUpperCase()}
                      </span>
                      {d.fee != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <Euro className="h-3 w-3" />
                          {d.fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </span>
                      )}
                    </div>
                    <p className={`mt-1.5 text-xs font-medium ${phaseColor}`}>
                      {isUnassigned ? (
                        <span>Sin repartidor asignado · esperando {fmtMin(phaseTime)}</span>
                      ) : driverLabel ? (
                        <span>
                          <strong className="text-foreground">{driverLabel}</strong>
                          {' lleva '}
                          <strong className={isVerySlow ? 'text-rose-600' : isSlow ? 'text-amber-600' : 'text-foreground'}>
                            {fmtMin(phaseTime)}
                          </strong>
                          {' ' + phaseLabel}
                        </span>
                      ) : (
                        <span>Esperando repartidor · {fmtMin(phaseTime)}</span>
                      )}
                    </p>
                    {d.status === 'PICKED_UP' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ⚠ Ya está repartiendo — no se puede robar. Si tarda
                        mucho, contacta con <strong>{driverLabel}</strong>.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {canSteal ? (
                      <Button
                        size="sm"
                        onClick={() => onSteal(d)}
                        className="bg-primary text-white hover:bg-primary/90"
                      >
                        <Shield className="mr-1.5 h-3.5 w-3.5" />
                        {isUnassigned ? 'Tomar' : 'Robar'}
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Vigilando
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OrderCard({
  delivery,
  collapsible,
  open,
  onToggle,
  onAccept,
  onReject,
  onPickup,
  onDeliver,
}: {
  delivery: DeliveryDTO
  /** Plegable en los estados que ya están en marcha (no en PENDING). */
  collapsible: boolean
  open: boolean
  onToggle: () => void
  onAccept: () => void
  onReject: () => void
  onPickup: () => void
  onDeliver: () => void
}) {
  const isPending = delivery.status === 'PENDING'
  const headerIcon = isPending
    ? Bell
    : delivery.status === 'ACCEPTED'
      ? Bike
      : PackageCheck
  const mapsUrl = delivery.dropoffAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.dropoffAddress)}`
    : null

  // Resumen siempre visible con la tarjeta plegada: a dónde ir y de quién es.
  // ACCEPTED: "Recoger en Kebab, pedido para Ana" — el repartidor sabe a qué
  // nombre va antes de recoger (la dirección la confirma en el diálogo).
  // PICKED_UP: "Entregar en [dirección]" — ya tiene la dirección.
  const summary = !isPending && (
    delivery.status === 'ACCEPTED' ? (
      <>
        <Store className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Recoger en{' '}
          <strong className="text-foreground">{delivery.restaurantName}</strong>
          {delivery.customerName && (
            <>
              {', pedido para '}
              <strong className="text-foreground">{delivery.customerName}</strong>
            </>
          )}
        </span>
      </>
    ) : (
      <>
        <MapPin className="h-4 w-4 shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Entregar en{' '}
          {delivery.dropoffAddress ? (
            <strong className="text-foreground">{delivery.dropoffAddress}</strong>
          ) : (
            'dirección pendiente'
          )}
        </span>
        {delivery.distanceKm != null && (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {formatKm(delivery.distanceKm)}
          </span>
        )}
        {delivery.fee != null && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
            <Euro className="h-3 w-3" />
            {formatEur(delivery.fee)}
          </span>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            <Navigation className="h-3.5 w-3.5" />
            Maps
          </a>
        )}
      </>
    )
  )

  // Acción principal compacta: se puede seguir trabajando sin expandir.
  const collapsedAction = !isPending && (
    delivery.status === 'ACCEPTED' ? (
      <Button
        onClick={onPickup}
        className="h-11 w-full bg-primary text-sm font-semibold text-white hover:bg-primary/90"
      >
        <PackageCheck className="h-4 w-4" />
        He recogido el pedido
      </Button>
    ) : (
      <Button
        onClick={onDeliver}
        className="h-11 w-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        Marcar como entregado
      </Button>
    )
  )

  return (
    <CollapsibleOrderCard
      icon={headerIcon}
      orderId={delivery.id}
      requestedAt={delivery.requestedAt}
      collapsible={collapsible}
      open={open}
      onToggle={onToggle}
      summary={summary}
      collapsedAction={collapsedAction}
    >
      <OrderCardBody
        delivery={delivery}
        onAccept={onAccept}
        onReject={onReject}
        onPickup={onPickup}
        onDeliver={onDeliver}
      />
    </CollapsibleOrderCard>
  )
}

/** Cuerpo grande de la tarjeta: igual que siempre (timeline, mapa y botones
 *  grandes). Se muestra expandido y se pliega cuando el pedido está en
 *  marcha. */
function OrderCardBody({
  delivery,
  onAccept,
  onReject,
  onPickup,
  onDeliver,
}: {
  delivery: DeliveryDTO
  onAccept: () => void
  onReject: () => void
  onPickup: () => void
  onDeliver: () => void
}) {
  const isPending = delivery.status === 'PENDING'

  return (
    <>
      {delivery.customerName && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            <User className="h-3.5 w-3.5" />
            {delivery.customerName}
          </span>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Timeline */}
        <div>
          <div className="flex gap-3">
            {/* line + nodes */}
            <div className="flex flex-col items-center">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-white">
                <Store className="h-4 w-4" />
              </span>
              <span className="my-1 h-8 w-px bg-border" />
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                <Home className="h-4 w-4" />
              </span>
            </div>
            <div className="flex flex-col justify-between py-0.5">
              <div>
                <p className="text-base font-bold">{delivery.restaurantName}</p>
                <p className="text-sm text-muted-foreground">
                  {delivery.restaurantAddress}
                </p>
                <p className="mt-0.5 text-xs font-medium text-primary">
                  Recoger aquí
                </p>
              </div>
              <div>
                <p className="text-base font-bold">Entrega</p>
                {delivery.dropoffAddress ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {delivery.dropoffAddress}
                    </p>
                    {delivery.fee != null && (
                      <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <Euro className="h-3 w-3" />
                        {formatKm(delivery.distanceKm)} · Tarifa {formatEur(delivery.fee)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Destino: te lo indican al recoger
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      El cliente y la dirección te los dan en el restaurante
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Timestamps row */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Solicitado" value={formatTime(delivery.requestedAt)} />
            <Stat label="Aceptado" value={formatTime(delivery.acceptedAt)} />
            <Stat label="Recogido" value={formatTime(delivery.pickedUpAt)} />
          </div>
        </div>

        {/* Map (only once accepted/in progress) */}
        {!isPending ? (
          <MapView
            lat={delivery.lat}
            lng={delivery.lng}
            label={delivery.restaurantName}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <MapPin className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Ubicación disponible al aceptar</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {delivery.restaurantName} · {delivery.restaurantAddress}
            </p>
          </div>
        )}
      </div>

      {/* Actions — Aceptar/Rechazar lado a lado y con buen tamaño táctil */}
      <div className="mt-5 space-y-3">
        {isPending && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={onReject}
              variant="outline"
              className="h-14 border-2 border-rose-200 bg-rose-50/60 text-base font-semibold text-rose-600 transition-transform hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 active:scale-[0.98]"
            >
              <X className="h-5 w-5" />
              Rechazar
            </Button>
            <Button
              onClick={onAccept}
              className="h-14 bg-primary text-base font-semibold text-white shadow-sm transition-transform hover:bg-primary/90 active:scale-[0.98]"
            >
              <Check className="h-5 w-5" />
              Aceptar
            </Button>
          </div>
        )}
        {delivery.status === 'ACCEPTED' && (
          <Button
            onClick={onPickup}
            className="h-14 w-full bg-primary text-base font-semibold text-white shadow-sm transition-transform hover:bg-primary/90 active:scale-[0.98]"
          >
            <PackageCheck className="h-5 w-5" />
            He recogido el pedido
          </Button>
        )}
        {delivery.status === 'PICKED_UP' && (
          <Button
            onClick={onDeliver}
            className="h-14 w-full bg-emerald-600 text-base font-semibold text-white shadow-sm transition-transform hover:bg-emerald-700 active:scale-[0.98]"
          >
            <CheckCircle2 className="h-5 w-5" />
            Marcar como entregado
          </Button>
        )}
      </div>
    </>
  )
}

/**
 * Diálogo de RECOGIDA: el repartidor confirma el nombre del cliente y
 * elige la dirección de entrega en el AUTOCOMPLETE con sugerencias en vivo
 * (estilo Google Maps). Al seleccionar el destino se calculan la distancia
 * real por carretera y la tarifa, que se guardan junto con el pedido.
 */
function PickupDialog({
  delivery,
  onOpenChange,
  onDone,
}: {
  delivery: DeliveryDTO | null
  onOpenChange: (o: boolean) => void
  onDone: (d: DeliveryDTO) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState<AddressSuggestion | null>(null)
  const [route, setRoute] = useState<{ km: number; method: 'road' | 'straight' } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const open = !!delivery

  // Prefill al abrir (nombre del cliente si el restaurante lo anotó)
  useEffect(() => {
    if (delivery) {
      setCustomerName(delivery.customerName || '')
      setAddress('')
      setSelected(null)
      setRoute(null)
      setRouteLoading(false)
    }
  }, [delivery])

  /** El repartidor eligió una dirección del desplegable: coordenadas exactas
   *  → tarifa en vivo con la distancia real por carretera (la que se guarda). */
  function handleSelect(s: AddressSuggestion) {
    setSelected(s)
    if (!delivery) return
    const from = { lat: delivery.lat, lng: delivery.lng }
    // No mostramos la línea recta ni siquiera temporalmente: el repartidor
    // solo verá la distancia por carretera (la real). Mientras llega, el
    // estado "calculando" lo gestiona routeLoading.
    setRoute(null)
    setRouteLoading(true)
    api
      .routeDistance(from, s)
      .then((r) => setRoute({ km: r.km, method: r.method }))
      .catch(() => {
        /* el servidor recalculará al guardar; dejamos route=null */
      })
      .finally(() => setRouteLoading(false))
  }

  // Distancia por carretera (Google Routes API en el servidor)
  const distanceKm = route?.km ?? null
  // Tarifa del restaurante de este reparto (cada local puede tener la suya)
  const feeConfig = delivery
    ? { baseEur: delivery.feeBaseEur, thresholdKm: delivery.feeThresholdKm, perExtraKmEur: delivery.feePerExtraKmEur }
    : undefined
  // El repartidor ve la tarifa NETA (real menos la comisión % de la plataforma).
  // delivery.commissionPct viene del servidor ya ajustado para el repartidor.
  const commissionPct = delivery?.commissionPct ?? 0
  const rawFee = distanceKm != null ? feeForDistanceKm(distanceKm, feeConfig) : null
  const fee = rawFee != null ? Math.max(0, Math.round((rawFee * (1 - commissionPct / 100)) * 100) / 100) : null

  const canSubmit = address.trim().length >= 4 && distanceKm != null && !submitting

  async function handleSubmit() {
    if (!delivery || !canSubmit) return
    setSubmitting(true)
    try {
      const res = await api.updateDelivery(delivery.id, 'PICKED_UP', {
        customerName: customerName.trim() || undefined,
        dropoffAddress: address.trim(),
        ...(selected
          ? { dropoffLat: selected.lat, dropoffLng: selected.lng }
          : {}),
      })
      toast.success('Pedido recogido', {
        description:
          res.delivery.fee != null
            ? `Tarifa del reparto: ${formatEur(res.delivery.fee)}`
            : undefined,
      })
      onDone(res.delivery)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Recoger pedido
            {delivery && (
              <span className="font-mono text-sm font-normal text-muted-foreground">
                #{delivery.id.slice(-6).toUpperCase()}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {delivery
              ? `Confirma los datos de la entrega de ${delivery.restaurantName}. La tarifa se calcula con la distancia y queda guardada con el pedido.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="pu-name">Nombre del cliente</Label>
            <Input
              id="pu-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej. Pedro"
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pu-address">Dirección de entrega *</Label>
            <AddressAutocomplete
              id="pu-address"
              value={address}
              onChange={setAddress}
              onSelect={handleSelect}
              onSelectionCleared={() => {
                setSelected(null)
                setRoute(null)
              }}
              bias={delivery ? { lat: delivery.lat, lng: delivery.lng } : undefined}
              placeholder="Calle y número…"
            />

            {/* Dirección seleccionada → distancia + tarifa en vivo */}
            {selected && route && route.km > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {formatKm(route.km)}{' '}
                  {routeLoading
                    ? '(calculando ruta…)'
                    : 'por carretera'}{' '}
                  desde {delivery?.restaurantName}
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white">
                  {formatEur(fee)}
                </span>
              </div>
            )}
            {selected && routeLoading && (!route || route.km === 0) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                <span className="text-sm text-emerald-700">Calculando ruta por carretera…</span>
              </div>
            )}

            {/* Guía: falta seleccionar una dirección del desplegable */}
            {!selected && address.trim().length >= 4 && (
              <p className="text-xs text-muted-foreground">
                Selecciona una dirección del desplegable para calcular la
                distancia y la tarifa automáticamente.
              </p>
            )}
          </div>

          {/* Vista del destino elegido + abrir en Google Maps */}
          {selected && (
            <MapView
              lat={selected.lat}
              lng={selected.lng}
              label={selected.main}
              compact
            />
          )}

          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Euro className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              La tarifa se calcula con la distancia por carretera desde el local
              hasta la dirección elegida. La que ves arriba es lo que cobras tú.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirmar recogida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}
