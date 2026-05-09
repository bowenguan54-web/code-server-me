#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html src/browser/pages/algo-lib.html
cp /mnt/e/code-server-me/algo_management.html algo_management.html 2>/dev/null || true
[ -d release/src/browser/pages ] && cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html release/src/browser/pages/algo-lib.html
python3 - <<'PY'
from pathlib import Path
import re
html = Path('src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
m = re.search(r'<script>([\s\S]*)</script>\s*</body>', html)
if not m:
    raise SystemExit('script not found')
Path('.run/algo-lib-check.js').write_text(m.group(1), encoding='utf-8')
PY
node --check .run/algo-lib-check.js
cs_pids=$(pgrep -f '/home/guan/code-server-me/release' || true)
[ -n "$cs_pids" ] && kill -9 $cs_pids 2>/dev/null || true
sleep 1
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 4
echo 'code-server:'
curl -s -o /dev/null -w '%{http_code}
' http://127.0.0.1:8080/ || true
echo 'html markers:'
grep -n 'data-delete-file\|????\|deleteSourceFile' src/browser/pages/algo-lib.html | head -20
