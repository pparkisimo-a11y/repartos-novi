'use client'

import { useState } from 'react'
import { ChevronDown, MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MapAppChooserDialog,
  navAppName,
  navAppsForPlatform,
  openNavApp,
  renderNavAppIcon,
  setPreferredNavApp,
  usePlatform,
  useStoredNavApp,
  type NavAppId,
} from './nav-apps'

function bbox(lat: number, lng: number, delta = 0.008) {
  const minLat = (lat - delta).toFixed(6)
  const maxLat = (lat + delta).toFixed(6)
  const minLng = (lng - delta).toFixed(6)
  const maxLng = (lng + delta).toFixed(6)
  return `${minLng},${minLat},${maxLng},${maxLat}`
}

export function MapView({
  lat,
  lng,
  label,
  className,
  compact,
}: {
  lat: number
  lng: number
  label?: string
  className?: string
  /** Altura reducida para diálogos. */
  compact?: boolean
}) {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox(
    lat,
    lng,
  )}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`

  const [chooserOpen, setChooserOpen] = useState(false)
  // Elección manual en esta sesión: { v } = app elegida (null = preguntar
  // siempre). Se combina con la preferencia guardada en el dispositivo.
  const [choice, setChoice] = useState<{ v: NavAppId | null } | null>(null)
  const platform = usePlatform()
  const storedPref = useStoredNavApp()

  const pref = choice ? choice.v : storedPref

  // La app preferida debe existir en esta plataforma (Apple Maps → solo iOS)
  const effectivePref =
    pref && navAppsForPlatform(platform).some((a) => a.id === pref) ? pref : null

  /** «Cómo llegar»: abre la app preferida o pregunta si no hay ninguna. */
  function handleNavigate() {
    if (effectivePref) openNavApp(effectivePref, lat, lng)
    else setChooserOpen(true)
  }

  /** Elección desde el diálogo: recordar (o no) y sincronizar el botón. */
  function handleChoose(app: NavAppId, remember: boolean) {
    setPreferredNavApp(remember ? app : null)
    setChoice({ v: remember ? app : null })
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className ?? ''}`}>
      <div className="relative">
        <iframe
          title="Ubicación del restaurante"
          src={src}
          className={compact ? 'h-36 w-full' : 'h-52 w-full sm:h-56'}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {label && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            {label}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 p-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Coordenadas</p>
          <p className="font-mono text-xs whitespace-nowrap">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        </div>
        {/* Botón partido: acción principal + selector de app (▾ o icono de la
            app elegida). Toca «Cómo llegar» para navegar; toca ▾ para cambiar
            de app (Google Maps, Waze, Apple Maps). */}
        <div className="flex shrink-0">
          <Button
            size="sm"
            className="rounded-r-none pr-3"
            onClick={handleNavigate}
          >
            <Navigation className="mr-1.5 h-4 w-4" />
            Cómo llegar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-l-none border-l-0 px-2.5"
            onClick={() => setChooserOpen(true)}
            aria-label={
              effectivePref
                ? `App de navegación: ${navAppName(effectivePref)}. Toca para cambiar`
                : 'Elegir app de navegación'
            }
            title={
              effectivePref
                ? `App elegida: ${navAppName(effectivePref)} — toca para cambiar`
                : 'Elegir app de navegación'
            }
          >
            {renderNavAppIcon(effectivePref, 'h-4 w-4') ?? (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <MapAppChooserDialog
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        lat={lat}
        lng={lng}
        label={label}
        onChoose={handleChoose}
      />
    </div>
  )
}
