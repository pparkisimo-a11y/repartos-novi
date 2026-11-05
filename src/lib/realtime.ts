// Server-side helper to broadcast realtime events to connected clients.
//
// Two modes:
// 1. PRODUCTION (custom server.js): socket.io runs in this same Node process and
//    the instance is exposed as globalThis.__io → emit directly, no network hop.
// 2. SANDBOX (dev): the realtime mini-service (mini-services/realtime) runs on
//    its own port; we ask it to emit via its internal HTTP endpoint.

import type { Server as SocketIOServer } from 'socket.io'

export interface EmitPayload {
  event: string
  room?: string // 'driver' | `restaurant:<id>` | undefined for broadcast to all
  payload: unknown
}

const REALTIME_URL = process.env.REALTIME_INTERNAL_URL || 'http://localhost:3004'
const EMIT_TOKEN = process.env.EMIT_TOKEN || 'kebab-emit-internal-token'

/**
 * Emit an event to connected clients.
 * Best-effort: failures are logged but never break the API response.
 */
export async function realtimeEmit(body: EmitPayload): Promise<void> {
  try {
    // Production: in-process socket.io (set by server.js)
    const g = globalThis as unknown as { __io?: SocketIOServer }
    if (g.__io) {
      if (body.room) {
        g.__io.to(body.room).emit(body.event, body.payload)
      } else {
        g.__io.emit(body.event, body.payload)
      }
      return
    }

    // Sandbox: ask the realtime mini-service (server-to-server)
    await fetch(`${REALTIME_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-emit-token': EMIT_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    console.error('[realtimeEmit] failed:', err)
  }
}
