import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export interface AdminRestaurantInput {
  name: string
  username: string
  password: string
  address: string
  lat: number
  lng: number
  assignedDriverId?: string | null
}

export interface AdminRestaurantOut {
  id: string
  name: string
  username: string
  address: string
  lat: number
  lng: number
  createdAt: string
  services: number
  assignedDriverId: string | null
  assignedDriverName: string | null
}

function normalize(input: Partial<AdminRestaurantInput>): {
  ok: true; data: AdminRestaurantInput
} | {
  ok: false; error: string
} {
  const name = String(input.name || '').trim()
  const username = String(input.username || '').trim().toLowerCase()
  const password = String(input.password || '')
  const address = String(input.address || '').trim()
  const lat = Number(input.lat)
  const lng = Number(input.lng)

  if (!name || !username || !password || !address) {
    return { ok: false, error: 'Faltan campos obligatorios' }
  }
  if (password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return { ok: false, error: 'El usuario solo puede tener letras minúsculas, números, ".", "_" y "-"' }
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, error: 'Ubicación no válida' }
  }
  return { ok: true, data: { name, username, password, address, lat, lng, assignedDriverId: input.assignedDriverId || null } }
}

/** Resolve an optional driver id into a valid DB driver (or null). */
async function resolveDriver(
  assignedDriverId: string | null | undefined,
): Promise<{ ok: true; driverId: string | null; driverName: string | null } | { ok: false; error: string }> {
  if (!assignedDriverId) return { ok: true, driverId: null, driverName: null }
  const driver = await db.driver.findUnique({ where: { id: assignedDriverId }, select: { id: true, name: true } })
  if (!driver) return { ok: false, error: 'Repartidor no encontrado' }
  return { ok: true, driverId: driver.id, driverName: driver.name }
}

export async function listRestaurants(): Promise<AdminRestaurantOut[]> {
  const rows = await db.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { deliveries: true } },
      assignedDriver: { select: { id: true, name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    createdAt: r.createdAt.toISOString(),
    services: r._count.deliveries,
    assignedDriverId: r.assignedDriverId,
    assignedDriverName: r.assignedDriver?.name ?? null,
  }))
}

export async function createRestaurant(
  input: Partial<AdminRestaurantInput>,
): Promise<{ ok: true; restaurant: AdminRestaurantOut } | { ok: false; error: string; status: number }> {
  const norm = normalize(input)
  if (!norm.ok) return { ok: false, error: norm.error, status: 400 }

  // Username must not collide with a restaurant OR a driver account
  const [existingRestaurant, existingDriver] = await Promise.all([
    db.restaurant.findUnique({ where: { username: norm.data.username } }),
    db.driver.findUnique({ where: { username: norm.data.username } }),
  ])
  if (existingRestaurant || existingDriver) {
    return { ok: false, error: 'Ese nombre de usuario ya existe', status: 409 }
  }

  const driver = await resolveDriver(norm.data.assignedDriverId)
  if (!driver.ok) return { ok: false, error: driver.error, status: 400 }

  const r = await db.restaurant.create({
    data: {
      name: norm.data.name,
      username: norm.data.username,
      password: hashPassword(norm.data.password),
      address: norm.data.address,
      lat: norm.data.lat,
      lng: norm.data.lng,
      assignedDriverId: driver.driverId,
    },
  })
  return {
    ok: true,
    restaurant: {
      id: r.id,
      name: r.name,
      username: r.username,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      createdAt: r.createdAt.toISOString(),
      services: 0,
      assignedDriverId: driver.driverId,
      assignedDriverName: driver.driverName,
    },
  }
}

/** Assign (or unassign with null) a restaurant to a driver. */
export async function updateRestaurantAssignment(
  id: string,
  assignedDriverId: string | null,
): Promise<{ ok: true; restaurant: AdminRestaurantOut } | { ok: false; error: string; status: number }> {
  const existing = await db.restaurant.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Restaurante no encontrado', status: 404 }

  const driver = await resolveDriver(assignedDriverId)
  if (!driver.ok) return { ok: false, error: driver.error, status: 400 }

  const r = await db.restaurant.update({
    where: { id },
    data: { assignedDriverId: driver.driverId },
    include: {
      _count: { select: { deliveries: true } },
      assignedDriver: { select: { id: true, name: true } },
    },
  })
  return {
    ok: true,
    restaurant: {
      id: r.id,
      name: r.name,
      username: r.username,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      createdAt: r.createdAt.toISOString(),
      services: r._count.deliveries,
      assignedDriverId: r.assignedDriverId,
      assignedDriverName: r.assignedDriver?.name ?? null,
    },
  }
}

export async function updateRestaurantPassword(
  id: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!password || password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres', status: 400 }
  }
  const existing = await db.restaurant.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Restaurante no encontrado', status: 404 }
  await db.restaurant.update({ where: { id }, data: { password: hashPassword(password) } })
  return { ok: true }
}

export async function deleteRestaurant(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const existing = await db.restaurant.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Restaurante no encontrado', status: 404 }
  // Delete deliveries first (no cascade in SQLite Prisma without relation onDelete)
  await db.delivery.deleteMany({ where: { restaurantId: id } })
  await db.restaurant.delete({ where: { id } })
  return { ok: true }
}
