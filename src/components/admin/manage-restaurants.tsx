'use client'

import { useState, useEffect } from 'react'
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
  Check,
  Euro,
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
import { api, ApiError, type AdminRestaurant, type AdminDriver } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { feeExplanation, type FeeConfig } from '@/lib/fees'
import { AddressAutocomplete } from '@/components/driver/address-autocomplete'
import type { AddressSuggestion } from '@/lib/types'
import { parseSchedule, scheduleLabel, DAY_LABELS, DAY_SHORT } from '@/lib/schedule'
import { Clock } from 'lucide-react'

export function ManageRestaurants() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminRestaurant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminRestaurant | null>(null)
  const [feeTarget, setFeeTarget] = useState<AdminRestaurant | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<AdminRestaurant | null>(null)

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
  const unassignedCount = restaurants.filter((r) => r.assignedDriverIds.length === 0).length

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'restaurants'] })
  }

  /** Añade/quita un repartidor del local (multi-asignación). */
  async function handleAssignToggle(restaurant: AdminRestaurant, driverId: string) {
    const current = restaurant.assignedDriverIds
    const next = current.includes(driverId)
      ? current.filter((id) => id !== driverId)
      : [...current, driverId]
    try {
      const res = await api.adminAssignRestaurant(restaurant.id, next)
      const names = res.restaurant.assignedDriverNames
      toast.success(
        names.length
          ? `${restaurant.name} → ${names.join(', ')}`
          : `${restaurant.name} sin repartidores`,
        {
          description:
            next.length > 1
              ? 'Las peticiones llegarán a todos; el primero que acepte se lleva el pedido.'
              : 'Las peticiones de este local llegarán solo a su repartidor.',
        },
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
                {unassignedCount} local{unassignedCount === 1 ? '' : 'es'} sin repartidores asignados
              </p>
              <p className="mt-0.5">
                Esos restaurantes no podrán pedir reparto hasta que les asignes al
                menos un repartidor desde la lista de abajo.
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
            <Card key={r.id} className={`shadow-sm ${r.assignedDriverIds.length === 0 ? 'border-amber-300' : ''}`}>
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

                {/* Repartidores asignados (múltiples) */}
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">
                    Repartidores ({r.assignedDriverIds.length})
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {drivers.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Crea primero un repartidor en la sección «Repartidores».
                      </p>
                    )}
                    {drivers.map((d) => {
                      const selected = r.assignedDriverIds.includes(d.id)
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleAssignToggle(r, d.id)}
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.97] ${
                            selected
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                          }`}
                        >
                          <Bike className="h-3.5 w-3.5" />
                          {d.name}
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Pulsa para asignar o quitar. Las peticiones llegan a todos los
                    asignados; el primero que acepta se lleva el pedido.
                  </p>
                </div>

                {/* Tarifa del local — configurable por restaurante */}
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Euro className="h-3.5 w-3.5" />
                      Tarifa
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setFeeTarget(r)}
                    >
                      Editar tarifa
                    </Button>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">
                    {feeExplanation({
                      baseEur: r.feeBaseEur,
                      thresholdKm: r.feeThresholdKm,
                      perExtraKmEur: r.feePerExtraKmEur,
                    } as FeeConfig)}
                  </p>
                </div>

                {/* Horario negociado del local */}
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
                      onClick={() => setScheduleTarget(r)}
                    >
                      Editar horario
                    </Button>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">
                    {scheduleLabel(parseSchedule(r.scheduleDays, r.scheduleStart, r.scheduleEnd))}
                  </p>
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
      <EditFeeDialog
        target={feeTarget}
        onOpenChange={(o) => !o && setFeeTarget(null)}
        onDone={() => {
          invalidate()
          setFeeTarget(null)
        }}
      />
      <EditScheduleDialog
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

function CreateRestaurantDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')
  /** Sugerencia elegida del autocomplete: trae dirección normalizada + coords. */
  const [selected, setSelected] = useState<AddressSuggestion | null>(null)
  /** Coordenadas manuales (fallback «Mi ubicación» cuando no hay sugerencia). */
  const [manualCoords, setManualCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [assignedDriverIds, setAssignedDriverIds] = useState<string[]>([])

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
    setSelected(null)
    setManualCoords(null)
    setAssignedDriverIds([])
  }

  /** Coordenadas efectivas: las de la sugerencia elegida, o las manuales. */
  const coords = selected ? { lat: selected.lat, lng: selected.lng } : manualCoords

  function toggleDriver(id: string) {
    setAssignedDriverIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setManualCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        })
        setLocating(false)
        toast.success('Ubicación detectada', {
          description: 'Coordenadas fijadas. Escribe la dirección del local arriba.',
        })
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
    if (!name || !username || !password || !address) {
      toast.error('Completa todos los campos')
      return
    }
    if (!coords) {
      toast.error('Selecciona la dirección del desplegable o usa «Mi ubicación»')
      return
    }
    setLoading(true)
    try {
      const res = await api.adminCreateRestaurant({
        name,
        username,
        password,
        // Si hay sugerencia, su label es la dirección normalizada; si no, el texto tal cual
        address: selected ? selected.label : address,
        lat: coords.lat,
        lng: coords.lng,
        assignedDriverIds,
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
            <AddressAutocomplete
              id="c-address"
              value={address}
              onChange={setAddress}
              onSelect={(s) => {
                setSelected(s)
                setManualCoords(null)
              }}
              onSelectionCleared={() => setSelected(null)}
              placeholder="Calle, número, ciudad — salen sugerencias"
            />
            <p className="text-xs text-muted-foreground">
              Escribe la calle y número y elige la dirección del desplegable:
              se rellena sola con la posición exacta en el mapa.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Repartidores que lo llevan</Label>
            {drivers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay repartidores todavía: podrás asignarlos luego desde la lista.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {drivers.map((d) => {
                  const selected = assignedDriverIds.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDriver(d.id)}
                      aria-pressed={selected}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.97] ${
                        selected
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      <Bike className="h-3.5 w-3.5" />
                      {d.name}
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Puedes asignar varios: las peticiones llegarán a todos y el
              primero que acepte se llevará el pedido. Podrás cambiarlo en
              cualquier momento.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Posición en el mapa
              </Label>
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
            {coords ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="font-mono text-xs">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
                {selected ? (
                  <span className="ml-auto text-xs font-medium">✓ Dirección seleccionada</span>
                ) : (
                  <span className="ml-auto text-xs font-medium">Ubicación GPS</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>
                  Selecciona una dirección del desplegable de arriba, o pulsa
                  «Mi ubicación» si estás en el local.
                </span>
              </div>
            )}
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

function EditFeeDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminRestaurant | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [baseEur, setBaseEur] = useState('')
  const [thresholdKm, setThresholdKm] = useState('')
  const [perExtraKmEur, setPerExtraKmEur] = useState('')

  // Prefill al abrir con los valores actuales del local
  useEffect(() => {
    if (target) {
      setBaseEur(String(target.feeBaseEur))
      setThresholdKm(String(target.feeThresholdKm))
      setPerExtraKmEur(String(target.feePerExtraKmEur))
    }
  }, [target])

  const config: FeeConfig | null = parseFee(baseEur, thresholdKm, perExtraKmEur)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target || !config) return
    setLoading(true)
    try {
      await api.adminUpdateRestaurantFees(target.id, {
        feeBaseEur: config.baseEur,
        feeThresholdKm: config.thresholdKm,
        feePerExtraKmEur: config.perExtraKmEur,
      })
      toast.success('Tarifa actualizada', {
        description: `${target.name}: ${feeExplanation(config)}`,
      })
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
            <Euro className="h-5 w-5 text-primary" />
            Tarifa de {target?.name ?? ''}
          </DialogTitle>
          <DialogDescription>
            Define la tarifa de reparto de este local. Se aplica al recoger cada
            pedido según la distancia hasta la dirección de entrega.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="fee-base">Tarifa base (€)</Label>
            <Input
              id="fee-base"
              value={baseEur}
              onChange={(e) => setBaseEur(e.target.value)}
              placeholder="3"
              inputMode="decimal"
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Importe fijo que se cobra hasta el umbral de km.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fee-threshold">Umbral de km incluidos</Label>
            <Input
              id="fee-threshold"
              value={thresholdKm}
              onChange={(e) => setThresholdKm(e.target.value)}
              placeholder="2"
              inputMode="decimal"
              required
            />
            <p className="text-xs text-muted-foreground">
              Hasta esta distancia se cobra solo la tarifa base.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fee-extra">Suplemento por km adicional (€)</Label>
            <Input
              id="fee-extra"
              value={perExtraKmEur}
              onChange={(e) => setPerExtraKmEur(e.target.value)}
              placeholder="0.35"
              inputMode="decimal"
              required
            />
            <p className="text-xs text-muted-foreground">
              Se suma por cada kilómetro empezado por encima del umbral.
            </p>
          </div>

          {/* Previsualización de la tarifa resultante */}
          {config && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-semibold">Así quedará:</p>
              <p className="mt-0.5">{feeExplanation(config)}</p>
            </div>
          )}
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !target || !config}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar tarifa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


function parseFee(base: string, threshold: string, extra: string): FeeConfig | null {
  const b = Number(base.replace(',', '.'))
  const t = Number(threshold.replace(',', '.'))
  const e = Number(extra.replace(',', '.'))
  if (![b, t, e].every((n) => Number.isFinite(n) && n >= 0)) return null
  if (b > 100 || e > 50 || t > 100) return null
  return { baseEur: b, thresholdKm: t, perExtraKmEur: e }
}

/**
 * Editor del horario negociado del local. Selecciona los días activos con
 * botones (Lun–Dom) y la franja horaria con dos inputs de tipo time.
 * Vacío (sin días ni horas) = bloqueado (no puede pedir reparto).
 */
function EditScheduleDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminRestaurant | null
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

  const is247 = days.length === 0 && !start && !end

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setLoading(true)
    try {
      const scheduleDays = days.slice().sort().join(',')
      await api.adminUpdateRestaurantSchedule(target.id, {
        scheduleDays,
        scheduleStart: start,
        scheduleEnd: end,
      })
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
            Días y franja horaria en los que este local puede pedir reparto.
            Fuera de este horario, el botón de solicitar repartidor se bloquea.
            Si lo dejas vacío, el local no podrá pedir reparto hasta que configures un horario.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Días activos */}
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
            <p className="text-xs text-muted-foreground">
              {days.length === 0
                ? 'Sin selección = todos los días (pero necesita franja horaria).'
                : `${days.length} día${days.length === 1 ? '' : 's'} seleccionado${days.length === 1 ? '' : 's'}.`}
            </p>
          </div>

          {/* Franja horaria */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sch-start">Desde</Label>
              <Input
                id="sch-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                  disabled={days.length === 0 && !end}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-end">Hasta</Label>
              <Input
                id="sch-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={days.length === 0 && !start}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Si la hora de fin es menor que la de inicio, la franja cruza
            medianoche (ej. 22:00–05:00 = madrugada incluida).
          </p>

          {/* Previsualización */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">Así quedará:</p>
            <p className="mt-0.5">
              {scheduleLabel(parseSchedule(days.slice().sort().join(','), start, end))}
            </p>
          </div>

          {is247 && (
            <p className="text-xs text-rose-600">
              ⚠ Sin horario: el local <strong>no podrá pedir reparto</strong> hasta que configures sus días y horas.
            </p>
          )}
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
