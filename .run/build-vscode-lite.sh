#!/usr/bin/env bash
set -euo pipefail

MINIFY=${MINIFY-true}

cd /home/guan/code-server-me
source ./ci/lib.sh

export BUILD_SOURCEVERSION
BUILD_SOURCEVERSION=$(git rev-parse HEAD)
export VERSION=${VERSION:-0.0.0}

fix-bin-script() {
  local script="lib/vscode-reh-web-$VSCODE_TARGET/bin/$1"
  sed -i.bak "s/@@VERSION@@/$(vscode_version)/g" "$script"
  sed -i.bak "s/@@COMMIT@@/$BUILD_SOURCEVERSION/g" "$script"
  sed -i.bak "s/@@APPNAME@@/code-server/g" "$script"
  sed -i.bak 's/^ROOT=\(.*\)$/VSROOT=\1\nROOT="$(dirname "$(dirname "$VSROOT")")"/g' "$script"
  sed -i.bak 's/ROOT\/out/VSROOT\/out/g' "$script"
  sed -i.bak 's/$ROOT\/node/${NODE_EXEC_PATH:-$ROOT\/lib\/node}/g' "$script"
  sed -i.bak 's/^set ROOT_DIR=\(.*\)$/set ROOT_DIR=%~dp0..\\..\\..\\..\r\nset VSROOT_DIR=\1/g' "$script"
  sed -i.bak 's/%ROOT_DIR%\\out/%VSROOT_DIR%\\out/g' "$script"
  chmod +x "$script"
  rm "$script.bak"
}

copy-bin-script() {
  cp "lib/vscode/resources/server/bin/$1" "lib/vscode-reh-web-$VSCODE_TARGET/bin/$1"
  fix-bin-script "$1"
}

build-simple-browser-extension() {
  cd /home/guan/code-server-me/lib/vscode/extensions/simple-browser
  npx --yes --package typescript tsc -p tsconfig.json
  node ./esbuild.browser.mts
  cd /home/guan/code-server-me
}

pushd lib/vscode >/dev/null
git checkout product.json
cp product.json product.original.json
jq --slurp '.[0] * .[1]' product.original.json <(
  cat <<EOF
{
  "enableTelemetry": true,
  "quality": "stable",
  "codeServerVersion": "$VERSION",
  "nameShort": "code-server",
  "nameLong": "code-server",
  "applicationName": "code-server",
  "dataFolderName": ".code-server",
  "win32MutexName": "codeserver",
  "licenseUrl": "https://github.com/coder/code-server/blob/main/LICENSE",
  "win32DirName": "code-server",
  "win32NameVersion": "code-server",
  "win32AppUserModelId": "coder.code-server",
  "win32ShellNameShort": "c&ode-server",
  "darwinBundleIdentifier": "com.coder.code.server",
  "linuxIconName": "com.coder.code.server",
  "reportIssueUrl": "https://github.com/coder/code-server/issues/new",
  "documentationUrl": "https://go.microsoft.com/fwlink/?LinkID=533484#vscode",
  "keyboardShortcutsUrlMac": "https://go.microsoft.com/fwlink/?linkid=832143",
  "keyboardShortcutsUrlLinux": "https://go.microsoft.com/fwlink/?linkid=832144",
  "keyboardShortcutsUrlWin": "https://go.microsoft.com/fwlink/?linkid=832145",
  "introductoryVideosUrl": "https://go.microsoft.com/fwlink/?linkid=832146",
  "tipsAndTricksUrl": "https://go.microsoft.com/fwlink/?linkid=852118",
  "newsletterSignupUrl": "https://www.research.net/r/vsc-newsletter",
  "linkProtectionTrustedDomains": [
    "https://open-vsx.org"
  ],
  "trustedExtensionAuthAccess": [
    "vscode.git", "vscode.github",
    "github.vscode-pull-request-github",
    "github.copilot", "github.copilot-chat"
  ],
  "aiConfig": {
    "ariaKey": "code-server"
  }
}
EOF
) > product.json
popd >/dev/null

cd /home/guan/code-server-me/lib/vscode
npm run gulp "vscode-reh-web-$VSCODE_TARGET${MINIFY:+-min}"
cd /home/guan/code-server-me

build-simple-browser-extension

git -C lib/vscode checkout product.json
jq -e .commit "lib/vscode-reh-web-$VSCODE_TARGET/product.json" >/dev/null

case $OS in
  windows)
    fix-bin-script remote-cli/code.cmd
    fix-bin-script helpers/browser.cmd
    ;;
  *)
    fix-bin-script remote-cli/code-server
    fix-bin-script helpers/browser.sh
    ;;
esac

copy-bin-script remote-cli/code-darwin.sh
copy-bin-script remote-cli/code-linux.sh
copy-bin-script remote-cli/code.cmd
copy-bin-script helpers/browser-darwin.sh
copy-bin-script helpers/browser-linux.sh
copy-bin-script helpers/browser.cmd
