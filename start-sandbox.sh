#!/usr/bin/env bash
# Arranca el sandbox de forma daemon (doble fork) para que sobreviva al shell.
cd /home/z/my-project
# Limpia instancias previas
pkill -f "next-server\|next dev" 2>/dev/null
sleep 1
# Redirige TODO y se desengancha del terminal
nohup ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &
PID=$!
disown

# Mini-service de tiempo real (solo sandbox): socket.io en 3003 (vía gateway
# Caddy con XTransformPort) y endpoint interno de emit en 3004. Sin él, los
# paneles quedan siempre en "Conectando…" y no llegan los eventos en vivo.
if [ -d /home/z/my-project/mini-services/realtime ]; then
  pkill -f "mini-services/realtime" 2>/dev/null
  sleep 0.5
  cd /home/z/my-project/mini-services/realtime
  nohup bun run dev > /tmp/realtime-service.log 2>&1 < /dev/null &
  disown
  cd /home/z/my-project
fi

# Da tiempo a levantar y reporta
sleep 8
if kill -0 "$PID" 2>/dev/null; then
  echo "OK pid=$PID"
else
  echo "DEAD pid=$PID — últimos logs:"
  tail -20 /home/z/my-project/dev.log
fi
