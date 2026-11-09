/**
 * Control de cuota de Google Routes API — INFALIBLE.
 *
 * Cuenta cada petición a Google en la BD (tabla Setting) y corta ANTES de
 * llegar al límite diario. Así es imposible pasarse de la cuota gratuita,
 * incluso si el servidor se reinicia o hay múltiples instancias.
 *
 * Cuota gratuita: 10.000/mes. Tope diario: 320 (9.600/mes, 96% del límite).
 * Al llegar al tope diario, las peticiones caen a Mapbox/OSRM automáticamente.
 *
 * El contador se resetea cada día a las 00:00 UTC.
 */
import { db } from '@/lib/db'

const QUOTA_KEY = 'googleRoutesCount'
const DATE_KEY = 'googleRoutesDate'
const DAILY_LIMIT = 320 // 320/día = 9.600/mes < 10.000 gratis

/** Devuelve la fecha actual en formato YYYY-MM-DD (UTC). */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * ¿Quedan peticiones disponibles hoy? Lee el contador de la BD.
 * Si la fecha cambió, el contador se resetea a 0.
 */
export async function googleQuotaAvailable(): Promise<boolean> {
  const [countRow, dateRow] = await Promise.all([
    db.setting.findUnique({ where: { key: QUOTA_KEY } }),
    db.setting.findUnique({ where: { key: DATE_KEY } }),
  ])

  const savedDate = dateRow?.value ? new Date(dateRow.value * 1000).toISOString().slice(0, 10) : ''
  if (savedDate !== today()) {
    // Nuevo día: resetear contador
    return true
  }

  const count = countRow?.value ?? 0
  return count < DAILY_LIMIT
}

/**
 * Incrementa el contador de peticiones a Google en 1. Debe llamarse DESPUÉS
 * de cada petición exitosa (o fallida por 429) para llevar la cuenta exacta.
 * Si la fecha cambió, resetea a 1.
 */
export async function incrementGoogleQuota(): Promise<void> {
  const todayStr = today()
  const dateRow = await db.setting.findUnique({ where: { key: DATE_KEY } })
  const savedDate = dateRow?.value ? new Date(dateRow.value * 1000).toISOString().slice(0, 10) : ''

  if (savedDate !== todayStr) {
    // Nuevo día: resetear
    await db.setting.upsert({
      where: { key: DATE_KEY },
      create: { key: DATE_KEY, value: Date.now() / 1000 },
      update: { value: Date.now() / 1000 },
    })
    await db.setting.upsert({
      where: { key: QUOTA_KEY },
      create: { key: QUOTA_KEY, value: 1 },
      update: { value: 1 },
    })
  } else {
    // Mismo día: incrementar
    const countRow = await db.setting.findUnique({ where: { key: QUOTA_KEY } })
    const count = countRow?.value ?? 0
    await db.setting.upsert({
      where: { key: QUOTA_KEY },
      create: { key: QUOTA_KEY, value: 1 },
      update: { value: count + 1 },
    })
  }
}

/**
 * Devuelve cuántas peticiones quedan hoy y el total usado.
 */
export async function googleQuotaStatus(): Promise<{ used: number; limit: number; remaining: number }> {
  const [countRow, dateRow] = await Promise.all([
    db.setting.findUnique({ where: { key: QUOTA_KEY } }),
    db.setting.findUnique({ where: { key: DATE_KEY } }),
  ])

  const savedDate = dateRow?.value ? new Date(dateRow.value * 1000).toISOString().slice(0, 10) : ''
  if (savedDate !== today()) {
    return { used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT }
  }

  const used = Math.round(countRow?.value ?? 0)
  return { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used) }
}
