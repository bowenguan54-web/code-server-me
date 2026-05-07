#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
mkdir -p .run
pids=$(pgrep -f "python -m uvicorn algo_service.main:app" || true)
if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
nodepids=$(pgrep -f "/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release" || true)
if [ -n "$nodepids" ]; then kill -9 $nodepids 2>/dev/null || true; fi
sleep 1
nohup python -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir algo_service > .run/algo-service.log 2>&1 < /dev/null &
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 4
curl -sS --max-time 8 http://127.0.0.1:8000/health
printf '\n'
curl -sS --max-time 5 -o /dev/null -w 'code-server:%{http_code}\n' http://127.0.0.1:8080/
