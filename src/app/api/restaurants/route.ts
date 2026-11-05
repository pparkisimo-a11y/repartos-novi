import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const restaurants = await db.restaurant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
    },
  })
  return NextResponse.json({ restaurants })
}
