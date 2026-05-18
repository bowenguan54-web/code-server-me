#!/usr/bin/env bash
set -euo pipefail

RUN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${RUN_DIR}/.." && pwd)"
BUILD_SCRIPT="${RUN_DIR}/build-algo-lib.sh"
NEW_CHECK="${RUN_DIR}/algo-lib-check.js"
NEW_INLINE="${RUN_DIR}/algo-lib-inline-check.js"

ORIGINAL_CHECK_TMP="$(mktemp)"
ORIGINAL_FUNCS_TMP="$(mktemp)"
NEW_FUNCS_TMP="$(mktemp)"
ORIGINAL_EXPORTS_TMP="$(mktemp)"
NEW_EXPORTS_TMP="$(mktemp)"
ORIGINAL_DUPS_TMP="$(mktemp)"
NEW_DUPS_TMP="$(mktemp)"

cleanup() {
  rm -f \
    "${ORIGINAL_CHECK_TMP}" \
    "${ORIGINAL_FUNCS_TMP}" \
    "${NEW_FUNCS_TMP}" \
    "${ORIGINAL_EXPORTS_TMP}" \
    "${NEW_EXPORTS_TMP}" \
    "${ORIGINAL_DUPS_TMP}" \
    "${NEW_DUPS_TMP}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

info() {
  echo "[verify-split] $*"
}

count_function_lines() {
  local file="$1"
  grep -c "function " "${file}" || true
}

extract_function_sequence() {
  local file="$1"
  grep -oE 'function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*' "${file}" \
    | awk '{print $2}' \
    || true
}

extract_window_exports() {
  local file="$1"
  grep -oE 'window\.[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=' "${file}" \
    | sed -E 's/^window\.([A-Za-z_$][A-Za-z0-9_$]*)[[:space:]]*=.*/\1/' \
    | sort -u \
    || true
}

extract_duplicate_functions() {
  local file="$1"
  extract_function_sequence "${file}" | sort | uniq -d || true
}

cd "${REPO_ROOT}"

info "Reading original .run/algo-lib-check.js from Git HEAD"
git show HEAD:.run/algo-lib-check.js > "${ORIGINAL_CHECK_TMP}" \
  || fail "Cannot read HEAD:.run/algo-lib-check.js. Is this file tracked by Git?"

info "Building split bundles"
bash "${BUILD_SCRIPT}" all

[[ -f "${NEW_CHECK}" ]] || fail "Missing generated ${NEW_CHECK}"
[[ -f "${NEW_INLINE}" ]] || fail "Missing generated ${NEW_INLINE}"

info "Checking JavaScript syntax"
if command -v node >/dev/null 2>&1; then
  node --check "${NEW_CHECK}" >/dev/null
  node --check "${NEW_INLINE}" >/dev/null
else
  info "node not found; skipped node --check"
fi

original_count="$(count_function_lines "${ORIGINAL_CHECK_TMP}")"
new_count="$(count_function_lines "${NEW_CHECK}")"
info "function line count: original=${original_count}, generated=${new_count}"
[[ "${original_count}" == "${new_count}" ]] \
  || fail "function line count mismatch"

extract_function_sequence "${ORIGINAL_CHECK_TMP}" > "${ORIGINAL_FUNCS_TMP}"
extract_function_sequence "${NEW_CHECK}" > "${NEW_FUNCS_TMP}"

if ! diff -u "${ORIGINAL_FUNCS_TMP}" "${NEW_FUNCS_TMP}" >/dev/null; then
  echo "Function declaration order differs:" >&2
  diff -u "${ORIGINAL_FUNCS_TMP}" "${NEW_FUNCS_TMP}" >&2 || true
  fail "function order mismatch"
fi
info "function declaration sequence matches"

extract_duplicate_functions "${ORIGINAL_CHECK_TMP}" > "${ORIGINAL_DUPS_TMP}"
extract_duplicate_functions "${NEW_CHECK}" > "${NEW_DUPS_TMP}"

if ! diff -u "${ORIGINAL_DUPS_TMP}" "${NEW_DUPS_TMP}" >/dev/null; then
  echo "Duplicate function declarations differ:" >&2
  diff -u "${ORIGINAL_DUPS_TMP}" "${NEW_DUPS_TMP}" >&2 || true
  fail "duplicate function set mismatch"
fi

dup_count="$(wc -l < "${NEW_DUPS_TMP}" | tr -d '[:space:]')"
info "duplicate function names match original (${dup_count})"

extract_window_exports "${ORIGINAL_CHECK_TMP}" > "${ORIGINAL_EXPORTS_TMP}"
extract_window_exports "${NEW_CHECK}" > "${NEW_EXPORTS_TMP}"

missing_exports=0
while IFS= read -r export_name; do
  [[ -n "${export_name}" ]] || continue
  if ! grep -qxF "${export_name}" "${NEW_EXPORTS_TMP}"; then
    echo "Missing window export: window.${export_name}" >&2
    missing_exports=$((missing_exports + 1))
  fi
done < "${ORIGINAL_EXPORTS_TMP}"

[[ "${missing_exports}" -eq 0 ]] \
  || fail "${missing_exports} window exports missing"

original_export_count="$(wc -l < "${ORIGINAL_EXPORTS_TMP}" | tr -d '[:space:]')"
new_export_count="$(wc -l < "${NEW_EXPORTS_TMP}" | tr -d '[:space:]')"
info "window export count: original=${original_export_count}, generated=${new_export_count}"

info "PASS: split build preserves function count, function order, duplicate set, and window exports"
