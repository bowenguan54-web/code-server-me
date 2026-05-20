/*
 * AlgoLib module: 10-workspace-monaco-save.js
 * ???????? Monaco ???????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function initWorkspaceMonaco(moduleKind = "") {
      const host = qs("#wsCodeHost");
      if (!host) return;
      const m = await loadMonaco();
      if (newAlgoState.editor) {
        newAlgoState.editor.dispose();
        newAlgoState.editor = null;
      }
      if (newAlgoState.models) {
        newAlgoState.models.forEach(model => {
          if (model && !model.isDisposed()) model.dispose();
        });
      }
      newAlgoState.models = new Map();
      newAlgoState.files.forEach(file => {
        const uri = m.Uri.parse(`inmemory://algolib-new/${Date.now()}-${encodeURIComponent(file.relative_path)}`);
        const model = m.editor.createModel(file.content || "", "python", uri);
        newAlgoState.models.set(file.relative_path, model);
      });
      if (!newAlgoState.files.length) {
        const blank = m.editor.createModel("", "python", m.Uri.parse(`inmemory://algolib-new/blank-${Date.now()}.py`));
        newAlgoState.models.set("__blank__.py", blank);
      }
      const first = newAlgoState.currentFile || newAlgoState.files[0]?.relative_path || "__blank__.py";
      newAlgoState.currentFile = first;
      newAlgoState.editor = m.editor.create(host, {
        model: newAlgoState.models.get(first),
        theme: "algolib-dark",
        language: "python",
        automaticLayout: true,
        fontSize: 14,
        tabSize: 4,
        insertSpaces: true,
        autoIndent: "full",
        formatOnPaste: true,
        formatOnType: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        minimap: { enabled: true },
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6, useShadows: false }
      });
      window._activeMonaco = newAlgoState.editor;
      newAlgoState.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveWorkspaceAlgorithm(moduleKind || (qs("#wsCreateMode") ? currentModuleKind(state.page) : "component")));
      newAlgoState.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
      newAlgoState.editor.onDidChangeModelContent(() => {
        updateWorkspaceFileContent();
        runWorkspaceDiagnostics();
      });
      renderWorkspaceFiles();
      runWorkspaceDiagnostics();
    }

    function getWorkspaceCode() {
      updateWorkspaceFileContent();
      return newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile)?.content || "";
    }

    function inferFirstPythonFunction(source) {
      const match = String(source || "").match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/m);
      return match ? match[1] : "";
    }

    function inferWorkspaceNameFromCode() {
      const name = inferFirstPythonFunction(getWorkspaceCode());
      if (!name) { showToast("没有识别到 Python 函数定义"); return; }
      const input = qs("#wsName");
      if (input) input.value = name;
      const current = newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile);
      if (current && current.relative_path === "my_algorithm.py") {
        current.relative_path = `${name}.py`;
        newAlgoState.currentFile = current.relative_path;
        initWorkspaceMonaco();
      }
      showToast(`已识别函数名：${name}`);
    }

    function parseImportedWorkspaceFiles(source, fallbackName) {
      const text = String(source || "");
      const marker = /^\s*#\s*(?:file|filename|path)\s*:\s*([A-Za-z0-9_./-]+\.py)\s*$/i;
      const lines = text.split(/\r?\n/);
      const files = [];
      let current = null;
      for (const line of lines) {
        const matched = line.match(marker);
        if (matched) {
          current = { relative_path: matched[1].replace(/^\/+/, ""), content: "" };
          files.push(current);
          continue;
        }
        if (current) current.content += `${line}\n`;
      }
      if (files.length) return files.map(file => ({ ...file, content: file.content.replace(/\n$/, "") }));
      return [{ relative_path: `${fallbackName || "my_algorithm"}.py`, content: text }];
    }

    function localPythonDiagnostics(source) {
      const markers = [];
      const stack = [];
      const pairs = { "(": ")", "[": "]", "{": "}" };
      const closing = { ")": "(", "]": "[", "}": "{" };
      String(source || "").split(/\r?\n/).forEach((line, index) => {
        const lineNo = index + 1;
        if (/^\t+ +|^ +\t+/.test(line)) {
          markers.push({ line: lineNo, col: 1, message: "同一缩进层混用了 Tab 和空格" });
        }
        if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b.*[^:]\s*(#.*)?$/.test(line)) {
          markers.push({ line: lineNo, col: Math.max(1, line.length), message: "语句块可能缺少冒号" });
        }
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (pairs[ch]) stack.push({ ch, line: lineNo, col: i + 1 });
          else if (closing[ch]) {
            const last = stack.pop();
            if (!last || last.ch !== closing[ch]) markers.push({ line: lineNo, col: i + 1, message: `括号不匹配：${ch}` });
          }
        }
      });
      stack.slice(-5).forEach(item => markers.push({ line: item.line, col: item.col, message: `括号未闭合：${item.ch}` }));
      return markers;
    }

    function applyDiagnosticsToModel(model, diagnostics) {
      if (!state.monaco || !model) return;
      state.monaco.editor.setModelMarkers(model, "algolib-check", (diagnostics || []).map(item => ({
        severity: state.monaco.MarkerSeverity.Error,
        message: item.message || "代码检查错误",
        startLineNumber: item.line || 1,
        startColumn: item.col || 1,
        endLineNumber: item.line || 1,
        endColumn: Math.max((item.col || 1) + 1, 2)
      })));
    }

    function runWorkspaceDiagnostics(showResult = false) {
      const model = newAlgoState.editor?.getModel();
      if (!model) return [];
      const diagnostics = localPythonDiagnostics(model.getValue());
      applyDiagnosticsToModel(model, diagnostics);
      if (showResult) showToast(diagnostics.length ? `发现 ${diagnostics.length} 个代码问题` : "代码检查通过");
      return diagnostics;
    }

    function checkWorkspaceCode() {
      runWorkspaceDiagnostics(true);
    }

    async function testWorkspaceSource() {
      updateWorkspaceFileContent();
      const output = qs("#wsOutput");
      if (!output) { showToast("测试面板未找到，请刷新页面后重试"); return; }
      if (!qs("#wsKind") || !qs("#wsName")) { showToast("界面未就绪，请稍后再试"); return; }
      const source = getWorkspaceCode();
      const parsedParams = parseParamsFromCode(source);
      if (parsedParams.length && !(newAlgoState.widgetParams || []).length) {
        newAlgoState.widgetParams = parsedParams;
        parsedParams.forEach(param => {
          if (!newAlgoState.widgetOverrides[param.name]) newAlgoState.widgetOverrides[param.name] = param.widget;
        });
        renderWidgetConfigRows(parsedParams);
      }
      const kwargs = typeof collectWorkspaceParamExamples === "function" ? collectWorkspaceParamExamples() : {};
      const params = ((newAlgoState.widgetParams || []).length ? newAlgoState.widgetParams : parsedParams).map(item => ({
        name: item.name,
        type: item.type || "Any",
        default: item.default || "",
        nullable: !!item.nullable,
        widget_hint: newAlgoState.widgetOverrides?.[item.name] || item.widget || inferParamWidget(item),
        widget_options: item.options || []
      }));
      const funcName = inferFirstPythonFunction(source) || qs("#wsName").value.trim();
      if (!funcName) { showToast("当前文件没有可测试的 Python 函数"); return; }
      openTestPage({
        id: "__workspace_source__",
        zhName: qs("#wsZhName")?.value.trim() || "新建算法",
        funcName,
        name: funcName,
        namespace: qs("#wsCategory")?.value || "custom",
        callPrefix: `alg.${(qs("#wsCategory")?.value || "custom").replace(/^alg\./, "")}.${funcName}`,
        displayNamespace: `alg.${(qs("#wsCategory")?.value || "custom").replace(/^alg\./, "")}.${funcName}`,
        params,
        inputExample: JSON.stringify(kwargs),
        _workspaceSource: source
      });
      output.classList.add("hidden");
      output.innerHTML = "";
      return;
    }

    async function saveWorkspaceAlgorithm(moduleKind) {
      updateWorkspaceFileContent();
      let kind = qs("#wsKind").value;
      let name = qs("#wsName").value.trim();
      let catValue = qs("#wsCategory")?.value || "";
      const tags = qs("#wsTags").value.split(",").map(item => item.trim()).filter(Boolean);
      const isBlockMode = moduleKind === "template" && qs("#wsEditMode")?.value === "blocks" && state.blockEditor;
      let blocksPayload = null;
      let blockSource = "";
      if (isBlockMode) {
        syncEditorsToBlocks();
        blocksPayload = [...state.blockEditor.blocks]
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((block, index) => ({
            id: block.id || `blk_${index + 1}`,
            order: Number(block.order || index + 1),
            title: block.title || `步骤 ${index + 1}`,
            description: block.description || "",
            hint: block.hint || "",
            code: block.code || "",
            locked: !!block.locked,
          }));
        blockSource = blocksPayload.map(block => {
          const code = block.code || "";
          return code.endsWith("\n") ? code : `${code}\n`;
        }).join("");
        newAlgoState.files = [{ relative_path: `${name || "my_algorithm"}.py`, content: blockSource }];
        newAlgoState.currentFile = newAlgoState.files[0].relative_path;
        kind = "simple";
        if (qs("#wsKind")) qs("#wsKind").value = "simple";
      }

      if (qs("#wsCreateMode")?.value === "import") {
        if (!newAlgoState.importedFromPicker || !newAlgoState.files.length) {
          showToast("请先点击“选择文件”或“选择文件夹”导入本地代码");
          return;
        }
        const imported = newAlgoState.importedFromPicker
          ? newAlgoState.files
          : parseImportedWorkspaceFiles(getWorkspaceCode(), name || "my_algorithm");
        const detected = inferFirstPythonFunction(imported[0]?.content || "");
        if ((!name || name === "my_algorithm") && detected) {
          name = detected;
          qs("#wsName").value = detected;
        }
        newAlgoState.files = imported.map((file, index) => ({
          relative_path: file.relative_path || (index === 0 ? `${name}.py` : `helpers_${index}.py`),
          content: file.content || ""
        }));
        const selectedEntry = qs("#wsEntryFile")?.value;
        const selectedExport = qs("#wsExportFunc")?.value;
        if (selectedExport) {
          name = selectedExport;
          qs("#wsName").value = selectedExport;
        }
        newAlgoState.currentFile = selectedEntry || newAlgoState.currentFile || newAlgoState.files[0]?.relative_path || `${name}.py`;
        kind = newAlgoState.files.length > 1 ? "complex" : "simple";
        if (qs("#wsKind")) qs("#wsKind").value = kind;
      }

      // 前端校验
      if (!name) { showToast("函数名不能为空"); return; }
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) { showToast("函数名只能使用小写字母、数字和下划线（如 my_algo）"); return; }

      // 处理新建分类
      if (catValue === "__new__") {
        const catName = qs("#wsCategoryName")?.value.trim();
        const catNs = qs("#wsCategoryNs")?.value.trim();
        if (!catName || !catNs) { showToast("请填写新分类名称和命名空间"); return; }
        if (/[\u4e00-\u9fff]/.test(catNs) || !/^[a-z_][a-z0-9_.]*$/.test(catNs)) { showToast("分类命名空间只能使用小写字母、数字和下划线"); return; }
        try {
          await api("/api/v1/categories", { method: "POST", body: JSON.stringify({ namespace: catNs, zh_name: catName, module_kind: moduleKind }) });
          catValue = catNs;
        } catch (err) { showToast(err.message); return; }
      }

      const namespace = catValue.trim().replace(/^alg\./, "");
      if (!namespace) { showToast("命名空间不能为空"); return; }
      if (/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/.test(namespace)) { showToast("命名空间不能包含中文字符，请使用英文字母、数字和下划线"); return; }
      if (!/^[a-z_][a-z0-9_.]*$/.test(namespace)) { showToast("命名空间只能使用小写字母、数字、下划线和点号"); return; }
      const inputExample = JSON.stringify(typeof collectWorkspaceParamExamples === "function" ? collectWorkspaceParamExamples() : {});

      // 重复命名空间检测
      const allItems = [...(state.data.components || []), ...(state.data.templates || [])];
      const fullId = `${namespace}.${name}`;
      const duplicate = allItems.find(item => {
        const itemId = item.id || `${item.namespace || ""}.${item.name || item.funcName || ""}`;
        return itemId === fullId;
      });
      if (duplicate) { showToast(`命名空间 "${fullId}" 已存在，请修改函数名或所属类别`); return; }
      const widgetOverrides = collectWorkspaceWidgetOverrides();

      try {
        if (kind === "complex" && !isBlockMode) {
          await api("/api/v1/packages/create", {
            method: "POST",
            body: JSON.stringify({
              name,
              namespace,
              zh_name: qs("#wsZhName").value.trim(),
              version: "1.0.0",
              entry: qs("#wsEntryFile")?.value || newAlgoState.currentFile || newAlgoState.files[0]?.relative_path || "main.py",
              exports: [name],
              zh_description: qs("#wsDesc").value.trim(),
              zh_tags: tags,
              input_example: inputExample,
              widget_overrides: widgetOverrides,
              module_kind: moduleKind,
              published: false,
              publish_status: "draft",
              files: newAlgoState.files
            })
          });
        } else {
          await api("/api/v1/algorithms/create", {
            method: "POST",
            body: JSON.stringify({
              name,
              category: namespace,
              zh_name: qs("#wsZhName").value.trim(),
              zh_description: qs("#wsDesc").value.trim(),
              zh_tags: tags,
              version: "1.0.0",
              code: isBlockMode ? blockSource : newAlgoState.files[0].content,
              module_kind: moduleKind,
              publish_status: "draft",
              input_example: inputExample,
              widget_overrides: widgetOverrides,
              blocks: blocksPayload
            })
          });
        }
        showToast("算法已保存为草稿");
        if (state.blockEditor) cleanupBlockEditor();
        switchPage(newAlgoState.returnPage || (moduleKind === "template" ? "templates-general" : "components-general"));
      } catch (error) {
        showToast(error.message);
      }
    }
