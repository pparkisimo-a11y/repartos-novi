'use client'

import { useState, useSyncExternalStore } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

/* ────────────────────────────────────────────────────────────
 * Apps de navegación: Google Maps real, Waze y Apple Maps.
 * En móvil se usa el esquema URL de la app (comgooglemaps://,
 * google.navigation:, waze://) y, si no está instalada, se cae
 * automáticamente al enlace web tras 1,5 s.
 * ──────────────────────────────────────────────────────────── */

export type NavAppId = 'google' | 'waze' | 'apple'
export type Platform = 'ios' | 'android' | 'desktop'

/** Detecta la plataforma (cliente). SSR-safe: devuelve 'desktop'. */
export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPad moderno se reporta como Mac con touch
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios'
  }
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/* ── Preferencia recordada (localStorage) ─────────────────── */

const PREF_KEY = 'novi:navapp'

export function getPreferredNavApp(): NavAppId | null {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === 'google' || v === 'waze' || v === 'apple' ? v : null
  } catch {
    return null
  }
}

export function setPreferredNavApp(app: NavAppId | null) {
  try {
    if (app) localStorage.setItem(PREF_KEY, app)
    else localStorage.removeItem(PREF_KEY)
  } catch {
    /* modo privado */
  }
}

/* ── URLs por app y plataforma ────────────────────────────── */

function navUrls(
  app: NavAppId,
  lat: number,
  lng: number,
): { url: string; fallback?: string } {
  const ll = `${lat},${lng}`
  const gmapsWeb = `https://www.google.com/maps/dir/?api=1&destination=${ll}`
  const wazeWeb = `https://waze.com/ul?ll=${ll}&navigate=yes`
  const plat = getPlatform()
  switch (app) {
    case 'google':
      // iOS: esquema de la app de Google Maps → navegación en coche
      if (plat === 'ios')
        return {
          url: `comgooglemaps://?daddr=${ll}&directionsmode=driving`,
          fallback: gmapsWeb,
        }
      // Android: navegación guiada directa en la app
      if (plat === 'android')
        return { url: `google.navigation:q=${ll}&mode=d`, fallback: gmapsWeb }
      return { url: gmapsWeb }
    case 'waze':
      if (plat === 'desktop') return { url: wazeWeb }
      return { url: `waze://?ll=${ll}&navigate=yes`, fallback: wazeWeb }
    case 'apple':
      // Enlace universal: en iPhone abre siempre la app de Apple Maps
      return { url: `https://maps.apple.com/?daddr=${ll}&dirflg=d` }
  }
}

/**
 * Abre la app de navegación elegida. En móvil prueba el esquema de
 * la app y, si la página sigue visible al cabo de 1,5 s (la app no
 * está instalada), abre la versión web como alternativa.
 */
export function openNavApp(app: NavAppId, lat: number, lng: number) {
  const { url, fallback } = navUrls(app, lat, lng)
  if (!fallback) {
    // Escritorio o enlace universal: abrir en pestaña nueva
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  let left = false
  const onHide = () => {
    left = true
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide, { once: true })
  window.location.href = url
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!left && !document.hidden) {
      window.open(fallback, '_blank', 'noopener,noreferrer')
    }
  }, 1500)
}

/* ── Iconos de marca (SVG inline, sin dependencias) ───────── */

export function GoogleMapsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {/* Pin base roja */}
      <path
        d="M12 22.5s6.8-10 6.8-14a6.8 6.8 0 1 0-13.6 0c0 4 6.8 14 6.8 14z"
        fill="#EA4335"
      />
      {/* Cuadrante superior izquierdo (azul) */}
      <path d="M12 1.7a6.8 6.8 0 0 0-5 2.2L12 8.5V1.7z" fill="#4285F4" />
      {/* Franja izquierda (verde) */}
      <path
        d="M7 3.9a6.8 6.8 0 0 0-1.8 4.6c0 1.5.6 3.4 1.3 5.2l5.5-5.2L7 3.9z"
        fill="#34A853"
      />
      {/* Franja derecha (amarilla) */}
      <path
        d="M17 3.9a6.8 6.8 0 0 1 1.8 4.6c0 1.5-.6 3.4-1.3 5.2l-5.5-5.2L17 3.9z"
        fill="#FBBC04"
      />
      <circle cx="12" cy="8.5" r="2.4" fill="#fff" />
    </svg>
  )
}

export function WazeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <circle cx="12" cy="11.5" r="8.5" fill="#33CCFF" />
      <circle cx="12" cy="11.5" r="8.5" fill="none" stroke="#1FA8E0" strokeWidth="1.2" />
      <circle cx="8.8" cy="10.2" r="1.25" fill="#fff" />
      <circle cx="15.2" cy="10.2" r="1.25" fill="#fff" />
      <path
        d="M8.6 13.8c.9 1.5 2.1 2.2 3.4 2.2s2.5-.7 3.4-2.2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AppleMapsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#34C759" />
      <path
        fill="#fff"
        d="M16.4 12.9c0-1.9 1.5-2.8 1.6-2.9-.9-1.3-2.2-1.5-2.7-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.1 1.9-1.4 2.3-.4 5.8 1 7.6.7.9 1.4 1.9 2.4 1.9.9-.1 1.3-.6 2.5-.6s1.5.6 2.5.6c1 0 1.7-1 2.3-1.9.7-1 .9-2 .9-2.1 0 0-2-.8-2-2.9zM14.3 6.6c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.2 1.1-.5.6-.9 1.5-.8 2.3.9.1 1.7-.4 2.2-1z"
      />
    </svg>
  )
}

/* ── Catálogo por plataforma ──────────────────────────────── */

export interface NavAppInfo {
  id: NavAppId
  name: string
  icon: (props: { className?: string }) => React.ReactNode
  note: string
}

/** Apps disponibles según plataforma (Apple Maps solo en iPhone/iPad). */
export function navAppsForPlatform(platform: Platform): NavAppInfo[] {
  const note =
    platform === 'desktop'
      ? 'Se abrirá en el navegador'
      : 'Se abrirá la app si está instalada'
  const apps: NavAppInfo[] = [
    { id: 'google', name: 'Google Maps', icon: GoogleMapsIcon, note },
    { id: 'waze', name: 'Waze', icon: WazeIcon, note },
  ]
  if (platform === 'ios') {
    apps.push({
      id: 'apple',
      name: 'Apple Maps',
      icon: AppleMapsIcon,
      note: 'Incluida en iPhone',
    })
  }
  return apps
}

export function navAppName(id: NavAppId): string {
  return id === 'google' ? 'Google Maps' : id === 'waze' ? 'Waze' : 'Apple Maps'
}

/** Renderiza el icono de una app como JSX (evita componentes en render). */
export function renderNavAppIcon(id: NavAppId | null, className?: string) {
  if (id === 'google') return <GoogleMapsIcon className={className} />
  if (id === 'waze') return <WazeIcon className={className} />
  if (id === 'apple') return <AppleMapsIcon className={className} />
  return null
}

/* ── Diálogo selector ─────────────────────────────────────── */

/**
 * "Abrir en…": deja elegir entre las apps de navegación del
 * dispositivo. Si se marca "Recordar mi elección", la próxima vez
 * el botón «Cómo llegar» abrirá esa app directamente.
 */

const emptySubscribe = () => () => {}

/** Plataforma actual leída sin efectos (SSR-safe, sin mismatch). */
export function usePlatform(): Platform {
  return useSyncExternalStore(
    emptySubscribe,
    getPlatform,
    () => 'desktop' as Platform,
  )
}

/** App de navegación preferida guardada en este dispositivo. */
export function useStoredNavApp(): NavAppId | null {
  return useSyncExternalStore(
    emptySubscribe,
    getPreferredNavApp,
    () => null,
  )
}

export function MapAppChooserDialog({
  open,
  onOpenChange,
  lat,
  lng,
  label,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lat: number
  lng: number
  label?: string
  /** Notifica la elección (app + si se recuerda) para sincronizar el botón. */
  onChoose: (app: NavAppId, remember: boolean) => void
}) {
  const [remember, setRemember] = useState(true)
  // El diálogo solo se monta al abrirse (client-side, nunca en SSR), así que
  // la plataforma se lee directamente al montar: siempre fresca por apertura.
  const [platform] = useState<Platform>(() => getPlatform())

  const apps = navAppsForPlatform(platform)

  function handlePick(app: NavAppId) {
    onChoose(app, remember)
    openNavApp(app, lat, lng)
    onOpenChange(false)
  }

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      toast.success('Coordenadas copiadas')
    } catch {
      toast.error('No se pudieron copiar las coordenadas')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir en…</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {label
              ? `Cómo llegar a ${label}`
              : 'Elige tu app de navegación preferida'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {apps.map((app) => {
            const Icon = app.icon
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => handlePick(app.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{app.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {app.note}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}

          {/* Copiar coordenadas — útil para pegarlas en cualquier app */}
          <button
            type="button"
            onClick={copyCoords}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Copy className="h-4.5 w-4.5 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                Copiar coordenadas
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </span>
            </span>
          </button>
        </div>

        <label
          htmlFor="remember-navapp"
          className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 p-3"
        >
          <Checkbox
            id="remember-navapp"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">
              Recordar mi elección
            </strong>{' '}
            — no volveremos a preguntar. Puedes cambiarla cuando quieras con el
            botón ▾ junto a «Cómo llegar».
          </span>
        </label>
      </DialogContent>
    </Dialog>
  )
}
