import { db } from '../src/lib/db'
async function main() {
  const restaurants = await db.restaurant.findMany({
    select: { id: true, name: true, username: true, address: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Restaurantes activos: ${restaurants.length}`)
  for (const r of restaurants) {
    console.log(`  - ${r.name} | usuario: ${r.username} | ${r.address}`)
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
