#!/usr/bin/env bash
set -e
cd /home/guan/code-server-me
mkdir -p .run
for pid in $(pgrep -f "/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release" || true); do kill -9 "$pid" 2>/dev/null || true; done
sleep 1
nohup /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 3
pgrep -af "/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release" || true