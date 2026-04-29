#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/code-server.pid"
LOG_FILE="$RUN_DIR/code-server.log"
PORT="${CODE_SERVER_PORT:-8081}"
HOST="${CODE_SERVER_HOST:-127.0.0.1}"
LOCALE="${CODE_SERVER_LOCALE:-zh-cn}"
USER_DATA_DIR="${CODE_SERVER_USER_DATA_DIR:-$RUN_DIR/dev-user-data}"
EXTENSIONS_DIR="${CODE_SERVER_EXTENSIONS_DIR:-$RUN_DIR/dev-extensions}"
WORKBENCH_DEV_SRC="$ROOT/lib/vscode/src/vs/code/browser/workbench/workbench-dev.html"
WORKBENCH_DEV_OUT="$ROOT/lib/vscode/out/vs/code/browser/workbench/workbench-dev.html"
WORKBENCH_HTML_SRC="$ROOT/lib/vscode/src/vs/code/browser/workbench/workbench.html"
WORKBENCH_HTML_OUT="$ROOT/lib/vscode/out/vs/code/browser/workbench/workbench.html"

mkdir -p "$RUN_DIR" "$USER_DATA_DIR" "$EXTENSIONS_DIR"

prepare_locale_runtime() {
  mkdir -p "$USER_DATA_DIR/User"

  cat > "$USER_DATA_DIR/User/locale.json" <<EOF
{
  "locale": "$LOCALE"
}
EOF

  cat > "$USER_DATA_DIR/User/argv.json" <<EOF
{
  "locale": "$LOCALE"
}
EOF

  if [[ -f "$WORKBENCH_DEV_SRC" && -d "$(dirname "$WORKBENCH_DEV_OUT")" ]]; then
    cp "$WORKBENCH_DEV_SRC" "$WORKBENCH_DEV_OUT"
  fi

  if [[ -f "$WORKBENCH_HTML_SRC" && -d "$(dirname "$WORKBENCH_HTML_OUT")" ]]; then
    cp "$WORKBENCH_HTML_SRC" "$WORKBENCH_HTML_OUT"
  fi
}

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

require_build() {
  if [[ ! -f "$ROOT/out/node/entry.js" ]]; then
    echo "Missing $ROOT/out/node/entry.js"
    echo "Run: npm run build"
    exit 1
  fi

  if ! grep -q "loadCodeWithNls" "$ROOT/lib/vscode/out/server-main.js" 2>/dev/null; then
    echo "Missing patched VS Code output in $ROOT/lib/vscode/out/server-main.js"
    echo "Rebuild the native WSL copy before starting."
    exit 1
  fi
}

start_server() {
  require_build
  prepare_locale_runtime

  if [[ "$LOCALE" != en* ]]; then
    echo "Dev mode is starting on http://$HOST:$PORT"
    echo "Use full build on http://127.0.0.1:8080 for stable Chinese UI."
  fi

  if is_running; then
    echo "code-server is already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi

  if port_in_use; then
    echo "Port $PORT is already in use on $HOST"
    echo "Run: bash ./ci/dev/code-server-bg.sh stop"
    exit 1
  fi

  : > "$LOG_FILE"

  # Install algolib extension into dev-extensions dir
  local ext_src="$ROOT/src/sdk/algolib-extension"
  local ext_dst="$EXTENSIONS_DIR/coder.algolib-1.0.0"
  if [[ -d "$ext_src" ]]; then
    mkdir -p "$ext_dst"
    cp -f "$ext_src/package.json" "$ext_dst/"
    cp -f "$ext_src/extension.js" "$ext_dst/"
    echo "AlgoLib extension installed → $ext_dst"
  fi

  (
    cd "$ROOT"
    export VSCODE_DEV=1
    export VSCODE_IPC_HOOK_CLI=
    exec setsid node out/node/entry.js \
      --bind-addr "$HOST:$PORT" \
      --auth none \
      --locale "$LOCALE" \
      --user-data-dir "$USER_DATA_DIR" \
      --extensions-dir "$EXTENSIONS_DIR"
  ) >>"$LOG_FILE" 2>&1 &

  local pid="$!"
  echo "$pid" > "$PID_FILE"

  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "code-server exited during startup"
      tail -n 80 "$LOG_FILE" || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if grep -q "$HOST:$PORT" "$LOG_FILE" 2>/dev/null; then
      echo "code-server started at http://$HOST:$PORT"
      echo "pid: $pid"
      echo "log: $LOG_FILE"
      exit 0
    fi
    sleep 2
  done

  echo "code-server is still starting"
  echo "pid: $pid"
  echo "log: $LOG_FILE"
}

stop_server() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    kill "$pid" 2>/dev/null || true

    for _ in $(seq 1 15); do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        break
      fi
      sleep 1
    done

    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "code-server stopped forcefully"
    fi
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$PORT"/tcp >/dev/null 2>&1 || true
  fi

  echo "code-server stopped"
}

status_server() {
  if is_running; then
    echo "code-server is running"
    echo "pid: $(cat "$PID_FILE")"
    echo "url: http://$HOST:$PORT"
    echo "log: $LOG_FILE"
  else
    echo "code-server is not running"
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
    echo "Usage: bash ./ci/dev/code-server-bg.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
