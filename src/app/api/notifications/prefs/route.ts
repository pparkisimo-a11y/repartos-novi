import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { getNotifPrefs, setNotifPrefs, type NotifRole } from '@/lib/notification-prefs'

/**
 * Preferencias de notificaciones del usuario logueado.
 *
 *   GET /api/notifications/prefs  → { prefs: { [clave]: boolean } }
 *   PUT /api/notifications/prefs  ← { prefs: { [clave]: boolean } }
 *
 * Las claves válidas dependen del rol (catálogo NOTIF_CATALOG de
 * src/lib/notif-catalog.ts); las que no existan en BD vienen como true.
 */
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const prefs = await getNotifPrefs(session.role as NotifRole, session.id)
  return NextResponse.json({ prefs })
}

export async function PUT(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const prefs = body?.prefs
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return NextResponse.json(
      { error: 'Formato no válido: envía { prefs: { clave: boolean } }' },
      { status: 400 },
    )
  }
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value !== 'boolean') {
      return NextResponse.json(
        { error: `El valor de "${key}" debe ser true o false` },
        { status: 400 },
      )
    }
  }

  const role = session.role as NotifRole
  await setNotifPrefs(role, session.id, prefs)
  const fresh = await getNotifPrefs(role, session.id)
  return NextResponse.json({ prefs: fresh })
}
