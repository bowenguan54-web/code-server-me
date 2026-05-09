#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js src/browser/pages/algo-lib.js
[ -d release/src/browser/pages ] && cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js release/src/browser/pages/algo-lib.js
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json src/sdk/algolib-extension/package.json
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js src/sdk/algolib-extension/extension.js
mkdir -p release/lib/vscode/extensions/algolib .run/fullbuild-user-data/User
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json release/lib/vscode/extensions/algolib/package.json
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js release/lib/vscode/extensions/algolib/extension.js
# user extension copy kept for compatibility, but builtin copy is the one that must load
mkdir -p .run/fullbuild-extensions/coder.algolib-1.0.0
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json .run/fullbuild-extensions/coder.algolib-1.0.0/package.json
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js .run/fullbuild-extensions/coder.algolib-1.0.0/extension.js
python3 - <<'PY'
from pathlib import Path
import json
p = Path('.run/fullbuild-user-data/User/keybindings.json')
try:
    data = json.loads(p.read_text(encoding='utf-8')) if p.exists() and p.read_text(encoding='utf-8').strip() else []
except json.JSONDecodeError:
    data = []
if not isinstance(data, list):
    data = []
data = [item for item in data if item.get('command') != 'algolib.insertSnippet']
data.append({"key": "ctrl+alt+s", "command": "algolib.insertSnippet", "when": "editorTextFocus || editorFocus"})
p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
PY
rm -f .run/fullbuild-user-data/CachedProfilesData/__default__profile__/extensions.builtin.cache
node --check src/browser/pages/algo-lib.js
node --check release/lib/vscode/extensions/algolib/extension.js
node -e "JSON.parse(require('fs').readFileSync('release/lib/vscode/extensions/algolib/package.json','utf8')); console.log('checks ok')"
cs_pids=$(pgrep -f '/home/guan/code-server-me/release' || true)
[ -n "$cs_pids" ] && kill -9 $cs_pids 2>/dev/null || true
sleep 1
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 6
echo http=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ || true)
echo 'keybindings:' && cat .run/fullbuild-user-data/User/keybindings.json
echo 'builtin cache algolib:' && grep -o '"id":"coder.algolib"' .run/fullbuild-user-data/CachedProfilesData/__default__profile__/extensions.builtin.cache 2>/dev/null | head -1 || true
echo 'activation log:' && grep -R -n 'AlgoLib extension activated\|algolib.insertSnippet\|coder.algolib' .run/fullbuild-user-data/logs .run/code-server.log 2>/dev/null | tail -50 || true
