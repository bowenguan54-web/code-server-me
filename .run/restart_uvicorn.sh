#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
mkdir -p .run
for pid in $(pgrep -f "python -m uvicorn algo_service.main:app" || true); do kill -9 "$pid" 2>/dev/null || true; done
sleep 1
nohup python -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir algo_service > .run/algo-service.log 2>&1 < /dev/null &
sleep 3
pgrep -af "python -m uvicorn algo_service.main:app" || true