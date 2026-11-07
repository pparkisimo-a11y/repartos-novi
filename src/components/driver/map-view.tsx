'use client'

import { MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

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
        <Button asChild size="sm">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="mr-1.5 h-4 w-4" />
            Cómo llegar
          </a>
        </Button>
      </div>
    </div>
  )
}
