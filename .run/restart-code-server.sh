set -e
cd /home/guan/code-server-me
mapfile -t pids < <(ps -eo pid=,args= | awk '/\/home\/guan\/code-server-me\/release\/lib\/node/ && $0 !~ /awk/ {print $1}')
if [ "${#pids[@]}" -gt 0 ]; then
  kill -9 "${pids[@]}" 2>/dev/null || true
fi
sleep 2
: > .run/code-server.log
setsid ./release/lib/node ./release \
  --bind-addr 127.0.0.1:8080 \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --locale zh-cn \
  --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data \
  --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions \
  > .run/code-server.log 2>&1 < /dev/null &
sleep 10
curl -s -o /dev/null -w 'code-server %{http_code}\n' http://127.0.0.1:8080/algo-lib
ss -ltnp | grep -E ':8000|:8080' || true
