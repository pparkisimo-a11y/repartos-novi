'use client'

/**
 * Vista de ubicación para repartidores.
 *
 * Dos modos:
 *  - Normal (tarjetas expandidas): iframe interactivo de OpenStreetMap
 *    (se puede arrastrar/hacer zoom). Está en el flujo de la página, sin
 *    ancestros fixed → sin problemas.
 *  - `compact` (diálogo «Recoger pedido»): mapa ESTÁTICO compuesto por
 *    tiles <img> de OSM, SIN iframe. Motivo: en iPhone un iframe (capa de
 *    composición) dentro de un diálogo position:fixed+transform rompe el
 *    anclaje del diálogo — todo el diálogo se volvía arrastrable con el
 *    dedo tras seleccionar la dirección. Los <img> planos no crean esa
 *    capa y además eliminan el encadenado de scroll del iframe.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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

const TILE = 256
const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright'

function bbox(lat: number, lng: number, delta = 0.008) {
  const minLat = (lat - delta).toFixed(6)
  const maxLat = (lat + delta).toFixed(6)
  const minLng = (lng - delta).toFixed(6)
  const maxLng = (lng + delta).toFixed(6)
  return `${minLng},${minLat},${maxLng},${maxLat}`
}

/** Píxel (Web Mercator) del punto al zoom dado. */
function project(lat: number, lng: number, z: number) {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  const x = ((lng + 180) / 360) * n * TILE
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE
  return { x, y }
}

/**
 * Mapa estático: rejilla de tiles <img> centrada EXACTAMENTE en el pin.
 * Sin iframe, sin transform (márgenes), sin interactividad — puro preview.
 */
function StaticTileMap({
  lat,
  lng,
  zoom = 16,
  className,
}: {
  lat: number
  lng: number
  zoom?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  // El ancho depende del diálogo: medir una vez (+ resize por rotación).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tiles = useMemo(() => {
    if (!size) return []
    const pin = project(lat, lng, zoom)
    // Ventana visible del mundo (px) centrada en el pin
    const left = pin.x - size.w / 2
    const top = pin.y - size.h / 2
    const x0 = Math.floor(left / TILE)
    const x1 = Math.floor((left + size.w) / TILE)
    const y0 = Math.floor(top / TILE)
    const y1 = Math.floor((top + size.h) / TILE)
    const out: { key: string; src: string; left: number; top: number }[] = []
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        out.push({
          key: `${zoom}/${tx}/${ty}`,
          src: `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`,
          left: tx * TILE - left,
          top: ty * TILE - top,
        })
      }
    }
    return out
  }, [lat, lng, zoom, size])

  return (
    <div ref={ref} className={`relative overflow-hidden bg-muted ${className ?? ''}`}>
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute select-none"
          // +1 px de solape para evitar hilillos blancos entre tiles
          style={{ left: Math.round(t.left), top: Math.round(t.top), width: TILE + 1, height: TILE + 1 }}
        />
      ))}
      {/* Pin centrado (margen, sin transform) */}
      <div
        className="pointer-events-none absolute"
        style={{ left: '50%', top: '50%', marginLeft: -11, marginTop: -26 }}
      >
        <MapPin
          className="h-7 w-7 text-primary drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
          fill="currentColor"
          strokeWidth={1.5}
        />
      </div>
      {/* Atribución exigida por OSM */}
      <a
        href={OSM_COPYRIGHT}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 left-1.5 rounded bg-black/35 px-1 py-px text-[9px] leading-tight text-white/90 no-underline"
      >
        © OSM
      </a>
    </div>
  )
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
  /** Versión reducida para diálogos: mapa estático (sin iframe). */
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

  if (compact) {
    return (
      <div className={`overflow-hidden rounded-xl border border-border bg-card ${className ?? ''}`}>
        <div className="relative">
          <StaticTileMap lat={lat} lng={lng} className="h-32 w-full" />
          {label && (
            <div className="pointer-events-none absolute left-2 top-2 flex max-w-[65%] items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{label}</span>
            </div>
          )}
          {/* Botón partido flotante sobre el mapa (ahorra la barra inferior) */}
          <div className="absolute bottom-1.5 right-1.5 flex">
            <Button
              size="sm"
              className="rounded-r-none pr-3 shadow-md"
              onClick={handleNavigate}
            >
              <Navigation className="mr-1.5 h-4 w-4" />
              Cómo llegar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-l-none border-l-0 bg-background/95 px-2.5 shadow-md"
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

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className ?? ''}`}>
      <div className="relative">
        <iframe
          title="Ubicación del restaurante"
          src={src}
          className="h-52 w-full sm:h-56"
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
