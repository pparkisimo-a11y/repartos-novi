'use client'

/**
 * Autocomplete de direcciones estilo Google Maps para el repartidor.
 *
 * Mientras escribe (calle y número) se muestran sugerencias en un
 * desplegable; cada sugerencia trae sus coordenadas. Al seleccionar una:
 *  - el input queda con la dirección completa normalizada, y
 *  - el padre recibe la sugerencia (onSelect) para calcular distancia
 *    y tarifa con precisión.
 *
 * Los datos salen de OpenStreetMap (Photon/Nominatim vía nuestro backend),
 * priorizando resultados cercanos al restaurante (prop `bias`).
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import type { AddressSuggestion } from '@/lib/types'

const DEBOUNCE_MS = 350
const MIN_QUERY = 3

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onSelectionCleared,
  bias,
  id,
  placeholder = 'Calle, número, ciudad',
  disabled,
}: {
  /** Texto actual del input (controlado). */
  value: string
  /** Cambia el texto mientras se escribe. */
  onChange: (v: string) => void
  /** El repartidor eligió una sugerencia del desplegable. */
  onSelect: (s: AddressSuggestion) => void
  /** El texto se editó después de una selección (la selección queda invalidada). */
  onSelectionCleared: () => void
  /** Posición del restaurante: prioriza sugerencias cercanas. */
  bias?: { lat: number; lng: number }
  id?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<AddressSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searched, setSearched] = useState('') // última consulta con respuesta

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Valor seleccionado (para no re-buscar al llenar el input con el label)
  const selectedRef = useRef<AddressSuggestion | null>(null)
  // Secuencia para descartar respuestas desactualizadas
  const seqRef = useRef(0)

  const listId = useId()

  // Cerrar el desplegable al hacer clic fuera
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('touchstart', onDocMouseDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('touchstart', onDocMouseDown)
    }
  }, [open])

  // Búsqueda con debounce
  useEffect(() => {
    if (selectedRef.current && value === selectedRef.current.label) return
    const q = value.trim()
    if (q.length < MIN_QUERY) {
      setItems([])
      setLoading(false)
      setOpen(false)
      setSearched('')
      return
    }
    setLoading(true)
    const seq = ++seqRef.current
    const t = setTimeout(async () => {
      try {
        const res = await api.autocomplete(q, bias)
        if (seq !== seqRef.current) return // llegó una más nueva
        setItems(res.suggestions)
        setSearched(q)
        setActiveIndex(res.suggestions.length > 0 ? 0 : -1)
        setOpen(true)
      } catch {
        if (seq !== seqRef.current) return
        setItems([])
        setSearched(q)
        setOpen(true)
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value, bias])

  function select(s: AddressSuggestion) {
    // Selección idempotente: si se vuelve a pulsar la misma sugerencia
    // (doble tap / tap fantasma), no se repite el cálculo ni el onSelect.
    const same =
      selectedRef.current != null &&
      selectedRef.current.label === s.label &&
      selectedRef.current.lat === s.lat &&
      selectedRef.current.lng === s.lng
    selectedRef.current = s
    onChange(s.label)
    setOpen(false)
    setActiveIndex(-1)
    // Vaciar las sugerencias: el desplegable desaparece del DOM y no se
    // puede volver a pulsar nada. Volverá a aparecer si se edita el texto.
    setItems([])
    setSearched('')
    if (!same) onSelect(s)
    inputRef.current?.focus()
  }

  function handleInputChange(v: string) {
    if (selectedRef.current && v !== selectedRef.current.label) {
      selectedRef.current = null
      onSelectionCleared()
    }
    onChange(v)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (
        e.key === 'ArrowDown' &&
        !selectedRef.current &&
        value.trim().length >= MIN_QUERY &&
        !loading
      ) {
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % items.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
        break
      case 'Enter':
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault()
          select(items[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
    }
  }

  const showDropdown = open && (loading || items.length > 0 || searched.length >= MIN_QUERY)

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Nunca reabrir si ya hay una selección válida: al pulsar una
            // sugerencia el input se re-enfoca y este handler se dispara
            // justo después del setOpen(false) — sin este guardia el
            // desplegable se volvía a abrir (bug del dropdown que no cerraba).
            if (selectedRef.current) return
            if (value.trim().length >= MIN_QUERY && items.length > 0) setOpen(true)
          }}
          placeholder={placeholder}
          maxLength={200}
          disabled={disabled}
          className="pl-9"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Sugerencias de dirección"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {loading && items.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando direcciones…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              Sin resultados para «{searched}». Prueba con calle y número, o
              pon los km a mano.
            </div>
          )}
          {items.map((s, i) => (
            <button
              key={`${s.label}-${s.lat.toFixed(5)},${s.lng.toFixed(5)}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              // Evita que el input pierda el foco al pulsar (y con ello el
              // ciclo blur→re-focus que reabría el desplegable), y mantiene
              // el teclado abierto en móvil como hace Google Maps.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(s)}
              className={`flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 ${
                i === activeIndex ? 'bg-accent' : 'bg-transparent'
              }`}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.main}</span>
                {s.secondary && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.secondary}
                  </span>
                )}
              </span>
            </button>
          ))}
          <div className="border-t border-border/60 bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
            Direcciones: Esri · OpenStreetMap
          </div>
        </div>
      )}
    </div>
  )
}
