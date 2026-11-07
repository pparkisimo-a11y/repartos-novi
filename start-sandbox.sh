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
# Da tiempo a levantar y reporta
sleep 8
if kill -0 "$PID" 2>/dev/null; then
  echo "OK pid=$PID"
else
  echo "DEAD pid=$PID — últimos logs:"
  tail -20 /home/z/my-project/dev.log
fi
