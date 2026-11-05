import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'

interface SubscriptionBody {
  subscription?: {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
}

/**
 * Register the calling device's push subscription so the server can send it
 * notifications (new delivery requests, status changes...).
 */
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (session.role !== 'driver' && session.role !== 'restaurant') {
    return NextResponse.json({ error: 'Este perfil no recibe notificaciones' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as SubscriptionBody
  const sub = body.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, role: session.role, userId: session.id },
    update: { p256dh, auth, role: session.role, userId: session.id },
  })

  return NextResponse.json({ ok: true })
}

/** Remove the calling device's push subscription (e.g. permission revoked). */
export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { endpoint?: string }
  if (!body.endpoint) {
    return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 })
  }
  await db.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: session.id },
  })
  return NextResponse.json({ ok: true })
}
