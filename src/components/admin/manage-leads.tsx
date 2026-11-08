'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Bike,
  Check,
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
        <div className="min-w-0">
          <QrFlyerCard />
        </div>

        {/* Leads list */}
        <div className="min-w-0 space-y-3 lg:col-span-2">
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
  const displayUrl = contactUrl.replace(/^https?:\/\//, '')

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
  body {
    font-family: -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif;
    background: #F4F4F5;
    color: #27272A;
    padding: 32px 16px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .flyer {
    max-width: 520px;
    margin: 0 auto;
    background: #fff;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 8px 30px rgba(0,0,0,.10);
  }
  .head { background: #18181B; padding: 32px 24px 26px; text-align: center; }
  .head .pre {
    color: #A1A1AA;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 7px;
    text-transform: uppercase;
  }
  .head .brand {
    color: #F97316;
    font-size: 54px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -2px;
    line-height: 1.05;
    margin-top: 2px;
  }
  .head .tag {
    display: inline-block;
    margin-top: 10px;
    padding: 5px 14px;
    background: rgba(249,115,22,.14);
    border: 1px solid rgba(249,115,22,.45);
    color: #FDBA74;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
  }
  .body { padding: 28px 28px 30px; text-align: center; }
  h1 { font-size: 25px; line-height: 1.2; letter-spacing: -.4px; color: #18181B; }
  h1 em { font-style: normal; color: #F97316; }
  .sub {
    margin: 10px auto 0;
    max-width: 380px;
    color: #52525B;
    font-size: 14.5px;
    line-height: 1.55;
  }
  .qr-wrap {
    margin-top: 22px;
    display: inline-block;
    padding: 13px;
    border: 2px dashed #E4E4E7;
    border-radius: 18px;
  }
  .qr-wrap img { display: block; width: 205px; height: 205px; }
  .qr-cta { margin-top: 12px; font-size: 15px; font-weight: 800; color: #18181B; }
  .qr-sub { margin-top: 3px; font-size: 12px; color: #71717A; }
  .features {
    margin-top: 22px;
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .features span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #FFF7ED;
    border: 1px solid #FED7AA;
    color: #7C2D12;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 13px;
    border-radius: 999px;
  }
  .features b { color: #F97316; font-size: 13px; }
  .foot { background: #F97316; padding: 13px 12px; text-align: center; }
  .foot .url { color: #fff; font-weight: 800; font-size: 15px; letter-spacing: .3px; word-break: break-all; }
  .foot .note { color: rgba(255,255,255,.88); font-size: 11px; margin-top: 2px; }
  @media print {
    body { padding: 0; background: #fff; }
    .flyer { box-shadow: none; border-radius: 0; max-width: none; }
    @page { margin: 0; }
  }
</style>
</head>
<body>
  <div class="flyer">
    <div class="head">
      <div class="pre">Repartos</div>
      <div class="brand">NOVI</div>
      <div class="tag">Reparto nocturno a domicilio</div>
    </div>
    <div class="body">
      <h1>¿Tu local necesita <em>reparto nocturno</em>?</h1>
      <p class="sub">Tú cocinas, nosotros llevamos los pedidos a casa de tus clientes. Sin curro extra para tu equipo y sin permanencia.</p>
      <div class="qr-wrap">
        <img class="qr" src="${qrUrl}" alt="QR ${contactUrl}" />
      </div>
      <div class="qr-cta">Escanea con la cámara del móvil</div>
      <div class="qr-sub">Déjanos tus datos y te contactamos sin compromiso</div>
      <div class="features">
        <span><b>✓</b> Sin permanencia</span>
        <span><b>✓</b> Pedidos con un botón</span>
        <span><b>✓</b> Trato directo</span>
      </div>
    </div>
    <div class="foot">
      <div class="url">${displayUrl}</div>
      <div class="note">Repartos NOVI · reparto nocturno para restaurantes</div>
    </div>
  </div>
  <script>window.onload = () => window.print()</script>
</body>
</html>`)
    w.document.close()
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col p-5">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <QrCode className="h-4 w-4 text-primary" />
          Folleto captación
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Imprime y reparte: quien escanee el QR llegará a tu formulario de
          contacto.
        </p>

        {/* Mini preview of the printed flyer */}
        <div
          aria-hidden="true"
          className="mt-4 select-none overflow-hidden rounded-xl border border-border shadow-sm"
        >
          <div className="bg-zinc-900 px-4 py-3.5 text-center">
            <p className="text-[8px] font-bold uppercase tracking-[0.35em] text-zinc-400">
              Repartos
            </p>
            <p className="mt-0.5 text-2xl font-black italic leading-none tracking-tight text-primary">
              NOVI
            </p>
            <span className="mt-2 inline-block rounded-full border border-primary/45 bg-primary/15 px-2.5 py-0.5 text-[8px] font-semibold text-orange-300">
              Reparto nocturno a domicilio
            </span>
          </div>
          <div className="bg-white px-3 py-3.5 text-center">
            <p className="text-[11px] font-bold leading-tight text-zinc-900">
              ¿Tu local necesita{' '}
              <span className="text-primary">reparto nocturno</span>?
            </p>
            <img
              src={qrUrl}
              alt="Código QR del formulario de contacto"
              className="mx-auto my-2.5 h-24 w-24"
            />
            <p className="text-[9px] font-medium text-zinc-500">
              Escanea con la cámara del móvil
            </p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-1">
              {['Sin permanencia', 'Un botón', 'Trato directo'].map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[7.5px] font-semibold text-orange-900"
                >
                  ✓ {f}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-primary px-3 py-1.5 text-center">
            <p className="truncate text-[9px] font-bold text-white">{displayUrl}</p>
          </div>
        </div>

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
          <div className="flex min-w-0 items-start gap-3">
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
            </div>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
            <span>{formatDateTime(lead.createdAt)}</span>
            {isPending && <RelativeBadge iso={lead.createdAt} />}
          </span>
        </div>

        {lead.message && (
          <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
            “{lead.message}”
          </p>
        )}
        {lead.notes && (
          <p className="mt-2 rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground">
            <MessageSquare className="mr-1 inline h-3 w-3" />
            {lead.notes}
          </p>
        )}

        {isConverted && lead.convertedRestaurantName && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Dado de alta como <strong>{lead.convertedRestaurantName}</strong>
          </p>
        )}

        {!isConverted && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              onClick={onOpenConvert}
              className="col-span-2 h-10 bg-primary text-white hover:bg-primary/90 sm:col-span-1 sm:h-9"
            >
              <Store className="mr-1.5 h-4 w-4" />
              Crear restaurante
            </Button>
            {isPending ? (
              <Button variant="outline" className="h-10 sm:h-9" onClick={onContacted}>
                <UserCheck className="mr-1.5 h-4 w-4" />
                Contactado
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 sm:h-9" onClick={onOpenNotes}>
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Notas
            </Button>
            <Button
              variant="outline"
              className={`${isPending ? 'col-span-2 ' : ''}h-10 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:col-span-1 sm:ml-auto sm:h-9`}
              onClick={onReject}
            >
              <UserX className="mr-1.5 h-4 w-4" />
              Descartar
            </Button>
          </div>
        )}
        {isConverted && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="h-10 w-full sm:h-9 sm:w-auto"
              onClick={onOpenNotes}
            >
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
  const [assignedDriverIds, setAssignedDriverIds] = useState<string[]>(
    currentDriverId ? [currentDriverId] : [],
  )

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

  function toggleDriver(id: string) {
    setAssignedDriverIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

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
    setAssignedDriverIds(currentDriverId ? [currentDriverId] : [])
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
        assignedDriverIds,
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
            <Label>Repartidores que lo llevarán</Label>
            {drivers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay repartidores todavía: podrás asignarlos luego desde
                «Restaurantes».
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
                      {selected ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Bike className="h-3.5 w-3.5" />
                      )}
                      {d.name}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Puedes asignar varios: las peticiones llegarán a todos y el
              primero que acepte se llevará el pedido.
            </p>
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
