# Repartos NOVI 🛵

App de gestión de repartos nocturnos para kebabs y pizzerías: los restaurantes piden
reparto con un botón y el repartidor asignado lo recibe al instante en su móvil (con
aviso sonoro), acepta, recoge y entrega. Cada restaurante está asignado a un repartidor
y sus peticiones solo llegan a quien lo lleva.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Prisma ORM** con **PostgreSQL** (Supabase)
- **Socket.IO** integrado en el propio servidor (`server.js`) para notificaciones en tiempo real
- Auth propia con token HMAC (header `Authorization: Bearer`) + cookie de respaldo

## Despliegue (Render, plan gratuito)

El despliegue es automático: cada `git push` a `main` dispara el workflow de GitHub
Actions (`.github/workflows/deploy.yml`) que lanza un deploy en Render vía API.

- **Build**: `npm install && npx prisma db push && npm run build`
- **Start**: `node server.js` (sirve Next.js + Socket.IO en el mismo puerto)

### Variables de entorno (configuradas en Render)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Supabase (usar el **pooler** `aws-0-eu-west-1.pooler.supabase.com`, IPv4) |
| `SESSION_SECRET` | Secreto HMAC para firmar sesiones |
| `NEXT_PUBLIC_SOCKET_SAME_ORIGIN` | `true` — el cliente conecta al socket del mismo origen |
| `NODE_VERSION` | `22` |

## Desarrollo local (sandbox)

```bash
bun install
bun run dev          # Next.js en :3000
```

En el entorno sandbox, el realtime corre como mini-service aparte
(`mini-services/realtime`, socket.io en :3003 vía gateway Caddy con `?XTransformPort=3003`).

## Notas

- La BD es Supabase (plan free). El proyecto se pausa tras 7 días sin actividad:
  mantenerlo activo con un ping periódico (p. ej. Google Apps Script) o entrando al dashboard.
- El servicio free de Render se duerme tras 15 min sin tráfico; el primer acceso tarda
  unos segundos más en despertar. Se puede mantener despierto con el mismo ping.
