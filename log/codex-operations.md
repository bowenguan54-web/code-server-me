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
- 修改 src/browser/pages/algo-lib.html：修复 
enderCards 中错误使用 state.filter?.category 的问题，改为读取 #filterCategory，选中分类后不再补空分类组。
- 修改 src/browser/pages/algo-lib.html：测试面板增加“表格”结果标签，新增通用 __output_type__ == "table" 渲染逻辑，并对表格结果自动切换到表格页。
- 新增 lgorithms_root/demo/image_folder_batch.py：图片文件夹批处理 demo，支持上传文件夹/多文件路径，处理后保存到输出目录，并返回表格结果。
- 已复制嵌入页到 lgo_management.html，并同步到 WSL /home/guan/code-server-me。
- 已执行本地校验：前端 JS OK；python -m py_compile algorithms_root/demo/image_folder_batch.py OK。
- 已执行 WSL 校验：前端 JS OK；demo Python py_compile OK；搜索接口能查到 demo.image_folder_batch。
- 已重启 WSL 项目：后端 8000 返回 200，code-server 8080 返回 302，当前监听进程正常。

### 2026-05-15 15:35:11
- 用户反馈：测试质量报告仍无表格标签；图片文件夹 demo 需用 E:\新建文件夹 输入、E:/test 输出验证；返回编辑器滚动恢复和分类过滤隐藏空组未生效。
- 关键定位：当前 code-server 运行时 
ootPath 是 /home/guan/code-server-me/release，实际服务 HTML 为 /home/guan/code-server-me/release/src/browser/pages/algo-lib.html，此前只同步 src/browser/pages/algo-lib.html，所以浏览器看到旧界面。
- 新增固定规则：以后修改嵌入算法管理界面时，必须同时同步三处：Windows src/browser/pages/algo-lib.html、WSL src/browser/pages/algo-lib.html、WSL 
elease/src/browser/pages/algo-lib.html；Windows 若存在 
elease/src/browser/pages/algo-lib.html 也同步。
- 本次修复：前端测试面板静态和动态结果标签都加入“表格”；服务端 curl /algo-lib 已确认 data-tp-tab="table" 出现 2 次。
- 本次修复：返回编辑区前记录实际 state.page 为 
eturnPage，关闭编辑器后按该页面恢复滚动；并在 switchPage 后立即和渲染后双保险恢复。
- 本次修复：分类过滤时生成 groupKeys，选中分类后过滤掉所有 0 项分组，避免其他文件夹显示 0。
- 本次修复：image_folder_batch.py 增加 Windows 路径到 WSL /mnt/<drive>/... 的转换，支持 E:\新建文件夹 和 E:/test 这种输入/输出。
- 已验证：image_folder_batch('E:\新建文件夹','E:/test') 返回 2 行成功记录，输出到 E:\test；因 WSL 未安装 Pillow，当前处理策略为复制原图并在结果说明中标注。
- 已校验：Windows 前端 JS OK；WSL src 和 
elease/src 两份前端 JS OK；demo Python py_compile OK。
- 已重启 WSL：后端 8000 返回 200，code-server 8080 返回 302。

### 2026-05-15 16:28:37
- 用户要求：从分类筛选后的列表（例如分类 demo）进入编辑/测试后，返回时仍保持该分类筛选界面，而不是回到顶部或默认列表。
- 修改 src/browser/pages/algo-lib.html：新增 
ememberListViewState / 
estoreListViewState，保存并恢复搜索、分类、语言、状态、权限和滚动位置。
- 修改卡片“测试”按钮：调用 openComponentTestModalById(id, page) 时传入当前页面，避免测试入口把 components-general 错退成 components。
- 修改 openComponentTestModalById：打开测试前如果需要进入编辑器，使用传入的当前页面作为返回页面。
- 修改 
enderModulePage、loadCurrentPage、我的算法列表刷新：hydrate 筛选项之后恢复已保存的筛选状态，再渲染卡片。
- 已同步到 Windows/WSL 的 src/browser/pages/algo-lib.html、lgo_management.html，以及 WSL 实际服务文件 
elease/src/browser/pages/algo-lib.html。
- 已校验：Windows JS OK；WSL src 与 
elease/src JS OK；curl /algo-lib 可检索到 
estoreListViewState。
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
- 新增/覆盖阶段三 JS：collectTestParams 改为组装 {args, kwargs}；
unFullTest 改为调用 POST /api/v1/algorithms/{id}/execute；新增 
enderTestOutput/switchOutputTab 输出路由。
- 新增结构化输出渲染：text/json/table/image/images/chart/html/file/error/mixed；表格超过 100 行截断；JSON 使用 DOM 树递归渲染；图片支持 data URL 和裸 base64；ECharts 缺失时优雅降级。
- 新增辅助函数：_isBase64Image、_ensureDataUrl、copyToClipboard、downloadBlob、downloadBase64File、showImageFullscreen、copyTableAsTsv，并挂载到 window。
- 已复制到 lgo_management.html，并同步到 WSL src/browser/pages/algo-lib.html 和实际服务文件 
elease/src/browser/pages/algo-lib.html。
- 已执行 Windows JS 语法检查和 WSL src/release 两份 JS 语法检查，均通过。
- 按用户要求，本阶段未重启前端或后端服务。

### 2026-05-15 20:27:35
- 用户进入第四阶段：联调集成前三阶段、修复缺口、同步检查并允许重启项目。
- 修改 lgo_service/sdk/param_inferrer.py：替换为阶段一完整清晰版本，包含 Optional/Union 解包、images 优先、dataframe/json/text 名称推断、infer_output_widget、_is_base64_image、
ullable 标记和 Literal 选项提取。
- 修改 lgo_service/routers/algorithms.py：将 import re 提到文件顶部；删除函数内部局部 import re；保留增强版 _preprocess_kwargs 和 _execute_entry；新增 POST /api/v1/algorithms/{algorithm_id:path}/execute，供全屏测试页按前端 id 执行算法。
- 前端 src/browser/pages/algo-lib.html、lgo_management.html、.run/algo-lib-inline-check.js、.run/algo-lib-check.js 已保持阶段二/三最新逻辑，测试入口调用全屏 openTestPage。
- 已同步到 WSL /home/guan/code-server-me 的后端文件、src/browser/pages/algo-lib.html、实际服务文件 
elease/src/browser/pages/algo-lib.html 和 .run JS 检查文件。
- 校验：Windows py_compile 通过；Windows .run JS 语法检查通过；WSL py_compile 与 .run JS 语法检查通过；WSL 路由检查确认 /api/v1/upload-temp 和 /api/v1/algorithms/{algorithm_id:path}/execute 均已注册。
- 运行验证：调用 /api/v1/algorithms/data_utils.chunk_list/execute 成功返回 success=true、output_hint=json 和执行结果。
- 已重启 WSL 后端与 code-server：后端 8000 返回 200，code-server 8080 返回 302；实际服务页 /algo-lib 可检索到 	estFullpage、
unFullTest 和 /api/v1/algorithms/。
### 2026-05-15 21:00:52
- 操作：为 AlgoLib 新增演示算法集合，写入 lgorithms_root/demo/folder_config.json 和 18 个 demo_*.py 独立算法文件，覆盖 int/float/str/text/bool/list/dict/dataframe/Literal/Optional/url/datetime/color/password/image/images/file/chart/mixed 输出等类型。
- 验证：本地 python -m py_compile algorithms_root/demo/demo_*.py 通过；AST 校验每个文件仅一个公开函数，input_example JSON 与函数参数一致；后端 API 注册到 demo 命名空间共 18 个 demo。
- 同步：已复制 lgorithms_root/demo/folder_config.json 和 demo_*.py 到 WSL /home/guan/code-server-me/algorithms_root/demo/。
- 重启：已重启 WSL 中 uvicorn 后端  .0.0.0:8000 与 code-server 127.0.0.1:8080。
- 复用规则：新增算法 demo 时保持每个算法一个独立 .py 文件；@algo_meta.input_example 的 key 必须与函数签名一致；文件/图片 demo 不依赖 pandas/numpy，Pillow 仅作为图片处理的可选依赖。
### 2026-05-18 09:44:04
- 用户要求：验证 lgorithms_root/demo/ 下 18 个 demo 算法是否可被 AlgoLib 扫描、注册和测试，并检查参数/输出推断。
- 扫描配置：config.yaml 已包含 ./algorithms_root 和 ./algorithms_root/demo，无需修改 watch_roots。
- 校验结果：18 个新增 demo 均被 Registry 扫描注册；所有参数 widget_hint 与预期一致，包括 content=text、
ows=dataframe、Optional[str] nullable=True、images=images、ile_path=file。
- 修复：仅修改 demo 文件。demo_dict.py 将返回字段 alues 改为 alue_list，避免被 infer_output_widget 误判为 chart；demo_image.py/demo_images.py 在未安装 Pillow 时原样返回输入 base64，保证输出仍可识别为 image/images。
- 验证：本地和 WSL py_compile 通过；运行中后端确认 18 个预期 demo 全部存在；抽测 /execute 输出 demo_int_float=text、demo_dataframe=table、demo_chart_line=chart、demo_dict=json。
- 同步与重启：已同步 demo 文件到 WSL /home/guan/code-server-me/algorithms_root/demo/；已重启后端 8000 和 code-server 8080，健康检查分别返回 200/302。
### 2026-05-18 10:22:11
- 用户要求：修复全屏测试页关闭后再次点击“测试”无反应，以及 @algo_meta.input_example 不再预填参数的问题。
- 修改 src/browser/pages/algo-lib.html、lgo_management.html、.run/algo-lib-inline-check.js、.run/algo-lib-check.js；未修改后端、未修改 Monaco 初始化逻辑。
- 修复点：openTestPage(algo) 每次都重新解析 lgo.inputExample 到 state._testInputExample，重置测试状态并重新渲染参数/输出；closeTestPage() 仅隐藏 #testFullpage，只清理测试状态，不触碰 state.editing 和编辑器 DOM。
- 新增：hasTestInputExample、illTestParamExample、illAllTestExamples、ensureTestExampleButton；参数卡片有示例时显示“填入示例”，运行栏动态加入“填入全部示例”。
- 同步：已重新提取 .run 两份 JS 检查文件，并同步到 WSL /home/guan/code-server-me/src/browser/pages/algo-lib.html 与实际服务文件 
elease/src/browser/pages/algo-lib.html。
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


## 2026-05-18 17:05 +08:00 - 拆分 algo-lib-check.js 为模块草稿

### 本次操作
- 用户要求基于上一轮方案生成 `.run/algo-modules/` 模块文件，要求从 `.run/algo-lib-check.js` 精确提取，不改业务逻辑。
- 已创建 `.run/algo-modules/`，按原始行序拆成 44 个模块文件，并生成 `.run/algo-modules/README-split-manifest.txt` 记录每个模块对应的原始行号范围。
- 每个模块顶部只新增职责注释；正文逐行来自 `.run/algo-lib-check.js` 对应切片。
- 本次未替换 `.run/algo-lib-check.js` 入口文件，运行时仍使用原巨型文件；模块目录目前是拆分草稿，便于下一步接入 loader/build。

### 验证
- 校验所有非空原始源码行均已被模块覆盖，`missing_nonblank_count = 0`。
- 校验每个模块正文与原文件对应切片完全一致，`body_mismatch = []`。
- 校验所有模块大小均小于 20KB，`over_20kb = []`。
- 执行 `node --check` 检查 `.run/algo-modules/*.js`，全部通过。

### 约束/规则
- 后续如果要真正启用拆分版，应先生成 loader 或运行构建脚本，不要直接删除原 `.run/algo-lib-check.js`。
- 拆分后存在函数覆盖顺序依赖，尤其是 `_isBase64Image`、`_ensureDataUrl`、`showImageFullscreen`、`runFullTest`、`switchOutputTab`、`renderJsonTree`；加载顺序必须遵循 manifest。


## 2026-05-18 17:12 +08:00 - inline-only 模块占位

### 本次操作
- 用户要求基于差异分析生成 inline 版本独有模块。
- 已确认 `.run/algo-lib-inline-check.js` 与 `.run/algo-lib-check.js` 当前 SHA256 完全一致，无 inline 独有函数、无 check 独有函数、无同名不同实现。
- 新增 `.run/algo-modules/inline-only/inline-overrides.js`，仅包含说明注释，作为未来 inline 覆盖共享模块函数的稳定扩展点。

### 约束/规则
- 当前 inline-only 不应包含业务逻辑；如果未来内嵌 code-server 需要差异逻辑，应放入 `inline-only/inline-overrides.js`，并在构建顺序中置于共享模块之后。


## 2026-05-18 17:30 +08:00 - 模块构建脚本与文档

### 本次操作
- 用户要求在模块拆分完成后生成构建脚本和模块说明文档。
- 新增 `.run/build-algo-lib.sh`：支持 `check`、`inline`、`all` 三种构建目标；构建时按模块顺序 concat，并在输出文件顶部写入自动生成注释和时间戳；构建后输出字节数。
- 新增 `.run/algo-modules/README.md`：记录每个模块职责、加载顺序依赖图、开发流程、常见修改场景和 HTML 开发/生产加载方式。
- 检查 HTML 引用：当前 `algo_management.html` 与 `src/browser/pages/algo-lib.html` 仍使用内联脚本，没有直接加载 `.run/algo-lib-check.js`，因此未修改 HTML 文件。

### 验证
- 使用 WSL 执行 `bash -n /mnt/e/code-server-me/.run/build-algo-lib.sh`，脚本语法检查通过。
- 确认 `.run/build-algo-lib.sh` 与 `.run/algo-modules/README.md` 已生成。

### 约束/规则
- 后续修改模块后运行 `bash .run/build-algo-lib.sh all` 生成 `.run/algo-lib-check.js` 与 `.run/algo-lib-inline-check.js`。
- inline 专属覆盖逻辑必须放在 `.run/algo-modules/inline-only/inline-overrides.js`，并保持在共享模块之后加载。
- 现有 HTML 仍是内联脚本；如需页面实际使用拆分产物，需要额外执行项目的 HTML 注入/提取流程，不要误以为 `.run` bundle 自动被页面加载。


## 2026-05-18 17:42 +08:00 - 拆分验证脚本

### 本次操作
- 用户要求生成拆分验证脚本和函数查找脚本。
- 新增 `.run/verify-split.sh`：从 Git `HEAD:.run/algo-lib-check.js` 读取原始版本，执行 `.run/build-algo-lib.sh all`，检查生成文件语法、`grep -c "function "` 计数、函数声明顺序、重复函数集合和 `window.xxx =` 导出完整性。
- 新增 `.run/list-functions.sh`：列出任意模块中的函数声明、箭头函数变量和 `window.xxx` 导出，便于定位函数在哪个模块。
- 已给 `.run/build-algo-lib.sh`、`.run/verify-split.sh`、`.run/list-functions.sh` 添加可执行权限。

### 验证
- `bash -n` 检查 `.run/verify-split.sh` 和 `.run/list-functions.sh` 通过。
- `bash .run/list-functions.sh .run/algo-modules/29-full-test-core.js` 能列出 `openTestPage`、`closeTestPage`、`renderTestParamCards` 等函数。
- `bash .run/verify-split.sh` 通过：原始/生成 `function` 行计数均为 487；函数声明顺序一致；重复函数名集合与原始一致（7 个）；`window` 导出数量均为 276；生成 check/inline bundle 的 `node --check` 通过。

### 约束/规则
- `.run/verify-split.sh` 会重建 `.run/algo-lib-check.js` 和 `.run/algo-lib-inline-check.js`，运行前后不要手工编辑这两个生成文件。
- 如果未来模块中故意新增或删除全局函数，需要同步理解 `verify-split.sh` 的基准仍来自 Git HEAD；在提交新基准后验证才会以新版本为准。


## 2026-05-18 17:55 +08:00 - 前端模块架构文档与产物忽略规则

### 本次操作
- 用户要求补充构建产物是否忽略的建议，并生成 `.run/ARCHITECTURE.md`。
- 修改 `.gitignore`：新增 `.run/algo-lib-check.js` 与 `.run/algo-lib-inline-check.js` 忽略规则，建议将 `.run/algo-modules/` 作为源码、bundle 作为构建产物。
- 新增 `.run/ARCHITECTURE.md`：记录前端架构、模块职责速查、AI 助手上下文说明和标准修改流程。

### 约束/规则
- 注意：`.run/algo-lib-check.js` 和 `.run/algo-lib-inline-check.js` 当前已经被 Git 跟踪，`.gitignore` 不会自动停止跟踪已有文件；若确认部署不需要提交 bundle，需要后续手动执行 `git rm --cached .run/algo-lib-check.js .run/algo-lib-inline-check.js`。
- 如果部署环境不能运行 `.run/build-algo-lib.sh`，则应移除 `.gitignore` 中这两条规则，并继续提交构建产物。
- 后续每次修改前端模块前，先读 `.run/ARCHITECTURE.md` 定位模块，再读 `log/codex-operations.md` 复用已有规则。


## 2026-05-18 18:15 +08:00 - 构建脚本自动注入 HTML

### 本次操作
- 用户要求 `.run/build-algo-lib.sh` 在 `all` 或 `inject` 下自动把 `.run/algo-lib-inline-check.js` 注入 `src/browser/pages/algo-lib.html`。
- 修改 `src/browser/pages/algo-lib.html`：在主内联 `<script>` 内增加 `// ==== ALGO-LIB-JS-START ==== / // ==== ALGO-LIB-JS-END ==== ` 标记。
- 修改 `.run/build-algo-lib.sh`：新增 `inject` 与 `dev` 子命令；`all` 现在会构建 check/inline 并注入 HTML；`dev` 会执行 all 后调用 `ci/dev/sync-and-restart.sh --full`。
- 注入前安全检查：HTML 存在、START/END 标记各出现一次、inline JS 非空；注入前备份 `src/browser/pages/algo-lib.html.bak`。
- 更新 `.run/ARCHITECTURE.md` 与 `.run/algo-modules/README.md` 的构建流程说明。

### 验证
- `bash -n .run/build-algo-lib.sh` 通过。
- `bash .run/build-algo-lib.sh all` 成功生成 `.run/algo-lib-check.js`、`.run/algo-lib-inline-check.js` 并注入 `src/browser/pages/algo-lib.html`。
- `bash .run/verify-split.sh` 通过：函数数量、函数顺序、重复函数集合和 window 导出均与 Git HEAD 原始版本一致。

### 约束/规则
- 现在标准前端模块流程是：改 `.run/algo-modules/*.js` → `bash .run/build-algo-lib.sh all` → HTML 已自动注入 → 如需 WSL 重启则运行 `bash .run/build-algo-lib.sh dev`。
- `ci/dev/sync-and-restart.sh` 排除 `.run/` 不影响注入后的页面，因为同步目标是 `src/browser/pages/algo-lib.html`。
- 如果从 `/mnt/e/code-server-me` 运行 `dev`，脚本会优先调用 `/home/guan/code-server-me/ci/dev/sync-and-restart.sh` 来完成 Windows→WSL 同步；可用 `ALGOLIB_WSL_PROJECT_DIR` 覆盖目标路径。


## 2026-05-18 23:25 +08:00 - 后续构建注入与 WSL 同步约定

### 本次操作
- 用户要求以后每次修改后，由 Codex 负责完成前端模块构建与 HTML 注入步骤。
- 用户只希望自己执行 WSL 同步重启命令：
  `wsl bash -lc "cd /home/guan/code-server-me && bash ci/dev/sync-and-restart.sh --full"`

### 约束/规则
- 后续凡是修改 `.run/algo-modules/`、`.run/algo-modules/inline-only/` 或任何会影响内联前端 JS 的文件，Codex 修改完成后必须运行 `bash .run/build-algo-lib.sh all` 完成构建与注入。
- Codex 不应默认替用户执行 WSL 同步重启；除非用户明确要求，否则最终只提示用户运行上述 `wsl bash -lc ... sync-and-restart.sh --full` 命令。
- 修改前端模块时先读取 `.run/ARCHITECTURE.md` 和本日志，复用构建、注入、同步约定。


## 2026-05-18 23:30 +08:00 - 全屏测试输出 Tab 改造

### 本次操作
- 用户要求把测试输出区从“原始输出/结构化/图表”三 Tab 改为用户主动选择的八种展示方式。
- 修改 `.run/algo-modules/39-output-utils-run.js`：将最终输出路由改为 `raw/json/table/line/bar/pie/image/file`，保留旧 `renderStructuredOutput` 兼容入口。
- 修改 `.run/algo-modules/40-output-renderers.js`：新增宽松字段匹配、统一转换失败提示、表格/折线图/柱状图/饼图/图片/文件下载的 `tryRender*` 系列函数。
- `src/browser/pages/algo-lib.html` 的静态 `#outputTabs` 已调整为八个中文按钮。

### 约束/规则
- 新输出 Tab 是“尝试转换”而不是只依赖后端 `output_hint`；转换失败必须显示中文友好提示和支持结构示例。
- 图表相关字段名使用宽松同义词：`labels/categories/name/x/类别/标签/名称` 与 `values/data/count/y/数值/数量/值`。
- ECharts 不可用时降级显示 JSON，不阻断测试页面。


## 2026-05-19 09:20 +08:00 - 全屏测试页 DOM 丢失修复

### 本次操作
- 用户反馈编辑器工具栏“测试”按钮无反应，返回列表后卡片“测试”也失效。
- 修改 `.run/algo-modules/29-full-test-core.js`：新增 `_createTestFullpageElement()`，当 `#testFullpage` 被 `#main.innerHTML` 重绘删除后，可动态重建完整测试页 DOM。
- 修改 `openTestPage()`：不再依赖 `#main` 内已有测试页；测试页固定挂载到 `document.body`，避免后续编辑器重绘再次删除。
- `closeTestPage()` 继续只隐藏测试页并清理测试状态，不移除 DOM，不触碰 `state.editing`。

### 验证
- 已运行 `bash .run/build-algo-lib.sh all`，生成 check/inline bundle 并注入 `src/browser/pages/algo-lib.html`。
- 已运行 `node --check .run/algo-lib-check.js && node --check .run/algo-lib-inline-check.js`，语法检查通过。

### 约束/规则
- 全屏测试页这类跨页面浮层不要挂在 `#main` 内；`#main` 会被列表页、编辑页反复 `innerHTML` 重建。
- 需要跨页面保持的 DOM 应挂到 `document.body`，关闭时优先隐藏而不是删除。


## 2026-05-19 09:45 +08:00 - 全屏测试输出八 Tab 最终路由修复

### 本次操作
- 用户反馈输出区八个 Tab 仍被旧 `switchOutputTab` 逻辑兜底为原始输出。
- 修改 `.run/algo-modules/39-output-utils-run.js`：最终生效的 `switchOutputTab` 明确支持 `raw/json/table/line/bar/pie/image/file`，运行完成后按 `output_hint` 和数据结构自动切到合适 Tab。
- 修改 `.run/algo-modules/40-output-renderers.js`：重写宽松表格/折线图/柱状图/饼图/图片/文件下载转换函数，并保留旧渲染函数和兼容入口。
- 修改 `src/browser/pages/algo-lib.html`：将 ECharts CDN 放入 `<head>`，避免图表 Tab 使用时库未加载。

### 约束/规则
- 39 模块是最终输出路由层，会覆盖 32 模块中的旧兼容实现；新增输出 Tab 的路由必须优先在 39 中改。
- 40 模块负责具体渲染和转换失败提示；不要删除 `renderOutput*` 旧入口，保持旧调用链兼容。
- 图表初始化统一使用 `echarts.init(container, "dark")`，切换 Tab 后延迟 resize。

### 验证
- 已运行 `node --check .run/algo-modules/39-output-utils-run.js` 与 `node --check .run/algo-modules/40-output-renderers.js`，语法检查通过。
- 已按用户要求运行 `bash .run/build-algo-lib.sh dev`，完成 check/inline bundle 构建、注入 HTML、同步 WSL 并重启服务。
- 已运行 `node --check .run/algo-lib-check.js` 与 `node --check .run/algo-lib-inline-check.js`，生成产物语法检查通过。


## 2026-05-19 10:10 +08:00 - 全屏测试示例值入口调整

### 本次操作
- 用户要求保留测试页打开时自动填入 `inputExample` 的行为，但将“填入全部示例”按钮从底部运行栏移动到参数输入区顶部。
- 修改 `.run/algo-modules/29-full-test-core.js`：新增 `renderTestExampleTopButton()`，仅当 `state._testInputExample` 有内容时显示“一键填入示例值”按钮。
- 修改 `openTestPage()`：有示例值时，输出区显示“已根据算法示例自动填入参数，点击「运行测试」即可查看结果”。
- 保留 `ensureTestExampleButton()` 作为空操作，兼容旧调用链。

### 约束/规则
- 全屏测试页示例填充逻辑集中在 29 模块维护；旧运行栏按钮入口不再新增真实按钮。
- 打开测试页时自动填入示例值不能删除，手动一键按钮只是补充入口。

## 2026-05-19 10:26:02 +08:00
- 修改 .run/algo-modules/08-workspace-core.js：新建算法工作区移除可见的算法形态下拉，默认多文件模式。
- 保留隐藏 #wsKind=complex 兼容保存/测试逻辑，避免影响外部导入模式。
- 模板选项简化为基础算法/数据质量，均生成 main.py + utils.py。
- 增加工作区文件列表的新增文件与删除文件能力；按用户约束仅改 08 模块，通过运行时覆盖 renderWorkspaceFiles 接入按钮。
- 复用规则：修改模块后运行 bash .run/build-algo-lib.sh dev 完成构建、注入、同步 WSL /home/guan/code-server-me 并重启。

## 2026-05-19 10:59:55 +08:00
- 修复新建算法工作区文件列表按钮拥挤：改为紧凑网格行，文件名独占一列，改名/删除按钮固定宽度。
- 修复“测试当前文件”：不再因默认多文件模式直接返回，改为打开全屏测试页，并用当前 Monaco 文件源码通过 /api/v1/run-source 执行。
- 保存新建算法/包时提交 wsKwargs 为 input_example；packages/create 写装饰器时同步 input_example，保证扫描后测试页能自动填入示例。
- 修改模块后执行 build-algo-lib.sh dev，保持构建、注入、同步 WSL /home/guan/code-server-me 与重启流程一致。

## 2026-05-19 11:22:39 +08:00
- 修复已有算法无 input_example 时测试页参数为空：`.run/algo-modules/29-full-test-core.js` 增加按参数控件类型生成默认示例值的兜底逻辑。
- 调整后端源码展示/保存链路：`algorithm-source` 返回给编辑器前剥离 `from algo_service.sdk.decorators import algo_meta` 与 `@algo_meta(...)`，保存入口文件时由后端自动补回平台装饰器。
- 修改 `algo_service/routers/algorithms.py` 与 `algo_service/routers/packages.py`，确保单文件、多文件包入口文件保存都自动包装元数据，用户编辑区只暴露业务代码。
- 验证：已运行 `node --check .run/algo-modules/29-full-test-core.js` 与 `python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py`。

## 2026-05-19 15:15:00 +08:00
- 将算法管理前端改为离线依赖：`.run/algo-modules/12-editor-shell.js` 的 Monaco `vs` 路径改为本地后端静态资源基址 `window._ALGO_STATIC_BASE || window._ALGO_BASE || http://127.0.0.1:8000`。
- 修改 `src/browser/pages/algo-lib.html`：移除 jsdelivr CDN，改为从本地 `/static/vendor/` 加载 Monaco loader、ECharts、xterm 及其插件；由于 code-server 的 8080 `/static` 返回 404，HTML 用本地后端 8000 作为默认静态资源基址。
- 修改 `algo_service/main.py`：挂载 `src/browser/static` 到 FastAPI `/static`，供嵌入 code-server 的页面加载离线 vendor 资源。
- 新增 `scripts/download-vendor-deps.sh`：一键下载 ECharts、Monaco 0.45.0、xterm 相关资源到 `src/browser/static/vendor/`。
- 更新 `.gitignore`：忽略 `src/browser/static/vendor/`；部署到新环境时需运行下载脚本，或取消忽略并提交 vendor 文件。
- 验证：已运行 `bash .run/build-algo-lib.sh dev` 完成构建、注入、同步 WSL `/home/guan/code-server-me` 并重启；`node --check` 两个 bundle 通过，`python -m py_compile algo_service/main.py` 通过，`curl -I` 验证 8000 下 ECharts 与 Monaco loader 均返回 200。
- 注意：不要直接在 Windows 挂载路径执行 `bash ci/dev/sync-and-restart.sh --full`；这会把源和目标误判为 `/mnt/e/code-server-me` 并可能尝试从错误的 release 目录启动。常规修改后继续使用 `bash .run/build-algo-lib.sh dev`，或按用户手动命令在 WSL 内执行 `cd /home/guan/code-server-me && bash ci/dev/sync-and-restart.sh --full`。

## 2026-05-19 16:10:38 +08:00
- 修复 code-server 离线 Webview/Simple Browser 仍访问 `vscode-cdn.net` 的问题。`patches/webview.diff` 已与当前 `lib/vscode` 版本不完全匹配，因此按补丁意图手工应用等价修改。
- 修改 VS Code 源码与构建产物：`webClientServer.ts`/`server-main.js` 增加本地 `webviewEndpoint`；`environmentService.ts`/`workbench.js` 优先使用本地 webview endpoint；`pre/index.html` 与 `webWorkerExtensionHostIframe.html` 增加同源 hostname 绕过并放宽脚本 CSP，避免离线 hash 不匹配。
- 关键规则：`ci/dev/sync-and-restart.sh` 默认排除 `lib/`，且当前 code-server 实际从 WSL 的 `release/lib/vscode/out/` 运行。Webview 底层修复必须同步到 `/home/guan/code-server-me/release/lib/vscode/out/`，普通前端同步不会覆盖这些 runtime 文件。
- 已手动同步补丁到 WSL `/home/guan/code-server-me`，并直接补丁 `release/lib/vscode/out/server-main.js`、`release/lib/vscode/out/vs/code/browser/workbench/workbench.js`、`release/lib/vscode/out/vs/workbench/contrib/webview/browser/pre/index.html`、`release/lib/vscode/out/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`。
- 验证：`release` 下 `server-main.js` 已包含 `webviewEndpoint`，`workbench.js` 已包含 `new URL(this.options.webviewEndpoint, window.location.toString())`，webview `index.html` 已包含 `parent.hostname === hostname`；`node --check` 通过。
- 已重启 WSL code-server full build。`curl http://127.0.0.1:8080/` 返回的页面配置中 `webviewEndpoint` 为本地 `/stable-.../static/out/vs/workbench/contrib/webview/browser/pre`，并且不再出现 `vscode-cdn.net`。

## 2026-05-19 17:20:00 +08:00 - 新建算法模板支持分块设计
- 当前开发环境已简化为 Windows 本地 FastAPI + 静态 HTML，不再处理 WSL/code-server/Webview 相关流程；修改模块后使用 `bash .run/build-algo-lib.sh all` 构建并注入 HTML。
- 修改 `.run/algo-modules/08-workspace-core.js`：新建算法模板表单增加“编辑模式”下拉，支持“普通代码 / 分块设计”；分块模式会隐藏普通文件编辑网格，显示 `#wsBlockDesignerShell` 并用默认分块初始化现有 block editor。
- 修改 `.run/algo-modules/42-block-editor-core.js`：`initBlockEditor(container, item, initialBlocks)` 支持传入新建态 blocks，跳过 API 加载，直接进入设计模式；新建模板隐藏“进入/退出设计模式”切换按钮。
- 修改 `.run/algo-modules/10-workspace-monaco-save.js`：保存新建模板时，如果处于分块设计模式，会同步所有分块编辑器，将分块代码按顺序拼接为源码，并把 `blocks` 数组随 `/api/v1/algorithms/create` 一起提交。
- 修改 `algo_service/models/schemas.py` 与 `algo_service/routers/algorithms.py`：`AlgorithmCreateRequest` 新增可选 `blocks` 字段；创建模板时保存 `{func_name}.blocks.json`，与现有 `GET /api/v1/templates/{id}/blocks` 读取路径保持一致。
- 验证：已运行 `bash .run/build-algo-lib.sh all` 完成 check/inline bundle 构建并注入 `src/browser/pages/algo-lib.html`；`node --check` 两个 bundle 和相关模块通过；`python -m py_compile algo_service/routers/algorithms.py algo_service/models/schemas.py` 通过。

## 2026-05-20 09:30:00 +08:00 - 新建算法参数示例改为按参数控件填写
- 用户要求删除新建算法/模板里的“测试参数 JSON”大文本框，改为点击“识别参数”后为每个参数显示对应类型的示例值输入控件。
- 修改 `.run/algo-modules/08-workspace-core.js`：移除 `#wsKwargs` 表单行；`renderWidgetConfigRows()` 每行新增“示例”输入区，按 widget 渲染 number/select/input/textarea，并维护 `newAlgoState.paramExamples`。
- 修改 `.run/algo-modules/10-workspace-monaco-save.js`：`testWorkspaceSource()` 不再读取 `#wsKwargs`，而是从参数示例控件收集并转换 kwargs；保存草稿时将示例对象 `JSON.stringify(...)` 写入 `input_example`。
- 修改 `.run/algo-modules/07-categories.js`：`newAlgoState` 新增 `paramExamples` 字段。
- 后端核对结果：`AlgorithmCreateRequest`、`/api/v1/algorithms/create` 和 `/api/v1/packages/create` 已支持 `input_example` 持久化，无需额外改接口。
- 验证：已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 HTML；`node --check` 相关模块和两个 bundle 通过；`python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/models/schemas.py` 通过。

## 2026-05-20 09:55:00 +08:00 - 修复 widget_overrides、正式发布和输入示例保存
- 修改 `algo_service/sdk/decorators.py`：`algo_meta()` 增加 `widget_overrides` 可选参数，并写入函数 `_algo_meta` 元数据，解决动态加载用户算法时报 `unexpected keyword argument 'widget_overrides'`。
- 修改 `.run/algo-modules/08-workspace-core.js`：参数控件配置中的示例值输入框不再显示任何 placeholder，避免误导用户。
- 修改 `algo_service/routers/publish.py`：`_set_status()` 增加 `force` 参数，正式发布接口使用强制发布，避免管理员从草稿直接发布时报 `Invalid transition: draft -> published`。
- 修改 `.run/algo-modules/15-editor-inline-test-panel.js` 与 `.run/algo-modules/41-init-exports.js`：编辑器内测试面板新增“保存为输入示例”按钮，调用 `PATCH /api/v1/algorithms/{id}/metadata` 持久化当前参数。
- 修改 `algo_service/routers/algorithms.py`：metadata 更新包算法 manifest 时也带上 `input_example` 字段，保持字段链路一致。
- 规则：每次修改前端模块后必须运行 `bash .run/build-algo-lib.sh all`，确保 `.run/algo-lib-inline-check.js` 重新注入到 `src/browser/pages/algo-lib.html`。
- 验证：已运行 `python -m py_compile algo_service/sdk/decorators.py algo_service/routers/publish.py algo_service/routers/algorithms.py`；已运行 `node --check` 检查修改模块和两个 bundle；已运行 `bash .run/build-algo-lib.sh all` 完成构建和注入。

## 2026-05-20 11:20:00 +08:00 - 补齐正式发布路径与编辑器参数配置
- 用户直接打开 `src/browser/pages/algo-lib.html` 是正确入口；前端模块改完后必须先构建并注入，否则页面仍会显示旧逻辑。
- 确认 `.run/algo-modules/08-workspace-core.js` 的 `renderWidgetConfigRows()` 不再调用 `defaultExampleForParam(param)`，识别参数后的示例值为空，`defaultExampleForParam` 仅作为未调用的旧工具保留。
- 修改 `.run/algo-modules/17-algo-info-admin-publish.js`：管理员“正式发布”从旧的 `/admin-publish` 改为调用后端已有 `/publish`，并随请求提交版本迭代与基础 metadata。
- 修改 `algo_service/routers/algorithms.py`：`_entry_config_path()` 优先检查真实存在的 `algopack.json`，不存在时回退到 `folder_config.json`，避免普通目录算法发布时错误查找 `algopack.json`。
- 修改 `algo_service/routers/publish.py`：发布请求体兼容 `note/version_bump/metadata`，`publish_algorithm()` 使用 force 发布并写入版本、中文名、描述、标签等元信息。
- 修改 `.run/algo-modules/15-editor-inline-test-panel.js` 与 `.run/algo-modules/41-init-exports.js`：编辑器测试面板新增“识别参数 / 保存参数配置”，可从当前代码重新识别参数、调整控件类型和输入示例，并保存 `widget_overrides` 与 `input_example`。
- 验证：已运行 `node --check` 检查相关模块和两个 bundle；已运行 `python -m py_compile algo_service/routers/algorithms.py algo_service/routers/publish.py algo_service/sdk/decorators.py`；已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`。

## 2026-05-20 11:55:00 +08:00 - 修复示例空值双引号、发布首点报错和编辑参数入口
- 用户反馈新建算法识别参数后示例框仍显示 `""`，原因是空字符串进入 JSON/list/dataframe 示例格式化函数后被 `JSON.stringify("")` 渲染成双引号。
- 修改 `.run/algo-modules/08-workspace-core.js`：`formatWorkspaceExampleValue()` 对空字符串直接返回空字符串，`renderWidgetConfigRows()` 继续保持不自动写入默认示例。
- 修改 `.run/algo-modules/15-editor-inline-test-panel.js`：编辑器参数示例格式化同样对空字符串直接返回空字符串；新增 `openEditorParamConfig()`，用于从编辑器工具栏直接展开测试面板并识别当前代码参数。
- 修改 `.run/algo-modules/12-editor-shell.js` 与 `.run/algo-modules/41-init-exports.js`：编辑器工具栏增加“参数配置”按钮，并导出 `window.openEditorParamConfig`。
- 修改 `algo_service/routers/algorithms.py`：正式发布私有算法时，移动目录后重新定位真实存在的 `folder_config.json` 或 `algopack.json`，避免第一次发布移动目录后仍按旧路径读取 manifest 导致首点失败、第二次才成功。
- 验证：已运行 `node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`、`python -m py_compile algo_service/routers/algorithms.py`；已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`。

## 2026-05-20 12:35:00 +08:00 - 公有贡献历史与代码片段修改审核
- 后端 `algo_service/routers/algorithms.py` 的 `_entry_dict()` 新增 `contributors` 字段，从算法/模板目录的 `publish_history.json` 提取已发布贡献记录，供基本信息弹窗展示贡献人、时间和版本变化。
- 后端 `algo_service/routers/publish.py` 的发布历史记录补充 `operator_name/from_version/to_version/action_type`，管理员正式发布时会把前端传入的当前用户显示名写入历史。
- 后端 `algo_service/routers/snippets.py` 增加代码片段 `history` 与 `review_draft` 持久字段，并新增 `/snippets/{id}/edit-draft`、`/approve-edit`、`/reject-edit` 接口；公有片段编辑先进入审核草稿，管理员通过后才覆盖公有内容。
- 前端 `06-cards-list.js`、`22-snippets.js` 增加公有代码片段“编辑 / 复制 / 修改记录”入口；编辑公有片段时保存按钮变为“提交修改”，不会直接改公有内容。
- 前端 `23-settings-review-sse.js` 的审核页合并显示代码片段发布审核和公有片段修改审核，管理员可在同一页面通过或驳回片段修改。
- 前端 `17-algo-info-admin-publish.js`、`21-review-admin-actions.js` 增加贡献记录/贡献人显示；`41-init-exports.js` 导出片段 fork、历史、通过修改和驳回修改函数。
- 验证：已运行 Python `py_compile` 检查相关后端文件；已运行 `node --check` 检查修改模块和两个 bundle；已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`。

## 2026-05-21 09:47:47 +08:00 - 修复包文件保存入口字段名
- 修改 `algo_service/routers/packages.py`：`save_package_file()` 判断入口文件时从错误的 `package.entry` 改为 `package.entry_file`，匹配 `AlgorithmPackage` dataclass 的真实字段名。
- 全局检查 `packages.py`，确认没有其他 `package.entry` 误用。
- 验证：已运行 `python -m py_compile algo_service/routers/packages.py`；因 8000 端口已有服务监听，使用临时端口 `18000` 运行 `python -m uvicorn algo_service.main:app --host 127.0.0.1 --port 18000 --reload` 并访问 `/docs` 返回 200，随后关闭该临时验证进程。

## 2026-05-21 10:13:02 +08:00 - 防止普通用户直接覆盖公有多文件算法
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：`saveCurrentFile()` 在单文件和 package 分支之前统一判断权限，非 owner 的普通用户保存公有算法时会先另存为私有草稿。
- 修改 `_saveAsPrivateDraft()`：当当前算法有 `packageId` 时调用 `/api/v1/packages/create` 创建完整多文件私有副本，并带上所有 Monaco model 文件、入口文件、exports、metadata、输入示例和控件覆盖配置；创建后重新加载列表并切换到新私有算法。
- 修改 `algo_service/routers/packages.py`：新增 package 写入权限校验，普通用户不能直接写入 `owner_id == system` 的公有 package；私有 package 仅 owner 或 admin 可写；保存入口文件继续使用 `package.entry_file`。
- 验证：已运行 `node --check .run/algo-modules/14-editor-save-namespace.js`、`python -m py_compile algo_service/routers/packages.py`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-21 10:41:28 +08:00 - 隔离公有算法另存私有草稿路径
- 修改 algo_service/routers/algorithms.py：认证用户通过 /api/v1/algorithms/create 创建或另存算法时，一律落到 algorithms_root/users/{user_id}/{namespace}_{funcName}/，不再复用 namespace/funcName 目录，避免覆盖已发布公有算法的 folder_config.json。
- 修改 algo_service/sdk/registry.py：带 owner_id 的 package 创建使用 users/{user_id}/{namespace}_{name}/ 扁平目录，避免私有多文件草稿与同命名空间公有 package 的物理路径冲突。
- 确认 algo_service/routers/packages.py 中 package 文件保存仍使用 package.entry_file，并保留公有/私有 package 写入权限校验。
- 验证：已运行 python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/sdk/registry.py；已运行 node --check .run/algo-modules/14-editor-save-namespace.js。
- 追加验证：用临时目录调用 AlgorithmRegistry.create_package(owner_id=usr_test)，确认私有 package 物理路径为 custom_my_algorithm，且不会创建 custom/my_algorithm。

## 2026-05-21 11:08:53 +08:00 - ???????????????????
- ?? `algo_service/routers/publish.py`???????????? `action_type` ? `submit/approve/reject/publish/withdraw/deprecate`??? `from_version/to_version/operator/operator_name`?`publish-history` ??????????????
- ?? `algo_service/routers/algorithms.py`??????????? `publish_history.json` ?? `code_save` ?????????????
- ?? `algo_service/routers/packages.py`?package ??????????? `code_save` ?????????? package entry??????????????
- ?? `.run/algo-modules/17-algo-info-admin-publish.js`?????????????????????????????????? `/api/v1/algorithms/{id}/publish-history`?????????? 50 ???????????
- ?? `.run/algo-modules/41-init-exports.js`??? `window.loadAlgorithmHistory`?
- ?????? `python -m py_compile algo_service/routers/publish.py algo_service/routers/algorithms.py algo_service/routers/packages.py`???? `node --check` ????????? bundle???? `bash .run/build-algo-lib.sh all` ??????? `src/browser/pages/algo-lib.html`?

## 2026-05-21 修复基本信息弹窗中文乱码
- 问题：上次修改 `.run/algo-modules/17-algo-info-admin-publish.js` 时，基本信息弹窗部分中文被写成 `????`，构建注入后页面显示乱码。
- 修复：恢复弹窗标题、字段名、修改记录表头、按钮和历史动作映射为中文。
- 已执行：`bash .run/build-algo-lib.sh all`，并通过 `node --check .run/algo-lib-check.js` 与 `node --check .run/algo-lib-inline-check.js`。

## 2026-05-21 11:18:00 +08:00 - 修复修改记录加载与另存私有草稿返回卡住
- 修改 `algo_service/routers/algorithms.py`：新增 `/api/v1/algorithms/{id}/publish-history` 显式路由，并放在通配详情路由之前，避免前端基本信息弹窗请求被 `/algorithms/{id}` 吃掉导致“加载失败”。
- 修改 `algo_service/routers/algorithms.py`：`_entry_from_client_id()` 支持解析前端私有算法 id 的 `@@owner_id` 后缀，确保私有算法的修改记录、保存和详情定位到正确 owner。
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：公有算法另存私有草稿后，会同时刷新当前页、父级算法页和“我的算法”数据，并高亮/切换到新私有草稿，避免返回列表只剩骨架或无法继续操作。
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：关闭编辑器时延迟恢复滚动位置，让 `switchPage()` 完成异步渲染后再恢复，减少返回后页面卡在加载态的问题。
- 修改 `.run/algo-modules/17-algo-info-admin-publish.js`：正式发布后按当前页父级刷新列表，支持在分类子页中正确重绘卡片。
- 验证：已运行 `python -m py_compile algo_service/routers/algorithms.py`、`node --check` 检查相关模块和两个 bundle；已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`；确认 `publish-history` 路由注册顺序位于通配详情路由之前。

## 2026-05-21 20:53:42 +08:00 - 完成公有算法另存私有草稿与版本迭代关联
- 后端 `algo_service/routers/algorithms.py`：`AlgorithmCreateRequest` 新增 `target_public_id/target_public_call_prefix`，认证用户新建或另存算法一律写入 `algorithms_root/users/{user_id}/{namespace}_{funcName}/`，并禁止同一用户重复创建同名私有草稿，避免覆盖公有目录。
- 后端 `algo_service/routers/algorithms.py`：`_entry_dict()` 返回 `targetPublicId/targetPublicCallPrefix`；提交审核时优先读取私有草稿中的目标公有算法信息，自动识别“版本迭代”类型；发布版本迭代后会把私有草稿代码应用到目标公有算法，并清理私有草稿目录。
- 后端 `algo_service/routers/algorithms.py`：新增 `/api/v1/algorithms/check-duplicate`，用于按 owner 范围检查同名算法；新建发布时如已有同名公有算法会返回冲突提示。
- 后端 `algo_service/sdk/registry.py`：私有 package 继续使用扁平目录，并在 `algopack.json` 中保留 `target_public_id/target_public_call_prefix`，支持多文件算法版本迭代关联。
- 后端 `algo_service/routers/packages.py`：确认 package 文件保存使用 `package.entry_file`，并保留公有 package 普通用户禁止直写、私有 package 仅 owner/admin 可写的权限校验。
- 前端 `.run/algo-modules/14-editor-save-namespace.js`：普通用户保存公有算法时会另存为私有草稿；若函数名未变，会向后端传入原公有算法 id 和调用前缀作为版本迭代关联；另存后不再重新打开编辑器，避免返回列表时卡在骨架屏。
- 前端 `.run/algo-modules/10-workspace-monaco-save.js`：新建算法保存前增加后端同 owner 重名检查，允许公有与私有同名共存，但禁止同一用户私有空间同名。
- 构建与验证：已运行 `python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/sdk/registry.py algo_service/models/schemas.py`；已运行 `node --check` 检查修改模块和两个 bundle；已运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`。

## 2026-05-21 21:04:43 +08:00 - 恢复审核相关弹窗中文
- 修复 `.run/algo-modules/20-review-submit.js`：恢复提交审核、版本迭代提示、驳回记录查看、撤回/放弃修改等弹窗中文，保留 `targetPublicId/targetPublicCallPrefix` 自动识别版本迭代的逻辑。
- 修复 `.run/algo-modules/21-review-admin-actions.js`：恢复管理员审核通过、版本选择、代码对比、驳回、发布、版本历史、API 文档、删除确认等弹窗中文。
- 构建与验证：已运行 `node --check .run/algo-modules/20-review-submit.js`、`node --check .run/algo-modules/21-review-admin-actions.js`、`python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/sdk/registry.py algo_service/models/schemas.py`；已运行 `bash .run/build-algo-lib.sh all` 完成构建注入，并通过两个 bundle 的 `node --check`；已用 `rg` 确认构建产物中不再包含本次相关中文乱码片段。

## 2026-05-21 21:42:12 +08:00 - 继续公有算法另存私有草稿任务收尾
- 复查公有算法编辑保护链路：前端 `14-editor-save-namespace.js` 中非 owner 保存会走 `_saveAsPrivateDraft()`，不会直接写公有单文件或 package；同名未改时会提交 `target_public_id/target_public_call_prefix` 用于后续版本迭代。
- 复查后端链路：`algorithms.py` 已支持私有草稿物理隔离、同 owner 重名检查、`check-duplicate`、版本迭代审核与发布；`packages.py` 已使用 `package.entry_file`，未发现 `package.entry` 误用。
- 复查乱码：`20-review-submit.js`、`21-review-admin-actions.js` 和 `17-algo-info-admin-publish.js` 未发现连续问号界面文案；构建产物中剩余的 `????` 位于模块头部注释，不影响页面显示。
- 验证：已运行 `node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`、`python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/sdk/registry.py algo_service/models/schemas.py`；已重新运行 `bash .run/build-algo-lib.sh all` 完成构建并注入 `src/browser/pages/algo-lib.html`。

## 2026-05-22 10:49:26
- 修改 `algo_service/sdk/registry.py`：将 `AlgorithmRegistry._store` 从单 entry 字典改为 `dict[str, list[AlgorithmEntry]]`，支持同一 namespace/function 下公有 `system` 与用户私有算法共存。
- 新增/调整注册与查询语义：同 id 同 owner 替换、不同 owner 追加；`get_by_id()` 公有优先；新增 `get_by_id_and_owner()`；`get_all()` 展平返回全部。
- 为 `AlgorithmPackage` 增加 `owner_id`，package 重扫时只替换同 package、同 owner 的 entries，避免覆盖其他 owner 的同名算法。
- 验证：`python -m py_compile algo_service/sdk/registry.py` 通过；最小脚本验证公私同名共存、owner 查询、替换、删除通过。

## 2026-05-22 11:18:00
- 复查并补齐 `algo_service/routers/publish.py` 的提交审核快照逻辑：`ReasonBody` 支持 `is_version_iteration`，`submit_algorithm()` 会在进入 `reviewing` 前保存 `.review_draft_*.json`，包含文件快照、元数据、版本迭代目标和基础公有版本。
- 修复 `publish.py` 中 `_get_entry()` / `_find_history_entry()`：支持解析前端私有算法 id 的 `@@owner_id` 后缀，避免私有草稿提交审核时误定位到公有算法或 404。
- 验证：`python -m py_compile algo_service/routers/publish.py` 通过；脚本验证 `ReasonBody(is_version_iteration=True)` 可正常解析。

## 2026-05-22 11:37:00
- 修改 `algo_service/routers/publish.py`：重写 `approve_algorithm()` 的有审核草稿路径，审核通过后直接发布并返回 `autoPublished: true`。
- 版本迭代审核：读取 `review_draft.target_public_id`，将草稿文件应用到目标公有算法，更新版本和发布状态，记录 `iteration` 历史，删除私有草稿目录并全量重扫 registry。
- 新发布审核：将草稿文件应用到当前私有算法，检查同名公有冲突后移动到公有目录，移除 `owner_id/target_public_*`，设置 `publish_status=published` 并记录 `new_publish` 历史。
- 验证：`python -m py_compile algo_service/routers/publish.py` 通过；导入脚本确认新增 approve helper 均可加载。
## 2026-05-22 15:21:15
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：`_saveAsPrivateDraft(skipReload)` 支持保存并返回时跳过编辑器内列表预刷新；`saveCurrentFile(forClose)` 与 `saveAndCloseEditor()` 使用该路径，避免另存私有草稿后又立即触发第二次列表加载。
- 修改 `.run/algo-modules/05-data-loading.js`：列表数据加载增加 15 秒超时保护；卡片渲染后若仍为空或停留在骨架屏，显示空状态/错误信息，避免永久骨架屏。
- 已执行 `bash .run/build-algo-lib.sh all`，完成合并与注入到 `src/browser/pages/algo-lib.html`；已执行 `node --check .run/algo-lib-check.js` 和 `node --check .run/algo-lib-inline-check.js`。

## 2026-05-22 16:40:06
- 修复提交审核弹窗的后端检查接口：`algo_service/routers/publish.py` 新增 `/api/v1/algorithms/{algorithm_id}/submit-check`，并抽出 `_submit_check_payload()` 返回前端需要的冲突信息、版本迭代判断、公有算法信息和版本选项。
- 兼容当前路由加载顺序：由于 `algo_service/main.py` 先注册 `algorithms.py` 的通配 GET 路由，`algo_service/routers/algorithms.py` 中原有 `algorithm_id.endswith("/submit-check")` 分支也同步改成同样的返回结构，避免继续被通配路由截获后返回旧数据。
- 确认 `ReasonBody.is_version_iteration` 已存在且提交审核快照逻辑会读取该字段，用于写入 `review_kind=version_iteration/new_publish`。
- 验证：`python -m py_compile algo_service/routers/publish.py algo_service/routers/algorithms.py` 通过；脚本检查确认路由表中存在显式 `submit-check` 路由，同时当前通配路由兼容该路径。

## 2026-05-22 16:56:40
- 修改 `.run/algo-modules/21-review-admin-actions.js`：管理员点击“通过审核”时会同时读取 `review-draft` 和 `submit-check`，弹窗明确显示审核类型（版本迭代/新建发布）。
- 版本迭代场景：保留代码对比，版本下拉优先使用后端 `versionOptions`；新建发布场景：新增发布版本输入框，默认 `1.0.0` 或审核草稿元数据版本。
- 新建发布且存在同名公有算法冲突时：弹窗显示红色警告并禁用“确认通过”，避免管理员误把冲突草稿直接发布。
- `confirmApproveReview()` 现在发送 `version_bump/version_bump_type/reason`，并在后端返回 `autoPublished` 时显示“审核已通过并自动发布”，同时刷新组件数据和审核页。
- 已运行 `bash .run/build-algo-lib.sh all` 完成 bundle 构建与 HTML 注入；已运行 `node --check .run/algo-modules/21-review-admin-actions.js`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 10:27:12
- 修改 `.run/algo-modules/17-algo-info-admin-publish.js`：基本信息弹窗的“修改记录”表格改为 5 列（操作人、时间、动作、版本变化、备注），异步读取 `/publish-history` 后按时间倒序显示最近 50 条。
- 补齐动作映射：`code_save` 显示“保存代码”，`draft_save` 显示“保存草稿”，并将备注截断到 30 字符。
- 修改 `algo_service/routers/algorithms.py`：`PATCH /api/v1/algorithm-source/{id}` 的单文件保存入口也写入 `publish_history.json`；草稿保存记录 `draft_save`，正常保存记录 `code_save`。
- 同步改进单文件/文件级保存入口的 entry 解析，优先支持前端私有算法 id 的 `@@owner` 后缀，避免同名公私算法误定位。
- 已运行 `python -m py_compile algo_service/routers/algorithms.py`、`node --check .run/algo-modules/17-algo-info-admin-publish.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 10:51:58
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：`_saveAsPrivateDraft(skipReload)` 创建私有草稿前会先在当前页面、父页面、`my-algos`、components/templates 缓存中查找当前用户同 namespace/function 的私有草稿。
- 若同名私有草稿已存在，不再调用 `/algorithms/create` 或 `/packages/create`，而是逐文件保存到既有草稿；单文件缺失的额外文件会回退到 `add-file`。
- 更新既有草稿后会调用 `bumpVersionAfterCodeSave()`，更新 `state.editing` 指向该草稿并提示“私有草稿已更新”；`skipReload` 行为保留，保存并返回时不额外刷新列表。
- 已运行 `node --check .run/algo-modules/14-editor-save-namespace.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 11:18:00
- 补齐同名算法的权限级别校验：`algo_service/routers/algorithms.py` 的 `/algorithms/create` 在写文件前按 `owner_id` 查重，私有只拦当前用户同名草稿，公有只拦已存在的同名公有算法。
- 修改 `algo_service/routers/packages.py` 的 `/packages/create`，多文件算法同样按 owner 范围查重，并支持管理员显式 `publish_status=published` 时创建公有包。
- 修改 `algo_service/routers/publish.py` 的新发布审核分支：仅当已有同名且已发布的公有算法时返回 409，提示用户修改命名空间后重新提交。
- 修改 `.run/algo-modules/10-workspace-monaco-save.js`：新建工作区的前端重复校验区分公有/私有作用域，允许普通用户创建与公有同名的私有草稿，但阻止自己的同名私有重复。
- 已运行 `python -m py_compile algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/routers/publish.py`、`node --check .run/algo-modules/10-workspace-monaco-save.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 11:31:00
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：`saveCurrentFile(forClose)` 现在返回保存结果；非 owner 触发 `_saveAsPrivateDraft()` 时返回 `savedAsPrivateDraft: true`。
- `saveEditorAll()` 检测到本次保存已经另存为私有草稿后，直接跳过后续 `saveNamespace()`，避免保存公有算法时重复另存或紧接着 PATCH 新草稿命名空间。
- 保持 owner 私有草稿流程不变：用户编辑自己的私有草稿并修改调用名时，普通保存仍会继续执行 `saveNamespace()`。
- 已运行 `node --check .run/algo-modules/14-editor-save-namespace.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 11:42:00
- 修改 `.run/algo-modules/02-utils.js`：新增通用 `withTimeout(promise, ms, message)` 工具，用于给前端异步流程添加明确超时。
- 修改 `.run/algo-modules/05-data-loading.js`：`renderModulePage()` 现在用 `withTimeout(loadModuleData(...), 15000, "数据加载超时，请刷新页面重试")` 包装列表加载。
- 列表页渲染阶段新增 try/catch：`renderCards()`、筛选恢复等渲染异常会显示“页面渲染出错：...”而不是白屏或永久骨架屏；渲染后无卡片/分组/空态时显示“当前分类下暂无算法”。
- 修改 `.run/algo-modules/41-init-exports.js`：导出 `window.withTimeout`。
- 已运行 `node --check .run/algo-modules/02-utils.js`、`node --check .run/algo-modules/05-data-loading.js`、`node --check .run/algo-modules/41-init-exports.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-05-25 17:20:00
- 排查前端“点击按钮后没反应/必须刷新”：发现列表页异步加载缺少渲染令牌，旧的 `loadModuleData()` 请求晚返回时可能覆盖当前页面 DOM；`api()` 也直接依赖 `AbortSignal.timeout()`，在部分浏览器环境会抛错并中断按钮链路。
- 修改 `.run/algo-modules/05-data-loading.js`：`renderModulePage()` 增加 `state._moduleRenderToken`，只允许最后一次页面渲染落地，旧请求返回后直接丢弃；保留超时、渲染异常、空列表提示。
- 修改 `.run/algo-modules/02-utils.js`：`api()` 增加 `AbortController` 超时降级，兼容不支持 `AbortSignal.timeout()` 的浏览器，避免请求初始化阶段直接抛错。
- 排查 uvicorn Ctrl+C 停不掉：当前 8000 端口进程命令行为 `uvicorn ... --reload`；Windows 下 reload 父子进程叠加项目自身 watchdog，容易出现子进程残留或 shutdown 卡顿。
- 修改 `algo_service/main.py`：显式保存并在 shutdown 时取消临时上传清理后台任务；修改 `algo_service/sdk/file_watcher.py`：watchdog observer 停止时 join 最多等待 5 秒，避免 Ctrl+C 被文件监听线程无限阻塞。
- 已运行 `node --check .run/algo-modules/02-utils.js`、`node --check .run/algo-modules/05-data-loading.js`、`python -m py_compile algo_service/main.py algo_service/sdk/file_watcher.py`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-06-02 20:20:35 +08:00
- 修复扩展输出面板 ECharts 加载：计划将 extensions/algolib-manager/src/panels/OutputPanel.ts 从 CDN 引用改为 Webview 本地 media 资源，并复用 src/browser/static/vendor/echarts.min.js。

## 2026-06-02 20:22:28 +08:00
- 修改 extensions/algolib-manager/src/panels/OutputPanel.ts：输出 Webview 改为通过 webview.asWebviewUri() 加载本地 media/echarts.min.js，移除 ECharts CDN 依赖，并统一使用 ECharts 检测与准确降级文案。
- 复制 src/browser/static/vendor/echarts.min.js 到 extensions/algolib-manager/media/echarts.min.js；运行 
pm run build 更新 extensions/algolib-manager/dist/extension.js。
- 验证：
ode --check extensions/algolib-manager/dist/extension.js 通过；确认 OutputPanel 不再引用 cdn.jsdelivr.net/npm/echarts。

## 2026-06-02 20:40:46 +08:00
- 修复浏览器版 AlgoLib 图表页 ECharts 加载：.run/algo-modules/40-output-renderers.js 新增 ensureEchartsLoaded()，当 window.echarts 缺失时按相对静态路径、页面静态路径、后端 /static 路径依次补加载，成功后自动重绘图表。
- 修改 src/browser/pages/algo-lib.html 的离线 vendor 预加载：优先相对 ../static/vendor/，失败回退到后端 http://127.0.0.1:8000/static/vendor/。
- 生成 docs/ALGOLIB_CODEBASE_AUDIT.md，说明 lgo_management.html 是历史 standalone 快照，并梳理核心功能、构建产物、临时脚本和可清理候选项。
- 验证：ash .run/build-algo-lib.sh all 已运行；
ode --check 检查模块和 bundle 通过；/static/vendor/echarts.min.js 后端返回 200。

## 2026-06-02 21:05:00 +08:00
- 排查按钮点击后“没反应/卡顿”：`openAdminPublishModal()` 原本先等待 `review-draft` 和 `submit-check` 两个接口返回后才渲染弹窗，后端稍慢时用户看不到任何反馈；`openEditorById()` 也缺少失败恢复，源码接口失败时会静默中断。
- 修改 `.run/algo-modules/17-algo-info-admin-publish.js`：点击“正式发布”后立即显示“正在准备正式发布”弹窗；确认发布后保持“正在正式发布”加载弹窗；发布后的列表刷新改为去重并发加载，避免 components/templates/currentPage 串行重复刷新。
- 修改 `.run/algo-modules/12-editor-shell.js`：打开编辑器时立即 toast“正在打开编辑器...”，同一条目重复点击会被合并；源码加载失败时显示错误并退回原页面，避免半开状态必须刷新。
- 已运行 `node --check .run/algo-modules/12-editor-shell.js`、`node --check .run/algo-modules/17-algo-info-admin-publish.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-06-03 09:20:00 +08:00
- 修复编辑器打开时报 `require is not defined`：根因是 Monaco AMD loader (`vs/loader.js`) 未先加载成功或加载时序不稳定，`loadMonaco()` 直接调用 `require.config()` 会抛错。
- 修改 `.run/algo-modules/12-editor-shell.js`：`loadMonaco()` 现在会先检查 `window.require`，缺失时动态按页面相对静态目录、后端 `/static/vendor/`、`http://127.0.0.1:8000/static/vendor/` 顺序加载 `monaco-editor@0.45.0/min/vs/loader.js`，成功后再执行 `window.require.config()` 和加载 `vs/editor/editor.main`。
- 本地确认 `src/browser/static/vendor/monaco-editor@0.45.0/min/vs/loader.js` 和 `editor/editor.main.js` 存在。
- 已运行 `node --check .run/algo-modules/12-editor-shell.js`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`，并确认 `src/browser/pages/algo-lib.html` 已注入新逻辑。

## 2026-06-03 10:35:00 +08:00
- 新增 `algo_service/sdk/change_logs.py`，引入独立于 `publish_history.json` 的 `privateChangeLogs` / `publicChangeLogs` / `pendingPublicChangeLogs` 工具函数；保留原审核/发布审计历史不变。
- 修改 `algo_service/routers/algorithms.py`：`_entry_dict()` 返回三类 change logs；新建私有算法记录“新建算法”；编辑私有算法记录 `privateChangeLogs`；面向公有发布的编辑记录进入 `pendingPublicChangeLogs`。
- 修改 `algo_service/routers/packages.py`：package 创建/保存同步写入对应 change logs，并修正 package manifest 路径使用 `root_path`。
- 修改 `algo_service/routers/publish.py`：提交审核时把 pending public logs 保存进 review draft；审核通过版本迭代/新发布时只把 pending 合并进目标 publicChangeLogs，继续保留 `_append_history()` 审核发布记录。
- 修改 `.run/algo-modules/17-algo-info-admin-publish.js`：基本信息弹窗“修改记录”不再调用 publish-history；公有算法展示 `publicChangeLogs`，私有算法展示 `privateChangeLogs`，永不展示 pending。
- 已运行 `python -m py_compile algo_service/sdk/change_logs.py algo_service/routers/algorithms.py algo_service/routers/packages.py algo_service/routers/publish.py`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-06-03 11:15:00 +08:00
- 排查“保存”提示 Failed to fetch：当前 8000 端口由 `uvicorn algo_service.main:app --host 127.0.0.1 --port 8000 --reload` 启动，reload 监听整个仓库；保存公有算法另存私有草稿会写入 `algorithms_root/users/...`，触发 uvicorn reload，导致当前 POST 连接被中断，浏览器只显示 Failed to fetch。
- 修改 `.run/algo-modules/02-utils.js`：网络层 `Failed to fetch` 现在提示使用 `--reload-dir algo_service`，指出保存算法文件时后端被 reload 中断的原因。
- 新增 `scripts/start-algolib-backend.ps1`：Windows 推荐启动脚本，默认使用 `--reload --reload-dir algo_service`，避免监听算法运行时目录；支持 `-NoReload`。
- 更新 `docs/ALGOLIB_CODEBASE_AUDIT.md` 的后端启动说明，推荐使用新脚本或手动加 `--reload-dir algo_service`。
- 已运行 `node --check .run/algo-modules/02-utils.js`、PowerShell 脚本解析检查、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。

## 2026-06-03 11:40:00 +08:00
- 排查“编辑模式保存没反应 / 保存并返回后列表卡骨架屏”：保存函数只用 toast 提示，按钮无忙碌态；`saveAndCloseEditor()` 不管保存是否真正成功都会关闭编辑器；列表页在异常/竞态下可能保留 skeleton。
- 修改 `.run/algo-modules/14-editor-save-namespace.js`：保存与保存并退出按钮增加忙碌态；`saveCurrentFile()` 返回 `{ok}` 状态；保存失败不再自动关闭编辑器；另存私有草稿成功会返回新草稿对象，避免误判。
- 修改 `.run/algo-modules/05-data-loading.js`：列表页加载增加 `clearStaleSkeleton()` 双保险，超时/异常/空数据都会把骨架屏替换为明确提示。
- 已运行 `node --check .run/algo-modules/05-data-loading.js`、`node --check .run/algo-modules/14-editor-save-namespace.js`、`python -m py_compile ...`、`bash .run/build-algo-lib.sh all`、`node --check .run/algo-lib-check.js`、`node --check .run/algo-lib-inline-check.js`。
- 仍检测到当前后端进程使用全仓库 `uvicorn ... --reload`，保存算法文件可能触发后端重启；需改用 `scripts/start-algolib-backend.ps1` 或 `--reload-dir algo_service`。

## 2026-06-03 16:10:25
- 修复第一次点击“提交审核”偶发显示无法连接后端的问题。
- 恢复并修正 .run/algo-modules/20-review-submit.js：补全被截断的 confirmSubmitReview，修复非法正则，给 submit-check 和 submit 请求增加一次重试。
- submit 请求在瞬时网络错误后会刷新算法状态；若后端实际已切到 reviewing，则按提交成功处理，避免“第一次报错、第二次成功”的误导体验。
- 调整 .run/algo-modules/02-utils.js 的通用 fetch 错误提示，不再错误暗示必须使用 uvicorn --reload。
- 已运行 bash .run/build-algo-lib.sh all，完成构建与注入；已通过 node --check .run/algo-lib-check.js 和 .run/algo-lib-inline-check.js。

## 2026-06-03 16:18:29
- Debug 第一次点击“提交审核”提示无法连接后端、第二次成功的问题：确认前端生成文件不再包含“请重启后端”旧提示；实际生效 POST 路由为 algorithms.py 中先注册的 /algorithms/{id}/submit。
- 根因修复：提交审核是非幂等 POST，不能盲目重试；第一次请求若后端已切到 reviewing 但响应被浏览器判为网络失败，第二次重试会撞到 reviewing 状态并产生误导错误。
- 修改 .run/algo-modules/20-review-submit.js：新增 submitReviewRequestWithConfirmation()，首次网络异常后先刷新算法状态，若已为 reviewing 则按成功处理；未成功才重试一次，重试后仍会再次确认状态。
- 已运行 ash .run/build-algo-lib.sh all 注入 HTML，并通过 
ode --check .run/algo-lib-check.js、
ode --check .run/algo-lib-inline-check.js。

## 2026-06-03 16:44:27
- 继续 debug 第一次点击“提交审核”提示无法连接后端的问题：确认后端 /health 正常，问题发生在弹窗打开前的 submit-check 预检查阶段。
- 修改 .run/algo-modules/20-review-submit.js：submit-check 若出现瞬时网络错误，不再 toast 阻断，而是降级打开提交弹窗，并在弹窗内提示“暂时无法获取版本和命名冲突信息”；真正提交时仍由后端校验。
- confirmSubmitReview() 的 metadata PATCH 改为带一次重试；提交成功后的列表刷新失败不再覆盖成功结果，只提示“已提交审核，列表稍后刷新”。
- 已运行 ash .run/build-algo-lib.sh all，并通过 
ode --check .run/algo-lib-check.js 与 .run/algo-lib-inline-check.js。

## 2026-06-03 17:08:23
- 排查“依然提示无法连接后端”：确认后端 /health 正常，正式入口 src/browser/pages/algo-lib.html 已包含提交审核降级逻辑。
- 根因是根目录旧快照 lgo_management.html 仍包含旧版 openSubmitModal()，会在 submit-check 失败时直接 toast 并阻断；用户若误打开该文件会继续复现旧问题。
- 修改 lgo_management.html：在 <head> 顶部加入自动跳转到 src/browser/pages/algo-lib.html，避免继续使用旧快照入口。

## 2026-06-03 17:40:37
- 修复点击“提交审核”前 metadata PATCH 500：后端 egistry.update_package_manifest() 在私有 package 仅更新 version/metadata 时，错误按全局 watch root 计算目标目录，试图移动到 lgorithms_root/custom/my_algor 并撞上已有公有算法。
- 修改 lgo_service/sdk/registry.py：记录 manifest 更新前的 namespace/name；只有 namespace/name 真的变化时才移动目录；普通元数据更新原地写入 algopack.json。私有 package 改名时仍保留在用户私有目录的扁平路径下。
- 已运行 python -m py_compile algo_service/sdk/registry.py，并用临时 registry 场景验证私有 package 更新 version 不会移动到公有目录。

## 2026-06-03 17:56:58
- 修复审核通过后版本迭代不显示所选版本：实际生效路由是 lgo_service/routers/algorithms.py，多文件 package 的版本来自 lgopack.json；审核通过此前只更新入口函数 @algo_meta，未同步 package manifest。
- 新增 _write_entry_publish_metadata() 并在版本迭代发布路径调用，确保 ersion/zh_name/zh_description/zh_tags/input_example/widget_overrides 写回目标公有算法 manifest，列表版本随所选版本更新。
- 修复 admin 编辑公有算法直写公有文件：.run/algo-modules/14-editor-save-namespace.js 中保存文件/命名空间时，只要正在编辑的是公有算法，无论是否 admin，都先 _saveAsPrivateDraft()。
- 支持 admin 保存公有算法为私有草稿后直接“正式发布”：publish_algorithm() 读取版本发布请求体；_do_publish_algorithm() 在没有 review_draft 但私有草稿带 	arget_public_id 时，自动用当前草稿文件生成版本迭代草稿并应用到目标公有算法。
- 已运行 python -m py_compile algo_service/routers/algorithms.py、
ode --check .run/algo-modules/14-editor-save-namespace.js、ash .run/build-algo-lib.sh all、
ode --check .run/algo-lib-check.js、
ode --check .run/algo-lib-inline-check.js。

## 2026-06-03 18:18:34
- 修复“基本信息 / 修改记录”中审核后的编辑记录缺失：实际生效的 submit/approve/publish 路径在 algo_service/routers/algorithms.py，提交审核时此前没有把 pendingPublicChangeLogs 写入 review draft，发布时也没有合并到目标公有算法 publicChangeLogs。
- submit_algorithm_review() 现在保存提交者 operator/operator_name，并把当前私有草稿的 pendingPublicChangeLogs 一起写入 review draft；缺失时按版本迭代/新发布补一条待发布修改记录。
- _do_publish_algorithm() 在版本迭代发布时按目标公有算法旧版本和所选新版本正规化 pending 日志，再合并到目标公有算法 publicChangeLogs，避免继续显示管理员兜底记录或旧版本号。
- admin direct publish 的 synthetic draft 也携带 pendingPublicChangeLogs，确保管理员先另存私有草稿再正式发布时修改记录一致。
- 修复 .run/algo-modules/17-algo-info-admin-publish.js 的版本变化显示，使用 Unicode 箭头并恢复“暂无修改记录/未知用户”中文兜底文案。
- 已运行 python -m py_compile algo_service/routers/algorithms.py、node --check .run/algo-modules/17-algo-info-admin-publish.js、bash .run/build-algo-lib.sh all、node --check .run/algo-lib-check.js、node --check .run/algo-lib-inline-check.js。

## 2026-06-03 19:58:12
- 将“基本信息 / 修改记录”的版本变化箭头改为 HTML 实体 &#8594; 渲染，避免浏览器/字体/缓存场景下 Unicode 箭头显示成问号。
- 备注列确认仍来自 private/public change log 的 remark 字段，不混用审核通过/驳回意见；审核意见继续保留在 publish_history 审核记录体系。
- 已运行 node --check .run/algo-modules/17-algo-info-admin-publish.js、python -m py_compile algo_service/routers/algorithms.py、bash .run/build-algo-lib.sh all、node --check .run/algo-lib-check.js、node --check .run/algo-lib-inline-check.js。

## 2026-06-03 20:18:51
- 调整编辑器底部面板：点击“参数配置”时进入独立配置模式，只渲染“识别参数 / 保存参数配置 / 参数控件配置”，不再混入旧的函数测试、加载示例、运行输出区域；点击“测试”仍进入测试模式。
- 增强 parseParamValueByType 的列表/字典宽松解析：支持中文逗号、顿号、中文引号，并将无冒号的 `{0.1，0.2，0.9}` 当作列表解析为 `[0.1, 0.2, 0.9]`。
- 修复编辑器保存参数示例时优先按用户选择的 widget 类型解析，避免 list 示例被按字符串保存成带多层双引号的值。
- “格式化”按钮现在按控件类型调用 parseParamValueByType，可格式化 `{0.1，0.2，0.9}` 这类宽松列表输入。
- 已运行 node --check .run/algo-modules/02-utils.js、node --check .run/algo-modules/15-editor-inline-test-panel.js、bash .run/build-algo-lib.sh all、node --check .run/algo-lib-check.js、node --check .run/algo-lib-inline-check.js。
