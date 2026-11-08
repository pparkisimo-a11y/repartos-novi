/**
 * Cambia la contraseña del admin (o de cualquier usuario) en la BD.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." bun run scripts/change-password.ts admin nuevaPassword
 *   DATABASE_URL="postgresql://..." bun run scripts/change-password.ts atar nuevaPassword
 *   DATABASE_URL="postgresql://..." bun run scripts/change-password.ts pizzacentro nuevaPassword
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

async function main() {
  const username = process.argv[2]
  const password = process.argv[3]

  if (!username || !password) {
    console.log('Uso: bun run scripts/change-password.ts <usuario> <nueva_password>')
    process.exit(1)
  }

  // Buscar en Admin, Driver y Restaurant
  const [admin, driver, restaurant] = await Promise.all([
    db.admin.findUnique({ where: { username } }),
    db.driver.findUnique({ where: { username } }),
    db.restaurant.findUnique({ where: { username } }),
  ])

  if (admin) {
    await db.admin.update({ where: { id: admin.id }, data: { password: hashPassword(password) } })
    console.log(`✓ Contraseña del admin "${username}" cambiada`)
  } else if (driver) {
    await db.driver.update({ where: { id: driver.id }, data: { password: hashPassword(password) } })
    console.log(`✓ Contraseña del repartidor "${username}" cambiada`)
  } else if (restaurant) {
    await db.restaurant.update({ where: { id: restaurant.id }, data: { password: hashPassword(password) } })
    console.log(`✓ Contraseña del restaurante "${username}" cambiada`)
  } else {
    console.log(`✗ No existe el usuario "${username}"`)
    process.exit(1)
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
