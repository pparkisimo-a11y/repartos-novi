#!/usr/bin/env bash
# Arranca el sandbox completo (Next.js + mini-service realtime) de forma
# daemonizada (double-fork → PPID=1) para que sobreviva entre comandos del
# tool. Idempotente: si ya está vivo, no hace nada.
set -u

cd /home/z/my-project

# --- Next.js (puerto 3000) ---
if curl -sf -o /dev/null http://localhost:3000/healthz 2>/dev/null; then
  echo "next: ya vivo (3000 OK)"
else
  pkill -f "next dev" 2>/dev/null
  sleep 1
  cat > /tmp/daemonize-next.pl <<'PERL'
use POSIX qw(setsid);
chdir("/home/z/my-project") or die;
fork and exit;
setsid() or die;
fork and exit;
open(STDIN, "<", "/dev/null");
open(STDOUT, ">>", "/home/z/my-project/dev.log");
open(STDERR, ">>", "/home/z/my-project/dev.log");
exec("./node_modules/.bin/next", "dev", "-p", "3000", "--webpack") or die "exec failed: $!";
PERL
  perl /tmp/daemonize-next.pl
  echo "next: lanzado (daemonizado, PPID=1)"
  # esperar a que responda
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://localhost:3000/healthz 2>/dev/null; then
      echo "next: OK tras ${i}s"
      break
    fi
    sleep 1
  done
fi

# --- Mini-service realtime (socket.io :3003 + emit :3004) ---
if curl -sf -o /dev/null "http://localhost:3003/socket.io/?EIO=4&transport=polling" 2>/dev/null; then
  echo "realtime: ya vivo (3003 OK)"
else
  pkill -f "realtime/index.ts" 2>/dev/null
  sleep 1
  cat > /tmp/daemonize-realtime.pl <<'PERL'
use POSIX qw(setsid);
chdir("/home/z/my-project/mini-services/realtime") or die;
fork and exit;
setsid() or die;
fork and exit;
open(STDIN, "<", "/dev/null");
open(STDOUT, ">>", "/tmp/realtime-service.log");
open(STDERR, ">>", "/tmp/realtime-service.log");
exec("bun", "run", "dev") or die "exec failed: $!";
PERL
  perl /tmp/daemonize-realtime.pl
  echo "realtime: lanzado (daemonizado, PPID=1)"
  for i in $(seq 1 15); do
    if curl -sf -o /dev/null "http://localhost:3003/socket.io/?EIO=4&transport=polling" 2>/dev/null; then
      echo "realtime: OK tras ${i}s"
      break
    fi
    sleep 1
  done
fi

echo "--- Estado final ---"
curl -s -o /dev/null -w "  next  /healthz  HTTP %{http_code}\n" http://localhost:3000/healthz
curl -s -o /dev/null -w "  next  /         HTTP %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "  rt    socket.io HTTP %{http_code}\n" "http://localhost:3003/socket.io/?EIO=4&transport=polling"
