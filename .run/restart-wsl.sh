#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
pkill -f 'uvicorn algo_service.main:app' 2>/dev/null || true
pkill -f '/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release' 2>/dev/null || true
sleep 1
: > .run/algo-service.log
: > .run/code-server.log
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 6
curl -s http://127.0.0.1:8000/health || { echo 'BACKEND_LOG'; tail -100 .run/algo-service.log; }
echo
curl -s -o /dev/null -w 'code-server %{http_code}\n' http://127.0.0.1:8080/algo-lib || { echo 'CODE_SERVER_LOG'; tail -100 .run/code-server.log; }
pgrep -af 'uvicorn algo_service.main:app|/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release' || true
