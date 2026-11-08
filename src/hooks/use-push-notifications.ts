'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'

export type PushPermission = 'default' | 'granted' | 'denied'

/**
 * Converts the VAPID public key (base64url) to the Uint8Array the browser
 * expects in `pushManager.subscribe`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/**
 * Web Push notifications for the PWA (iPhone "Añadir a pantalla de inicio").
 *
 * On iOS, a page can NEVER show a notification by itself — only the service
 * worker can, and only for real Web Push subscriptions. This hook:
 *  1. Auto-subscribes the device if permission was already granted.
 *  2. Exposes `requestAndSubscribe` for the "Activar avisos" button (iOS
 *     requires a user tap to show the permission prompt).
 */
export function usePushNotifications(role: 'driver' | 'restaurant' | 'admin', userId: string) {
  const [permission, setPermission] = useState<PushPermission>('default')

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'

  const subscribeDevice = useCallback(async () => {
    try {
      // `ready` waits for the service worker (registered in production; in the
      // dev sandbox it never resolves — fine, push is a production feature).
      const reg = await navigator.serviceWorker.ready

      const res = await fetch('/api/push/public-key').then((r) => r.json()).catch(() => null)
      const publicKey: string | undefined = res?.publicKey
      if (!publicKey) return

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        })
      }
      await api.pushSubscribe(sub.toJSON(), role, userId)
    } catch (err) {
      console.warn('[push] no se pudo suscribir el dispositivo:', err)
    }
  }, [role, userId])

  useEffect(() => {
    if (!supported) return
    // Notification.permission is a browser API: read it after mount (deferred,
    // so SSR and the first client render stay in sync).
    const t = setTimeout(() => {
      setPermission(Notification.permission as PushPermission)
      // Already granted (user accepted before): keep the subscription
      // registered on the server for this account/device.
      if (Notification.permission === 'granted') {
        void subscribeDevice()
      }
    }, 0)
    return () => clearTimeout(t)
  }, [supported, subscribeDevice])

  /** Ask for permission (needs a user tap on iOS) and subscribe on success.
   *  Returns the resulting permission so callers can react. */
  const requestAndSubscribe = useCallback(async (): Promise<PushPermission> => {
    if (!supported) return 'denied'
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        await subscribeDevice()
      }
      return result
    } catch (err) {
      console.warn('[push] permiso denegado:', err)
      return Notification.permission as PushPermission
    }
  }, [supported, subscribeDevice])

  return { permission, supported, requestAndSubscribe }
}
