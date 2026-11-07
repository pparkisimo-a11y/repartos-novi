/**
 * Tarifas de reparto por distancia — configurables por restaurante.
 *
 * La tarifa se calcula al RECOGER el pedido: el repartidor introduce (o
 * confirma) la dirección de entrega, se mide la distancia desde el
 * restaurante y se aplica la fórmula del local:
 *
 *   · tarifa base (baseEur) hasta thresholdKm
 *   · + perExtraKmEur por cada km empezado por encima
 *
 * Cada restaurante guarda sus propios valores (feeBaseEur, feeThresholdKm,
 * feePerExtraKmEur). Si el admin no los toca, hereda DEFAULT_FEE_CONFIG.
 *
 * El km adicional se cobra por kilómetro EMPEZADO (como el taxímetro):
 * con el default (3 € / 2 km / 0,35 €): 2,0 km → 3,00 € · 2,1 km → 3,35 €
 * · 3,0 km → 3,35 € · 3,1 km → 3,70 € · 5 km → 4,40 €
 *
 * ⚙️ Para cambiar el default global, edita DEFAULT_FEE_CONFIG. Para un local
 * concreto, el admin lo cambia desde el panel (se guarda en la BD).
 */

export interface FeeConfig {
  /** Tarifa base (incluye los primeros thresholdKm km). */
  baseEur: number
  /** Km incluidos en la tarifa base. */
  thresholdKm: number
  /** € por cada km empezado por encima del umbral. */
  perExtraKmEur: number
}

/** Tarifa por defecto: la hereda cualquier restaurante que el admin no haya
 *  personalizado. Coincide con los @default del schema de Prisma. */
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  baseEur: 3,
  thresholdKm: 2,
  perExtraKmEur: 0.35,
}

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
 * Tarifa en euros para una distancia dada, según la configuración del local.
 * Base hasta thresholdKm + suplemento por km empezado por encima.
 */
export function feeForDistanceKm(km: number, config: FeeConfig = DEFAULT_FEE_CONFIG): number {
  const extra = Math.max(0, km - config.thresholdKm)
  // ceil: cada km empezado cuenta completo (2,1 km → 1 km extra).
  // Para el caso exacto del umbral (extra=0), ceil(0)=0 → sin suplemento.
  const extraSteps = extra > 0 ? Math.ceil(extra) : 0
  return round2(config.baseEur + extraSteps * config.perExtraKmEur)
}

/** Formatea un importe en euros al estilo español: "3,00 €". */
export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

/** Explicación de la tarifa para mostrarla en la UI (liquidación, diálogo…).
 *  Si no se pasa config, usa el default global. */
export function feeExplanation(config: FeeConfig = DEFAULT_FEE_CONFIG): string {
  return `${config.baseEur.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
  })} € hasta ${config.thresholdKm.toLocaleString('es-ES')} km + ${config.perExtraKmEur.toLocaleString(
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
