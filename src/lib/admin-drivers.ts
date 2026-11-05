import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { type SessionData } from '@/lib/session'

export interface AdminDriverInput {
  username: string
  name: string
  password: string
}

export interface AdminDriverOut {
  id: string
  username: string
  name: string
  createdAt: string
  restaurants: number
  services: number
}

function normalize(input: Partial<AdminDriverInput>): {
  ok: true; data: AdminDriverInput
} | {
  ok: false; error: string
} {
  const username = String(input.username || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  const password = String(input.password || '')

  if (!username || !name || !password) {
    return { ok: false, error: 'Faltan campos obligatorios' }
  }
  if (password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return { ok: false, error: 'El usuario solo puede tener letras minúsculas, números, ".", "_" y "-"' }
  }
  return { ok: true, data: { username, name, password } }
}

export async function listDrivers(): Promise<AdminDriverOut[]> {
  const rows = await db.driver.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { restaurants: true } },
      restaurants: { select: { id: true } },
    },
  })

  // Total deliveries served per assigned restaurant set
  const serviceCounts = await db.delivery.groupBy({
    by: ['restaurantId'],
    _count: { _all: true },
  })
  const servicesByRestaurant = new Map(serviceCounts.map((s) => [s.restaurantId, s._count._all]))

  return rows.map((d) => ({
    id: d.id,
    username: d.username,
    name: d.name,
    createdAt: d.createdAt.toISOString(),
    restaurants: d._count.restaurants,
    services: d.restaurants.reduce((acc, r) => acc + (servicesByRestaurant.get(r.id) || 0), 0),
  }))
}

export async function createDriver(
  input: Partial<AdminDriverInput>,
): Promise<{ ok: true; driver: AdminDriverOut } | { ok: false; error: string; status: number }> {
  const norm = normalize(input)
  if (!norm.ok) return { ok: false, error: norm.error, status: 400 }

  // Usernames are shared across drivers and restaurants: no collisions allowed
  const [existingDriver, existingRestaurant] = await Promise.all([
    db.driver.findUnique({ where: { username: norm.data.username } }),
    db.restaurant.findUnique({ where: { username: norm.data.username } }),
  ])
  if (existingDriver || existingRestaurant) {
    return { ok: false, error: 'Ese nombre de usuario ya existe', status: 409 }
  }

  const d = await db.driver.create({
    data: {
      username: norm.data.username,
      name: norm.data.name,
      password: hashPassword(norm.data.password),
    },
  })
  return {
    ok: true,
    driver: {
      id: d.id,
      username: d.username,
      name: d.name,
      createdAt: d.createdAt.toISOString(),
      restaurants: 0,
      services: 0,
    },
  }
}

export async function updateDriverPassword(
  id: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!password || password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres', status: 400 }
  }
  const existing = await db.driver.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Repartidor no encontrado', status: 404 }
  await db.driver.update({ where: { id }, data: { password: hashPassword(password) } })
  return { ok: true }
}

export async function updateDriverName(
  id: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const clean = String(name || '').trim()
  if (!clean) return { ok: false, error: 'El nombre es obligatorio', status: 400 }
  const existing = await db.driver.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Repartidor no encontrado', status: 404 }
  await db.driver.update({ where: { id }, data: { name: clean } })
  return { ok: true }
}

export async function deleteDriver(
  id: string,
  session: SessionData,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (id === session.id) {
    return { ok: false, error: 'No puedes eliminar tu propia cuenta', status: 400 }
  }
  const existing = await db.driver.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Repartidor no encontrado', status: 404 }

  // Unassign his restaurants (deliveries/history stay, they belong to the restaurant)
  await db.restaurant.updateMany({ where: { assignedDriverId: id }, data: { assignedDriverId: null } })
  await db.driver.delete({ where: { id } })
  return { ok: true }
}
