#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
mkdir -p .run
pids=$(pgrep -f "python -m uvicorn algo_service.main:app" || true)
if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
sleep 1
nohup python -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir algo_service > .run/algo-service.log 2>&1 < /dev/null &
sleep 3
curl -sS --max-time 8 http://127.0.0.1:8000/health
