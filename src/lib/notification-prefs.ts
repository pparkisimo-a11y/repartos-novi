import { db } from '@/lib/db'
import { NOTIF_CATALOG, notifKeys, type NotifRole } from '@/lib/notif-catalog'

/**
 * Preferencias de notificaciones — parte SERVIDOR (usa Prisma).
 *
 * Si no existe fila en la BD para un tipo, se entiende ACTIVADO (valor por
 * defecto), así los usuarios nuevos no necesitan sembrar nada. Se aplican en
 * dos sitios: antes de enviar cada Web Push (sendPush recibe `type` y llama
 * isNotifEnabled) y en el cliente, donde los dashboards filtran sus toasts.
 */

/** Preferencias completas de un usuario (catálogo + BD, por defecto true). */
export async function getNotifPrefs(
  role: NotifRole,
  userId: string,
): Promise<Record<string, boolean>> {
  const prefs: Record<string, boolean> = {}
  for (const t of NOTIF_CATALOG[role]) prefs[t.key] = true
  const rows = await db.notificationPref.findMany({ where: { role, userId } })
  for (const row of rows) {
    if (row.key in prefs) prefs[row.key] = row.enabled
  }
  return prefs
}

// --- Mini caché en memoria (TTL corto) para no golpear SQLite en cada push ---
const CACHE_TTL_MS = 5000
const cache = new Map<string, { value: boolean; expires: number }>()

/** ¿Tiene este usuario activado este tipo de notificación? (default: true) */
export async function isNotifEnabled(
  role: NotifRole,
  userId: string,
  key: string,
): Promise<boolean> {
  const cacheKey = `${role}:${userId}:${key}`
  const now = Date.now()
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > now) return hit.value

  const row = await db.notificationPref.findUnique({
    where: { role_userId_key: { role, userId, key } },
  })
  const value = row ? row.enabled : true

  if (cache.size > 500) cache.clear()
  cache.set(cacheKey, { value, expires: now + CACHE_TTL_MS })
  return value
}

/** Guarda (upsert) las preferencias enviadas; ignora claves que no sean del rol. */
export async function setNotifPrefs(
  role: NotifRole,
  userId: string,
  prefs: Record<string, boolean>,
): Promise<void> {
  const valid = notifKeys(role)
  const entries = Object.entries(prefs).filter(([key]) => valid.has(key))
  await Promise.all(
    entries.map(([key, enabled]) =>
      db.notificationPref.upsert({
        where: { role_userId_key: { role, userId, key } },
        create: { role, userId, key, enabled: Boolean(enabled) },
        update: { enabled: Boolean(enabled) },
      }),
    ),
  )
  cache.clear() // el cambio debe notarse de inmediato en los push
}
