'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Phone,
  Printer,
  QrCode,
  Store,
  UserCheck,
  UserPlus,
  UserX,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { api, ApiError, type Lead } from '@/lib/api-client'
import { formatDateTime, relativeTime } from '@/lib/format'
import { useNow } from '@/hooks/use-now'

const STATUS_CONFIG: Record<
  Lead['status'],
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Nueva',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  CONTACTED: {
    label: 'Contactado',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  CONVERTED: {
    label: 'Convertido',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  REJECTED: {
    label: 'Descartado',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  },
}

export function ManageLeads({ currentDriverId }: { currentDriverId?: string }) {
  const qc = useQueryClient()
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)
  const [notesTarget, setNotesTarget] = useState<Lead | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'leads'],
    queryFn: () => api.adminListLeads(),
    refetchInterval: 30000,
  })

  const leads = data?.leads || []
  const pendingCount = leads.filter((l) => l.status === 'PENDING').length

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'leads'] })
    qc.invalidateQueries({ queryKey: ['admin', 'restaurants'] })
  }

  async function setStatus(lead: Lead, status: string) {
    try {
      await api.adminUpdateLead(lead.id, { status })
      const labels: Record<string, string> = {
        CONTACTED: 'Marcado como contactado',
        REJECTED: 'Solicitud descartada',
        PENDING: 'Vuelta a pendientes',
      }
      toast.success(labels[status] || 'Estado actualizado')
      invalidate()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Solicitudes de locales</h2>
        <p className="text-sm text-muted-foreground">
          Contactos que llegan desde el folleto con QR. Negocia con ellos y, si
          os ponéis de acuerdo, conviértelos en restaurante con un clic.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* QR flyer card */}
        <QrFlyerCard />

        {/* Leads list */}
        <div className="space-y-3 lg:col-span-2">
          {isLoading ? (
            <Card className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
          ) : leads.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="font-medium">Aún no hay solicitudes</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Imprime el folleto con el QR y déjalo en los locales que
                  quieras captar: cuando lo escaneen y te escriban, aparecerán
                  aquí.
                </p>
              </CardContent>
            </Card>
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onContacted={() => setStatus(lead, 'CONTACTED')}
                onReject={() => setStatus(lead, 'REJECTED')}
                onOpenNotes={() => setNotesTarget(lead)}
                onOpenConvert={() => setConvertTarget(lead)}
              />
            ))
          )}
        </div>
      </div>

      <ConvertLeadDialog
        target={convertTarget}
        currentDriverId={currentDriverId}
        onOpenChange={(o) => !o && setConvertTarget(null)}
        onDone={() => {
          invalidate()
          setConvertTarget(null)
        }}
      />
      <NotesDialog
        target={notesTarget}
        onOpenChange={(o) => !o && setNotesTarget(null)}
        onDone={() => {
          invalidate()
          setNotesTarget(null)
        }}
      />
    </div>
  )
}

const emptySubscribe = () => () => {}

function QrFlyerCard() {
  // Read the browser origin (SSR-safe, no setState-in-effect)
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => '',
  )
  const contactUrl = `${origin || 'https://repartosnovi.com'}/?contacto`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(contactUrl)}`

  function printFlyer() {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) {
      toast.error('El navegador bloqueó la ventana de impresión')
      return
    }
    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Folleto Repartos NOVI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1F2937; padding: 48px; }
  .flyer { max-width: 560px; margin: 0 auto; text-align: center; border: 4px solid #F97316; border-radius: 24px; padding: 48px 40px; }
  .brand { font-size: 40px; font-weight: 900; font-style: italic; color: #F97316; letter-spacing: -1px; }
  .brand-sub { font-size: 20px; font-weight: 700; font-style: italic; color: #1F2937; margin-bottom: 6px; }
  h1 { font-size: 26px; margin: 18px 0 8px; }
  p.lead { font-size: 16px; color: #6B7280; margin-bottom: 24px; }
  img.qr { width: 280px; height: 280px; }
  .cta { font-size: 18px; font-weight: 700; margin-top: 16px; }
  .url { font-size: 13px; color: #6B7280; margin-top: 8px; word-break: break-all; }
  .features { display: flex; justify-content: center; gap: 18px; margin-top: 26px; flex-wrap: wrap; }
  .features span { font-size: 13px; color: #1F2937; background: #FFF3E8; border-radius: 999px; padding: 6px 14px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="flyer">
    <div class="brand-sub">Repartos</div>
    <div class="brand">NOVI</div>
    <h1>¿Tu local necesita reparto nocturno?</h1>
    <p class="lead">Reparto dedicado para restaurantes de zona. Escanea el código y déjanos tus datos: te contactamos sin compromiso.</p>
    <img class="qr" src="${qrUrl}" alt="QR ${contactUrl}" />
    <div class="cta">Escanea con la cámara del móvil</div>
    <div class="url">${contactUrl}</div>
    <div class="features">
      <span>✓ Un solo botón</span>
      <span>✓ Sin permanencia</span>
      <span>✓ Trato directo</span>
    </div>
  </div>
  <script>window.onload = () => window.print()</script>
</body>
</html>`)
    w.document.close()
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col items-center p-5 text-center">
        <h3 className="flex items-center gap-2 self-start text-base font-bold">
          <QrCode className="h-4 w-4 text-primary" />
          Folleto captación
        </h3>
        <p className="mt-1 self-start text-xs text-muted-foreground">
          Imprime y reparte: quien escanee el QR llegará a tu formulario de
          contacto.
        </p>
        <div className="my-4 rounded-xl border border-border bg-white p-3">
          <img
            src={qrUrl}
            alt="Código QR del formulario de contacto"
            className="h-36 w-36"
          />
        </div>
        <p className="break-all text-[11px] text-muted-foreground">{contactUrl}</p>
        <Button
          onClick={printFlyer}
          className="mt-4 w-full bg-primary text-white hover:bg-primary/90"
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Imprimir folleto
        </Button>
      </CardContent>
    </Card>
  )
}

function LeadCard({
  lead,
  onContacted,
  onReject,
  onOpenNotes,
  onOpenConvert,
}: {
  lead: Lead
  onContacted: () => void
  onReject: () => void
  onOpenNotes: () => void
  onOpenConvert: () => void
}) {
  const tone = STATUS_CONFIG[lead.status]
  const isPending = lead.status === 'PENDING'
  const isConverted = lead.status === 'CONVERTED'

  return (
    <Card className={`shadow-sm ${isPending ? 'border-primary/40' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isConverted
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {isConverted ? <Store className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{lead.restaurantName}</p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.className}`}
                >
                  {tone.label}
                </span>
              </div>
              {lead.contactName && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Contacto: {lead.contactName}
                </p>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {lead.phone}
                </a>
              )}
              {lead.message && (
                <p className="mt-2 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
                  “{lead.message}”
                </p>
              )}
              {lead.notes && (
                <p className="mt-2 rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground">
                  <MessageSquare className="mr-1 inline h-3 w-3" />
                  {lead.notes}
                </p>
              )}
            </div>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
            <span>{formatDateTime(lead.createdAt)}</span>
            {isPending && <RelativeBadge iso={lead.createdAt} />}
          </span>
        </div>

        {isConverted && lead.convertedRestaurantName && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Dado de alta como <strong>{lead.convertedRestaurantName}</strong>
          </p>
        )}

        {!isConverted && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onOpenConvert} className="bg-primary text-white hover:bg-primary/90">
              <Store className="mr-1.5 h-4 w-4" />
              Crear restaurante
            </Button>
            {isPending ? (
              <Button variant="outline" onClick={onContacted}>
                <UserCheck className="mr-1.5 h-4 w-4" />
                Contactado
              </Button>
            ) : null}
            <Button variant="outline" onClick={onOpenNotes}>
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Notas
            </Button>
            <Button
              variant="outline"
              className="ml-auto border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={onReject}
            >
              <UserX className="mr-1.5 h-4 w-4" />
              Descartar
            </Button>
          </div>
        )}
        {isConverted && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={onOpenNotes}>
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Notas
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RelativeBadge({ iso }: { iso: string }) {
  useNow(30000)
  return (
    <span className="flex items-center gap-1 text-[11px] text-primary">
      <Clock className="h-3 w-3" />
      {relativeTime(iso)}
    </span>
  )
}

function ConvertLeadDialog({
  target,
  currentDriverId,
  onOpenChange,
  onDone,
}: {
  target: Lead | null
  currentDriverId: string | undefined
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('40.4168')
  const [lng, setLng] = useState('-3.7038')
  const [assignedDriverId, setAssignedDriverId] = useState<string | undefined>(currentDriverId)

  const { data: driversData } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers(),
    enabled: !!target,
  })
  const drivers = driversData?.drivers || []

  // The dialog is opened by the parent setting `target`; Radix never fires
  // onOpenChange(true) in that flow, so prefill must run as an effect.
  useEffect(() => {
    if (target) prefill(target)
  }, [target])

  function prefill(t: Lead | null) {
    if (!t) return
    setName(t.restaurantName)
    const slug = t.restaurantName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 16) || 'local'
    setUsername(slug)
    setPassword(
      Math.random().toString(36).slice(2, 6) + Math.floor(Math.random() * 90 + 10),
    )
    setAddress('')
    setLat('40.4168')
    setLng('-3.7038')
    setAssignedDriverId(currentDriverId)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setLoading(true)
    try {
      const res = await api.adminConvertLead(target.id, {
        name,
        username,
        password,
        address,
        lat: Number(lat),
        lng: Number(lng),
        assignedDriverId: assignedDriverId || null,
      })
      toast.success('Restaurante creado', {
        description: `${res.restaurant.name}: ${res.restaurant.username} / ${password}`,
        duration: 10000,
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
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (o) prefill(target)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Convertir en restaurante
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Crea la cuenta de ${target.restaurantName} tras llegar a acuerdo. Se generan las credenciales para entregárselas.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cv-name">Nombre del restaurante</Label>
            <Input
              id="cv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cv-username">Usuario</Label>
              <Input
                id="cv-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-password">Contraseña</Label>
              <Input
                id="cv-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cv-address">Dirección del local</Label>
            <Input
              id="cv-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, número, ciudad"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Repartidor que lo llevará</Label>
            <Select value={assignedDriverId} onValueChange={setAssignedDriverId}>
              <SelectTrigger className="w-full" aria-label="Repartidor asignado">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.id === currentDriverId ? ' (tú)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cv-lat">Latitud</Label>
              <Input
                id="cv-lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-lng">Longitud</Label>
              <Input
                id="cv-lng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
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
            disabled={loading || !target}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Crear y convertir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NotesDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: Lead | null
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')

  // Load the existing notes every time a different lead is opened (the
  // dialog opens via the parent's `target`, not via onOpenChange).
  useEffect(() => {
    if (target) setNotes(target.notes || '')
  }, [target])

  function handleOpen(o: boolean) {
    if (o && target) setNotes(target.notes || '')
    onOpenChange(o)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setLoading(true)
    try {
      await api.adminUpdateLead(target.id, { notes })
      toast.success('Notas guardadas')
      onDone()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Notas de la conversación
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Apunta lo hablado con ${target.restaurantName}: precios, condiciones, horarios…`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: 2€/reparto, cierra a las 00:30, unos 8 pedidos/noche fin de semana…"
            rows={5}
            autoFocus
          />
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !target}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar notas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
