#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
python3 - <<'PY'
from pathlib import Path
src = Path('/mnt/e/code-server-me/src/node/routes/algoLib.ts').read_text(encoding='utf-8')
Path('src/node/routes/algoLib.ts').write_text(src, encoding='utf-8')
path = Path('release/out/node/routes/algoLib.js')
text = path.read_text(encoding='utf-8')
old = '''exports.router.get(pageRoutes, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.send(yield renderPage(req));
}));'''
new = '''exports.router.get(pageRoutes, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(yield renderPage(req));
}));'''
if old in text:
    text = text.replace(old, new)
elif 'res.setHeader("Cache-Control"' not in text:
    raise SystemExit('compiled route pattern not found')
path.write_text(text, encoding='utf-8')
PY
node --check release/out/node/routes/algoLib.js
grep -n -E 'Cache-Control|refreshEditorFolderFiles|ctrl\+alt\+s' release/out/node/routes/algoLib.js release/src/browser/pages/algo-lib.html .run/fullbuild-extensions/coder.algolib-1.0.0/package.json | head -20
