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
