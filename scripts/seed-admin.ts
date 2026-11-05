/**
 * Seed del usuario administrador inicial.
 * Uso: DATABASE_URL=<supabase> bun scripts/seed-admin.ts [username] [password] [name]
 * (los parámetros son opcionales; por defecto crea admin / admin1234)
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const db = new PrismaClient()

async function main() {
  const username = (process.argv[2] || 'admin').toLowerCase()
  const password = process.argv[3] || 'admin1234'
  const name = process.argv[4] || 'Administrador'

  const existing = await db.admin.findUnique({ where: { username } })
  if (existing) {
    console.log(`El admin "${username}" ya existe — actualizo contraseña y nombre`)
    await db.admin.update({
      where: { username },
      data: { password: hashPassword(password), name },
    })
  } else {
    await db.admin.create({
      data: { username, password: hashPassword(password), name },
    })
  }
  console.log(`✓ Admin "${username}" listo`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
