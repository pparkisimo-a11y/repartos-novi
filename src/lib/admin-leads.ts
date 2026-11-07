import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export type LeadStatus = 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'

export interface LeadOut {
  id: string
  restaurantName: string
  contactName: string | null
  phone: string | null
  message: string | null
  status: LeadStatus
  notes: string | null
  createdAt: string
  contactedAt: string | null
  convertedAt: string | null
  convertedRestaurantId: string | null
  convertedRestaurantName: string | null
}

const VALID_STATUSES: LeadStatus[] = ['PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED']

function serialize(
  l: {
    id: string
    restaurantName: string
    contactName: string | null
    phone: string | null
    message: string | null
    status: string
    notes: string | null
    createdAt: Date
    contactedAt: Date | null
    convertedAt: Date | null
    convertedRestaurantId: string | null
    convertedRestaurant?: { name: string } | null
  },
): LeadOut {
  return {
    id: l.id,
    restaurantName: l.restaurantName,
    contactName: l.contactName,
    phone: l.phone,
    message: l.message,
    status: l.status as LeadStatus,
    notes: l.notes,
    createdAt: l.createdAt.toISOString(),
    contactedAt: l.contactedAt?.toISOString() ?? null,
    convertedAt: l.convertedAt?.toISOString() ?? null,
    convertedRestaurantId: l.convertedRestaurantId,
    convertedRestaurantName: l.convertedRestaurant?.name ?? null,
  }
}

/** PUBLIC: create a new contact request from a potential restaurant. */
export async function createLead(input: {
  restaurantName?: unknown
  contactName?: unknown
  phone?: unknown
  message?: unknown
  website?: unknown // honeypot: must be empty
}): Promise<{ ok: true; lead: LeadOut } | { ok: false; error: string }> {
  // Honeypot: bots fill hidden fields
  if (String(input.website || '').trim() !== '') {
    return { ok: false, error: 'Solicitud no válida' }
  }

  const restaurantName = String(input.restaurantName || '').trim()
  const contactName = String(input.contactName || '').trim() || null
  const phone = String(input.phone || '').trim()
  const message = String(input.message || '').trim() || null

  if (!restaurantName) return { ok: false, error: 'El nombre del local es obligatorio' }
  if (restaurantName.length > 120) return { ok: false, error: 'Nombre demasiado largo' }
  if (!phone) return { ok: false, error: 'El teléfono es obligatorio' }
  if (phone.length > 30) return { ok: false, error: 'Teléfono no válido' }

  const lead = await db.lead.create({
    data: { restaurantName, contactName, phone, message },
  })
  return { ok: true, lead: serialize(lead) }
}

/** DRIVER: list all leads, newest first. */
export async function listLeads(): Promise<LeadOut[]> {
  const leads = await db.lead.findMany({
    orderBy: { createdAt: 'desc' },
    include: { convertedRestaurant: { select: { name: true } } },
  })
  return leads.map(serialize)
}

/** DRIVER: update status and/or notes. */
export async function updateLead(
  id: string,
  input: { status?: unknown; notes?: unknown },
): Promise<{ ok: true; lead: LeadOut } | { ok: false; error: string; status: number }> {
  const existing = await db.lead.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Solicitud no encontrada', status: 404 }

  const data: Record<string, unknown> = {}

  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase()
    if (!VALID_STATUSES.includes(status as LeadStatus)) {
      return { ok: false, error: 'Estado no válido', status: 400 }
    }
    if (existing.status === 'CONVERTED' && status !== 'CONVERTED') {
      return { ok: false, error: 'Una solicitud convertida no puede cambiar de estado', status: 400 }
    }
    data.status = status
    if (status === 'CONTACTED' && !existing.contactedAt) data.contactedAt = new Date()
  }

  if (input.notes !== undefined) {
    data.notes = String(input.notes).trim() || null
  }

  const lead = await db.lead.update({
    where: { id },
    data,
    include: { convertedRestaurant: { select: { name: true } } },
  })
  return { ok: true, lead: serialize(lead) }
}

/** DRIVER: convert a lead into a real restaurant account. */
export async function convertLead(
  id: string,
  input: {
    name?: unknown
    username?: unknown
    password?: unknown
    address?: unknown
    lat?: unknown
    lng?: unknown
    assignedDriverIds?: unknown
  },
): Promise<
  | { ok: true; lead: LeadOut; restaurant: { id: string; name: string; username: string } }
  | { ok: false; error: string; status: number }
> {
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) return { ok: false, error: 'Solicitud no encontrada', status: 404 }
  if (lead.status === 'CONVERTED') {
    return { ok: false, error: 'Esta solicitud ya fue convertida', status: 400 }
  }

  const name = String(input.name ?? lead.restaurantName).trim()
  const username = String(input.username || '').trim().toLowerCase()
  const password = String(input.password || '')
  const address = String(input.address ?? '').trim()
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  // Un local puede tener VARIOS repartidores asignados
  const assignedDriverIds = (Array.isArray(input.assignedDriverIds)
    ? input.assignedDriverIds
    : input.assignedDriverIds
      ? [input.assignedDriverIds]
      : []
  ).map((v) => String(v)).filter(Boolean)

  if (!name || !username || !password || !address) {
    return { ok: false, error: 'Completa todos los campos del restaurante', status: 400 }
  }
  if (password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres', status: 400 }
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return { ok: false, error: 'El usuario solo puede tener letras minúsculas, números, ".", "_" y "-"', status: 400 }
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, error: 'Ubicación no válida', status: 400 }
  }

  // Usernames are shared across drivers and restaurants: no collisions allowed
  const [existing, existingDriver] = await Promise.all([
    db.restaurant.findUnique({ where: { username } }),
    db.driver.findUnique({ where: { username } }),
  ])
  if (existing || existingDriver) {
    return { ok: false, error: 'Ese nombre de usuario ya existe', status: 409 }
  }

  let assignedDrivers: { id: string }[] = []
  if (assignedDriverIds.length > 0) {
    assignedDrivers = await db.driver.findMany({
      where: { id: { in: assignedDriverIds } },
      select: { id: true },
    })
    if (assignedDrivers.length !== assignedDriverIds.length) {
      return { ok: false, error: 'Repartidor no encontrado', status: 400 }
    }
  }

  const restaurant = await db.restaurant.create({
    data: {
      name,
      username,
      password: hashPassword(password),
      address,
      lat,
      lng,
      drivers: {
        create: assignedDrivers.map((d) => ({ driverId: d.id })),
      },
    },
  })

  const updated = await db.lead.update({
    where: { id },
    data: {
      status: 'CONVERTED',
      convertedAt: new Date(),
      convertedRestaurantId: restaurant.id,
    },
    include: { convertedRestaurant: { select: { name: true } } },
  })

  return {
    ok: true,
    lead: serialize(updated),
    restaurant: { id: restaurant.id, name: restaurant.name, username: restaurant.username },
  }
}
