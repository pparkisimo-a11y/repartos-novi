/**
 * Tarifas de reparto por distancia.
 *
 * La tarifa se calcula al RECOGER el pedido: el repartidor introduce (o
 * confirma) la dirección de entrega, se mide la distancia desde el
 * restaurante y se aplica esta fórmula:
 *
 *   · tarifa base FEE_BASE_EUR (3,00 €) hasta FEE_THRESHOLD_KM (2 km)
 *   · + FEE_PER_EXTRA_KM_EUR (0,25 €) por cada km empezado por encima
 *
 * El km adicional se cobra por kilómetro EMPEZADO (como el taxímetro):
 * 2,0 km → 3,00 € · 2,1 km → 3,25 € · 3,0 km → 3,25 € · 3,1 km → 3,50 €
 * · 4,0 km → 3,50 € · 5,0 km → 3,75 € · 6,0 km → 4,00 €
 *
 * ⚙️ Para ajustar precios, cambia solo las constantes de abajo. Se usan
 * tanto en el servidor (cálculo definitivo que se guarda) como en la UI
 * (previsualización en vivo para el repartidor).
 */

/** Tarifa base (incluye los primeros FEE_THRESHOLD_KM km). */
export const FEE_BASE_EUR = 3
/** Km incluidos en la tarifa base. */
export const FEE_THRESHOLD_KM = 2
/** € por cada km empezado por encima de FEE_THRESHOLD_KM. */
export const FEE_PER_EXTRA_KM_EUR = 0.25

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
 * Base hasta FEE_THRESHOLD_KM + suplemento por km empezado por encima.
 */
export function feeForDistanceKm(km: number): number {
  const extra = Math.max(0, km - FEE_THRESHOLD_KM)
  // ceil: cada km empezado cuenta completo (2,1 km → 1 km extra).
  // Para el caso exacto de 2 km (extra=0), ceil(0)=0 → sin suplemento.
  const extraSteps = extra > 0 ? Math.ceil(extra) : 0
  return round2(FEE_BASE_EUR + extraSteps * FEE_PER_EXTRA_KM_EUR)
}

/** Formatea un importe en euros al estilo español: "3,00 €". */
export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

/** Explicación de la tarifa para mostrarla en la UI (liquidación, diálogo…). */
export function feeExplanation(): string {
  return `${FEE_BASE_EUR.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
  })} € hasta ${FEE_THRESHOLD_KM.toLocaleString('es-ES')} km + ${FEE_PER_EXTRA_KM_EUR.toLocaleString(
    'es-ES',
    { minimumFractionDigits: 2 },
  )} € por cada km adicional empezado`
}

/** Distancia legible: "1,2 km" / "850 m". */
export function formatKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
}
