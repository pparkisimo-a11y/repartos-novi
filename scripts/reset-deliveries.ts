import { db } from '../src/lib/db'

async function main() {
  const r = await db.delivery.deleteMany()
  console.log(`Deleted ${r.count} deliveries`)
  const restaurants = await db.restaurant.count()
  console.log(`Restaurants kept: ${restaurants}`)
  await db.$disconnect()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
