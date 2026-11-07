/**
 * Tarifas de reparto por distancia.
 *
 * La tarifa se calcula al RECGER el pedido: el repartidor introduce (o
 * confirma) la dirección de entrega, se mide la distancia desde el
 * restaurante y se aplica esta fórmula:
 *
 *   tarifa = BASE + PER_KM × km adicionales (en tramos de 500 m)
 *
 * Ejemplos: hasta 1,5 km → 2,50 € · 2,4 km → 3,50 € · 3,2 km → 4,50 €
 *
 * ⚙️ Para ajustar precios, cambia solo las constantes de abajo. Se usan
 * tanto en el servidor (cálculo definitivo que se guarda) como en la UI
 * (previsualización en vivo para el repartidor).
 */

export const FEE_BASE_EUR = 2.5 // tarifa base (incluye FEE_BASE_KM km)
export const FEE_BASE_KM = 1.5 // km incluidos en la base
export const FEE_PER_KM_EUR = 1.0 // € por km adicional
export const FEE_STEP_KM = 0.5 // tramos de 500 m

/** Distancia haversine (línea recta) entre dos puntos, en km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371 // radio terrestre en km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Redondeo a 2 decimales evitando errores de coma flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Tarifa en euros para una distancia dada.
 * Los km adicionales se cobran en tramos de FEE_STEP_KM (500 m empezados
 * cuentan como tramo completo).
 */
export function feeForDistanceKm(km: number): number {
  const extra = Math.max(0, km - FEE_BASE_KM)
  const steps = Math.ceil(extra / FEE_STEP_KM)
  return round2(FEE_BASE_EUR + steps * FEE_PER_KM_EUR * FEE_STEP_KM)
}

/** Formatea un importe en euros al estilo español: "3,50 €". */
export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

/** Explicación de la fórmula para mostrarla en la UI (liquidación, diálogo…). */
export function feeExplanation(): string {
  return `${FEE_BASE_EUR.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
  })} € base hasta ${FEE_BASE_KM.toLocaleString('es-ES')} km + ${FEE_PER_KM_EUR.toLocaleString(
    'es-ES',
    { minimumFractionDigits: 2 },
  )} € por cada km adicional (tramos de ${FEE_STEP_KM * 1000} m)`
}

/** Distancia legible: "1,2 km" / "850 m". */
export function formatKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
}
