#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html src/browser/pages/algo-lib.html
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html algo_management.html
cp /mnt/e/code-server-me/algo_service/routers/algorithms.py algo_service/routers/algorithms.py
python3 -m py_compile algo_service/routers/algorithms.py algo_service/routers/snippets.py
python3 - <<'PY'
from pathlib import Path
import re
html=Path('src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
js='\n'.join(re.findall(r'<script>([\s\S]*?)</script>', html))
Path('.run/algo-lib-inline-check.js').write_text(js, encoding='utf-8')
PY
node --check .run/algo-lib-inline-check.js
mkdir -p .run
pkill -f "uvicorn algo_service.main:app" 2>/dev/null || true
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
sleep 4
if ! ss -ltnp | grep -q ':8000'; then
  echo 'FastAPI failed to start'
  tail -120 .run/algo-service.log || true
  exit 1
fi
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
printf 'API\n'
curl -s http://127.0.0.1:8000/api/v1/algorithms?module_kind=template | head -c 160
printf '\nDONE\n'