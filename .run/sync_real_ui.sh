#!/usr/bin/env bash
set -euo pipefail
cd /home/guan/code-server-me
cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js src/browser/pages/algo-lib.js
if [ -d release/src/browser/pages ]; then
  cp /mnt/e/code-server-me/src/browser/pages/algo-lib.js release/src/browser/pages/algo-lib.js
fi
cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json src/sdk/algolib-extension/package.json
cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js src/sdk/algolib-extension/extension.js
if [ -d .run/fullbuild-extensions/coder.algolib-1.0.0 ]; then
  cp /mnt/e/code-server-me/src/sdk/algolib-extension/package.json .run/fullbuild-extensions/coder.algolib-1.0.0/package.json
  cp /mnt/e/code-server-me/src/sdk/algolib-extension/extension.js .run/fullbuild-extensions/coder.algolib-1.0.0/extension.js
fi
rm -f .run/fullbuild-extensions/.obsolete
node --check src/browser/pages/algo-lib.js
node --check src/sdk/algolib-extension/extension.js
node -e "JSON.parse(require('fs').readFileSync('src/sdk/algolib-extension/package.json','utf8')); JSON.parse(require('fs').readFileSync('.run/fullbuild-extensions/coder.algolib-1.0.0/package.json','utf8')); console.log('checks ok')"
