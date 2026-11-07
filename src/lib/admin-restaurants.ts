import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export interface AdminRestaurantInput {
  name: string
  username: string
  password: string
  address: string
  lat: number
  lng: number
  assignedDriverIds?: string[]
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
  assignedDriverIds: string[]
  assignedDriverNames: string[]
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
  const assignedDriverIds = Array.isArray(input.assignedDriverIds)
    ? input.assignedDriverIds.map((id) => String(id)).filter(Boolean)
    : []

  if (!name || !username || !password || !address) {
    return { ok: false, error: 'Faltan campos obligatorios' }
  }
  if (password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return { ok: false, error: 'El usuario solo puede tener letras minúsculas, números, ".", "_" y "-"', }
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, error: 'Ubicación no válida' }
  }
  return { ok: true, data: { name, username, password, address, lat, lng, assignedDriverIds } }
}

/** Resolve a list of driver ids into valid DB drivers (all must exist). */
async function resolveDrivers(
  driverIds: string[],
): Promise<{ ok: true; drivers: { id: string; name: string }[] } | { ok: false; error: string }> {
  if (driverIds.length === 0) return { ok: true, drivers: [] }
  const drivers = await db.driver.findMany({
    where: { id: { in: driverIds } },
    select: { id: true, name: true },
  })
  if (drivers.length !== driverIds.length) {
    return { ok: false, error: 'Repartidor no encontrado' }
  }
  return { ok: true, drivers }
}

export async function listRestaurants(): Promise<AdminRestaurantOut[]> {
  const rows = await db.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { deliveries: true } },
      drivers: { select: { driverId: true, driver: { select: { id: true, name: true } } } },
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
    assignedDriverIds: r.drivers.map((a) => a.driverId),
    assignedDriverNames: r.drivers.map((a) => a.driver.name),
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

  const drivers = await resolveDrivers(norm.data.assignedDriverIds || [])
  if (!drivers.ok) return { ok: false, error: drivers.error, status: 400 }

  const r = await db.restaurant.create({
    data: {
      name: norm.data.name,
      username: norm.data.username,
      password: hashPassword(norm.data.password),
      address: norm.data.address,
      lat: norm.data.lat,
      lng: norm.data.lng,
      drivers: {
        create: drivers.drivers.map((d) => ({ driverId: d.id })),
      },
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
      assignedDriverIds: drivers.drivers.map((d) => d.id),
      assignedDriverNames: drivers.drivers.map((d) => d.name),
    },
  }
}

/**
 * Sustituye el conjunto de repartidores asignados a un restaurante.
 * Un local puede tener VARIOS repartidores: sus peticiones llegan a todos
 * y el primero que acepta se queda el pedido.
 */
export async function updateRestaurantAssignment(
  id: string,
  driverIds: string[],
): Promise<{ ok: true; restaurant: AdminRestaurantOut } | { ok: false; error: string; status: number }> {
  const existing = await db.restaurant.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Restaurante no encontrado', status: 404 }

  const drivers = await resolveDrivers(driverIds)
  if (!drivers.ok) return { ok: false, error: drivers.error, status: 400 }

  const r = await db.restaurant.update({
    where: { id },
    data: {
      drivers: {
        deleteMany: {},
        create: drivers.drivers.map((d) => ({ driverId: d.id })),
      },
    },
    include: {
      _count: { select: { deliveries: true } },
      drivers: { select: { driverId: true, driver: { select: { id: true, name: true } } } },
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
      assignedDriverIds: r.drivers.map((a) => a.driverId),
      assignedDriverNames: r.drivers.map((a) => a.driver.name),
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
  // Borrar primero pedidos y suscripciones push del local (sin cascadas en el esquema)
  await db.delivery.deleteMany({ where: { restaurantId: id } })
  await db.pushSubscription.deleteMany({ where: { role: 'restaurant', userId: id } })
  await db.restaurant.delete({ where: { id } }) // las asignaciones (RestaurantDriver) van en cascada
  return { ok: true }
}
