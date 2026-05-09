#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
cp /mnt/e/code-server-me/algo_service/routers/algorithms.py algo_service/routers/algorithms.py
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js src/browser/pages/algo-lib.js
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.css src/browser/pages/algo-lib.css
[ -d release/src/browser/pages ] && cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js release/src/browser/pages/algo-lib.js
[ -d release/src/browser/pages ] && cp /mnt/e/code-server-me/src/browser/pages/algo-lib.css release/src/browser/pages/algo-lib.css
python3 -m py_compile algo_service/routers/algorithms.py
node --check src/browser/pages/algo-lib.js
api_pids=$(pgrep -f 'uvicorn algo_service.main:app' || true)
[ -n "$api_pids" ] && kill -9 $api_pids 2>/dev/null || true
cs_pids=$(pgrep -f '/home/guan/code-server-me/release' || true)
[ -n "$cs_pids" ] && kill -9 $cs_pids 2>/dev/null || true
sleep 1
nohup python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
setsid /home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
sleep 4
echo 'health:'
curl -s http://127.0.0.1:8000/health || true
echo
echo 'code-server:'
curl -s -o /dev/null -w '%{http_code}
' http://127.0.0.1:8080/ || true
echo 'markers:'
grep -n 'deleteGallerySourceFile\|data-gallery-delete' src/browser/pages/algo-lib.js | head -10
grep -n 'delete_algorithm_folder_file' algo_service/routers/algorithms.py | head -5
