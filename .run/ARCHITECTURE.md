# AlgoLib 前端架构

AlgoLib 前端目前以普通浏览器脚本运行，不使用 ES Module。拆分后的源码位于 `.run/algo-modules/`，所有模块按数字前缀顺序加载，共享全局 `state`、`qs`、`qsa`、`esc`、`api`、`showToast` 等对象和工具函数。`.run/algo-lib-check.js` 与 `.run/algo-lib-inline-check.js` 是由 `.run/build-algo-lib.sh` 生成的 bundle；建议把模块文件作为源码维护，把 bundle 视为构建产物。当前 `src/browser/pages/algo-lib.html` 仍是内联脚本页面，构建脚本的 `all` 和 `inject` 子命令会把 `.run/algo-lib-inline-check.js` 自动注入到 HTML 的 `ALGO-LIB-JS-START/END` 标记之间。

## 模块速查

| 要修改的功能 | 对应文件 | 大小 |
| --- | --- | --- |
| 全局状态、BASE、控件中文名 | `01-state.js` | ~3KB |
| API、Toast、DOM、参数解析工具 | `02-utils.js` | ~6KB |
| 条目字段、权限、状态、版本工具 | `03-item-helpers.js` | ~6KB |
| 左侧导航、页面路由 | `04-nav-router.js` | ~8KB |
| 列表数据加载、筛选数据准备 | `05-data-loading.js` | ~7KB |
| 卡片、统计栏、分组、滚动恢复 | `06-cards-list.js` | ~16KB |
| 分类新增/编辑/删除 | `07-categories.js` | ~10KB |
| 新建算法工作区、参数控件配置 | `08-workspace-core.js` | ~17KB |
| 外部导入算法文件/文件夹 | `09-workspace-import.js` | ~8KB |
| 新建工作区 Monaco、保存、诊断 | `10-workspace-monaco-save.js` | ~13KB |
| 旧版新建算法兼容逻辑 | `11-legacy-create.js` | ~13KB |
| 算法编辑器外壳和 Monaco 初始化 | `12-editor-shell.js` | ~17KB |
| 文件树、新增文件、改名、删除、切换 | `13-editor-files.js` | ~12KB |
| 保存代码、命名空间、补全 | `14-editor-save-namespace.js` | ~11KB |
| 编辑器底部旧测试面板 | `15-editor-inline-test-panel.js` | ~13KB |
| 旧测试输出、图表、历史 | `16-editor-inline-output-history.js` | ~12KB |
| 基本信息、管理员发布弹窗 | `17-algo-info-admin-publish.js` | ~18KB |
| 模板编辑、模板测试控件 | `18-template-test-editor.js` | ~19KB |
| 模板运行、保存、发布组件 | `19-template-run-save-publish.js` | ~13KB |
| 提交审核、冲突与拒绝信息 | `20-review-submit.js` | ~9KB |
| 管理员审核、发布、删除、API 文档 | `21-review-admin-actions.js` | ~13KB |
| 代码片段列表、编辑、复制、插入 | `22-snippets.js` | ~18KB |
| 设置页、审核页、SSE、时钟 | `23-settings-review-sse.js` | ~10KB |
| 终端面板 | `24-terminal-panel.js` | ~6KB |
| 调试器、断点、变量和调用栈 | `25-debug-tools.js` | ~19KB |
| 当前文件运行、问题面板、快捷键 | `26-run-problems-keys.js` | ~6KB |
| 登录登出、我的算法兼容页 | `27-auth-myalgos.js` | ~19KB |
| 用户管理 | `28-users.js` | ~6KB |
| 全屏测试页核心、示例填充 | `29-full-test-core.js` | ~11KB |
| 全屏测试基础输入控件 | `30-full-test-basic-inputs.js` | ~6KB |
| 全屏测试图片/文件等上传控件 | `31-full-test-upload-inputs.js` | ~19KB |
| 全屏测试兼容运行/输出 | `32-full-test-run-output-compat.js` | ~9KB |
| 旧组件测试弹窗核心 | `33-component-test-core.js` | ~8KB |
| 旧组件测试控件 | `34-component-test-widgets.js` | ~16KB |
| 旧组件测试文件处理 | `35-component-test-file-processing.js` | ~5KB |
| 旧组件测试运行与历史 | `36-component-test-run-history.js` | ~13KB |
| 旧组件测试输出与拖拽 | `37-component-test-output-resize.js` | ~12KB |
| 公有算法复制为私有草稿 | `38-fork-copy.js` | ~7KB |
| 全屏测试最终运行和输出路由 | `39-output-utils-run.js` | ~10KB |
| 全屏测试最终输出渲染器 | `40-output-renderers.js` | ~16KB |
| 初始化、window 导出、兼容函数 | `41-init-exports.js` | ~13KB |
| 模板分块编辑器核心 | `42-block-editor-core.js` | ~11KB |
| 模板分块编辑器操作 | `43-block-editor-actions.js` | ~10KB |
| 登录态启动和初始加载 | `44-auth-bootstrap.js` | ~1KB |

## AI 助手上下文说明

未来修改前请先读本文件和 `log/codex-operations.md`。不要直接编辑 `.run/algo-lib-check.js` 或 `.run/algo-lib-inline-check.js`，它们由模块构建生成。先定位功能对应模块，只读取相关模块和必要后端文件，避免读取整个巨型 bundle。修改后运行 `bash .run/build-algo-lib.sh all`，该命令会同时生成 bundle 并注入 `src/browser/pages/algo-lib.html`，再运行 `bash .run/verify-split.sh` 或至少 `node --check` 检查生成文件。

如果用户说“内嵌 code-server 页面没变化”，重点检查 `src/browser/pages/algo-lib.html` 是否仍使用旧内联脚本，以及是否需要把构建后的 inline 版本同步回 HTML。`.run/algo-modules/inline-only/inline-overrides.js` 仅用于 inline 专属差异，当前通常为空。

## 标准修改流程

1. 确认要改的功能。
2. 查本文件找到对应模块。
3. 只读取该模块和直接依赖文件。
4. 修改模块文件。
5. 运行 `bash .run/build-algo-lib.sh all`。
6. 运行 `bash .run/verify-split.sh` 或 `node --check .run/algo-lib-check.js`。
7. 运行 `bash .run/build-algo-lib.sh dev` 可完成构建、注入、同步 WSL 和重启；只想本地构建注入时运行 `bash .run/build-algo-lib.sh all`。
8. 刷新页面验证。
