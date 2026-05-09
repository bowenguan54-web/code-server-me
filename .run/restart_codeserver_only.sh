#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
cs_pids=$(pgrep -f '/home/guan/code-server-me/release' || true)
if [ -n "$cs_pids" ]; then kill -9 $cs_pids 2>/dev/null || true; fi
sleep 1
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 4
echo 'code-server:'
ps -ef | grep -E '/home/guan/code-server-me/release' | grep -v grep || true
echo 'http:'
curl -s -o /dev/null -w '%{http_code}
' http://127.0.0.1:8080/ || true
echo 'obsolete:'
[ -f .run/fullbuild-extensions/.obsolete ] && cat .run/fullbuild-extensions/.obsolete || echo none
echo 'extension-log:'
grep -n -E 'algolib|obsolete|removed|Ctrl\+Alt|insertSnippet' .run/code-server.log 2>/dev/null | tail -30 || true
