/**
 * Asignación SECUENCIAL de repartidores.
 *
 * Cuando un restaurante pide un reparto, el pedido se ofrece a UN repartidor
 * cada vez (no a todos a la vez). Si rechaza, salta al siguiente; el último
 * no puede rechazar. Así se reparte el trabajo por igual.
 *
 * El orden de la rotación prioriza:
 *   1. Repartidores dentro de su horario laboral (los que no trabajan van al final)
 *   2. Los que tienen MENOS repartos activos (para repartir por igual)
 *   3. Orden alfabético (desempate estable)
 *
 * Los súper repartidores no entran en la rotación normal: ellos ven todo y
 * pueden "robar" pedidos a otros desde su panel, pero no reciben ofertas
 * automáticas (su rol es cubrir fallos, no repartir lo rutinario).
 */
import { db } from '@/lib/db'
import { parseSchedule, isRestaurantOpen } from '@/lib/schedule'

/** Construye la lista ordenada de repartidores para una rotación secuencial. */
export async function buildAssigneeOrder(
  restaurantDriverIds: string[],
): Promise<string[]> {
  if (restaurantDriverIds.length === 0) return []

  // Carga los repartidores asignados (no súper) con su carga actual
  const drivers = await db.driver.findMany({
    where: { id: { in: restaurantDriverIds }, isSuperDriver: false },
    select: {
      id: true,
      name: true,
      scheduleDays: true,
      scheduleStart: true,
      scheduleEnd: true,
      deliveries: {
        where: { status: { in: ['ACCEPTED', 'PICKED_UP'] } },
        select: { id: true },
      },
    },
  })

  const now = new Date()
  const withMeta = drivers.map((d) => {
    const schedule = parseSchedule(d.scheduleDays, d.scheduleStart, d.scheduleEnd)
    const isWorking = isRestaurantOpen(schedule, now) // misma lógica de horario
    return {
      id: d.id,
      name: d.name,
      activeCount: d.deliveries.length,
      isWorking,
    }
  })

  // Ordena: primero los que trabajan ahora, luego por menos carga, luego nombre
  withMeta.sort((a, b) => {
    if (a.isWorking !== b.isWorking) return a.isWorking ? -1 : 1
    if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount
    return a.name.localeCompare(b.name)
  })

  return withMeta.map((d) => d.id)
}

/** Devuelve el currentAssigneeId según el índice actual, o null si se acabó. */
export function assigneeAt(order: string[], index: number): string | null {
  if (index < 0 || index >= order.length) return null
  return order[index] ?? null
}
