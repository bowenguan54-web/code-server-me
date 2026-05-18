#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./list-functions.sh <module-file>

Examples:
  ./list-functions.sh algo-modules/29-full-test-core.js
  ./list-functions.sh .run/algo-modules/22-snippets.js
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -ne 1 ]]; then
  usage
  exit $([[ $# -eq 1 ]] && echo 0 || echo 1)
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$1"

if [[ -f "${INPUT}" ]]; then
  MODULE_FILE="${INPUT}"
elif [[ -f "${SCRIPT_DIR}/${INPUT}" ]]; then
  MODULE_FILE="${SCRIPT_DIR}/${INPUT}"
else
  echo "File not found: ${INPUT}" >&2
  exit 1
fi

echo "# ${MODULE_FILE}"

{
  grep -nE '^[[:space:]]*(async[[:space:]]+)?function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*\(' "${MODULE_FILE}" \
    | sed -E 's/^([0-9]+):[[:space:]]*(async[[:space:]]+)?function[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*).*/\1\t\3/'

  grep -nE '^[[:space:]]*(const|let|var)[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=[[:space:]]*(async[[:space:]]*)?\([^)]*\)[[:space:]]*=>' "${MODULE_FILE}" \
    | sed -E 's/^([0-9]+):[[:space:]]*(const|let|var)[[:space:]]+([A-Za-z_$][A-Za-z0-9_$]*).*/\1\t\3/'

  grep -nE '^[[:space:]]*window\.[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=' "${MODULE_FILE}" \
    | sed -E 's/^([0-9]+):[[:space:]]*window\.([A-Za-z_$][A-Za-z0-9_$]*).*/\1\twindow.\2/'
} | sort -n -k1,1 | awk -F '\t' '!seen[$2]++ { printf "%s:%s\n", $1, $2 }'
