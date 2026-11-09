import { NextResponse } from 'next/server'
import { createLead } from '@/lib/admin-leads'
import { realtimeEmit } from '@/lib/realtime'

// Simple in-memory rate limit: max 5 submissions per IP per 10 minutes.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list)
    return true
  }
  list.push(now)
  hits.set(ip, list)
  return false
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Inténtalo más tarde.' },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const res = await createLead(body)
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }
    // Avisar a los admins conectados en tiempo real (antes tocaba esperar al
    // refresco de 60 s de la pestaña Solicitudes). El toast del admin respeta
    // su preferencia "new_lead".
    await realtimeEmit({
      event: 'lead:new',
      room: 'admin',
      payload: {
        restaurantName: res.lead.restaurantName,
        contactName: res.lead.contactName ?? null,
        phone: res.lead.phone ?? null,
      },
    })
    return NextResponse.json({ ok: true, lead: res.lead }, { status: 201 })
  } catch (err) {
    console.error('[leads:POST]', err)
    return NextResponse.json({ error: 'Error al enviar la solicitud' }, { status: 500 })
  }
}
