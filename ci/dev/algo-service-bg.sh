#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/algo-service.pid"
LOG_FILE="$RUN_DIR/algo-service.log"
PORT="${ALGO_SERVICE_PORT:-8000}"
HOST="${ALGO_SERVICE_HOST:-0.0.0.0}"

mkdir -p "$RUN_DIR"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

port_in_use() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$PORT$"
}

start_server() {
  if is_running; then
    echo "algo-service is already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi

  if port_in_use; then
    echo "Port $PORT is already in use"
    echo "Run: bash ./ci/dev/algo-service-bg.sh stop"
    exit 1
  fi

  : > "$LOG_FILE"
  (
    cd "$ROOT"
    exec setsid python -m uvicorn algo_service.main:app \
      --host "$HOST" \
      --port "$PORT" \
      --reload \
      --reload-dir algo_service
  ) >>"$LOG_FILE" 2>&1 &

  local pid="$!"
  echo "$pid" > "$PID_FILE"

  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "algo-service exited during startup"
      tail -n 40 "$LOG_FILE" || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if grep -qiE "Application startup complete|Uvicorn running on" "$LOG_FILE" 2>/dev/null; then
      echo "algo-service started at http://$HOST:$PORT"
      echo "pid: $pid"
      echo "log: $LOG_FILE"
      exit 0
    fi
    sleep 1
  done

  echo "algo-service is still starting"
  echo "pid: $pid"
  echo "log: $LOG_FILE"
}

stop_server() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    # Kill the setsid group so uvicorn reloader children are also killed
    local pgid
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')" || pgid=""
    if [[ -n "$pgid" ]] && [[ "$pgid" != "0" ]]; then
      kill -- "-$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    else
      kill "$pid" 2>/dev/null || true
    fi

    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        break
      fi
      sleep 1
    done

    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "algo-service stopped forcefully"
    fi
  fi

  # Belt-and-suspenders: kill anything still holding the port
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  fi

  echo "algo-service stopped"
}

status_server() {
  if is_running; then
    echo "algo-service is running"
    echo "pid: $(cat "$PID_FILE")"
    echo "url: http://$HOST:$PORT"
    echo "log: $LOG_FILE"
  else
    echo "algo-service is not running"
    exit 1
  fi
}

logs_server() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 80 "$LOG_FILE"
  else
    echo "No log file yet"
  fi
}

case "${1:-start}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server || true
    start_server
    ;;
  status)
    status_server
    ;;
  logs)
    logs_server
    ;;
  *)
    echo "Usage: bash ./ci/dev/algo-service-bg.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
