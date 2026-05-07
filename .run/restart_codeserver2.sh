#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
pids=$(pgrep -f "/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release" || true)
if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
sleep 1
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 3
curl -sS --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/
