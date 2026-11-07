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
  Ruler,
  Search,
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
import { StatusBadge } from '@/components/status-badge'
import { MapView } from './map-view'
import { AddressAutocomplete } from './address-autocomplete'
import { StatsView } from '@/components/shared/stats-view'
import { HistoryView } from '@/components/shared/history-view'
import { OrdersGroup } from '@/components/shared/orders-group'
import { AppShell, type NavItem } from '@/components/layout/app-shell'
import { useSocket } from '@/hooks/use-socket'
import { useNow } from '@/hooks/use-now'
import { formatTime } from '@/lib/format'
import { PushBell } from '@/components/pwa/push-bell'
import { feeForDistanceKm, haversineKm, formatEur, formatKm, feeExplanation } from '@/lib/fees'

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

  // ¿Es un pedido «mío»? Con varios repartidores por local: la petición
  // llega a todos los asignados, pero una vez aceptada solo es del que la tomó.
  const isMine = (d: DeliveryDTO) =>
    (d.assignedDriverIds || []).includes(user.id) &&
    (!d.driverId || d.driverId === user.id)

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
  const pending = deliveries.filter((d) => d.status === 'PENDING')
  const inProgress = deliveries.filter((d) => ['ACCEPTED', 'PICKED_UP'].includes(d.status))

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
          onAccept={(d) => handleAction(d, 'ACCEPTED', 'Solicitud aceptada')}
          onReject={(d) => handleAction(d, 'REJECTED', 'Solicitud rechazada')}
          onPickup={(d) => setPickupTarget(d)}
          onDeliver={(d) => handleAction(d, 'DELIVERED', 'Reparto completado')}
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
  onAccept,
  onReject,
  onPickup,
  onDeliver,
  onViewHistory,
}: {
  isLoading: boolean
  pending: DeliveryDTO[]
  inProgress: DeliveryDTO[]
  activity: DeliveryDTO[]
  onAccept: (d: DeliveryDTO) => void
  onReject: (d: DeliveryDTO) => void
  onPickup: (d: DeliveryDTO) => void
  onDeliver: (d: DeliveryDTO) => void
  onViewHistory: () => void
}) {
  const hasActive = pending.length > 0 || inProgress.length > 0

  // Grupos expandibles: si un restaurante tiene varios pedidos a la vez se
  // contraen en una cabecera compacta (mejor vista general de noche, cuando
  // un local saca varios repartos seguidos). Los sueltos van como siempre.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const byRestaurant = new Map<string, DeliveryDTO[]>()
  for (const d of [...pending, ...inProgress]) {
    const list = byRestaurant.get(d.restaurantId)
    if (list) list.push(d)
    else byRestaurant.set(d.restaurantId, [d])
  }
  const restaurantGroups = [...byRestaurant.values()]

  const orderCardProps = (d: DeliveryDTO) => ({
    delivery: d,
    onAccept: () => onAccept(d),
    onReject: () => onReject(d),
    onPickup: () => onPickup(d),
    onDeliver: () => onDeliver(d),
  })

  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: orders (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
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
              {restaurantGroups.map((items) => {
                // Un solo pedido del local → tarjeta normal, sin grupo
                if (items.length === 1) {
                  return <OrderCard key={items[0].id} {...orderCardProps(items[0])} />
                }
                const pend = items.filter((d) => d.status === 'PENDING').length
                const prog = items.length - pend
                const key = items[0].restaurantId
                return (
                  <OrdersGroup
                    key={key}
                    icon={Store}
                    title={items[0].restaurantName}
                    ordersCount={items.length}
                    open={openGroups.has(key)}
                    onToggle={() => toggleGroup(key)}
                    chips={[
                      ...(pend > 0
                        ? [{ label: `${pend} ${pend === 1 ? 'pendiente' : 'pendientes'}`, tone: 'amber' as const }] 
                        : []),
                      ...(prog > 0
                        ? [{ label: `${prog} en curso`, tone: 'primary' as const }]
                        : []),
                    ]}
                  >
                    {items.map((d) => (
                      <OrderCard key={d.id} {...orderCardProps(d)} />
                    ))}
                  </OrdersGroup>
                )
              })}
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
                    return (
                      <li key={d.id} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            done
                              ? 'bg-emerald-100 text-emerald-600'
                              : moving
                                ? 'bg-primary/15 text-primary'
                                : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {done ? (
                            <Check className="h-4 w-4" />
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
                            {d.customerName ? ` — ${d.customerName}` : ''} · #{d.id.slice(-4).toUpperCase()}
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

function OrderCard({
  delivery,
  readOnly,
  onAccept,
  onReject,
  onPickup,
  onDeliver,
}: {
  delivery: DeliveryDTO
  readOnly?: boolean
  onAccept: () => void
  onReject: () => void
  onPickup: () => void
  onDeliver: () => void
}) {
  const isPending = delivery.status === 'PENDING'
  // Re-render every second so the elapsed counter ticks live.
  const now = useNow(1000)
  // elapsed time
  const elapsedMin = Math.max(
    0,
    Math.round(
      (now - new Date(delivery.requestedAt).getTime()) / 60000,
    ),
  )

  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      {/* Orange header */}
      <div className="flex items-center justify-between gap-3 bg-primary px-5 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-2 font-bold">
          <Bell className="h-4 w-4 shrink-0" />
          <span className="truncate">Pedido #{delivery.id.slice(-6).toUpperCase()}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium">
          <Clock className="h-4 w-4" />
          <span className="text-white/80">Tiempo:</span>
          <span className="font-bold">{elapsedMin} min</span>
        </div>
      </div>

      <CardContent className="p-5">
        {readOnly && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Bike className="h-3.5 w-3.5" />
              {delivery.driverName
                ? `Repartidor: ${delivery.driverName}`
                : 'Sin repartidor asignado'}
            </span>
            <StatusBadge status={delivery.status} showDot={false} />
          </div>
        )}
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

        {/* Actions — Acceptar/Rechazar lado a lado y con buen tamaño táctil */}
        {!readOnly && (
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
        )}
      </CardContent>
    </Card>
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
  const [manualKm, setManualKm] = useState('')
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
      setManualKm('')
      setSelected(null)
      setRoute(null)
      setRouteLoading(false)
    }
  }, [delivery])

  /** El repartidor eligió una dirección del desplegable: coordenadas exactas
   *  → tarifa en vivo. Primero línea recta (instantáneo) y luego la distancia
   *  real por carretera, que es la que se guarda. */
  function handleSelect(s: AddressSuggestion) {
    setSelected(s)
    if (!delivery) return
    const from = { lat: delivery.lat, lng: delivery.lng }
    // Feedback inmediato con línea recta mientras llega la ruta real
    setRoute({ km: haversineKm(from, s), method: 'straight' })
    setRouteLoading(true)
    api
      .routeDistance(from, s)
      .then((r) => setRoute({ km: r.km, method: r.method }))
      .catch(() => {
        /* se queda la línea recta: el servidor la recalcula al guardar */
      })
      .finally(() => setRouteLoading(false))
  }

  // Distancia y tarifa en vivo (km manuales mandan sobre el mapa)
  const manualKmNum = Number(manualKm.replace(',', '.'))
  const manualValid = manualKm.trim() !== '' && Number.isFinite(manualKmNum) && manualKmNum > 0
  const distanceKm = manualValid ? manualKmNum : route?.km ?? null
  const fee = distanceKm != null ? feeForDistanceKm(distanceKm) : null

  const canSubmit = address.trim().length >= 4 && distanceKm != null && !submitting

  async function handleSubmit() {
    if (!delivery || !canSubmit) return
    setSubmitting(true)
    try {
      const res = await api.updateDelivery(delivery.id, 'PICKED_UP', {
        customerName: customerName.trim() || undefined,
        dropoffAddress: address.trim(),
        ...(manualValid
          ? { distanceKm: manualKmNum }
          : selected
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
            {selected && route && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {formatKm(route.km)}{' '}
                  {routeLoading
                    ? '(calculando ruta…)'
                    : route.method === 'road'
                      ? 'por carretera'
                      : 'en línea recta'}{' '}
                  desde {delivery?.restaurantName}
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white">
                  {formatEur(fee)}
                </span>
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

          <div className="space-y-2">
            <Label htmlFor="pu-km" className="flex items-center gap-1.5 text-muted-foreground">
              <Ruler className="h-3.5 w-3.5" />
              Distancia a mano (km) — opcional
            </Label>
            <Input
              id="pu-km"
              value={manualKm}
              onChange={(e) => setManualKm(e.target.value)}
              placeholder="Ej. 2.5"
              inputMode="decimal"
              className="max-w-[10rem]"
            />
            {manualValid && (
              <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Tarifa: <strong>{formatEur(fee)}</strong>
                <span className="text-xs">({formatKm(manualKmNum)})</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Si la conoces o el mapa no encuentra la dirección. Prevalece
              sobre la distancia calculada.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Euro className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Cómo se calcula la tarifa:</strong>{' '}
              {feeExplanation()}. La distancia se mide por carretera desde el
              local hasta la dirección elegida.
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
