#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
mkdir -p src/browser/pages src/sdk/algolib-extension .run
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html src/browser/pages/algo-lib.html
cp /mnt/e/code-server-me/algo_management.html algo_management.html
if [ -d release/src/browser/pages ]; then
  cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html release/src/browser/pages/algo-lib.html
fi
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json src/sdk/algolib-extension/package.json
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js src/sdk/algolib-extension/extension.js
if [ -d .run/fullbuild-extensions/coder.algolib-1.0.0 ]; then
  cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json .run/fullbuild-extensions/coder.algolib-1.0.0/package.json
  cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js .run/fullbuild-extensions/coder.algolib-1.0.0/extension.js
fi
node --check src/sdk/algolib-extension/extension.js
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
python3 -m py_compile algo_service/routers/algorithms.py algo_service/sdk/registry.py algo_service/main.py
