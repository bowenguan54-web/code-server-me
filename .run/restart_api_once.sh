#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
pids=$(pgrep -f 'uvicorn algo_service.main:app' || true)
echo "old_pids=${pids:-none}"
if [ -n "$pids" ]; then
  kill -9 $pids 2>/dev/null || true
fi
sleep 1
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
sleep 2
echo "new:"
ps -ef | grep -E 'uvicorn algo_service.main:app' | grep -v grep || true
echo "health:"
curl -s http://127.0.0.1:8000/health || true
