# AlgoLib 前端模块说明

`.run/algo-modules/` 存放从 `.run/algo-lib-check.js` 拆分出的前端模块。模块不是 ES Module，不使用 `import/export`，而是按顺序用普通 `<script>` 执行，并共享全局 `state`、`qs`、`api`、`showToast` 等对象和函数。

## 模块职责

| 顺序 | 文件 | 职责 |
| --- | --- | --- |
| 01 | `01-state.js` | 全局配置、`state` 单例和控件中文映射。 |
| 02 | `02-utils.js` | DOM、转义、API、Toast、确认框和宽松参数解析等基础工具。 |
| 03 | `03-item-helpers.js` | 算法/片段通用字段、权限、状态、命名空间和版本工具。 |
| 04 | `04-nav-router.js` | 左侧导航渲染、页面切换和路由分发。 |
| 05 | `05-data-loading.js` | 模块列表数据加载、骨架屏、筛选数据准备。 |
| 06 | `06-cards-list.js` | 统计卡片、算法卡片、分组折叠、筛选应用和滚动记忆。 |
| 07 | `07-categories.js` | 分类新增、编辑、删除和子分类管理。 |
| 08 | `08-workspace-core.js` | 新建算法工作区基础模板、参数控件配置和创建模式切换。 |
| 09 | `09-workspace-import.js` | 外部导入、文件选择、入口文件和导出函数识别。 |
| 10 | `10-workspace-monaco-save.js` | 新建工作区 Monaco 初始化、代码诊断、测试和保存。 |
| 11 | `11-legacy-create.js` | 旧版普通/复杂算法新建弹窗兼容逻辑。 |
| 12 | `12-editor-shell.js` | 算法编辑器打开、主视图渲染和 Monaco 初始化。 |
| 13 | `13-editor-files.js` | 编辑器本地诊断、文件列表刷新、文件树和文件切换。 |
| 14 | `14-editor-save-namespace.js` | 保存为私有草稿、版本号、文件保存、补全和命名空间。 |
| 15 | `15-editor-inline-test-panel.js` | 编辑器底部旧测试面板布局、参数收集和运行。 |
| 16 | `16-editor-inline-output-history.js` | 编辑器底部旧测试结果渲染、图表/表格和测试用例历史。 |
| 17 | `17-algo-info-admin-publish.js` | 算法基本信息、模板描述和管理员发布弹窗。 |
| 18 | `18-template-test-editor.js` | 模板发布为组件弹窗、模板编辑器和模板测试参数控件。 |
| 19 | `19-template-run-save-publish.js` | 模板源码测试、模板草稿保存和发布为组件确认。 |
| 20 | `20-review-submit.js` | 算法提交审核、冲突判断、拒绝草稿查看和拒绝原因。 |
| 21 | `21-review-admin-actions.js` | 撤回、通过、驳回、正式发布、下架、版本、删除和 API 文档。 |
| 22 | `22-snippets.js` | 代码片段编辑、复制、审核、发布、搜索和插入浮层。 |
| 23 | `23-settings-review-sse.js` | 设置页、审核页渲染、SSE、公共刷新和时钟。 |
| 24 | `24-terminal-panel.js` | 底部面板、终端初始化和 WebSocket 终端连接。 |
| 25 | `25-debug-tools.js` | 断点、调试会话、变量、调用栈和调试控制。 |
| 26 | `26-run-problems-keys.js` | 当前文件运行、执行 WebSocket、问题面板和全局快捷键。 |
| 27 | `27-auth-myalgos.js` | 登录登出、我的算法兼容页和我的算法提交操作。 |
| 28 | `28-users.js` | 用户管理页、创建用户、重置密码、禁用启用和删除用户。 |
| 29 | `29-full-test-core.js` | 全屏测试页打开关闭、参数卡片和示例填充。 |
| 30 | `30-full-test-basic-inputs.js` | 全屏测试页基础输入控件、JSON 控件和布尔/文本控件。 |
| 31 | `31-full-test-upload-inputs.js` | 全屏测试页图片、多图、文件、下拉、URL、日期、颜色和密码控件。 |
| 32 | `32-full-test-run-output-compat.js` | 全屏测试页早期运行与输出兼容渲染。 |
| 33 | `33-component-test-core.js` | 旧组件测试浮层打开关闭和基础参数布局。 |
| 34 | `34-component-test-widgets.js` | 旧组件测试浮层图片、多图、文件和参数卡片控件。 |
| 35 | `35-component-test-file-processing.js` | 旧组件测试浮层图片/文件读取、上传和参数跳过表格编辑。 |
| 36 | `36-component-test-run-history.js` | 旧组件测试浮层参数收集、示例填充、历史和运行。 |
| 37 | `37-component-test-output-resize.js` | 旧组件测试浮层结果渲染、结构化展示、图表和右侧拖拽。 |
| 38 | `38-fork-copy.js` | 公有算法/模板复制为私有草稿。 |
| 39 | `39-output-utils-run.js` | 最终版全屏测试运行、输出路由和基础输出工具。 |
| 40 | `40-output-renderers.js` | 最终版文本、JSON、表格、图片、图表、HTML、文件和混合输出渲染。 |
| 41 | `41-init-exports.js` | 初始化函数、全局 `window` 导出和旧输入示例兼容函数。 |
| 42 | `42-block-editor-core.js` | 模板分块编辑器初始化、渲染和锁定行装饰。 |
| 43 | `43-block-editor-actions.js` | 分块编辑器保存、模式切换、块增删移动、元信息和预览清理。 |
| 44 | `44-auth-bootstrap.js` | 登录态启动流程和初始页面加载。 |
| inline | `inline-only/inline-overrides.js` | 仅 inline 版本使用；当前为空，用于放置覆盖共享模块的 inline 专属函数。 |

## 加载顺序依赖图

```text
01-state
  -> 02-utils
  -> 03-item-helpers
  -> 04-nav-router
  -> 05-data-loading
  -> 06-cards-list
  -> 07-categories
  -> 08-workspace-core
  -> 09-workspace-import
  -> 10-workspace-monaco-save
  -> 11-legacy-create
  -> 12-editor-shell
  -> 13-editor-files
  -> 14-editor-save-namespace
  -> 15-editor-inline-test-panel
  -> 16-editor-inline-output-history
  -> 17-algo-info-admin-publish
  -> 18-template-test-editor
  -> 19-template-run-save-publish
  -> 20-review-submit
  -> 21-review-admin-actions
  -> 22-snippets
  -> 23-settings-review-sse
  -> 24-terminal-panel
  -> 25-debug-tools
  -> 26-run-problems-keys
  -> 27-auth-myalgos
  -> 28-users
  -> 29-full-test-core
  -> 30-full-test-basic-inputs
  -> 31-full-test-upload-inputs
  -> 32-full-test-run-output-compat
  -> 33-component-test-core
  -> 34-component-test-widgets
  -> 35-component-test-file-processing
  -> 36-component-test-run-history
  -> 37-component-test-output-resize
  -> 38-fork-copy
  -> 39-output-utils-run
  -> 40-output-renderers
  -> 41-init-exports
  -> 42-block-editor-core
  -> 43-block-editor-actions
  -> 44-auth-bootstrap

inline build:
  shared 01-44 -> inline-only/inline-overrides
```

顺序很重要：后面的模块可能覆盖前面同名函数，例如全屏测试页的最终运行和输出渲染逻辑会覆盖兼容实现。

## 开发流程

1. 根据功能找到对应模块，只修改模块文件，不直接修改 `.run/algo-lib-check.js` 或 `.run/algo-lib-inline-check.js`。
2. 构建单页版本：

   ```bash
   bash .run/build-algo-lib.sh check
   ```

3. 构建 code-server inline 版本：

   ```bash
   bash .run/build-algo-lib.sh inline
   ```

4. 同时构建两个版本并注入到 `src/browser/pages/algo-lib.html`：

   ```bash
   bash .run/build-algo-lib.sh all
   ```

5. 只构建 inline 并注入到 HTML：

   ```bash
   bash .run/build-algo-lib.sh inject
   ```

6. 构建、注入、同步 WSL 并重启：

   ```bash
   bash .run/build-algo-lib.sh dev
   ```

7. 构建后建议检查语法：

   ```bash
   node --check .run/algo-lib-check.js
   node --check .run/algo-lib-inline-check.js
   ```

当前 `src/browser/pages/algo-lib.html` 仍然是内联脚本页面，不直接加载 `.run/algo-lib-check.js`。构建脚本会把 `.run/algo-lib-inline-check.js` 注入到 `ALGO-LIB-JS-START/END` 标记之间。

## 常见修改场景

| 场景 | 优先修改模块 |
| --- | --- |
| 左侧导航、页面切换 | `04-nav-router.js` |
| 列表加载、筛选、骨架屏 | `05-data-loading.js`、`06-cards-list.js` |
| 算法卡片按钮、卡片标签、滚动恢复 | `06-cards-list.js` |
| 分类新增/编辑/删除 | `07-categories.js` |
| 新建算法、模板代码、参数控件配置 | `08-workspace-core.js`、`10-workspace-monaco-save.js` |
| 外部导入算法 | `09-workspace-import.js` |
| 编辑器打开、文件树、文件切换 | `12-editor-shell.js`、`13-editor-files.js` |
| 保存代码、命名空间、补全 | `14-editor-save-namespace.js` |
| 全屏测试页面输入控件 | `29-full-test-core.js`、`30-full-test-basic-inputs.js`、`31-full-test-upload-inputs.js` |
| 全屏测试运行和结果渲染 | `39-output-utils-run.js`、`40-output-renderers.js` |
| 旧测试面板兼容 | `15-editor-inline-test-panel.js`、`16-editor-inline-output-history.js`、`33-component-test-core.js` 到 `37-component-test-output-resize.js` |
| 代码片段 | `22-snippets.js` |
| 审核、发布、驳回、下架 | `20-review-submit.js`、`21-review-admin-actions.js` |
| 模板使用说明、模板编辑、模板发布组件 | `18-template-test-editor.js`、`19-template-run-save-publish.js` |
| 登录、登出、用户管理 | `27-auth-myalgos.js`、`28-users.js`、`44-auth-bootstrap.js` |
| 终端和调试 | `24-terminal-panel.js`、`25-debug-tools.js`、`26-run-problems-keys.js` |
| 模板分块编辑器 | `42-block-editor-core.js`、`43-block-editor-actions.js` |
| inline 版本专属差异 | `inline-only/inline-overrides.js` |

## HTML 加载方式

### 开发模式：逐个加载模块

适用于独立 HTML 调试，改模块文件后刷新页面即可看到变化。

```html
<script src=".run/algo-modules/01-state.js"></script>
<script src=".run/algo-modules/02-utils.js"></script>
<script src=".run/algo-modules/03-item-helpers.js"></script>
<script src=".run/algo-modules/04-nav-router.js"></script>
<script src=".run/algo-modules/05-data-loading.js"></script>
<script src=".run/algo-modules/06-cards-list.js"></script>
<script src=".run/algo-modules/07-categories.js"></script>
<script src=".run/algo-modules/08-workspace-core.js"></script>
<script src=".run/algo-modules/09-workspace-import.js"></script>
<script src=".run/algo-modules/10-workspace-monaco-save.js"></script>
<script src=".run/algo-modules/11-legacy-create.js"></script>
<script src=".run/algo-modules/12-editor-shell.js"></script>
<script src=".run/algo-modules/13-editor-files.js"></script>
<script src=".run/algo-modules/14-editor-save-namespace.js"></script>
<script src=".run/algo-modules/15-editor-inline-test-panel.js"></script>
<script src=".run/algo-modules/16-editor-inline-output-history.js"></script>
<script src=".run/algo-modules/17-algo-info-admin-publish.js"></script>
<script src=".run/algo-modules/18-template-test-editor.js"></script>
<script src=".run/algo-modules/19-template-run-save-publish.js"></script>
<script src=".run/algo-modules/20-review-submit.js"></script>
<script src=".run/algo-modules/21-review-admin-actions.js"></script>
<script src=".run/algo-modules/22-snippets.js"></script>
<script src=".run/algo-modules/23-settings-review-sse.js"></script>
<script src=".run/algo-modules/24-terminal-panel.js"></script>
<script src=".run/algo-modules/25-debug-tools.js"></script>
<script src=".run/algo-modules/26-run-problems-keys.js"></script>
<script src=".run/algo-modules/27-auth-myalgos.js"></script>
<script src=".run/algo-modules/28-users.js"></script>
<script src=".run/algo-modules/29-full-test-core.js"></script>
<script src=".run/algo-modules/30-full-test-basic-inputs.js"></script>
<script src=".run/algo-modules/31-full-test-upload-inputs.js"></script>
<script src=".run/algo-modules/32-full-test-run-output-compat.js"></script>
<script src=".run/algo-modules/33-component-test-core.js"></script>
<script src=".run/algo-modules/34-component-test-widgets.js"></script>
<script src=".run/algo-modules/35-component-test-file-processing.js"></script>
<script src=".run/algo-modules/36-component-test-run-history.js"></script>
<script src=".run/algo-modules/37-component-test-output-resize.js"></script>
<script src=".run/algo-modules/38-fork-copy.js"></script>
<script src=".run/algo-modules/39-output-utils-run.js"></script>
<script src=".run/algo-modules/40-output-renderers.js"></script>
<script src=".run/algo-modules/41-init-exports.js"></script>
<script src=".run/algo-modules/42-block-editor-core.js"></script>
<script src=".run/algo-modules/43-block-editor-actions.js"></script>
<script src=".run/algo-modules/44-auth-bootstrap.js"></script>
```

inline 开发模式如需额外覆盖逻辑，在共享模块之后追加：

```html
<script src=".run/algo-modules/inline-only/inline-overrides.js"></script>
```

### 生产模式：加载合并文件

先构建：

```bash
bash .run/build-algo-lib.sh check
```

独立页面加载：

```html
<script src=".run/algo-lib-check.js"></script>
```

inline 版本先构建：

```bash
bash .run/build-algo-lib.sh inline
```

然后按 code-server 页面当前的内联脚本同步流程，把 `.run/algo-lib-inline-check.js` 注入到 `src/browser/pages/algo-lib.html` 的内联 `<script>` 中。
