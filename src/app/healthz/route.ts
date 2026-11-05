import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Health check usado por el Google Script de keep-alive.
 *
 * Un solo GET a /healthz mantiene despiertos a la vez:
 *  - el web service de Render (cualquier petición reinicia el contador de spin-down)
 *  - la base de datos de Supabase (ejecutamos SELECT 1 contra Postgres)
 *
 * No requiere autenticación: sólo lee una constante de Postgres.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        status: 'ok',
        service: 'repartos-novi',
        db: 'ok',
        latencyMs: Date.now() - started,
        time: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'repartos-novi',
        db: 'down',
        error: err instanceof Error ? err.message : String(err),
        time: new Date().toISOString(),
      },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}
