#!/usr/bin/env bash
# 一键下载 AlgoLib 离线前端依赖到本地 vendor 目录。
set -euo pipefail

VENDOR_DIR="src/browser/static/vendor"
mkdir -p "${VENDOR_DIR}"

echo "==> 下载 ECharts 5.5.1..."
curl -fSL "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js" \
  -o "${VENDOR_DIR}/echarts.min.js"
echo "  完成：${VENDOR_DIR}/echarts.min.js"

MONACO_VERSION="0.45.0"
MONACO_DIR="${VENDOR_DIR}/monaco-editor@${MONACO_VERSION}"
echo "==> 下载 Monaco Editor ${MONACO_VERSION}..."
rm -rf "${MONACO_DIR}"
mkdir -p "${MONACO_DIR}"
TARBALL_URL="https://registry.npmjs.org/monaco-editor/-/monaco-editor-${MONACO_VERSION}.tgz"
TMP_FILE="$(mktemp)"
curl -fSL "${TARBALL_URL}" -o "${TMP_FILE}"
tar -xzf "${TMP_FILE}" -C "${MONACO_DIR}" --strip-components=1 package/min/
rm -f "${TMP_FILE}"
if [[ -d "${MONACO_DIR}/min/vs" ]]; then
  echo "  完成：${MONACO_DIR}/min/vs/"
else
  echo "  警告：min/vs 目录未找到，请检查 tarball 结构"
fi

echo "==> 下载 xterm 终端资源..."
mkdir -p "${VENDOR_DIR}/xterm@5.3.0" \
  "${VENDOR_DIR}/xterm-addon-fit@0.8.0" \
  "${VENDOR_DIR}/xterm-addon-web-links@0.9.0"
curl -fSL "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" \
  -o "${VENDOR_DIR}/xterm@5.3.0/xterm.min.css"
curl -fSL "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js" \
  -o "${VENDOR_DIR}/xterm@5.3.0/xterm.min.js"
curl -fSL "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js" \
  -o "${VENDOR_DIR}/xterm-addon-fit@0.8.0/xterm-addon-fit.min.js"
curl -fSL "https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js" \
  -o "${VENDOR_DIR}/xterm-addon-web-links@0.9.0/xterm-addon-web-links.min.js"
echo "  完成：xterm 相关资源"

echo ""
echo "所有离线依赖已下载完毕。"
echo "请重新构建前端：bash .run/build-algo-lib.sh all"
