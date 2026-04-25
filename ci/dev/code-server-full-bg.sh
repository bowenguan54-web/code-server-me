#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/code-server-full.pid"
LOG_FILE="$RUN_DIR/code-server-full.log"
PORT="${CODE_SERVER_PORT:-8080}"
HOST="${CODE_SERVER_HOST:-127.0.0.1}"
LOCALE="${CODE_SERVER_LOCALE:-zh-cn}"
USER_DATA_DIR="${CODE_SERVER_USER_DATA_DIR:-$RUN_DIR/fullbuild-user-data}"
EXTENSIONS_DIR="${CODE_SERVER_EXTENSIONS_DIR:-$RUN_DIR/fullbuild-extensions}"
LANGUAGE_PACK_ID="${CODE_SERVER_LANGUAGE_PACK_ID:-MS-CEINTL.vscode-language-pack-zh-hans}"

mkdir -p "$RUN_DIR" "$USER_DATA_DIR" "$EXTENSIONS_DIR"

sync_algo_manager_release() {
  local release_root="$ROOT/release"
  local release_extension="$release_root/lib/vscode/extensions/simple-browser"

  if [[ ! -d "$release_root" ]]; then
    return 0
  fi

  mkdir -p "$release_root/src/browser/pages"
  cp "$ROOT/src/browser/pages/algo-lib.html" "$release_root/src/browser/pages/algo-lib.html"
  cp "$ROOT/src/browser/pages/algo-lib.css" "$release_root/src/browser/pages/algo-lib.css"
  cp "$ROOT/src/browser/pages/algo-lib.js" "$release_root/src/browser/pages/algo-lib.js"

  mkdir -p "$release_root/lib/vscode/out/vs/code/browser/workbench"
  cp "$ROOT/lib/vscode/src/vs/code/browser/workbench/workbench.html" \
    "$release_root/lib/vscode/out/vs/code/browser/workbench/workbench.html"

  mkdir -p "$release_root/out/node/routes" "$release_root/out/node/algo-lib"
  cp "$ROOT/out/node/routes/algoLib.js" "$release_root/out/node/routes/algoLib.js"
  [[ -f "$ROOT/out/node/routes/algoLib.js.map" ]] && cp "$ROOT/out/node/routes/algoLib.js.map" "$release_root/out/node/routes/algoLib.js.map"
  cp "$ROOT/out/node/routes/index.js" "$release_root/out/node/routes/index.js"
  [[ -f "$ROOT/out/node/routes/index.js.map" ]] && cp "$ROOT/out/node/routes/index.js.map" "$release_root/out/node/routes/index.js.map"
  cp -r "$ROOT/out/node/algo-lib/." "$release_root/out/node/algo-lib/"

  if [[ -d "$release_extension" ]]; then
    mkdir -p "$release_extension/out" "$release_extension/dist/browser"
    cp "$ROOT/lib/vscode/extensions/simple-browser/package.json" "$release_extension/package.json"
    cp "$ROOT/lib/vscode/extensions/simple-browser/out/"*.js "$release_extension/out/"
    cp "$ROOT/lib/vscode/extensions/simple-browser/out/"*.js.map "$release_extension/out/" 2>/dev/null || true
    cp "$ROOT/lib/vscode/extensions/simple-browser/dist/browser/extension.js" "$release_extension/dist/browser/extension.js"
    [[ -f "$ROOT/lib/vscode/extensions/simple-browser/dist/browser/extension.js.map" ]] && cp "$ROOT/lib/vscode/extensions/simple-browser/dist/browser/extension.js.map" "$release_extension/dist/browser/extension.js.map"
    touch "$release_extension/package.json"
  fi
}

reset_extension_caches() {
  rm -f "$USER_DATA_DIR/CachedProfilesData/__default__profile__/extensions.builtin.cache"
  rm -f "$USER_DATA_DIR/CachedProfilesData/__default__profile__/extensions.user.cache"
}

write_locale_config() {
  mkdir -p "$USER_DATA_DIR/User"
  cat > "$USER_DATA_DIR/User/argv.json" <<EOF
{
  "locale": "$LOCALE"
}
EOF
  cat > "$USER_DATA_DIR/User/locale.json" <<EOF
{
  "locale": "$LOCALE"
}
EOF
}

gallery_json() {
  cat <<'EOF'
{"serviceUrl":"https://open-vsx.org/vscode/gallery","itemUrl":"https://open-vsx.org/vscode/item","extensionUrlTemplate":"https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest","resourceUrlTemplate":"https://open-vsx.org/vscode/asset/{publisher}/{name}/{version}/Microsoft.VisualStudio.Code.WebResources/{path}","controlUrl":"","recommendationsUrl":""}
EOF
}

with_gallery_env() {
  EXTENSIONS_GALLERY="$(gallery_json)" "$@"
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

require_release() {
  if [[ ! -x "$ROOT/release/bin/code-server" ]]; then
    echo "Missing $ROOT/release/bin/code-server"
    echo "Run the full build first."
    exit 1
  fi
}

has_language_pack() {
  local extension_glob
  extension_glob="$(printf '%s' "$LANGUAGE_PACK_ID" | tr '[:upper:]' '[:lower:]')-*"
  compgen -G "$EXTENSIONS_DIR/$extension_glob" > /dev/null
}

install_lang() {
  require_release
  echo "Installing language pack: $LANGUAGE_PACK_ID"
  with_gallery_env "$ROOT/release/bin/code-server" \
    --extensions-dir "$EXTENSIONS_DIR" \
    --user-data-dir "$USER_DATA_DIR" \
    --install-extension "$LANGUAGE_PACK_ID" \
    --force
}

ensure_lang() {
  if has_language_pack; then
    echo "Language pack already installed: $LANGUAGE_PACK_ID"
  else
    install_lang
  fi
}

ensure_languagepacks_cache() {
  EXTENSIONS_DIR="$EXTENSIONS_DIR" USER_DATA_DIR="$USER_DATA_DIR" node <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const extensionsDir = process.env.EXTENSIONS_DIR;
const userDataDir = process.env.USER_DATA_DIR;
const languagePacks = {};

if (!extensionsDir || !userDataDir || !fs.existsSync(extensionsDir)) {
  process.exit(0);
}

for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const extensionDir = path.join(extensionsDir, entry.name);
  const manifestPath = path.join(extensionDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    continue;
  }

  const localizations = manifest?.contributes?.localizations;
  if (!Array.isArray(localizations) || localizations.length === 0) {
    continue;
  }

  const extensionId = `${manifest.publisher}.${manifest.name}`.toLowerCase();
  const version = manifest.version || '0.0.0';

  for (const localization of localizations) {
    if (!localization?.languageId || !Array.isArray(localization.translations) || localization.translations.length === 0) {
      continue;
    }

    const locale = String(localization.languageId).toLowerCase();
    if (!languagePacks[locale]) {
      languagePacks[locale] = {
        hash: '',
        extensions: [],
        translations: {},
        label: localization.localizedLanguageName || localization.languageName || locale,
      };
    }

    const languagePack = languagePacks[locale];
    languagePack.extensions.push({
      extensionIdentifier: { id: extensionId },
      version,
    });

    for (const translation of localization.translations) {
      if (translation?.id && translation?.path) {
        languagePack.translations[translation.id] = path.join(extensionDir, translation.path);
      }
    }
  }
}

for (const languagePack of Object.values(languagePacks)) {
  const hash = crypto.createHash('md5');
  for (const extension of languagePack.extensions) {
    hash.update(extension.extensionIdentifier.id).update(extension.version);
  }
  languagePack.hash = hash.digest('hex');
}

fs.mkdirSync(userDataDir, { recursive: true });
fs.writeFileSync(path.join(userDataDir, 'languagepacks.json'), JSON.stringify(languagePacks));
NODE
}

start_server() {
  require_release
  sync_algo_manager_release
  write_locale_config
  ensure_lang
  ensure_languagepacks_cache
  reset_extension_caches

  if is_running; then
    echo "code-server full build is already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi

  if port_in_use; then
    echo "Port $PORT is already in use on $HOST"
    echo "Run: bash ./ci/dev/code-server-full-bg.sh stop"
    exit 1
  fi

  : > "$LOG_FILE"
  (
    cd "$ROOT"
    export EXTENSIONS_GALLERY
    EXTENSIONS_GALLERY="$(gallery_json)"
    exec setsid "$ROOT/release/bin/code-server" \
      --bind-addr "$HOST:$PORT" \
      --auth none \
      --disable-telemetry \
      --disable-update-check \
      --locale "$LOCALE" \
      --user-data-dir "$USER_DATA_DIR" \
      --extensions-dir "$EXTENSIONS_DIR"
  ) >>"$LOG_FILE" 2>&1 &

  local pid="$!"
  echo "$pid" > "$PID_FILE"

  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "code-server full build exited during startup"
      tail -n 120 "$LOG_FILE" || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if grep -q "$HOST:$PORT" "$LOG_FILE" 2>/dev/null; then
      echo "code-server full build started at http://$HOST:$PORT"
      echo "locale: $LOCALE"
      echo "pid: $pid"
      echo "log: $LOG_FILE"
      exit 0
    fi
    sleep 2
  done

  echo "code-server full build is still starting"
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
      echo "code-server full build stopped forcefully"
    fi
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$PORT"/tcp >/dev/null 2>&1 || true
  fi

  echo "code-server full build stopped"
}

status_server() {
  if is_running; then
    echo "code-server full build is running"
    echo "pid: $(cat "$PID_FILE")"
    echo "url: http://$HOST:$PORT"
    echo "locale: $LOCALE"
    echo "extensions-dir: $EXTENSIONS_DIR"
    echo "user-data-dir: $USER_DATA_DIR"
    echo "log: $LOG_FILE"
  else
    echo "code-server full build is not running"
    exit 1
  fi
}

logs_server() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 120 "$LOG_FILE"
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
  install-lang)
    install_lang
    ;;
  *)
    echo "Usage: bash ./ci/dev/code-server-full-bg.sh {start|stop|restart|status|logs|install-lang}"
    exit 1
    ;;
esac
