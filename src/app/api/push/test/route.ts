import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { sendPush, countPushSubscriptions } from '@/lib/push'

// The test notification is sent with a small delay so the user can close the
// app / lock the phone and see it arrive exactly like a real one (iOS doesn't
// reliably show banners while the app is in the foreground).
const TEST_DELAY_MS = 9000

/** Send a test push to the caller's devices so they can verify alerts work. */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (session.role !== 'driver' && session.role !== 'restaurant') {
    return NextResponse.json({ error: 'Este perfil no recibe notificaciones' }, { status: 400 })
  }

  const target = { role: session.role as 'driver' | 'restaurant', userId: session.id }
  const devices = await countPushSubscriptions(target)
  if (devices === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const payload = {
    title: 'Notificación de prueba',
    body: 'Si estás leyendo esto, los avisos de Repartos NOVI funcionan en este dispositivo.',
    tag: 'novi-test',
  }

  setTimeout(() => {
    sendPush(target, payload).catch((err) => console.error('[push] test failed:', err))
  }, TEST_DELAY_MS)

  return NextResponse.json({ sent: devices, scheduled: true, delayMs: TEST_DELAY_MS })
}
