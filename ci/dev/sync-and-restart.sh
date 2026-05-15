#!/usr/bin/env bash
# sync-and-restart.sh
# 从 Windows (e:) 同步代码到 WSL，然后重启 code-server 和 algo-service。
# 用法：
#   bash ./ci/dev/sync-and-restart.sh          # 同步 + 重启全部
#   bash ./ci/dev/sync-and-restart.sh --full   # 使用 full-build code-server（默认）
#   bash ./ci/dev/sync-and-restart.sh --dev    # 使用 dev 模式 code-server
#   bash ./ci/dev/sync-and-restart.sh --algo-only  # 只重启 algo-service，不重启 code-server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# ── 参数解析 ──────────────────────────────────────────────────────────────────
CODE_SERVER_MODE="full"   # full | dev | none
for arg in "$@"; do
  case "$arg" in
    --full)      CODE_SERVER_MODE="full" ;;
    --dev)       CODE_SERVER_MODE="dev"  ;;
    --algo-only) CODE_SERVER_MODE="none" ;;
  esac
done

# ── 1. 同步 Windows (e:) → WSL ───────────────────────────────────────────────
WINDOWS_SRC="/mnt/e/code-server-me"
WSL_DST="$ROOT"  # 即 /home/guan/code-server-me（脚本运行在 WSL 中）

echo "▶ 同步代码：$WINDOWS_SRC  →  $WSL_DST"
if [[ "$WINDOWS_SRC" != "$WSL_DST" ]]; then
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '.run/' \
    --exclude 'out/' \
    --exclude 'release/' \
    --exclude 'release-standalone/' \
    --exclude 'release-packages/' \
    --exclude 'coverage/' \
    --exclude '.cache/' \
    --exclude 'lib/' \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    "$WINDOWS_SRC/" "$WSL_DST/"
  echo "  ✔ 同步完成"
  # 修复 Windows 同步过来的 CRLF 换行（所有 .sh 文件）
  find "$WSL_DST/ci" -name "*.sh" -exec sed -i 's/\r//' {} \;
else
  echo "  源与目标相同，跳过同步"
fi

# ── 2. 重启 algo-service (FastAPI :8000) ─────────────────────────────────────
echo "▶ 重启 algo-service …"
bash "$ROOT/ci/dev/algo-service-bg.sh" restart

# ── 3. 重启 code-server ───────────────────────────────────────────────────────
if [[ "$CODE_SERVER_MODE" == "full" ]]; then
  echo "▶ 重启 code-server (full build :8080) …"
  bash "$ROOT/ci/dev/code-server-full-bg.sh" restart
elif [[ "$CODE_SERVER_MODE" == "dev" ]]; then
  echo "▶ 重启 code-server (dev :8081) …"
  bash "$ROOT/ci/dev/code-server-bg.sh" restart
else
  echo "  跳过 code-server 重启（--algo-only）"
fi

echo ""
echo "✅ 全部重启完成"
