#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
mkdir -p .run
for pid in $(pgrep -f "python -m uvicorn algo_service.main:app" || true); do kill -9 "$pid" 2>/dev/null || true; done
for pid in $(pgrep -f "/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release" || true); do kill -9 "$pid" 2>/dev/null || true; done
sleep 1
nohup python -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir algo_service > .run/algo-service.log 2>&1 < /dev/null &
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 4
ps -ef | grep -E 'python -m uvicorn algo_service.main:app|/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release' | grep -v grep || true
