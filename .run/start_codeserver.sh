#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
mkdir -p .run
pkill -f "release/lib/node ./release" 2>/dev/null || true
pkill -f "release/bin/code-server" 2>/dev/null || true
rm -f .run/code-server.log
nohup setsid ./release/bin/code-server \
  --bind-addr 127.0.0.1:8080 \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --locale zh-cn \
  --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data \
  --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions \
  > .run/code-server.log 2>&1 < /dev/null &
sleep 3
printf 'PROCESSES\n'
ps -ef | grep -E 'code-server|release/lib/node|release/bin/code-server' | grep -v grep || true
printf 'PORTS\n'
ss -ltnp | grep -E ':8080|:8000' || true
printf 'LOG\n'
tail -120 .run/code-server.log 2>/dev/null || true