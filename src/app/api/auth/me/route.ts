import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/session'

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ user: null })
  }

  if (session.role === 'admin') {
    // Refresh the admin from DB: if the account was deleted, force logout.
    const admin = await db.admin.findUnique({
      where: { id: session.id },
      select: { id: true, name: true, username: true },
    })
    if (!admin) {
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({
      user: { id: admin.id, name: admin.name, username: admin.username, role: 'admin' },
    })
  }

  if (session.role === 'driver') {
    // Refresh the driver from DB: if the account was deleted, force logout.
    const driver = await db.driver.findUnique({
      where: { id: session.id },
      select: { id: true, name: true, username: true },
    })
    if (!driver) {
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({
      user: { id: driver.id, name: driver.name, username: driver.username, role: 'driver' },
    })
  }

  // Restaurant: refresh name/username from DB
  const restaurant = await db.restaurant.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, username: true, address: true, lat: true, lng: true },
  })

  if (!restaurant) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({
    user: { ...restaurant, role: 'restaurant' },
  })
}
