'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCircle2,
  PackageCheck,
  Bike,
  Clock,
  Loader2,
  Store as StoreIcon,
  ClipboardList,
  History,
  Search,
  MapPin,
  User,
  Plus,
  Euro,
  Receipt,
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
import { api } from '@/lib/api-client'
import type { AppUser, DeliveryDTO } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'
import {
  CollapsibleOrderCard,
  MiniStepper,
  OrdersSectionLabel,
} from '@/components/shared/order-collapsible'
import { AppShell, type NavItem } from '@/components/layout/app-shell'
import { useSocket } from '@/hooks/use-socket'
import { useNotifPrefs } from '@/hooks/use-notif-prefs'
import { NotificationSettings } from '@/components/shared/notification-settings'
import { PushBell } from '@/components/pwa/push-bell'
import { formatEur, formatKm } from '@/lib/fees'
import {
  formatTime,
  formatDateTime,
  formatDuration,
  relativeTime,
} from '@/lib/format'
import {
  parseSchedule,
  isRestaurantOpen,
  scheduleLabel,
} from '@/lib/schedule'
import { useNow } from '@/hooks/use-now'

type View = 'inicio' | 'historial' | 'notificaciones'

export function RestaurantDashboard({
  user,
  onLogout,
}: {
  user: Extract<AppUser, { role: 'restaurant' }>
  onLogout: () => void
}) {
  const qc = useQueryClient()
  const { status, subscribe } = useSocket(user)
  const { prefs } = useNotifPrefs(user)
  const [view, setView] = useState<View>('inicio')
  const [requestOpen, setRequestOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deliveries', 'restaurant', 'active'],
    queryFn: () => api.listDeliveries('active'),
    refetchInterval: 15000,
  })

  const { data: allData } = useQuery({
    queryKey: ['deliveries', 'restaurant', 'all'],
    queryFn: () => api.listDeliveries(),
    refetchInterval: 30000,
  })

  // Puede haber VARIOS repartos en curso a la vez
  const actives = useMemo(
    () =>
      (data?.deliveries || []).filter((d) =>
        ['PENDING', 'ACCEPTED', 'PICKED_UP'].includes(d.status),
      ),
    [data],
  )

  // Puede haber VARIOS repartos en curso a la vez. Los que esperan
  // repartidor (PENDING) van GRANDES como siempre; los que ya están en
  // marcha se pliegan solos y se abren al tocarlos.
  const [openOrders, setOpenOrders] = useState<ReadonlySet<string>>(new Set())
  const toggleOrder = (id: string) =>
    setOpenOrders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Pendientes primero (el más antiguo esperando, primero); luego los que
  // ya están en marcha, también del más antiguo al más reciente.
  const byOldest = (a: DeliveryDTO, b: DeliveryDTO) =>
    a.requestedAt.localeCompare(b.requestedAt)
  const pendingActives = actives
    .filter((d) => d.status === 'PENDING')
    .sort(byOldest)
  const inProgressActives = actives
    .filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP')
    .sort(byOldest)

  useEffect(() => {
    const onUpdate = (payload: unknown) => {
      const d = payload as DeliveryDTO
      qc.setQueryData(['deliveries', 'restaurant', 'active'], (old: { deliveries: DeliveryDTO[] } | undefined) => {
        if (!old) return old
        const rest = old.deliveries.filter((x) => x.id !== d.id)
        if (['PENDING', 'ACCEPTED', 'PICKED_UP'].includes(d.status)) {
          return { deliveries: [d, ...rest] }
        }
        return { deliveries: rest }
      })
      qc.invalidateQueries({ queryKey: ['deliveries', 'restaurant', 'all'] })
      // Cada toast depende de su tipo de notificación (pestaña Notificaciones)
      if (d.status === 'ACCEPTED' && prefs?.order_accepted !== false)
        toast.success('¡Repartidor en camino!', { description: 'Tu repartidor ha aceptado la solicitud.' })
      if (d.status === 'PICKED_UP' && prefs?.order_picked_up !== false)
        toast.info('Pedido recogido', { description: 'El repartidor ha recogido el pedido.' })
      if (d.status === 'DELIVERED' && prefs?.order_delivered !== false)
        toast.success('¡Reparto completado!', { description: 'El repartidor ha confirmado la entrega.' })
      if (d.status === 'REJECTED' && prefs?.order_rejected !== false)
        toast.error('Solicitud rechazada', { description: 'El repartidor no pudo aceptar. Puedes solicitar de nuevo.' })
      if (d.status === 'CANCELLED' && prefs?.order_cancelled !== false)
        toast.info('Pedido cancelado', { description: 'El repartidor ha cancelado el reparto.' })
    }
    const onNew = (payload: unknown) => {
      const d = payload as DeliveryDTO
      qc.setQueryData(['deliveries', 'restaurant', 'active'], (old: { deliveries: DeliveryDTO[] } | undefined) => ({
        deliveries: [d, ...(old?.deliveries.filter((x) => x.id !== d.id) || [])],
      }))
      qc.invalidateQueries({ queryKey: ['deliveries', 'restaurant', 'all'] })
    }
    const off1 = subscribe('delivery:update', onUpdate)
    const off2 = subscribe('delivery:created', onNew)
    return () => {
      off1()
      off2()
    }
  }, [subscribe, qc, prefs])

  async function handleRequest(customerName?: string) {
    setSending(true)
    try {
      const res = await api.createDelivery(customerName)
      toast.success('Solicitud enviada', {
        description: customerName
          ? `Pedido de ${customerName} — avisando a los repartidores…`
          : 'Avisando a los repartidores…',
      })
      qc.setQueryData(
        ['deliveries', 'restaurant', 'active'],
        (old: { deliveries: DeliveryDTO[] } | undefined) => ({
          deliveries: [
            res.delivery,
            ...(old?.deliveries.filter((x) => x.id !== res.delivery.id) || []),
          ],
        }),
      )
      qc.invalidateQueries({ queryKey: ['deliveries', 'restaurant', 'all'] })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message?: string }).message
          : 'Error al solicitar'
      void refetch()
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  const allDeliveries = allData?.deliveries || []
  const todayCount = allDeliveries.filter(
    (d) =>
      d.deliveredAt &&
      new Date(d.deliveredAt).toDateString() === new Date().toDateString(),
  ).length
  const completed = allDeliveries.filter((d) => d.status === 'DELIVERED')
  const avgMs =
    completed.length > 0
      ? Math.round(
          completed.reduce(
            (acc, d) => acc + (d.totalMs || 0),
            0,
          ) / completed.length,
        )
      : 0

  const navItems: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: StoreIcon },
    { id: 'historial', label: 'Historial', icon: ClipboardList },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  ]

  // Horario negociado del local: ¿está abierto ahora?
  const now = useNow(30000) // refresca cada 30s para el estado abierto/cerrado
  const schedule = parseSchedule(
    user.scheduleDays ?? '',
    user.scheduleStart ?? '',
    user.scheduleEnd ?? '',
  )
  const isOpen = isRestaurantOpen(schedule, new Date(now))

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Hola, {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {user.address}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PushBell role="restaurant" userId={user.id} />
        <ConnectionPill status={status} />
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
      {view === 'inicio' && (
        <div className="space-y-4">
          {/* Estado del local: una sola línea compacta */}
          {!user.hasDrivers ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Bike className="h-4 w-4 shrink-0" />
              <span className="font-medium">Sin repartidores asignados — contacta con el administrador</span>
            </div>
          ) : schedule.days.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="font-medium">Sin horario configurado — contacta con el administrador</span>
            </div>
          ) : !isOpen ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="font-medium">Fuera de horario · {scheduleLabel(schedule)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="font-medium">Abierto · {scheduleLabel(schedule)}</span>
            </div>
          )}
          {isLoading ? (
            <Card className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </Card>
          ) : actives.length === 0 ? (
            <RequestCard
              onRequest={() => setRequestOpen(true)}
              disabled={!isOpen || !user.hasDrivers}
              disabledText={!user.hasDrivers ? 'Sin repartidores' : schedule.days.length === 0 ? 'Sin horario' : 'Fuera de horario'}
              closedLabel={!user.hasDrivers ? 'sin repartidores asignados' : !isOpen ? scheduleLabel(schedule) : undefined}
            />
          ) : (
            <>
              {/* Pedir otro reparto SIN scroll: la acción rápida vive arriba,
                  a un toque aunque haya muchos pedidos debajo. El borde
                  discontinuo comunica "añadir otro" sin robar protagonismo
                  a los pedidos que esperan repartidor. Fuera de horario se bloquea. */}
              <Button
                size="lg"
                variant="outline"
                disabled={!isOpen || !user.hasDrivers}
                className="h-12 w-full border-2 border-dashed border-primary/50 bg-primary/5 px-8 text-base font-semibold text-primary hover:border-primary/70 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setRequestOpen(true)}
              >
                <Plus className="mr-2 h-5 w-5" />
                {!user.hasDrivers ? 'Sin repartidores' : schedule.days.length === 0 ? 'Sin horario' : isOpen ? 'Solicitar otro reparto' : 'Fuera de horario'}
              </Button>

              {/* Esperan repartidor: GRANDES como siempre — son los vivos */}
              {pendingActives.length > 0 && (
                <OrdersSectionLabel
                  icon={Clock}
                  label="Esperando repartidor"
                  count={pendingActives.length}
                />
              )}
              {pendingActives.map((d) => (
                <ActiveDeliveryCard key={d.id} delivery={d} />
              ))}

              {/* En marcha: se pliegan solos para no llenar la pantalla;
                  un toque los vuelve a expandir del todo. */}
              {inProgressActives.length > 0 && (
                <OrdersSectionLabel
                  icon={Bike}
                  label="En curso"
                  count={inProgressActives.length}
                />
              )}
              {inProgressActives.map((d) => (
                <ActiveDeliveryCard
                  key={d.id}
                  delivery={d}
                  collapsible
                  open={openOrders.has(d.id)}
                  onToggle={() => toggleOrder(d.id)}
                />
              ))}
            </>
          )}

          {/* Stats bar */}
          <StatsBar
            todayCount={todayCount}
            totalCompleted={completed.length}
            avgMs={avgMs}
          />

          <RequestDialog
            open={requestOpen}
            onOpenChange={setRequestOpen}
            sending={sending}
            onSubmit={handleRequest}
          />
        </div>
      )}
      {view === 'historial' && (
        <RestaurantHistory deliveries={allDeliveries} />
      )}
      {view === 'notificaciones' && (
        <NotificationSettings role="restaurant" userId={user.id} />
      )}
    </AppShell>
  )
}

function ConnectionPill({
  status,
}: {
  status: 'connecting' | 'connected' | 'disconnected'
}) {
  const map = {
    connected: { label: 'Conectado', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    connecting: { label: 'Conectando…', cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    disconnected: { label: 'Sin conexión', cls: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  }[status]
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${map.cls}`}>
      <span className={`h-2 w-2 rounded-full ${map.dot} ${status !== 'disconnected' ? 'animate-pulse' : ''}`} />
      {map.label}
    </span>
  )
}

function RequestCard({
  onRequest,
  disabled = false,
  disabledText = 'Fuera de horario',
  closedLabel,
}: {
  onRequest: () => void
  disabled?: boolean
  disabledText?: string
  closedLabel?: string
}) {
  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <div className="flex items-center justify-between bg-primary px-5 py-3.5 text-white">
        <div className="flex items-center gap-2 font-bold">
          <Bell className="h-4 w-4" />
          Solicitar repartidor
        </div>
        <span className="text-sm font-medium text-white">
          {disabled ? disabledText : 'Listo para enviar'}
        </span>
      </div>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
        <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-bold">¿Pedido listo?</h2>
        {disabled && closedLabel ? (
          <p className="mt-2 max-w-md text-amber-600">
            Tu horario de reparto es <strong>{closedLabel}</strong>. Fuera de
            ese horario no puedes pedir repartidor.
          </p>
        ) : (
          <p className="mt-2 max-w-md text-muted-foreground">
            Pulsa el botón y tus repartidores recibirán la solicitud al instante.
            Puedes anotar el nombre del cliente para que lo vean al recoger, y
            solicitar varios repartos a la vez si tienes varios pedidos.
          </p>
        )}
        <Button
          size="lg"
          disabled={disabled}
          className="mt-8 h-16 w-full max-w-sm text-lg font-semibold"
          onClick={onRequest}
        >
          <Bell className="mr-2 h-6 w-6" />
          {disabled ? disabledText : 'Solicitar repartidor'}
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          El repartidor verá tu ubicación en el mapa
        </p>
      </CardContent>
    </Card>
  )
}

/** Diálogo al solicitar reparto: nombre del cliente (opcional). */
function RequestDialog({
  open,
  onOpenChange,
  sending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sending: boolean
  onSubmit: (customerName?: string) => void
}) {
  const [name, setName] = useState('')

  function handleSend() {
    onSubmit(name.trim() || undefined)
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Solicitar repartidor
          </DialogTitle>
          <DialogDescription>
            Tus repartidores recibirán la solicitud al instante.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="space-y-4 py-1"
        >
          <div className="space-y-2">
            <Label htmlFor="req-name">Nombre del cliente (opcional)</Label>
            <Input
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Pedro — kebab mixto"
              maxLength={60}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Sirve para que el repartidor sepa de quién es el pedido. Puedes
              dejarlo vacío.
            </p>
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSend}
            disabled={sending}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveDeliveryCard({
  delivery,
  collapsible = false,
  open = false,
  onToggle,
}: {
  delivery: DeliveryDTO
  /** Plegable en los estados que ya están en marcha (no en PENDING). */
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const steps = [
    { key: 'PENDING', label: 'Solicitado', time: delivery.requestedAt, icon: Bell },
    { key: 'ACCEPTED', label: 'Aceptado', time: delivery.acceptedAt, icon: Bike },
    { key: 'PICKED_UP', label: 'Recogido', time: delivery.pickedUpAt, icon: PackageCheck },
    { key: 'DELIVERED', label: 'Entregado', time: delivery.deliveredAt, icon: CheckCircle2 },
  ]
  const currentIndex = steps.findIndex((s) => s.key === delivery.status)
  const isPending = delivery.status === 'PENDING'
  const headerIcon = isPending
    ? Bike
    : delivery.status === 'ACCEPTED'
      ? Bike
      : PackageCheck

  // Resumen siempre visible con la tarjeta plegada: quién lo lleva y por
  // dónde va el reparto (mini progreso de puntos).
  const summary = !isPending && (
    <>
      <Bike className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        <strong className="text-foreground">
          {delivery.driverName || 'Repartidor'}
        </strong>
        {delivery.status === 'ACCEPTED'
          ? ' en camino a tu local'
          : ' está repartiendo'}
        {delivery.customerName && (
          <span className="hidden sm:inline"> · {delivery.customerName}</span>
        )}
      </span>
      <MiniStepper total={steps.length} current={currentIndex} />
    </>
  )

  return (
    <CollapsibleOrderCard
      icon={headerIcon}
      orderId={delivery.id}
      requestedAt={delivery.requestedAt}
      collapsible={collapsible}
      open={open}
      onToggle={onToggle ?? (() => {})}
      summary={summary}
    >
      <ActiveDeliveryCardBody delivery={delivery} steps={steps} currentIndex={currentIndex} />
    </CollapsibleOrderCard>
  )
}

/** Cuerpo grande de la tarjeta: la línea de tiempo completa de siempre. */
function ActiveDeliveryCardBody({
  delivery,
  steps,
  currentIndex,
}: {
  delivery: DeliveryDTO
  steps: { key: string; label: string; time: string | null; icon: typeof Bell }[]
  currentIndex: number
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {delivery.customerName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                <User className="h-3.5 w-3.5" />
                {delivery.customerName}
              </span>
            )}
            {delivery.status === 'ACCEPTED' && delivery.driverName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Bike className="h-3.5 w-3.5" />
                {delivery.driverName}
              </span>
            )}
          </div>
          <StatusBadge status={delivery.status} />
        </div>

        {/* Timeline */}
        <ol className="relative space-y-5 border-l-2 border-border pl-6">
          {steps.map((step, i) => {
            const done = i <= currentIndex && step.time
            const isCurrent = i === currentIndex
            const Icon = step.icon
            return (
              <li key={step.key} className="relative">
                <span
                  className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                    done
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-card text-muted-foreground'
                  } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {step.time ? formatTime(step.time) : '—'}
                  </span>
                </div>
                {isCurrent && step.time && (
                  <p className="mt-0.5 text-xs text-primary">{relativeTime(step.time)}</p>
                )}
              </li>
            )
          })}
        </ol>

        {delivery.status === 'PENDING' && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <Clock className="h-4 w-4 shrink-0" />
            Esperando a que un repartidor acepte la solicitud…
          </div>
        )}
        {delivery.status === 'ACCEPTED' && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <Bike className="h-4 w-4 shrink-0" />
            {delivery.driverName || 'El repartidor'} se dirige a tu local para recoger el pedido.
          </div>
        )}
        {delivery.status === 'PICKED_UP' && (
          <>
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
              <PackageCheck className="h-4 w-4 shrink-0" />
              Pedido recogido. {delivery.driverName || 'El repartidor'} está realizando la entrega.
            </div>
            {(delivery.dropoffAddress || delivery.fee != null) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    Entrega en: <strong className="text-foreground">{delivery.dropoffAddress || '—'}</strong>
                    {delivery.distanceKm != null && (
                      <span className="text-xs"> ({formatKm(delivery.distanceKm)})</span>
                    )}
                  </span>
                </span>
                {delivery.fee != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                    <Euro className="h-3.5 w-3.5" />
                    Tarifa: {formatEur(delivery.fee)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
    </>
  )
}

function StatsBar({
  todayCount,
  totalCompleted,
  avgMs,
}: {
  todayCount: number
  totalCompleted: number
  avgMs: number
}) {
  const stats = [
    { label: 'Pedidos hoy', value: String(todayCount), icon: Bell },
    { label: 'Total entregados', value: String(totalCompleted), icon: CheckCircle2 },
    { label: 'Tiempo medio', value: formatDuration(avgMs), icon: Clock },
  ]
  return (
    <Card className="shadow-sm">
      <CardContent className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className={`flex items-center gap-3 px-5 py-4 ${i === 0 ? 'sm:pl-5' : ''}`}
            >
              <Icon className="h-6 w-6 text-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function RestaurantHistory({ deliveries }: { deliveries: DeliveryDTO[] }) {
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<'week' | 'month'>('month')
  const filtered = useMemo(() => {
    if (!query.trim()) return deliveries
    const q = query.toLowerCase()
    return deliveries.filter((d) => d.id.toLowerCase().includes(q))
  }, [deliveries, query])

  // Total a pagar: solo entregados, dentro del periodo seleccionado
  const now = new Date()
  const periodStart = new Date(now)
  if (period === 'week') periodStart.setDate(now.getDate() - 7)
  else periodStart.setMonth(now.getMonth() - 1)

  const periodDeliveries = deliveries.filter(
    (d) => d.status === 'DELIVERED' && d.deliveredAt && new Date(d.deliveredAt) >= periodStart,
  )
  const periodTotal = periodDeliveries.reduce((acc, d) => acc + (d.fee ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Resumen de pago */}
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="flex items-center justify-between gap-2 bg-primary px-5 py-3 text-white">
          <span className="flex items-center gap-2 font-bold">
            <Euro className="h-4 w-4" />
            Total a pagar
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${period === 'week' ? 'bg-white/20' : 'text-white/70 hover:text-white'}`}
            >
              Última semana
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${period === 'month' ? 'bg-white/20' : 'text-white/70 hover:text-white'}`}
            >
              Último mes
            </button>
          </div>
        </div>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-3xl font-bold text-emerald-600">{formatEur(periodTotal)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {periodDeliveries.length} reparto{periodDeliveries.length === 1 ? '' : 's'} entregado{periodDeliveries.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Receipt className="h-6 w-6" />
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">Historial de repartos</h2>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nº de pedido…"
            className="pl-9"
          />
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
          <div className="hidden md:block">
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Pedido</th>
                    <th className="px-5 py-3 font-semibold">Solicitado</th>
                    <th className="px-5 py-3 font-semibold">Recogido</th>
                    <th className="px-5 py-3 font-semibold">Entregado</th>
                    <th className="px-5 py-3 font-semibold">Cliente</th>
                    <th className="px-5 py-3 text-right font-semibold">Distancia</th>
                    <th className="px-5 py-3 text-right font-semibold">Tarifa</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-primary">
                        #{d.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDateTime(d.requestedAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(d.pickedUpAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(d.deliveredAt)}</td>
                      <td className="px-5 py-3">{d.customerName || '—'}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{d.distanceKm != null ? formatKm(d.distanceKm) : '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-600">{d.fee != null ? formatEur(d.fee) : '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={d.status} showDot={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3 scrollbar-thin md:hidden">
            {filtered.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs font-semibold text-primary">
                    #{d.id.slice(-6).toUpperCase()}
                  </p>
                  <StatusBadge status={d.status} showDot={false} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Solicitado: {formatDateTime(d.requestedAt)}</span>
                  <span>Entregado: {formatTime(d.deliveredAt)}</span>
                  {d.customerName && <span className="col-span-2">Cliente: {d.customerName}</span>}
                  {d.distanceKm != null && <span>Distancia: {formatKm(d.distanceKm)}</span>}
                  {d.fee != null && (
                    <span className="font-semibold text-emerald-600">Tarifa: {formatEur(d.fee)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
