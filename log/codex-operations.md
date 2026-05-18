# Codex 操作与约束记录

## 固定约束
- 主要仓库在 Windows: `E:\code-server-me`。
- WSL 运行仓库在: `/home/guan/code-server-me`。
- 修改前优先查看本文件，复用已有同步、启动、校验方式。
- 修改嵌入算法管理界面时，主要文件是 `src/browser/pages/algo-lib.html`，并同步一份到 `algo_management.html`。
- 修改完成后需要同步到 WSL，并重启 WSL 中的项目。
- 不要只改独立 `algo_management.html`，code-server 内嵌入口使用的是 `src/browser/pages/algo-lib.html`。

## 常用校验
- 前端 JS 语法校验：
  `node -e "const fs=require('fs');const s=fs.readFileSync('src/browser/pages/algo-lib.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/); new Function(m[1]); console.log('JS OK')"`
- 后端 Python 校验：
  `python -m py_compile algo_service/routers/algorithms.py`

## 常用同步
- 同步前端到 WSL：
  `wsl bash -lc "cd /mnt/e/code-server-me && cp -f src/browser/pages/algo-lib.html /home/guan/code-server-me/src/browser/pages/algo-lib.html && cp -f algo_management.html /home/guan/code-server-me/algo_management.html"`

## 常用启动
- 后端：
  `cd /home/guan/code-server-me && python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000`
- code-server：
  `cd /home/guan/code-server-me && ./release/bin/code-server --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions`

## 常用后台重启
```bash
cd /home/guan/code-server-me
mkdir -p .run
pkill -f 'uvicorn algo_service.main:app' 2>/dev/null || true
python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null &
```
code-server 如果端口 8080 被旧进程占用，先查并杀：
```bash
ss -ltnp | grep ':8080'
kill -9 <pid>
./release/bin/code-server --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null &
```

## 本次记录

### 2026-05-15 10:27:58
- 用户要求：记录操作和约束规则；排查 WSL 项目打开后黑屏。
- 开始检查 WSL 服务、日志、前端语法和同步状态。
- 定位到黑屏原因：src/browser/pages/algo-lib.html 中测试面板附近残留了一段不在函数内的旧代码，导致 JS 解析失败。已删除该孤立代码块。
- 本次修复：删除 `src/browser/pages/algo-lib.html` 中 `_renderRightTestParams` 前残留的孤立测试面板代码块；该代码块导致 JS 解析错误，code-server 内嵌算法页黑屏。
- 已执行本地 JS 校验：`local JS OK`。
- 已同步到 WSL 并执行 WSL 侧 JS 校验：`wsl JS OK`。
- 重启时发现旧 uvicorn SSE 连接导致普通退出较慢，改用端口/PID 清理后使用 `setsid -f` 后台启动，进程可稳定保留。
- 当前 WSL 进程：后端 8000、code-server 8080 均已启动；后端健康检查 200，code-server 首页 302。

## 更稳的后台启动方式
```bash
cd /home/guan/code-server-me
mkdir -p .run
# 如端口被占用，先 kill 对应 pid：ss -ltnp | grep -E ':8000|:8080'
setsid -f python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 > .run/algo-service.log 2>&1 < /dev/null
setsid -f ./release/bin/code-server --bind-addr 127.0.0.1:8080 --auth none --disable-telemetry --disable-update-check --locale zh-cn --user-data-dir /home/guan/code-server-me/.run/fullbuild-user-data --extensions-dir /home/guan/code-server-me/.run/fullbuild-extensions > .run/code-server.log 2>&1 < /dev/null
```

### 2026-05-15 11:35:38
- 用户要求：测试结果增加表格展示；新增图片文件夹批处理算法 demo；从编辑器返回时恢复进入前滚动位置；分类筛选时隐藏其他空文件夹。
- 修改 src/browser/pages/algo-lib.html：新增 pageScroll/pendingScrollRestore 状态，进入编辑器前记录 #main.scrollTop，关闭编辑器回列表后恢复滚动位置。
- 修改 src/browser/pages/algo-lib.html：修复 enderCards 中错误使用 state.filter?.category 的问题，改为读取 #filterCategory，选中分类后不再补空分类组。
- 修改 src/browser/pages/algo-lib.html：测试面板增加“表格”结果标签，新增通用 __output_type__ == "table" 渲染逻辑，并对表格结果自动切换到表格页。
- 新增 lgorithms_root/demo/image_folder_batch.py：图片文件夹批处理 demo，支持上传文件夹/多文件路径，处理后保存到输出目录，并返回表格结果。
- 已复制嵌入页到 lgo_management.html，并同步到 WSL /home/guan/code-server-me。
- 已执行本地校验：前端 JS OK；python -m py_compile algorithms_root/demo/image_folder_batch.py OK。
- 已执行 WSL 校验：前端 JS OK；demo Python py_compile OK；搜索接口能查到 demo.image_folder_batch。
- 已重启 WSL 项目：后端 8000 返回 200，code-server 8080 返回 302，当前监听进程正常。

### 2026-05-15 15:35:11
- 用户反馈：测试质量报告仍无表格标签；图片文件夹 demo 需用 E:\新建文件夹 输入、E:/test 输出验证；返回编辑器滚动恢复和分类过滤隐藏空组未生效。
- 关键定位：当前 code-server 运行时 ootPath 是 /home/guan/code-server-me/release，实际服务 HTML 为 /home/guan/code-server-me/release/src/browser/pages/algo-lib.html，此前只同步 src/browser/pages/algo-lib.html，所以浏览器看到旧界面。
- 新增固定规则：以后修改嵌入算法管理界面时，必须同时同步三处：Windows src/browser/pages/algo-lib.html、WSL src/browser/pages/algo-lib.html、WSL elease/src/browser/pages/algo-lib.html；Windows 若存在 elease/src/browser/pages/algo-lib.html 也同步。
- 本次修复：前端测试面板静态和动态结果标签都加入“表格”；服务端 curl /algo-lib 已确认 data-tp-tab="table" 出现 2 次。
- 本次修复：返回编辑区前记录实际 state.page 为 eturnPage，关闭编辑器后按该页面恢复滚动；并在 switchPage 后立即和渲染后双保险恢复。
- 本次修复：分类过滤时生成 groupKeys，选中分类后过滤掉所有 0 项分组，避免其他文件夹显示 0。
- 本次修复：image_folder_batch.py 增加 Windows 路径到 WSL /mnt/<drive>/... 的转换，支持 E:\新建文件夹 和 E:/test 这种输入/输出。
- 已验证：image_folder_batch('E:\新建文件夹','E:/test') 返回 2 行成功记录，输出到 E:\test；因 WSL 未安装 Pillow，当前处理策略为复制原图并在结果说明中标注。
- 已校验：Windows 前端 JS OK；WSL src 和 elease/src 两份前端 JS OK；demo Python py_compile OK。
- 已重启 WSL：后端 8000 返回 200，code-server 8080 返回 302。

### 2026-05-15 16:28:37
- 用户要求：从分类筛选后的列表（例如分类 demo）进入编辑/测试后，返回时仍保持该分类筛选界面，而不是回到顶部或默认列表。
- 修改 src/browser/pages/algo-lib.html：新增 ememberListViewState / estoreListViewState，保存并恢复搜索、分类、语言、状态、权限和滚动位置。
- 修改卡片“测试”按钮：调用 openComponentTestModalById(id, page) 时传入当前页面，避免测试入口把 components-general 错退成 components。
- 修改 openComponentTestModalById：打开测试前如果需要进入编辑器，使用传入的当前页面作为返回页面。
- 修改 enderModulePage、loadCurrentPage、我的算法列表刷新：hydrate 筛选项之后恢复已保存的筛选状态，再渲染卡片。
- 已同步到 Windows/WSL 的 src/browser/pages/algo-lib.html、lgo_management.html，以及 WSL 实际服务文件 elease/src/browser/pages/algo-lib.html。
- 已校验：Windows JS OK；WSL src 与 elease/src JS OK；curl /algo-lib 可检索到 estoreListViewState。
- 已重启 WSL 项目：后端 8000 返回 200，code-server 8080 返回 302。

### 2026-05-15 16:50:00
- 用户进入四阶段任务的第一阶段：完善参数控件推断、输出渲染 hint、临时文件上传接口、执行返回结构、base64 预处理和临时文件清理任务。
- 修改 `algo_service/sdk/param_inferrer.py`：确认 `images` 规则优先于 `image`；新增 dataframe/json/text 名称推断；支持 Optional/Union 解包；新增 `infer_output_widget` 与 `_is_base64_image`；Optional/Union 参数会在 `enrich_params` 中标记 `nullable: True`。
- 修改 `algo_service/routers/algorithms.py`：新增 `/api/v1/upload-temp`，按当前用户保存到系统临时目录 `algolib_uploads/{user_id}`，限制空文件和 50MB 大小；`_execute_entry` 返回 `output_hint`；`_preprocess_kwargs` 支持 list 递归和纯 base64 padding 补齐。
- 修改 `algo_service/main.py`：lifespan startup 启动后台清理任务，每 30 分钟清理超过 60 分钟的 `/tmp/algolib_uploads` 文件。
- 已执行 Windows 校验：`python -m py_compile algo_service/sdk/param_inferrer.py algo_service/routers/algorithms.py algo_service/main.py`；参数和输出 hint 快速测试通过。
- 已同步到 WSL `/home/guan/code-server-me` 并执行 WSL `py_compile`。
- 已重启 WSL 项目：后端 8000 返回 200，code-server 8080 返回 302。
- 微调：`/api/v1/upload-temp` 参数顺序调整为用户指定形式 `file: UploadFile = File(...), request: Request = None`；重新同步 WSL、编译并重启后端，后端 8000 返回 200。

### 2026-05-15 17:25:00
- 用户进入第二阶段：将算法测试面板改为导航栏右侧区域内的全屏页面，本阶段不重启前后端。
- 修改 `src/browser/pages/algo-lib.html`：新增 `--bg`、`--border`、`--text-secondary` 变量别名，并让 `.main` 成为全屏测试页的定位容器。
- 新增全屏测试页 CSS：`.test-fullpage`、`.test-header`、左右输入/输出面板、拖拽分割条、参数卡片、基础输入控件、图片/文件上传、输出区、JSON tree 和图片全屏预览样式。
- 新增静态 HTML 容器 `#testFullpage`，打开时会移动到 `#main` 内，确保只覆盖导航栏右侧主内容区域，不覆盖左侧导航和底部 code-server 框架。
- 新增 JS：`openTestPage/closeTestPage`、参数卡片渲染、int/float/str/text/bool/json/image/images/file/literal/url/datetime/color/password 控件、上传临时文件、拖拽分割条、运行测试与 output_hint 基础渲染。
- 修改现有测试入口：卡片“测试”和编辑器“测试”改为调用 `openTestPage(...)`；旧 overlay 函数保留为兼容包装。
- 已执行 Windows 校验：`python .run/extract_js.py; node --check .run/algo-lib-inline-check.js`。
- 已同步到 `algo_management.html`、WSL `src/browser/pages/algo-lib.html`、WSL 实际服务文件 `release/src/browser/pages/algo-lib.html`；已执行 WSL 侧 JS 语法检查。
- 按用户要求，本阶段未重启前端或后端服务。

### 2026-05-15 19:48:31
- 用户进入第三阶段：为全屏测试页面接入运行逻辑和输出渲染，本阶段不重启项目。
- 修改 src/browser/pages/algo-lib.html：参数卡片补充 data-param-name，跳过复选框补充 param-skip-checkbox，用于运行前收集参数和跳过 nullable 参数。
- 新增/覆盖阶段三 JS：collectTestParams 改为组装 {args, kwargs}；unFullTest 改为调用 POST /api/v1/algorithms/{id}/execute；新增 enderTestOutput/switchOutputTab 输出路由。
- 新增结构化输出渲染：text/json/table/image/images/chart/html/file/error/mixed；表格超过 100 行截断；JSON 使用 DOM 树递归渲染；图片支持 data URL 和裸 base64；ECharts 缺失时优雅降级。
- 新增辅助函数：_isBase64Image、_ensureDataUrl、copyToClipboard、downloadBlob、downloadBase64File、showImageFullscreen、copyTableAsTsv，并挂载到 window。
- 已复制到 lgo_management.html，并同步到 WSL src/browser/pages/algo-lib.html 和实际服务文件 elease/src/browser/pages/algo-lib.html。
- 已执行 Windows JS 语法检查和 WSL src/release 两份 JS 语法检查，均通过。
- 按用户要求，本阶段未重启前端或后端服务。

### 2026-05-15 20:27:35
- 用户进入第四阶段：联调集成前三阶段、修复缺口、同步检查并允许重启项目。
- 修改 lgo_service/sdk/param_inferrer.py：替换为阶段一完整清晰版本，包含 Optional/Union 解包、images 优先、dataframe/json/text 名称推断、infer_output_widget、_is_base64_image、
ullable 标记和 Literal 选项提取。
- 修改 lgo_service/routers/algorithms.py：将 import re 提到文件顶部；删除函数内部局部 import re；保留增强版 _preprocess_kwargs 和 _execute_entry；新增 POST /api/v1/algorithms/{algorithm_id:path}/execute，供全屏测试页按前端 id 执行算法。
- 前端 src/browser/pages/algo-lib.html、lgo_management.html、.run/algo-lib-inline-check.js、.run/algo-lib-check.js 已保持阶段二/三最新逻辑，测试入口调用全屏 openTestPage。
- 已同步到 WSL /home/guan/code-server-me 的后端文件、src/browser/pages/algo-lib.html、实际服务文件 elease/src/browser/pages/algo-lib.html 和 .run JS 检查文件。
- 校验：Windows py_compile 通过；Windows .run JS 语法检查通过；WSL py_compile 与 .run JS 语法检查通过；WSL 路由检查确认 /api/v1/upload-temp 和 /api/v1/algorithms/{algorithm_id:path}/execute 均已注册。
- 运行验证：调用 /api/v1/algorithms/data_utils.chunk_list/execute 成功返回 success=true、output_hint=json 和执行结果。
- 已重启 WSL 后端与 code-server：后端 8000 返回 200，code-server 8080 返回 302；实际服务页 /algo-lib 可检索到 	estFullpage、unFullTest 和 /api/v1/algorithms/。
### 2026-05-15 21:00:52
- 操作：为 AlgoLib 新增演示算法集合，写入 lgorithms_root/demo/folder_config.json 和 18 个 demo_*.py 独立算法文件，覆盖 int/float/str/text/bool/list/dict/dataframe/Literal/Optional/url/datetime/color/password/image/images/file/chart/mixed 输出等类型。
- 验证：本地 python -m py_compile algorithms_root/demo/demo_*.py 通过；AST 校验每个文件仅一个公开函数，input_example JSON 与函数参数一致；后端 API 注册到 demo 命名空间共 18 个 demo。
- 同步：已复制 lgorithms_root/demo/folder_config.json 和 demo_*.py 到 WSL /home/guan/code-server-me/algorithms_root/demo/。
- 重启：已重启 WSL 中 uvicorn 后端  .0.0.0:8000 与 code-server 127.0.0.1:8080。
- 复用规则：新增算法 demo 时保持每个算法一个独立 .py 文件；@algo_meta.input_example 的 key 必须与函数签名一致；文件/图片 demo 不依赖 pandas/numpy，Pillow 仅作为图片处理的可选依赖。
### 2026-05-18 09:44:04
- 用户要求：验证 lgorithms_root/demo/ 下 18 个 demo 算法是否可被 AlgoLib 扫描、注册和测试，并检查参数/输出推断。
- 扫描配置：config.yaml 已包含 ./algorithms_root 和 ./algorithms_root/demo，无需修改 watch_roots。
- 校验结果：18 个新增 demo 均被 Registry 扫描注册；所有参数 widget_hint 与预期一致，包括 content=text、ows=dataframe、Optional[str] nullable=True、images=images、ile_path=file。
- 修复：仅修改 demo 文件。demo_dict.py 将返回字段 alues 改为 alue_list，避免被 infer_output_widget 误判为 chart；demo_image.py/demo_images.py 在未安装 Pillow 时原样返回输入 base64，保证输出仍可识别为 image/images。
- 验证：本地和 WSL py_compile 通过；运行中后端确认 18 个预期 demo 全部存在；抽测 /execute 输出 demo_int_float=text、demo_dataframe=table、demo_chart_line=chart、demo_dict=json。
- 同步与重启：已同步 demo 文件到 WSL /home/guan/code-server-me/algorithms_root/demo/；已重启后端 8000 和 code-server 8080，健康检查分别返回 200/302。
### 2026-05-18 10:22:11
- 用户要求：修复全屏测试页关闭后再次点击“测试”无反应，以及 @algo_meta.input_example 不再预填参数的问题。
- 修改 src/browser/pages/algo-lib.html、lgo_management.html、.run/algo-lib-inline-check.js、.run/algo-lib-check.js；未修改后端、未修改 Monaco 初始化逻辑。
- 修复点：openTestPage(algo) 每次都重新解析 lgo.inputExample 到 state._testInputExample，重置测试状态并重新渲染参数/输出；closeTestPage() 仅隐藏 #testFullpage，只清理测试状态，不触碰 state.editing 和编辑器 DOM。
- 新增：hasTestInputExample、illTestParamExample、illAllTestExamples、ensureTestExampleButton；参数卡片有示例时显示“填入示例”，运行栏动态加入“填入全部示例”。
- 同步：已重新提取 .run 两份 JS 检查文件，并同步到 WSL /home/guan/code-server-me/src/browser/pages/algo-lib.html 与实际服务文件 elease/src/browser/pages/algo-lib.html。
- 校验：Windows 与 WSL 的 .run JS 
ode --check 通过；后端 8000 返回 200，code-server 8080 返回 302；接口确认 demo 算法 inputExample 正常返回。
### 2026-05-18 10:35:00
- 用户要求：修复从滚动后的列表页进入全屏测试页时，测试页沿用旧 scrollTop 导致上半部分不可见的问题。
- 修改 src/browser/pages/algo-lib.html、algo_management.html、.run/algo-lib-inline-check.js、.run/algo-lib-check.js；同步到 WSL /home/guan/code-server-me/src/browser/pages/algo-lib.html 与实际服务文件 release/src/browser/pages/algo-lib.html。
- 修复点：openTestPage(algo) 进入时强制 document/body/#main 滚动归零，并设置 body overflow=hidden 禁止背景滚动；closeTestPage() 退出时恢复 body overflow。
- CSS：追加 .test-fullpage/#testFullpage/[class*=comp-test-fullpage] fixed 全屏规则，z-index 9999，脱离父级滚动上下文。
- 校验：Windows 与 WSL 的 .run JS node --check 均通过；WSL release 文件确认包含滚动控制代码。


## 2026-05-18 16:44 +08:00 - 参数控件配置（widget_overrides）

### 本次操作
- 以后修改前继续先查看本文件，复用已确认的同步和验证流程。
- 以 WSL 当前可运行的 `src/browser/pages/algo-lib.html` 为前端基底同步回本地，避免本地 HTML 旧编码损坏导致 JS 语法错误。
- 后端新增 `widget_overrides` 元数据链路：Pydantic 模型、AST 解析、Registry Entry、manifest 写入、算法创建/更新、包创建与 `_entry_dict` 返回。
- `enrich_params(params, widget_overrides=None)` 现在会优先使用用户指定控件类型，不传时保持原自动推断逻辑。
- 新建算法工作区新增“参数控件配置”面板，支持“识别参数”、按类型过滤控件选项、保存时提交 `widget_overrides`。
- 同步到 WSL：`src/browser/pages/algo-lib.html`、`release/src/browser/pages/algo-lib.html`、`.run/algo-lib-inline-check.js`、`.run/algo-lib-check.js` 以及相关后端文件。
- 已重启 WSL 后端：`python3 -m uvicorn algo_service.main:app --host 0.0.0.0 --port 8000`。

### 验证
- Windows：`python -m py_compile algo_service/sdk/param_inferrer.py algo_service/sdk/ast_parser.py algo_service/sdk/registry.py algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/models/schemas.py`
- Windows：`node --check .run/algo-lib-inline-check.js`、`node --check .run/algo-lib-check.js`
- Windows：`enrich_params([{'name':'image','type':'str'}], {'image':'file'})` 返回 `file`；`Optional[str]` override 为 `text` 返回 `text`。
- WSL：同步后同样执行 py_compile 与 node --check，均通过。

### 约束/规则
- 前端修改必须以 WSL 可运行版本为准，避免本地编码损坏版本扩散。
- 每次改完前端都要执行 `python .run/extract_js.py`，再将 `.run/algo-lib-inline-check.js` 复制到 `.run/algo-lib-check.js`。
- 前端同步到 WSL 时必须同时覆盖 `src/browser/pages/algo-lib.html` 和 `release/src/browser/pages/algo-lib.html`。
- 不要破坏自动推断逻辑；`widget_overrides` 必须可选，缺省时保持旧行为。
