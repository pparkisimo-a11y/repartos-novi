/**
 * Asignación SECUENCIAL de repartidores (round-robin puro).
 *
 * Un pedido para cada repartidor, alternando: Laura, Mohamed, Laura, Mohamed...
 * Sin importar cuántos pedidos tengan activos. El que le toca es el que
 * MENOS pedidos activos tiene (PENDING ofrecidos + ACCEPTED/PICKED_UP).
 * Si empatan, orden alfabético (estable).
 *
 * Los súper repartidores entran en la rotación normal.
 */
import { db } from '@/lib/db'
import { parseSchedule, isRestaurantOpen } from '@/lib/schedule'

export async function buildAssigneeOrder(
  restaurantDriverIds: string[],
): Promise<string[]> {
  if (restaurantDriverIds.length === 0) return []

  const drivers = await db.driver.findMany({
    where: { id: { in: restaurantDriverIds } },
    select: {
      id: true,
      name: true,
      offeredDeliveries: {
        where: { status: 'PENDING' },
        select: { id: true },
      },
      deliveries: {
        where: { status: { in: ['ACCEPTED', 'PICKED_UP'] } },
        select: { id: true },
      },
    },
  })

  const now = new Date()
  const withMeta = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    activeCount: d.offeredDeliveries.length + d.deliveries.length,
  }))

  // Round-robin: el que menos pedidos activos tiene es el que le toca.
  // Desempate por orden alfabético (estable).
  withMeta.sort((a, b) => {
    if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount
    return a.name.localeCompare(b.name)
  })

  return withMeta.map((d) => d.id)
}

export function assigneeAt(order: string[], index: number): string | null {
  if (index < 0 || index >= order.length) return null
  return order[index] ?? null
}
