import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { setSession, createSessionToken } from '@/lib/session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!username || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña obligatorios' }, { status: 400 })
    }

    // Unified login: the same form works for all three profiles. The username
    // determines the role automatically (admin → driver → restaurant).

    // Admin login (management profile)
    const admin = await db.admin.findUnique({ where: { username } })
    if (admin) {
      if (!verifyPassword(password, admin.password)) {
        return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
      }
      const adminSession = { role: 'admin' as const, id: admin.id, name: admin.name }
      await setSession(adminSession)
      return NextResponse.json({
        user: { id: admin.id, name: admin.name, username, role: 'admin' },
        token: createSessionToken(adminSession),
      })
    }

    // Driver login (each driver has its own DB account)
    const driver = await db.driver.findUnique({ where: { username } })
    if (driver) {
      if (!verifyPassword(password, driver.password)) {
        return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
      }
      const sessionData = { role: 'driver' as const, id: driver.id, name: driver.name }
      // Set the cookie as a fallback for top-level tabs; the bearer token below is
      // the primary auth mechanism (works in cross-site iframe previews).
      await setSession(sessionData)
      const token = createSessionToken(sessionData)
      return NextResponse.json({
        user: { id: driver.id, name: driver.name, username, role: 'driver' },
        token,
      })
    }

    // Restaurant login
    const restaurant = await db.restaurant.findUnique({ where: { username } })
    if (!restaurant || !verifyPassword(password, restaurant.password)) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    }

    const restaurantSession = { role: 'restaurant' as const, id: restaurant.id, name: restaurant.name }
    await setSession(restaurantSession)
    const restaurantToken = createSessionToken(restaurantSession)

    return NextResponse.json({
      user: {
        id: restaurant.id,
        name: restaurant.name,
        username: restaurant.username,
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        role: 'restaurant',
      },
      token: restaurantToken,
    })
  } catch (err) {
    console.error('[login]', err)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
