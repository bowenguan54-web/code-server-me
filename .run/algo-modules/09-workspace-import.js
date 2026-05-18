/*
 * AlgoLib module: 09-workspace-import.js
 * ?????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function pickWorkspaceFile() {
      const picker = qs("#wsFilePicker");
      if (picker) {
        picker.value = "";
        picker.click();
      }
    }

    function pickWorkspaceFolder() {
      const picker = qs("#wsFolderPicker");
      if (picker) {
        picker.value = "";
        picker.click();
      }
    }

    async function handleWorkspaceImportFiles(fileList) {
      const files = Array.from(fileList || [])
        .filter(file => /\.py$/i.test(file.name) && !/(^|\/)__pycache__(\/|$)/.test(file.webkitRelativePath || file.name))
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
      if (!files.length) {
        showToast("请选择 .py 文件或包含 .py 文件的文件夹");
        return;
      }
      const commonPrefix = longestCommonPathPrefix(files.map(file => file.webkitRelativePath || file.name));
      const loaded = [];
      for (const file of files) {
        const rawPath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        let relativePath = rawPath;
        if (commonPrefix && relativePath.startsWith(commonPrefix)) relativePath = relativePath.slice(commonPrefix.length);
        relativePath = relativePath.replace(/^\/+/, "");
        if (!relativePath || relativePath === "__init__.py") relativePath = file.name;
        loaded.push({ relative_path: relativePath, content: await file.text() });
      }
      const functions = detectWorkspaceFunctions(loaded);
      const entryName = chooseWorkspaceEntry(loaded, functions);
      const exportFunc = chooseWorkspaceExport(entryName, functions) || inferFirstPythonFunction(loaded.find(file => file.relative_path === entryName)?.content || "") || (qs("#wsName")?.value.trim() || "my_algorithm");
      newAlgoState.files = loaded;
      newAlgoState.currentFile = entryName || loaded[0].relative_path;
      newAlgoState.importedFromPicker = true;
      newAlgoState.functions = functions;
      newAlgoState.widgetParams = [];
      newAlgoState.widgetOverrides = {};
      renderWidgetConfigRows([]);
      if (qs("#wsKind")) qs("#wsKind").value = loaded.length > 1 ? "complex" : "simple";
      if (qs("#wsCreateMode")) qs("#wsCreateMode").value = "import";
      if (qs("#wsName") && exportFunc) qs("#wsName").value = exportFunc;
      renderWorkspaceFiles();
      await initWorkspaceMonaco();
      renderWorkspaceImportMeta(entryName, exportFunc);
      const summary = qs("#wsImportSummary");
      if (summary) summary.textContent = `已导入 ${loaded.length} 个 Python 文件，识别到 ${functions.length} 个函数`;
      showToast(`已导入 ${loaded.length} 个 Python 文件`);
    }

    function longestCommonPathPrefix(paths) {
      const splitPaths = (paths || [])
        .filter(path => path && path.includes("/"))
        .map(path => path.split("/").slice(0, -1));
      if (!splitPaths.length) return "";
      let prefix = splitPaths[0];
      splitPaths.slice(1).forEach(parts => {
        let i = 0;
        while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i += 1;
        prefix = prefix.slice(0, i);
      });
      return prefix.length ? `${prefix.join("/")}/` : "";
    }

    function detectWorkspaceFunctions(files) {
      const functions = [];
      (files || []).forEach(file => {
        const source = file.content || "";
        const regex = /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm;
        let match;
        while ((match = regex.exec(source)) !== null) {
          const params = splitTopLevelParams(match[2] || "").map(raw => {
            const clean = raw.replace(/^\*\*?/, "").split("=")[0].trim();
            const [name, type = "Any"] = clean.split(":").map(item => item.trim());
            return name && !["self", "cls"].includes(name) ? { name, type: type || "Any" } : null;
          }).filter(Boolean);
          functions.push({ file: file.relative_path, name: match[1], params, return_type: (match[3] || "Any").trim() });
        }
      });
      return functions;
    }

    function chooseWorkspaceEntry(files, functions) {
      const names = (files || []).map(file => file.relative_path);
      const preferred = ["main.py", "app.py", "algorithm.py", "model.py"];
      for (const item of preferred) {
        const exact = names.find(name => name.toLowerCase() === item);
        if (exact) return exact;
      }
      const firstWithFunction = functions?.[0]?.file;
      return firstWithFunction || names[0] || "";
    }

    function chooseWorkspaceExport(entryName, functions) {
      const fromEntry = (functions || []).find(fn => fn.file === entryName);
      return fromEntry?.name || functions?.[0]?.name || "";
    }

    function renderWorkspaceImportMeta(entryName = "", exportFunc = "") {
      const meta = qs("#wsImportMeta");
      const entrySelect = qs("#wsEntryFile");
      const exportSelect = qs("#wsExportFunc");
      if (!meta || !entrySelect || !exportSelect) return;
      meta.style.display = "";
      entrySelect.innerHTML = newAlgoState.files.map(file => `<option value="${esc(file.relative_path)}"${file.relative_path === entryName ? " selected" : ""}>${esc(file.relative_path)}</option>`).join("");
      const funcs = newAlgoState.functions.filter(fn => !entrySelect.value || fn.file === entrySelect.value);
      exportSelect.innerHTML = (funcs.length ? funcs : newAlgoState.functions).map(fn => `<option value="${esc(fn.name)}"${fn.name === exportFunc ? " selected" : ""}>${esc(fn.name)} (${esc(fn.file)})</option>`).join("");
      if (!exportSelect.innerHTML) exportSelect.innerHTML = `<option value="${esc(qs("#wsName")?.value || "my_algorithm")}">${esc(qs("#wsName")?.value || "my_algorithm")}</option>`;
    }

    function onWorkspaceEntryChange() {
      const entryName = qs("#wsEntryFile")?.value || "";
      if (entryName) {
        switchWorkspaceFile(entryName);
        const exportFunc = chooseWorkspaceExport(entryName, newAlgoState.functions);
        if (exportFunc && qs("#wsName")) qs("#wsName").value = exportFunc;
        renderWorkspaceImportMeta(entryName, exportFunc);
      }
    }

    function onWorkspaceExportChange() {
      const exportFunc = qs("#wsExportFunc")?.value || "";
      if (exportFunc && qs("#wsName")) qs("#wsName").value = exportFunc;
    }

    function renderWorkspaceFiles() {
      qs("#wsFileList").innerHTML = newAlgoState.files.length ? newAlgoState.files.map(file => `
        <div style="display:flex;align-items:center;gap:2px">
          <button class="${file.relative_path === newAlgoState.currentFile ? "active" : ""}" style="flex:1;text-align:left" onclick="window.switchWorkspaceFile('${esc(file.relative_path)}')">${esc(file.relative_path)}</button>
          <button class="ghost" style="font-size:11px;padding:2px 5px;flex-shrink:0" onclick="window.renameWorkspaceFile('${esc(file.relative_path)}')" title="重命名">改</button>
        </div>`).join("") : '<div class="empty" style="padding:14px">尚未导入文件</div>';
      const file = newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile);
      if (newAlgoState.editor && newAlgoState.models?.has(newAlgoState.currentFile)) {
        newAlgoState.editor.setModel(newAlgoState.models.get(newAlgoState.currentFile));
      }
    }

    function switchWorkspaceFile(path) {
      updateWorkspaceFileContent();
      newAlgoState.currentFile = path;
      renderWorkspaceFiles();
      runWorkspaceDiagnostics();
    }

    function updateWorkspaceFileContent() {
      const file = newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile);
      if (!file) return;
      if (newAlgoState.editor) file.content = newAlgoState.editor.getValue();
      else if (qs("#wsCode")) file.content = qs("#wsCode").value;
    }
