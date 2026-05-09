#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
mkdir -p .run
pkill -f "uvicorn algo_service.main:app" 2>/dev/null || true
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
sleep 4
if ! ss -ltnp | grep -q ':8000'; then
  echo 'FastAPI failed to start'
  tail -120 .run/algo-service.log || true
  exit 1
fi
# Keep code-server up if it died.
if ! ss -ltnp | grep -q ':8080'; then
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
fi
printf 'PORTS\n'
ss -ltnp | grep -E ':8000|:8080' || true
printf 'COMPLETIONS\n'
curl -s http://127.0.0.1:8000/api/v1/stubs/completions | python3 - <<'PY'
import json, sys
try:
    data=json.load(sys.stdin)
except Exception as exc:
    print('invalid json', exc)
    raise SystemExit(1)
for item in data.get('items', [])[:8]:
    print(item.get('privacyLabel'), item.get('callPrefix'))
PY