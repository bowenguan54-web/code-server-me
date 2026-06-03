# AlgoLib 与 code-server-me 代码用途梳理

本文档用于说明当前仓库中哪些内容属于核心功能，哪些内容是构建产物、历史副本、调试脚本或可清理候选项。它不要求立即删除任何文件，只提供后续整理时的判断依据。

## 当前推荐启动方式

后端：
???Windows ????

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-algolib-backend.ps1
```

????????????????????????????????? uvicorn ????????

```bash
uvicorn algo_service.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir algo_service
```

???????????????

```bash
uvicorn algo_service.main:app --host 127.0.0.1 --port 8000
```

前端推荐用静态服务打开，不建议直接双击 HTML：

```bash
cd E:\code-server-me\src\browser\pages
python -m http.server 3000
```

然后访问：

```text
http://127.0.0.1:3000/algo-lib.html
```

`algo_service.main` 已挂载 `/static` 到 `src/browser/static`，所以离线依赖也可以通过后端访问，例如：

```text
http://127.0.0.1:8000/static/vendor/echarts.min.js
```

## 核心功能目录

| 路径 | 用途 | 是否核心 |
| --- | --- | --- |
| `algo_service/` | AlgoLib FastAPI 后端，包含算法扫描、执行、审核、用户、片段、包管理等 API。 | 是 |
| `algorithms_root/` | 算法仓库根目录，包含 demo、公有算法、用户私有草稿等运行数据。 | 是 |
| `src/browser/pages/algo-lib.html` | 当前算法管理 SPA 页面，实际浏览器入口。 | 是 |
| `src/browser/static/vendor/` | 前端离线依赖目录，包含 Monaco、ECharts、xterm 等。 | 是，但通常是下载产物 |
| `.run/algo-modules/` | AlgoLib SPA 的模块化源码。修改前端逻辑时应优先改这里。 | 是 |
| `.run/build-algo-lib.sh` | 将 `.run/algo-modules/` 合并并注入 `src/browser/pages/algo-lib.html` 的构建脚本。 | 是 |
| `extensions/algolib-manager/` | VS Code/code-server 扩展形式的 AlgoLib 管理器。 | 是，如果仍使用扩展入口 |
| `src/node/routes/algoLib.ts` | code-server 内部路由，读取 `src/browser/pages/algo-lib.html`。 | 是，如果仍通过 code-server 打开 AlgoLib |
| `config.yaml` | 后端 watch 目录等配置。 | 是 |
| `users_store.json` / `snippets_store.json` / `submissions_store.json` | 简易 JSON 存储。 | 是，属于运行数据 |

## code-server 本体相关

这些目录主要属于 code-server 或 VS Code Web 构建体系，不是 AlgoLib 业务本身，但如果你仍维护 code-server 自身，则不能随意删除：

| 路径 | 用途 |
| --- | --- |
| `src/`（除 `src/browser/pages/algo-lib.html` 和静态资源外） | code-server 前后端源码。 |
| `lib/` | VS Code 子模块和构建相关内容。 |
| `ci/` | code-server 构建、同步、开发脚本。 |
| `patches/` / `.pc/` | quilt 补丁体系，用于修改 VS Code/code-server 底层行为。 |
| `resources/` | code-server 资源文件。 |
| `release/` / `out/` | 构建输出或运行输出，是否保留取决于当前部署方式。 |
| `package.json` / `package-lock.json` / `tsconfig.json` | code-server Node 构建配置。 |

## `algo_management.html` 的作用

`algo_management.html` 位于仓库根目录，是一个旧的 standalone 算法管理页面快照。

当前排查结果：

- 它不是当前推荐入口。
- 当前浏览器入口是 `src/browser/pages/algo-lib.html`。
- code-server 路由 `src/node/routes/algoLib.ts` 读取的也是 `src/browser/pages/algo-lib.html`。
- `algo_management.html` 内部仍引用多个 CDN：
  - `xterm`
  - `echarts`
  - `monaco-editor`
- 它没有 `.run/build-algo-lib.sh` 的注入标记，不会随 `.run/algo-modules/` 自动更新。
- 只有 `_check_am.py`、`_check_am.js` 这类临时检查脚本引用它。

结论：`algo_management.html` 更像历史调试副本或迁移前的手工页面。继续打开它会看到过期逻辑和 CDN 依赖，不建议作为 AlgoLib 正式入口。后续确认不再需要后，可以移动到 `docs/archive/` 或删除。

## 可清理候选项

以下内容看起来与当前核心功能关系较弱，建议先备份或确认后再删除。

### 根目录临时检查脚本

| 文件 | 可能用途 | 建议 |
| --- | --- | --- |
| `_check_am.js` / `_check_am.py` | 检查旧 `algo_management.html` 的临时脚本。 | 若不再维护旧页面，可删除。 |
| `_check_result.py` | 临时结果检查脚本。 | 可归档或删除。 |
| `_check_syntax.js` | 早期 HTML/JS 语法检查脚本。 | 现在已有 `.run/verify-split.sh` 和 `node --check`，可删除。 |
| `_debug.py` | 临时调试脚本。 | 可删除或移入 `scripts/debug/`。 |
| `_extract2.js` / `_extract_check.js` | 早期从 HTML 抽取 JS 的脚本。 | 模块化后通常不再需要。 |
| `_test_invoke.py` / `_test_login.py` / `_test_registry.py` | 临时 API/登录/注册表测试。 | 如要保留，建议移入 `test/` 并改成正式测试。 |
| `_translate_errors.py` | 临时错误翻译/修复脚本。 | 可归档。 |

### 日志和缓存

| 路径 | 说明 | 建议 |
| --- | --- | --- |
| `build-full.log` | 构建日志。 | 可删除。 |
| `watch.log` | 空或临时 watch 日志。 | 可删除。 |
| `.cache/` | TypeScript/build 缓存。 | 可删除，会自动重建。 |
| `coverage/` | 测试覆盖率输出。 | 不应作为源码长期维护，可忽略或删除。 |
| `.run/*.log` / `.run/*.pid` / `.run/*.png` | 调试运行日志、进程号、截图。 | 可按需清理。 |

### `.run/` 中的历史修补脚本

`.run/` 下有很多 `patch_*.py`、`restart_*.sh`、`sync_restart_*.sh`、`verify_*.py` 等脚本，大多来自阶段性调试或 WSL/code-server 同步流程。

当前你的开发方式已简化为 Windows 本地：

- 后端：`uvicorn algo_service.main:app --host 127.0.0.1 --port 8000`
- 前端：静态服务打开 `src/browser/pages/algo-lib.html`

因此许多 WSL/code-server 重启脚本已经不是日常必需。建议保留：

- `.run/algo-modules/`
- `.run/build-algo-lib.sh`
- `.run/ARCHITECTURE.md`
- `.run/algo-modules/README.md`
- `.run/verify-split.sh`
- `.run/list-functions.sh`

其它 `.run/patch_*`、`.run/restart_*`、`.run/sync_restart_*`、截图和日志文件可以作为清理候选。

## 不建议轻易删除的内容

| 路径 | 原因 |
| --- | --- |
| `patches/` | 如果仍维护 code-server / VS Code Webview 补丁，这是关键目录。 |
| `lib/` | code-server 构建依赖 VS Code 子模块。 |
| `extensions/algolib-manager/` | 如果还使用 VS Code 扩展入口，它是核心。 |
| `src/browser/static/vendor/` | 离线运行依赖。虽然 `.gitignore` 忽略，但本地运行必须存在。 |
| `algorithms_root/` | 算法数据和 demo 所在。 |
| `users_store.json` / `snippets_store.json` | 当前简易存储数据。 |

## 推荐整理顺序

1. 只使用 `src/browser/pages/algo-lib.html` 作为前端入口，停止使用根目录 `algo_management.html`。
2. 把根目录 `_check_*`、`_debug.py`、`_extract*.js`、`_test_*.py` 统一移动到 `docs/archive/debug-scripts/` 或删除。
3. 清理 `.run` 下的旧截图、日志、pid 文件。
4. 保留 `.run/algo-modules/`，以后前端修改只改模块，然后运行：

   ```bash
   bash .run/build-algo-lib.sh all
   ```

5. 如果完全不再使用 code-server，只保留 AlgoLib 后端、SPA、算法目录和必要静态资源；但这一步影响较大，应单独评估。

