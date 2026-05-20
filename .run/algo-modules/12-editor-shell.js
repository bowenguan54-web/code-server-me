/*
 * AlgoLib module: 12-editor-shell.js
 * ????????????????? Monaco ????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function openEditorById(id, page, expandTest = false) {
      const returnPage = state.page || page;
      rememberMainScroll(returnPage);
      const collection = state.data[page] || [];
      const item = collection.find(entry => entry.id === id) || { id };
      await openEditor(item, page, expandTest);
      if (state.editing) state.editing.returnPage = returnPage;
    }

    async function openEditor(item, page, expandTest = false) {
      const returnPage = state.page || page;
      rememberMainScroll(returnPage);
      const source = await api(`/api/v1/algorithm-source/${safeId(item.id)}`);
      const algo = source.algorithm || item;
      state.editing = { id: item.id, page, returnPage, algo, source, package: null };
      if (algo.packageId) {
        try {
          const packageData = await api(`/api/v1/packages/${safeId(algo.packageId)}`);
          state.editing.package = packageData.package;
        } catch (error) {
          showToast(error.message);
        }
      }
      renderEditorView(expandTest);
      await initEditor();
      if (expandTest) setTestHeight(240);
    }

    function renderEditorView(expandTest = false) {
      const e = state.editing;
      const nsPrefix = namespacePrefix(e.algo);
      const nsFunc = namespaceFunction(e.algo);
      const isOwner = canManageAlgorithm(e.algo);
      const isComponentEditor = e.page === "components" || e.page === "templates" || e.page === "my-algos";
      qs("#main").classList.add("editor-active");
      qs("#main").innerHTML = `
        <div class="editor-view" id="editorView">
          <div class="editor-top-info">
            <span class="breadcrumb">${esc(pageTitle(e.page))} / ${esc(getName(e.algo))}</span>
            <span class="ns-prefix">${esc(nsPrefix)}</span>
            <div class="namespace-edit" id="nsBox">
              <input id="nsInput" value="${esc(nsFunc)}" onblur="window.validateNamespace()" />
              <div class="field-error" id="nsErr"></div>
            </div>
            ${!isOwner && state.currentUser ? `<span class="editor-notice">💡 此算法不属于您，点击「保存」将另存为您的私有草稿</span>` : ""}
          </div>
          <div class="editor-toolbar" id="editorToolbar">
            <button onclick="window.closeEditor()">返回</button>
            <button onclick="window.openComponentTestModal()">测试</button>
            <button onclick="window.editCurrentAlgorithmInfo()">基本信息</button>
            ${e.page === "templates" ? `<button onclick="window.editTemplateDescription('${esc(e.id)}')">编辑说明</button>` : ""}
            ${isComponentEditor && state.currentUser?.role === "admin" && !isPublicItem(e.algo) ? `<button data-status-btn="1" class="success" onclick="window.openAdminPublishModal('${esc(e.id)}')">正式发布</button>` : ""}
            ${isComponentEditor && state.currentUser?.role !== "admin" && canSubmitAlgorithm(e.algo) ? `<button data-status-btn="1" onclick="window.openSubmitModal('${esc(e.id)}')">${getStatus(e.algo) === "rejected" ? "重新提交" : "提交审核"}</button>` : ""}
            <div class="more-menu-wrap" style="position:relative">
              <button onclick="window._toggleMoreMenu(this)">更多 ▾</button>
              <div class="more-menu hidden" style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;min-width:130px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,.55)">
                <div class="more-menu-item" onclick="window.checkCurrentEditorSyntax();this.closest('.more-menu').classList.add('hidden')">检查代码</div>
                ${e.page === "templates" ? `<div class="more-menu-item" onclick="window.showTemplateUsage('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">使用说明</div>` : ""}
                <div class="more-menu-item" onclick="window.openSnippetOverlay();this.closest('.more-menu').classList.add('hidden')">插入片段</div>
                <div class="more-menu-item" onclick="window.showVersions('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">版本历史</div>
                ${isComponentEditor && state.currentUser?.role !== "admin" && ownsAlgorithm(e.algo) && getStatus(e.algo) === "reviewing" ? `<div class="more-menu-item" onclick="window.withdrawReview('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">撤回审核</div>` : ""}
                ${isComponentEditor && getStatus(e.algo) === "rejected" ? `<div class="more-menu-item" onclick="window.viewRejectedDraft('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">查看驳回内容</div><div class="more-menu-item danger" onclick="window.discardRejectedDraft('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">放弃修改</div>` : ""}
              </div>
            </div>
            <div class="toolbar-divider"></div>
            <div id="blockEditorControls" style="display:contents"></div>
            <button id="runBtn" title="运行当前文件 (Ctrl+F5)" onclick="window.executeCurrentFile()">▶ 运行</button>
            <button id="debugBtn" class="btn-debug" title="启动调试" onclick="window.startDebug()">🔴 调试</button>
            <button title="打开终端 (Ctrl+\`)" onclick="window.openTerminalPanel()">⌗ 终端</button>
            <span class="spacer"></span>
            <button onclick="window.saveAndCloseEditor()">保存并退出</button>
            <button class="primary" onclick="window.saveEditorAll()">保存</button>
          </div>
          <div class="editor-main" id="editorMain">
            <aside class="file-tree" id="fileTree"></aside>
            <div class="tree-resize" onmousedown="window.startTreeResize(event)"></div>
            <div class="monaco-host" id="monacoHost"></div>
            <div class="r-resize-bar" id="rResizeBar" onmousedown="window.startRightResize(event)"></div>
            <div class="right-test-panel" id="rightTestPanel"></div>
          </div>
          <div class="v-resize-bar" id="vResizeBar" onmousedown="window.startTestResize(event)" ondblclick="window.toggleTestPanel()"></div>
          <div class="test-panel" id="testPanel"></div>
          <div class="panel-resize-bar" id="panelResizeBar" onmousedown="window.startPanelResize(event)"></div>
          <div class="bottom-panel" id="bottomPanel">
            <div id="debugToolbar" class="debug-toolbar" style="display:none">
              <button onclick="window.sendDebugAction('continue')" title="继续 (F5)">▶ 继续</button>
              <button onclick="window.sendDebugAction('next')" title="下一步 (F10)">→ 下一步</button>
              <button onclick="window.sendDebugAction('step')" title="进入 (F11)">↓ 进入</button>
              <button onclick="window.sendDebugAction('return')" title="跳出 (Shift+F11)">↑ 跳出</button>
              <button onclick="window.sendDebugAction('restart')" title="重启调试">↺ 重启</button>
              <span id="debugStatusText" class="debug-status">调试中...</span>
            </div>
            <div class="panel-tabs">
              <button class="panel-tab active" id="tab-output" onclick="window.switchBottomTab('output')">输出</button>
              <button class="panel-tab" id="tab-terminal" onclick="window.switchBottomTab('terminal')">终端</button>
              <button class="panel-tab" id="tab-problems" onclick="window.switchBottomTab('problems')">问题</button>
              <button class="panel-tab" id="tab-debug" onclick="window.switchBottomTab('debug')">🔴 调试</button>
              <button class="panel-close-btn" onclick="window.toggleBottomPanel(false)">✕</button>
            </div>
            <div class="panel-content">
              <div class="panel-pane" id="outputPane"><div id="execOutput" class="exec-output"><span class="panel-empty">运行后输出将显示在这里</span></div></div>
              <div class="panel-pane hidden" id="terminalPane"><div id="xtermHost"></div></div>
              <div class="panel-pane hidden" id="problemsPane"><div id="problemsList"></div></div>
              <div class="panel-pane hidden" id="debugPane">
                <div class="debug-panel">
                  <div class="debug-panel-section">
                    <h4>变量</h4>
                    <div id="debugVarsContent"><span class="panel-empty">等待调试启动...</span></div>
                  </div>
                  <div class="debug-panel-section">
                    <h4>调用堆栈</h4>
                    <div id="debugStackContent"><span class="panel-empty">等待调试启动...</span></div>
                  </div>
                  <div class="debug-panel-section" style="display:flex;flex-direction:column;min-height:0">
                    <h4>调试控制台</h4>
                    <div id="debugConsoleOutput" class="debug-console-output"></div>
                    <div class="debug-console-input">
                      <input id="debugConsoleInput" placeholder="输入 Python 表达式..." onkeydown="if(event.key==='Enter')window._debugConsoleEval()" />
                      <button onclick="window._debugConsoleEval()">执行</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      // 初始化 editorMain 的 --tree-width 变量
      const editorMain = qs("#editorMain");
      if (editorMain) editorMain.style.setProperty("--tree-width", "232px");
      // 初始 test panel 高度为 0
      const editorView = qs("#editorView");
      if (editorView) {
        editorView.style.setProperty("--test-height", "0px");
        editorView.style.setProperty("--vbar-h", "2px");
      }
    }

    async function loadMonaco() {
      if (state.monacoReady) return state.monacoReady;
      state.monacoReady = new Promise(resolve => {
        const staticBase = window._ALGO_STATIC_BASE || window._ALGO_BASE || "http://127.0.0.1:8000";
        require.config({ paths: { vs: `${staticBase}/static/vendor/monaco-editor@0.45.0/min/vs` } });
        require(["vs/editor/editor.main"], () => {
          monaco.editor.defineTheme("algolib-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
              { token: "keyword", foreground: "569cd6" },
              { token: "string", foreground: "ce9178" },
              { token: "comment", foreground: "6a9955" },
              { token: "number", foreground: "b5cea8" },
              { token: "identifier", foreground: "dcdcaa" }
            ],
            colors: {
              "editor.background": "#040e1f",
              "editorSuggestWidget.background": "#0d1e35",
              "editorSuggestWidget.border": "#1e3a5f",
              "editorSuggestWidget.foreground": "#d4e6f1",
              "editorSuggestWidget.selectedBackground": "#1a3a60",
              "editorSuggestWidget.selectedForeground": "#ffffff",
              "editorSuggestWidget.highlightForeground": "#7dd3fc",
              "editorSuggestWidget.selectedHighlightForeground": "#bae6fd",
              "editorHoverWidget.background": "#0d1e35",
              "editorHoverWidget.border": "#1e3a5f",
              "editorHoverWidget.foreground": "#d4e6f1"
            }
          });
          state.monaco = monaco;
          resolve(monaco);
        });
      });
      return state.monacoReady;
    }

    async function initEditor() {
      const m = await loadMonaco();
      const e = state.editing;

      // 对模板页面的算法，优先尝试分块编辑器
      if (e.page === "templates") {
        // 先查询是否有 blocks 数据
        let hasBlocks = false;
        try {
          const blocksResp = await api(`/api/v1/templates/${safeId(e.id)}/blocks`);
          hasBlocks = Array.isArray(blocksResp.blocks) && blocksResp.blocks.length > 0;
        } catch (_) { hasBlocks = false; }

        if (hasBlocks) {
          // 清理旧分块编辑器（如有）
          if (state.blockEditor) cleanupBlockEditor();
          // 替换 monacoHost 为容纳分块编辑器的容器
          const monacoHost = qs("#monacoHost");
          if (monacoHost) {
            monacoHost.id = "blockEditorRoot";
            monacoHost.style.cssText = "display:flex;flex-direction:column;overflow:hidden;background:var(--bg)";
          }
          const container = qs("#blockEditorRoot");
          if (container) {
            // 使用 item 对象初始化分块编辑器
            const item = { id: e.id, type: "template", moduleKind: "template",
              ownerId: e.algo?.ownerId || e.algo?.owner_id };
            initBlockEditor(container, item);
          }
          return;  // 跳过标准 Monaco 初始化
        }
      }

      const source = e.source || {};
      let files = [];
      if (Array.isArray(source.folder_files) && source.folder_files.length) {
        files = source.folder_files.map(file => ({
          filename: file.relative_path || file.filename,
          content: file.content || "",
          isEntry: !!file.is_entry,
          functions: normalizeFunctions(file.functions || [])
        }));
      } else if (e.package && Array.isArray(e.package.files)) {
        files = e.package.files.filter(file => String(file.filename || file.relative_path).endsWith(".py")).map(file => ({
          filename: file.relative_path || file.filename,
          content: file.content || "",
          isEntry: file.filename === e.package.entry,
          functions: normalizeFunctions(file.functions || [])
        }));
      } else {
        files = [{
          filename: (e.algo.sourceFile || "source.py").split(/[\\/]/).pop(),
          content: source.source || "",
          isEntry: true,
          functions: normalizeFunctions([{ func_name: e.algo.funcName, params: e.algo.params || [] }])
        }];
      }
      if (!files.length) files = [{ filename: "source.py", content: "", isEntry: true, functions: [] }];

      if (state.editor) {
        state.editor.dispose();
        state.editor = null;
        window._activeMonaco = null;
      }
      state.models.forEach(model => {
        if (model && !model.isDisposed()) model.dispose();
      });
      state.models.clear();
      state.fileMeta.clear();
      state.viewStates.clear();
      files.forEach(file => {
        const uri = m.Uri.parse(`inmemory://algolib/${encodeURIComponent(e.id)}/${encodeURIComponent(file.filename)}`);
        const existing = m.editor.getModel(uri);
        if (existing && !existing.isDisposed()) existing.dispose();
        const model = m.editor.createModel(file.content, "python", uri);
        state.models.set(file.filename, model);
        state.fileMeta.set(file.filename, file);
      });
      const first = (files.find(file => file.isEntry) || files[0]).filename;
      state.currentFile = first;
      renderFileTree();
      state.editor = m.editor.create(qs("#monacoHost"), {
        model: state.models.get(first),
        theme: "algolib-dark",
        language: "python",
        automaticLayout: true,
        fontSize: 14,
        tabSize: 4,
        autoIndent: "full",
        folding: true,
        glyphMargin: true,
        bracketPairColorization: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          useShadows: false
        }
      });
      window._activeMonaco = state.editor;
      state.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveCurrentFile());
      state.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
      state.editor.onDidChangeModelContent(() => runEditorLocalDiagnostics());
      // >>> DEBUG INTEGRATION POINT: init breakpoints (replaces old initBreakpoints)
      initDebugBreakpoints(state.editor);
      // Debug keyboard shortcuts
      state.editor.addAction({ id: "debug-continue", label: "继续", keybindings: [m.KeyCode.F5], run: () => sendDebugAction("continue") });
      state.editor.addAction({ id: "debug-next", label: "下一步", keybindings: [m.KeyCode.F10], run: () => sendDebugAction("next") });
      state.editor.addAction({ id: "debug-step", label: "进入", keybindings: [m.KeyCode.F11], run: () => sendDebugAction("step") });
      state.editor.addAction({ id: "debug-stepout", label: "跳出", keybindings: [m.KeyMod.Shift | m.KeyCode.F11], run: () => sendDebugAction("return") });
      await registerCompletionProvider();
      runEditorLocalDiagnostics();
      renderTestPanel();
      if (state.bottomPanelOpen) {
        window.setTimeout(() => toggleBottomPanel(true), 100);
      }
    }
