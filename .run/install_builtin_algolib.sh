#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
builtin_dir=release/lib/vscode/extensions/algolib
mkdir -p "$builtin_dir"
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json "$builtin_dir/package.json"
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js "$builtin_dir/extension.js"
rm -f .run/fullbuild-extensions/.obsolete
rm -f .run/fullbuild-user-data/CachedProfilesData/__default__profile__/extensions.builtin.cache
node --check "$builtin_dir/extension.js"
node -e "JSON.parse(require('fs').readFileSync('$builtin_dir/package.json','utf8')); console.log('builtin algolib ok')"
cs_pids=$(pgrep -f '/home/guan/code-server-me/release' || true)
if [ -n "$cs_pids" ]; then kill -9 $cs_pids 2>/dev/null || true; fi
sleep 1
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 5
echo http=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ || true)
echo obsolete=$([ -f .run/fullbuild-extensions/.obsolete ] && cat .run/fullbuild-extensions/.obsolete || echo none)
grep -n -E 'algolib|obsolete|removed|Extension host agent started' .run/code-server.log | tail -40 || true
