// Server-side Web Push helper (VAPID).
//
// Sends push notifications to the PushSubscription rows stored in the DB so
// alerts reach iPhones/Androids even with the app closed (PWA installed on
// the home screen). On iOS, notifications from a web page only work through
// the service worker + Web Push — this is the piece that makes them arrive.
import webpush from 'web-push'
import { db } from '@/lib/db'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''

let vapidConfigured = false
function ensureVapid() {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    'mailto:repartos.novi@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  /** Notifications with the same tag replace each other (no pila infinita) */
  tag?: string
  /** Where to take the user when tapping the notification */
  url?: string
}

export function hasVapidKeys(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

/** Number of devices subscribed for a given role/userId. */
export async function countPushSubscriptions(
  target: { role: 'driver' | 'restaurant'; userId: string },
): Promise<number> {
  return db.pushSubscription.count({
    where: { role: target.role, userId: target.userId },
  })
}

/**
 * Send a push notification to every device subscribed for the given
 * role/userId. Best-effort: expired subscriptions (404/410) are pruned.
 * Returns the number of notifications delivered.
 */
export async function sendPush(
  target: { role: 'driver' | 'restaurant'; userId: string },
  payload: PushPayload,
): Promise<number> {
  if (!hasVapidKeys()) {
    console.warn('[push] VAPID keys not configured; skipping push')
    return 0
  }

  const subs = await db.pushSubscription.findMany({
    where: { role: target.role, userId: target.userId },
  })
  if (subs.length === 0) return 0

  ensureVapid()
  let sent = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Subscription expired/revoked: remove it so we don't keep retrying
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {})
        } else {
          console.error('[push] send failed:', status ?? err)
        }
      }
    }),
  )
  return sent
}
