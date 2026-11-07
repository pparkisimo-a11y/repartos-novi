'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Trash2,
  KeyRound,
  Loader2,
  Bike,
  Store,
  Package,
  AlertTriangle,
  UserRound,
  Clock,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { api, ApiError, type AdminDriver } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { parseSchedule, scheduleLabel, DAY_SHORT } from '@/lib/schedule'

export function ManageDrivers({ currentDriverId }: { currentDriverId?: string }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminDriver | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminDriver | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<AdminDriver | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers(),
    refetchInterval: 30000,
  })

  const drivers = data?.drivers || []

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'drivers'] })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Repartidores</h2>
          <p className="text-sm text-muted-foreground">
            Crea una cuenta por repartidor y asigna cada restaurante a quien lo
            lleva. Las peticiones llegarán solo a su repartidor.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo repartidor
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Repartidores</p>
              <p className="text-2xl font-bold">{drivers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Locales repartidos</p>
              <p className="text-2xl font-bold">
                {drivers.reduce((acc, d) => acc + d.restaurants, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : drivers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">Aún no hay repartidores</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => {
            const isMe = d.id === currentDriverId
            return (
              <Card key={d.id} className={`shadow-sm ${isMe ? 'border-primary/40' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold ${
                          isMe ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {d.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{d.name}</p>
                          {isMe && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              Tú
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Usuario: <span className="font-mono font-medium text-foreground">{d.username}</span>
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Store className="h-3 w-3" />
                            {d.restaurants} {d.restaurants === 1 ? 'local' : 'locales'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {d.services} servicios
                          </span>
                        </p>
                      </div>
                    </div>
                    <Bike className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Alta {formatDateTime(d.createdAt)}
                  </div>

                  {/* Horario laboral del repartidor */}
                  <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Horario
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setScheduleTarget(d)}
                      >
                        Editar horario
                      </Button>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground">
                      {scheduleLabel(parseSchedule(d.scheduleDays, d.scheduleStart, d.scheduleEnd))}
                    </p>
                  </div>

                  {/* Súper repartidor: puede robar pedidos de otros */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5">
                      <Shield className={`h-4 w-4 ${d.isSuperDriver ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      <span className="text-xs font-semibold text-muted-foreground">Súper repartidor</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.adminToggleSuperDriver(d.id, !d.isSuperDriver)
                          toast.success(d.isSuperDriver ? 'Súper repartidor desactivado' : 'Súper repartidor activado', {
                            description: d.isSuperDriver
                              ? `${d.name} ya no puede robar pedidos.`
                              : `${d.name} ahora puede ver y robar los pedidos de todos los locales.`,
                          })
                          invalidate()
                        } catch (err) {
                          toast.error(err instanceof ApiError ? err.message : 'Error')
                        }
                      }}
                      aria-pressed={d.isSuperDriver}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        d.isSuperDriver ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.isSuperDriver ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setResetTarget(d)}
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                      Cambiar clave
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                      onClick={() => setDeleteTarget(d)}
                      disabled={isMe}
                      title={isMe ? 'No puedes eliminar tu propia cuenta' : undefined}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateDriverDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          invalidate()
          setCreateOpen(false)
        }}
      />
      <ResetDriverPasswordDialog
        target={resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onDone={() => {
          invalidate()
          setResetTarget(null)
        }}
      />
      <DeleteDriverDialog
        target={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDone={() => {
          invalidate()
          setDeleteTarget(null)
          qc.invalidateQueries({ queryKey: ['admin', 'restaurants'] })
        }}
      />
      <EditDriverScheduleDialog
        target={scheduleTarget}
        onOpenChange={(o) => !o && setScheduleTarget(null)}
        onDone={() => {
          invalidate()
          setScheduleTarget(null)
        }}
      />
    </div>
  )
}

function CreateDriverDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function reset() {
    setName('')
    setUsername('')
    setPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !username || !password) {
      toast.error('Completa todos los campos')
      return
    }
    setLoading(true)
    try {
      const res = await api.adminCreateDriver({ username, name, password })
      toast.success('Repartidor creado', {
        description: `Credenciales: ${res.driver.username} / ${password}`,
        duration: 10000,
      })
      reset()
      onCreated()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            Nuevo repartidor
          </DialogTitle>
          <DialogDescription>
            Crea la cuenta del repartidor y entrégale sus credenciales. Luego,
            en «Restaurantes», asígnale los locales que llevará.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="d-name">Nombre</Label>
            <Input
              id="d-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Sergio"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="d-username">Usuario</Label>
              <Input
                id="d-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sergio"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-password">Contraseña</Label>
              <Input
                id="d-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mín. 4 caracteres"
                required
              />
            </div>
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Crear repartidor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetDriverPasswordDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminDriver | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setLoading(true)
    try {
      await api.adminResetDriverPassword(target.id, password)
      toast.success('Contraseña actualizada', {
        description: `${target.name}: ${target.username} / ${password}`,
        duration: 10000,
      })
      setPassword('')
      onDone()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Cambiar contraseña
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Define una nueva contraseña para ${target.name} (${target.username}). Se la debes comunicar en persona.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="dp-pass">Nueva contraseña</Label>
            <Input
              id="dp-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mín. 4 caracteres"
              autoFocus
              required
            />
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !target}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Actualizar contraseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDriverDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminDriver | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!target) return
    setLoading(true)
    try {
      await api.adminDeleteDriver(target.id)
      toast.success(`${target.name} eliminado`)
      onDone()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            Eliminar repartidor
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target ? (
              <>
                Vas a eliminar a <strong>{target.name}</strong> ({target.username}).
                Sus {target.restaurants} local{target.restaurants === 1 ? '' : 'es'}
                {' '}quedarán sin repartidor asignado hasta que los reasignes. El
                historial de repartos no se pierde. Esta acción no se puede
                deshacer.
              </>
            ) : (
              ''
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading || !target}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Sí, eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Editor del horario laboral del repartidor (igual que el de restaurantes). */
function EditDriverScheduleDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminDriver | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState<number[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => {
    if (target) {
      const s = parseSchedule(target.scheduleDays, target.scheduleStart, target.scheduleEnd)
      setDays(s.days)
      setStart(s.start)
      setEnd(s.end)
    }
  }, [target])

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setLoading(true)
    try {
      const scheduleDays = days.slice().sort().join(',')
      await api.adminUpdateDriverSchedule(target.id, { scheduleDays, scheduleStart: start, scheduleEnd: end })
      toast.success('Horario actualizado', {
        description: scheduleLabel(parseSchedule(scheduleDays, start, end)),
      })
      onDone()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Horario de {target?.name ?? ''}
          </DialogTitle>
          <DialogDescription>
            Días y franja horaria en los que este repartidor trabaja. Fuera de
            su horario no se le ofrecerán pedidos (se salta en la rotación).
            Si lo dejas vacío, trabaja todos los días a cualquier hora.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Días activos</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const selected = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={selected}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors active:scale-95 ${
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="d-sch-start">Desde</Label>
              <Input id="d-sch-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-sch-end">Hasta</Label>
              <Input id="d-sch-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Si la hora de fin es menor que la de inicio, la franja cruza medianoche.
          </p>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">Así quedará:</p>
            <p className="mt-0.5">{scheduleLabel(parseSchedule(days.slice().sort().join(','), start, end))}</p>
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !target}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar horario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
