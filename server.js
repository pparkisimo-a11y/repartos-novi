/**
 * Repartos NOVI — servidor de producción.
 *
 * Custom server que sirve Next.js y Socket.IO en el MISMO puerto (process.env.PORT).
 * Así, en plataformas como Render (plan gratuito, un solo puerto expuesto), las
 * notificaciones en tiempo real (beep de nuevos repartos) funcionan sin servicios extra.
 *
 * El instance de socket.io se guarda en globalThis.__io para que las API routes de
 * Next.js (que corren en este mismo proceso) puedan emitir eventos directamente
 * (ver src/lib/realtime.ts).
 */
const http = require('http')
const next = require('next')
const { Server } = require('socket.io')

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'

async function main() {
  const app = next({ dev })
  const handle = app.getRequestHandler()

  await app.prepare()

  const httpServer = http.createServer((req, res) => {
    handle(req, res)
  })

  // Socket.IO sobre el mismo servidor HTTP (path por defecto: /socket.io)
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Compartir io con las API routes de Next.js (mismo proceso)
  globalThis.__io = io

  // Misma lógica de salas que el mini-service de desarrollo (mini-services/realtime):
  // - driver      → sala 'driver'
  // - restaurant  → sala 'restaurant:<id>'
  io.on('connection', (socket) => {
    console.log(`[io] connected: ${socket.id}`)

    socket.on('join', (data) => {
      if (!data || !data.role) return
      // salir de salas anteriores (conservar la sala propia socket.id)
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room)
      })
      if (data.role === 'driver') {
        socket.join('driver')
        // Sala personal para mensajes dirigidos a este repartidor concreto
        // (asignación secuencial: el servidor emite a driver:<id>)
        if (data.driverId) {
          socket.join(`driver:${data.driverId}`)
          socket.data.driverId = data.driverId
        }
        socket.data.role = 'driver'
      } else if (data.role === 'restaurant' && data.restaurantId) {
        const room = `restaurant:${data.restaurantId}`
        socket.join(room)
        socket.data.role = 'restaurant'
        socket.data.restaurantId = data.restaurantId
      } else if (data.role === 'admin' && data.adminId) {
        // Sala global de admins (nuevas solicitudes/leads) + sala personal
        socket.join('admin')
        socket.join(`admin:${data.adminId}`)
        socket.data.role = 'admin'
      }
      socket.emit('joined', { role: data.role })
    })

    socket.on('disconnect', (reason) => {
      console.log(`[io] disconnected: ${socket.id} (${reason})`)
    })

    socket.on('error', (err) => {
      console.error(`[io] socket error (${socket.id}):`, err)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Repartos NOVI listo en http://localhost:${port} (${dev ? 'dev' : 'producción'})`)
  })

  const shutdown = () => {
    console.log('[server] apagando...')
    io.close(() => process.exit(0))
    // Forzar salida si io.close se cuelga
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[server] error fatal:', err)
  process.exit(1)
})
