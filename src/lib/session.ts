import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

export type SessionRole = 'restaurant' | 'driver' | 'admin'

export interface SessionData {
  role: SessionRole
  id: string // restaurant id, or the driver's DB id
  name: string
}

const COOKIE_NAME = 'kebab_session'
const SECRET = process.env.SESSION_SECRET || 'kebab-reparto-secret-change-me-2026'

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

/** Encode session data into a signed token string (used both as cookie value and as bearer token). */
function encode(data: SessionData): string {
  const payload = `${data.role}:${data.id}:${data.name}`
  const sig = sign(payload)
  return Buffer.from(payload).toString('base64') + '.' + sig
}

function decode(token: string): SessionData | null {
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return null
  try {
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8')
    const expectedSig = sign(payload)
    // timing-safe compare
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expectedSig, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const [role, id, ...nameParts] = payload.split(':')
    if (role !== 'restaurant' && role !== 'driver' && role !== 'admin') return null
    if (!id) return null
    return { role, id, name: nameParts.join(':') || id }
  } catch {
    return null
  }
}

/** Create a bearer token for the given session (sent to the client on login). */
export function createSessionToken(data: SessionData): string {
  return encode(data)
}

/** Verify and decode a bearer token. Returns null if invalid. */
export function parseSessionToken(token: string): SessionData | null {
  return decode(token)
}

/** Read session from the cookie store (legacy / top-level tab fallback). */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  return decode(token)
}

/**
 * Read session from an incoming Request: prefers the `Authorization: Bearer <token>`
 * header (works in cross-site iframes where third-party cookies are blocked), and
 * falls back to the session cookie (for top-level tabs where cookies work).
 */
export async function getSessionFromRequest(req: Request): Promise<SessionData | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    const session = decode(token)
    if (session) return session
  }
  // Fallback: cookie
  return getSession()
}

export async function setSession(data: SessionData): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, encode(data), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export { COOKIE_NAME }

/** Assert the current session is a driver (cookie-only, legacy). Throws with .status on failure. */
export async function requireDriver(): Promise<SessionData> {
  const session = await getSession()
  if (!session || session.role !== 'driver') {
    const err = new Error('No autorizado') as Error & { status: number }
    err.status = 403
    throw err
  }
  return session
}

/**
 * Assert the request's session is a driver (header or cookie). Throws with .status on failure.
 * Use this in route handlers that receive a `Request`.
 */
export async function requireDriverFromRequest(req: Request): Promise<SessionData> {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'driver') {
    const err = new Error('No autorizado') as Error & { status: number }
    err.status = 403
    throw err
  }
  return session
}

/**
 * Assert the request's session is an admin. Throws with .status on failure.
 * Management endpoints (leads, restaurants, drivers) are admin-only.
 */
export async function requireAdminFromRequest(req: Request): Promise<SessionData> {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    const err = new Error('Solo el administrador puede hacer esto') as Error & { status: number }
    err.status = 403
    throw err
  }
  return session
}
