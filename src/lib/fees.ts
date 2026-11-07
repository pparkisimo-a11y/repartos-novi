/**
 * Tarifas de reparto por distancia.
 *
 * La tarifa se calcula al RECOGER el pedido: el repartidor introduce (o
 * confirma) la dirección de entrega, se mide la distancia desde el
 * restaurante y se aplica esta tarifa plana de dos tramos:
 *
 *   · hasta FEE_THRESHOLD_KM (2 km)  →  FEE_SHORT_EUR (3,00 €)
 *   · lo que exceda FEE_THRESHOLD_KM →  FEE_LONG_EUR  (4,00 €)
 *
 * Ejemplos: 0,8 km → 3,00 € · 2,0 km → 3,00 € · 2,1 km → 4,00 € · 5 km → 4,00 €
 *
 * ⚙️ Para ajustar precios, cambia solo las constantes de abajo. Se usan
 * tanto en el servidor (cálculo definitivo que se guarda) como en la UI
 * (previsualización en vivo para el repartidor).
 */

/** Distancia límite del tramo corto, en km. */
export const FEE_THRESHOLD_KM = 2
/** Tarifa para entregas dentro del tramo corto (≤ FEE_THRESHOLD_KM). */
export const FEE_SHORT_EUR = 3
/** Tarifa para entregas que superan el tramo corto (> FEE_THRESHOLD_KM). */
export const FEE_LONG_EUR = 4

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
 * Tramo único: 3,00 € hasta 2 km; 4,00 € a partir de ahí.
 */
export function feeForDistanceKm(km: number): number {
  return round2(km <= FEE_THRESHOLD_KM ? FEE_SHORT_EUR : FEE_LONG_EUR)
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
  return `${FEE_SHORT_EUR.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
  })} € hasta ${FEE_THRESHOLD_KM.toLocaleString('es-ES')} km · ${FEE_LONG_EUR.toLocaleString(
    'es-ES',
    { minimumFractionDigits: 2 },
  )} € a partir de ahí`
}

/** Distancia legible: "1,2 km" / "850 m". */
export function formatKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
}
