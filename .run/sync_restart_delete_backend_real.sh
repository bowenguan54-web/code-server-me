#!/usr/bin/env bash
set -u
cd /home/guan/code-server-me
mkdir -p .run
cp /mnt/e/code-server-me/algo_service/routers/algorithms.py algo_service/routers/algorithms.py
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html src/browser/pages/algo-lib.html
cp /mnt/e/code-server-me/algo_management.html algo_management.html 2>/dev/null || true
[ -d release/src/browser/pages ] && cp /mnt/e/code-server-me/src/browser/pages/algo-lib.html release/src/browser/pages/algo-lib.html
python3 -m py_compile algo_service/routers/algorithms.py
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
echo 'folder_files:'
python3 - <<'PY'
import requests, json
r=requests.get('http://127.0.0.1:8000/api/v1/algorithm-source/custom.my_algorit')
print(r.status_code)
print(json.dumps([(f.get('filename'), f.get('relative_path'), f.get('is_entry')) for f in r.json().get('folder_files', [])], ensure_ascii=False, indent=2))
PY
echo 'delete route marker:'
grep -n 'delete_algorithm_folder_file\|_merge_review_draft_files' algo_service/routers/algorithms.py | head -10
echo 'html marker:'
grep -n 'deleteSourceFile\|data-delete-file' src/browser/pages/algo-lib.html | head -10
