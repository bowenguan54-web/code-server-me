#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me || exit 1
mkdir -p .run
pkill -f "uvicorn algo_service.main:app" 2>/dev/null || true
pkill -f "release/lib/node ./release" 2>/dev/null || true
sleep 1
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
nohup ./release/lib/node ./release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 3
ps -ef | grep -E 'uvicorn algo_service.main:app|release/lib/node ./release' | grep -v grep || true
