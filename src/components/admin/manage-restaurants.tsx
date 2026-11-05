'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Store,
  Plus,
  Trash2,
  KeyRound,
  Loader2,
  LocateFixed,
  MapPin,
  Package,
  AlertTriangle,
  Bike,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { api, ApiError, type AdminRestaurant, type AdminDriver } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'

const UNASSIGNED = '__none__'

export function ManageRestaurants({ currentDriverId }: { currentDriverId?: string }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminRestaurant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminRestaurant | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'restaurants'],
    queryFn: () => api.adminListRestaurants(),
    refetchInterval: 30000,
  })

  const { data: driversData } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers(),
    refetchInterval: 60000,
  })

  const restaurants = data?.restaurants || []
  const drivers = driversData?.drivers || []
  const unassignedCount = restaurants.filter((r) => !r.assignedDriverId).length

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'restaurants'] })
  }

  async function handleAssign(restaurant: AdminRestaurant, value: string) {
    const driverId = value === UNASSIGNED ? null : value
    try {
      const res = await api.adminAssignRestaurant(restaurant.id, driverId)
      const driverName = res.restaurant.assignedDriverName
      toast.success(
        driverName
          ? `${restaurant.name} asignado a ${driverName}`
          : `${restaurant.name} sin repartidor`,
        { description: 'Las peticiones de este local llegarán solo a su repartidor.' },
      )
      invalidate()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Restaurantes</h2>
          <p className="text-sm text-muted-foreground">
            Da de alta los locales y asígnalos a un repartidor: sus peticiones
            llegarán solo a quien los lleva.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo restaurante
        </Button>
      </div>

      {unassignedCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-4 text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-semibold">
                {unassignedCount} local{unassignedCount === 1 ? '' : 'es'} sin repartidor asignado
              </p>
              <p className="mt-0.5">
                Esos restaurantes no podrán pedir reparto hasta que les asignes un
                repartidor desde la lista de abajo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Locales activos</p>
              <p className="text-2xl font-bold">{restaurants.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Servicios totales</p>
              <p className="text-2xl font-bold">
                {restaurants.reduce((acc, r) => acc + r.services, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : restaurants.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">Aún no has dado de alta ningún local</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea el primer restaurante con «Nuevo restaurante»
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {restaurants.map((r) => (
            <Card key={r.id} className={`shadow-sm ${!r.assignedDriverId ? 'border-amber-300' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Store className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {r.address}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Usuario: <span className="font-mono font-medium text-foreground">{r.username}</span>
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {r.services} servicios
                  </span>
                </div>

                {/* Assigned driver */}
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">
                    Repartidor asignado
                  </Label>
                  <div className="mt-1.5">
                    <Select
                      value={r.assignedDriverId || UNASSIGNED}
                      onValueChange={(v) => handleAssign(r, v)}
                    >
                      <SelectTrigger
                        className={`h-9 w-full text-sm ${!r.assignedDriverId ? 'border-amber-400 text-amber-700' : ''}`}
                        aria-label={`Repartidor asignado a ${r.name}`}
                      >
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>
                          <span className="flex items-center gap-1.5 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Sin asignar
                          </span>
                        </SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            <span className="flex items-center gap-1.5">
                              <Bike className="h-3.5 w-3.5" />
                              {d.name}
                              {d.id === currentDriverId ? ' (tú)' : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Dado de alta {formatDateTime(r.createdAt)}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setResetTarget(r)}
                  >
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                    Cambiar clave
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateRestaurantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentDriverId={currentDriverId}
        onCreated={() => {
          invalidate()
          setCreateOpen(false)
        }}
      />
      <ResetPasswordDialog
        target={resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onDone={() => {
          invalidate()
          setResetTarget(null)
        }}
      />
      <DeleteRestaurantDialog
        target={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDone={() => {
          invalidate()
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function CreateRestaurantDialog({
  open,
  onOpenChange,
  currentDriverId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  currentDriverId: string | undefined
  onCreated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [assignedDriverId, setAssignedDriverId] = useState<string>(currentDriverId ?? '')

  const { data: driversData } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers(),
    enabled: open,
  })
  const drivers: AdminDriver[] = driversData?.drivers || []

  function reset() {
    setName('')
    setUsername('')
    setPassword('')
    setAddress('')
    setLat('')
    setLng('')
    setAssignedDriverId(currentDriverId ?? '')
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success('Ubicación detectada')
      },
      () => {
        setLocating(false)
        toast.error('No se pudo obtener la ubicación')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !username || !password || !address || !lat || !lng) {
      toast.error('Completa todos los campos')
      return
    }
    setLoading(true)
    try {
      const res = await api.adminCreateRestaurant({
        name,
        username,
        password,
        address,
        lat: Number(lat),
        lng: Number(lng),
        assignedDriverId: assignedDriverId === UNASSIGNED ? null : assignedDriverId,
      })
      toast.success('Restaurante creado', {
        description: `Credenciales para ${res.restaurant.name}: ${res.restaurant.username}`,
        duration: 8000,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Nuevo restaurante
          </DialogTitle>
          <DialogDescription>
            Crea la cuenta del local, entrégale las credenciales en persona y
            decide qué repartidor lo lleva.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="c-name">Nombre del restaurante</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Kebab Istanbul"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-username">Usuario</Label>
              <Input
                id="c-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="istanbul"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-password">Contraseña</Label>
              <Input
                id="c-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mín. 4 caracteres"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-address">Dirección del local</Label>
            <Input
              id="c-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, número, ciudad"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Repartidor que lo lleva</Label>
            <Select value={assignedDriverId} onValueChange={setAssignedDriverId}>
              <SelectTrigger className="w-full" aria-label="Repartidor asignado">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>
                  <span className="flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sin asignar (no podrá pedir reparto)
                  </span>
                </SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-1.5">
                      <Bike className="h-3.5 w-3.5" />
                      {d.name}
                      {d.id === currentDriverId ? ' (tú)' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Las peticiones de este restaurante llegarán solo al repartidor
              elegido. Podrás cambiarlo en cualquier momento.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ubicación (lat, lng)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useMyLocation}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
                )}
                Mi ubicación
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitud"
                inputMode="decimal"
              />
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitud"
                inputMode="decimal"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              El repartidor verá esta posición en el mapa al aceptar el pedido.
            </p>
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
            Crear restaurante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminRestaurant | null
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
      await api.adminResetRestaurantPassword(target.id, password)
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
            <Label htmlFor="r-pass">Nueva contraseña</Label>
            <Input
              id="r-pass"
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

function DeleteRestaurantDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminRestaurant | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!target) return
    setLoading(true)
    try {
      await api.adminDeleteRestaurant(target.id)
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
            Eliminar restaurante
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target ? (
              <>
                Vas a eliminar <strong>{target.name}</strong> ({target.username}).
                Se borrarán también sus {target.services} reparto
                {target.services === 1 ? '' : 's'} del historial. Esta acción no
                se puede deshacer.
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
