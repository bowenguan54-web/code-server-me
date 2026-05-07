#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
mkdir -p .run
old_api=$(pgrep -f "uvicorn algo_service.main:app" || true)
if [ -n "$old_api" ]; then kill $old_api 2>/dev/null || true; fi
old_cs=$(pgrep -f "/home/guan/code-server-me/release.*bind-addr 127.0.0.1:8080" || true)
if [ -n "$old_cs" ]; then kill $old_cs 2>/dev/null || true; fi
sleep 1
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir algo_service > .run/algo-service.log 2>&1 < /dev/null &
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 3
printf 'api='; curl -s http://127.0.0.1:8000/health || true; printf '
code-server='; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ || true; printf '
'
