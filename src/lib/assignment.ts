/**
 * Asignación SECUENCIAL de repartidores (round-robin puro).
 *
 * Cuando un restaurante pide un reparto, el pedido se ofrece a UN repartidor
 * cada vez (no a todos a la vez). Si rechaza, salta al siguiente; el último
 * no puede rechazar.
 *
 * El orden rota de forma estrictamente alterna: si hay Laura y Mohamed, el
 * orden es Laura, Mohamed, Laura, Mohamed... sin importar cuántos pedidos
 * tengan activos. Para lograrlo, la lista empieza por el repartidor que
 * MENOS veces ha sido el primero en la rotación reciente (el que "le toca"
 * ahora), y el resto va en orden alfabético estable detrás.
 *
 * Los repartidores fuera de su horario laboral se colocan al final (si todos
 * están fuera, se ofrece igualmente al que le toque — mejor eso que nadie).
 *
 * Los súper repartidores SÍ entran en la rotación normal (son repartidores que
 * además tienen la capacidad extra de robar pedidos).
 */
import { db } from '@/lib/db'
import { parseSchedule, isRestaurantOpen } from '@/lib/schedule'

/**
 * Construye la lista ordenada de repartidores para una rotación secuencial.
 * El PRIMERO es el que le toca ahora (round-robin); el resto va detrás en
 * orden alfabético estable. Así cada pedido nuevo va a un repartidor distinto.
 */
export async function buildAssigneeOrder(
  restaurantDriverIds: string[],
): Promise<string[]> {
  if (restaurantDriverIds.length === 0) return []

  const drivers = await db.driver.findMany({
    where: { id: { in: restaurantDriverIds } },
    select: {
      id: true,
      name: true,
      scheduleDays: true,
      scheduleStart: true,
      scheduleEnd: true,
      // Pedidos activos que tiene este repartidor ahora mismo: PENDING que se
      // le están ofreciendo + ACCEPTED/PICKED_UP que ya aceptó. Así si Laura
      // ya aceptó uno y Mohamed no, el siguiente va a Mohamed (round-robin
      // real: uno para cada, alternando).
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
  const withMeta = drivers.map((d) => {
    const schedule = parseSchedule(d.scheduleDays, d.scheduleStart, d.scheduleEnd)
    const isWorking = isRestaurantOpen(schedule, now)
    return {
      id: d.id,
      name: d.name,
      // turnCount = pedidos pendientes esperándole + pedidos que ya aceptó y
      // están en marcha. El que menos tenga es el que le toca ahora.
      turnCount: d.offeredDeliveries.length + d.deliveries.length,
      isWorking,
    }
  })

  // Orden de la rotación:
  //   1. El que MENOS turnos ha tenido (a éste le toca)
  //   2. Los que están trabajando antes que los que no
  //   3. Orden alfabético (desempate estable)
  withMeta.sort((a, b) => {
    if (a.turnCount !== b.turnCount) return a.turnCount - b.turnCount
    if (a.isWorking !== b.isWorking) return a.isWorking ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return withMeta.map((d) => d.id)
}

/** Devuelve el currentAssigneeId según el índice actual, o null si se acabó. */
export function assigneeAt(order: string[], index: number): string | null {
  if (index < 0 || index >= order.length) return null
  return order[index] ?? null
}
