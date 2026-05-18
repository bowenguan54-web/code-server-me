/*
 * AlgoLib module: 13-editor-files.js
 * ???????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function runEditorLocalDiagnostics(showResult = false) {
      const model = state.editor?.getModel();
      if (!model) return [];
      const diagnostics = localPythonDiagnostics(model.getValue());
      applyDiagnosticsToModel(model, diagnostics);
      if (showResult) showToast(diagnostics.length ? `发现 ${diagnostics.length} 个本地代码问题` : "本地代码检查通过");
      return diagnostics;
    }

    async function checkCurrentEditorSyntax() {
      const model = state.editor?.getModel();
      if (!model || !state.editing) { showToast("编辑器未就绪"); return; }
      const localErrors = runEditorLocalDiagnostics(false);
      try {
        const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/check-syntax`, {
          method: "POST",
          body: JSON.stringify({ filename: state.currentFile || "source.py", content: model.getValue() })
        });
        const serverErrors = (result.errors || []).map(item => ({
          line: item.line || 1,
          col: item.col || 1,
          message: item.message || "Python 语法错误"
        }));
        applyDiagnosticsToModel(model, [...localErrors, ...serverErrors]);
        showToast(serverErrors.length || localErrors.length ? `发现 ${serverErrors.length + localErrors.length} 个代码问题` : "代码检查通过");
      } catch (error) {
        showToast(error.message || "代码检查失败");
      }
    }

    function normalizeFunctions(functions) {
      return (functions || []).map(fn => {
        if (typeof fn === "string") return { func_name: fn, name: fn, params: [] };
        return {
          ...fn,
          func_name: fn.func_name || fn.name,
          name: fn.name || fn.func_name,
          params: fn.params || []
        };
      }).filter(fn => fn.func_name || fn.name);
    }

    async function refreshEditorFolderFiles(files, activeFile) {
      const m = await loadMonaco();
      const normalized = (files || []).map(file => ({
        filename: file.relative_path || file.filename,
        content: file.content || "",
        isEntry: !!file.is_entry,
        functions: normalizeFunctions(file.functions || [])
      })).filter(file => file.filename);
      if (!normalized.length) return;

      if (!state.editing.source) state.editing.source = {};
      state.editing.source.folder_files = normalized;
      const nextNames = new Set(normalized.map(file => file.filename));

      Array.from(state.models.entries()).forEach(([filename, model]) => {
        if (!nextNames.has(filename)) {
          if (model && !model.isDisposed()) model.dispose();
          state.models.delete(filename);
          state.fileMeta.delete(filename);
          state.viewStates.delete(filename);
        }
      });

      normalized.forEach(file => {
        const uri = m.Uri.parse(`inmemory://algolib/${encodeURIComponent(state.editing.id)}/${encodeURIComponent(file.filename)}`);
        let model = state.models.get(file.filename);
        if (!model || model.isDisposed()) {
          const existing = m.editor.getModel(uri);
          if (existing && !existing.isDisposed()) existing.dispose();
          model = m.editor.createModel(file.content, "python", uri);
          state.models.set(file.filename, model);
        } else if (model.getValue() !== file.content && file.filename !== state.currentFile) {
          model.setValue(file.content);
        }
        state.fileMeta.set(file.filename, file);
      });

      const target = activeFile && state.models.has(activeFile)
        ? activeFile
        : (normalized.find(file => file.isEntry) || normalized[0]).filename;
      renderFileTree();
      switchFile(target);
    }

    function renderFileTree() {
      const files = Array.from(state.fileMeta.values());
      qs("#fileTree").innerHTML = `
        <div class="file-tree-head">
          <span>目录文件</span>
          <button class="ghost" type="button" data-add-file="1" onclick="window.addSourceFile(event)">＋ 新增文件</button>
        </div>
        ${files.map(file => {
          const names = (file.functions || []).map(fn => fn.func_name || fn.name).filter(Boolean);
          return `
            <div class="file-item ${file.filename === state.currentFile ? "active" : ""}" data-file-name="${esc(file.filename)}">
              <div class="file-name" style="display:flex;align-items:center;gap:4px">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(file.filename)}${file.isEntry ? " · entry" : ""}</span>
                <button class="ghost" type="button" style="font-size:11px;padding:1px 5px;flex-shrink:0" data-rename-file="${esc(file.filename)}" onclick="event.stopPropagation();window.renameSourceFile(this.dataset.renameFile)" title="重命名">改名</button>
                <button class="ghost danger" type="button" style="font-size:14px;line-height:1;padding:1px 6px;flex-shrink:0;color:${file.isEntry ? "var(--text-dim)" : "var(--danger)"};opacity:${file.isEntry ? ".55" : "1"}" data-delete-file="${esc(file.filename)}" ${file.isEntry ? 'data-entry-file="1" title="入口文件不能删除"' : 'title="删除文件"'}>×</button>
              </div>
              <div class="file-functions">${names.length ? `def ${esc(names.join(", "))}` : "无函数"}</div>
            </div>
          `;
        }).join("")}
      `;
      qsa("[data-file-name]", qs("#fileTree")).forEach(item => {
        item.addEventListener("click", () => switchFile(item.dataset.fileName || ""));
      });
      qsa("[data-delete-file]", qs("#fileTree")).forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          deleteSourceFile(button.dataset.deleteFile || "", button.dataset.entryFile === "1");
        });
      });
    }

    function switchFile(filename) {
      if (!state.editor || !state.models.has(filename)) return;
      if (state.currentFile) state.viewStates.set(state.currentFile, state.editor.saveViewState());
      state.currentFile = filename;
      state.editor.setModel(state.models.get(filename));
      const viewState = state.viewStates.get(filename);
      if (viewState) state.editor.restoreViewState(viewState);
      state.editor.focus();
      renderFileTree();
      renderTestPanel();
      // >>> DEBUG INTEGRATION POINT: sync breakpoint decorations to switched file
      updateBreakpointDecorations();
      if (state.debugSession?.currentFile === filename && state.debugSession?.currentLine) {
        updateCurrentLineDecoration(state.debugSession.currentLine);
      }
    }

    function openSourceFileModal(mode, oldName = "") {
      const isRename = mode === "rename";
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:440px">
          <h3>${isRename ? "重命名文件" : "新增 Python 文件"}</h3>
          <div class="form-grid">
            ${isRename ? `<div class="form-row"><label>当前文件</label><input value="${esc(oldName)}" disabled /></div>` : ""}
            <div class="form-row"><label>文件名</label><input id="sourceFileNameInput" value="${esc(isRename ? oldName : "helpers.py")}" placeholder="例如 helpers.py" /></div>
          </div>
          <div class="field-error" id="sourceFileErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.confirmSourceFileModal('${esc(mode)}','${esc(oldName)}')">${isRename ? "确认改名" : "创建文件"}</button>
          </div>
        </div>
      `;
      window.setTimeout(() => qs("#sourceFileNameInput")?.focus(), 0);
    }

    function addSourceFile(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openSourceFileModal("add");
    }

    function renameSourceFile(oldName) {
      if (!oldName) return;
      openSourceFileModal("rename", oldName);
    }

    async function deleteSourceFile(filename, isEntry = false) {
      if (!filename) return;
      if (isEntry) {
        showToast("入口文件不能删除");
        return;
      }
      showToast(`正在删除：${filename}`);
      try {
        const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/files/${encodeURIComponent(filename)}`, {
          method: "DELETE"
        });
        if (result.algorithm) {
          state.editing.algo = result.algorithm;
          state.editing.id = result.algorithm.id || state.editing.id;
        }
        const files = result.folder_files || [];
        const next = files.find(file => file.is_entry) || files[0];
        await refreshEditorFolderFiles(files, next ? (next.relative_path || next.filename) : "");
        showToast(`文件已删除：${filename}`);
      } catch (error) {
        showToast(error.message || `删除失败：${filename}`);
      }
    }

    async function confirmSourceFileModal(mode, oldName = "") {
      const clean = qs("#sourceFileNameInput")?.value.trim() || "";
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(clean) || clean === "__init__.py") {
        qs("#sourceFileErr").textContent = "文件名必须是普通 .py 文件，例如 helpers.py";
        return;
      }
      if (mode === "rename" && clean === oldName) {
        closeModal();
        return;
      }
      try {
        if (mode === "rename") await doRenameSourceFile(oldName, clean);
        else await doAddSourceFile(clean);
        closeModal();
      } catch (error) {
        const err = qs("#sourceFileErr");
        if (err) err.textContent = error.message;
        else showToast(error.message);
      }
    }

    async function doAddSourceFile(clean) {
      const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/add-file`, {
        method: "POST",
        body: JSON.stringify({ filename: clean, content: "# 新文件\n" })
      });
      await refreshEditorFolderFiles(result.folder_files || [], clean);
      showToast("文件已创建");
    }

    async function doRenameSourceFile(oldName, clean) {
      const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/rename-file`, {
        method: "PATCH",
        body: JSON.stringify({ old_name: oldName, new_name: clean })
      });
      if (result.algorithm) {
        state.editing.algo = result.algorithm;
        state.editing.id = result.algorithm.id || state.editing.id;
      }
      await refreshEditorFolderFiles(result.folder_files || [], clean);
      showToast(`文件已重命名为 ${clean}`);
    }

    // workspace textarea 界面的文件重命名（新建算法时）
    function renameWorkspaceFile(oldPath) {
      const newName = window.prompt("请输入新文件名（如 helpers.py）", oldPath);
      if (!newName || newName.trim() === oldPath) return;
      const clean = newName.trim();
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(clean)) {
        showToast("文件名格式不正确，必须以 .py 结尾");
        return;
      }
      const file = newAlgoState.files.find(f => f.relative_path === oldPath);
      if (!file) return;
      updateWorkspaceFileContent();
      file.relative_path = clean;
      if (newAlgoState.currentFile === oldPath) newAlgoState.currentFile = clean;
      renderWorkspaceFiles();
      showToast(`已重命名为 ${clean}`);
    }
