/* Crea un pedido PENDING de Pizzeria Centro para probar el flujo E2E. */
import { db } from '../src/lib/db'

async function main() {
  const r = await db.restaurant.findUnique({ where: { username: 'pizzacentro' } })
  if (!r) throw new Error('No existe pizzacentro — ejecuta seed-dev.ts primero')
  const d = await db.delivery.create({
    data: { restaurantId: r.id, status: 'PENDING', customerName: 'E2E Tester' },
  })
  console.log('✓ delivery PENDING creado:', d.id, 'para', r.name)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
