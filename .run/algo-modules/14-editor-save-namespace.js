/*
 * AlgoLib module: 14-editor-save-namespace.js
 * ????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function _saveAsPrivateDraft() {
      const algo = state.editing?.algo;
      if (!algo) return;
      const files = Array.from(state.models.entries()).map(([filename, model]) => ({
        filename,
        content: model?.getValue() || "",
        isEntry: !!state.fileMeta.get(filename)?.is_entry
      }));
      const oldFuncName = namespaceFunction(algo) || algo.funcName || algo.name || "my_func";
      const requestedName = qs("#nsInput")?.value.trim() || oldFuncName;
      const funcName = requestedName;
      const category = algo.namespace || "custom";
      const moduleKind = state.editing.page === "templates" ? "template" : "component";
      const entryFile = files.find(file => file.isEntry) || files.find(file => file.filename === state.currentFile) || files[0];
      const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const renameEntryFunction = (code, fromName, toName) => {
        if (!fromName || fromName === toName) return code;
        return String(code || "").replace(new RegExp(`(def\\s+)${escapeRegExp(fromName)}(\\s*\\()`, "m"), `$1${toName}$2`);
      };
      const entryContent = renameEntryFunction(entryFile?.content || "", oldFuncName, funcName);
      try {
        const result = await api("/api/v1/algorithms/create", {
          method: "POST",
          body: JSON.stringify({
            name: funcName,
            zh_name: algo.zhName || funcName,
            category,
            version: algo.version || "1.0.0",
            zh_description: algo.zhDescription || "",
            zh_tags: algo.zhTags || [],
            code: entryContent,
            module_kind: moduleKind,
            publish_status: "draft",
            input_example: algo.inputExample || ""
          })
        });
        const newAlgo = result.algorithm;
        if (newAlgo) {
          for (const file of files) {
            if (!file || file === entryFile) continue;
            await api(`/api/v1/algorithm-source/${safeId(newAlgo.id)}/add-file`, {
              method: "POST",
              body: JSON.stringify({ filename: file.filename, content: file.content })
            });
          }
          state.editing.id = newAlgo.id;
          state.editing.algo = newAlgo;
          await loadModuleData(state.editing.page);
          showToast("✅ 已另存为您的私有草稿");
          refreshEditorStatusButtons();
          // Update namespace display to new algo
          const nsInput = qs("#nsInput");
          if (nsInput) nsInput.value = namespaceFunction(newAlgo);
          await openEditor(newAlgo, state.editing.page);
        }
      } catch (err) {
        showToast(err.message);
      }
    }

    function nextPatchVersion(value) {
      const [major, minor, patch] = parseVersion(value || "1.0.0");
      return `${major}.${minor}.${patch + 1}`;
    }

    async function bumpVersionAfterCodeSave(algo, isDraftMode = false) {
      if (!algo || isDraftMode) return;
      const nextVersion = nextPatchVersion(algo.version || "1.0.0");
      try {
        const result = await api(`/api/v1/algorithms/${safeId(algo.id || state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ version: nextVersion })
        });
        state.editing.algo = result.algorithm || { ...algo, version: nextVersion };
        state.editing.id = state.editing.algo.id || state.editing.id;
      } catch (error) {
        console.warn("version bump failed", error);
      }
    }

    async function saveEditorAll() {
      if (state.blockEditor) {
        await saveBlockEditor();
      } else {
        await saveCurrentFile();
      }
      const input = qs("#nsInput");
      if (state.editing?.algo && input && input.value.trim()) {
        const desired = `${namespacePrefix(state.editing.algo)}${input.value.trim()}`;
        const current = state.editing.algo.callPrefix || state.editing.algo.displayNamespace || `alg.${state.editing.algo.namespace || ""}.${state.editing.algo.funcName || ""}`;
        if (desired !== current) await saveNamespace();
      }
    }

    async function saveCurrentFile() {
      if (!state.editing || !state.currentFile) return;
      const content = state.models.get(state.currentFile)?.getValue() || "";
      const packageId = state.editing.algo.packageId || state.editing.package?.package_id;
      const isOwner = canManageAlgorithm(state.editing.algo);
      if (!packageId) {
        if (!isOwner) {
          await _saveAsPrivateDraft();
          return;
        }
        try {
          const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/files/${safeId(state.currentFile)}`, {
            method: "POST",
            body: JSON.stringify({ content })
          });
          state.editing.algo = result.algorithm || state.editing.algo;
          state.editing.source.folder_files = result.folder_files || state.editing.source.folder_files;
          if (result.is_draft_mode) {
            showToast("已保存为草稿（提交审核后生效）");
          } else {
            await bumpVersionAfterCodeSave(state.editing.algo, false);
            showToast(`文件已保存，版本已更新为 ${state.editing.algo.version || "新版本"}`);
          }
          refreshEditorStatusButtons();
        } catch (error) {
          showToast(error.message);
        }
        return;
      }
      try {
        await api(`/api/v1/packages/${safeId(packageId)}/files/${safeId(state.currentFile)}`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        await bumpVersionAfterCodeSave(state.editing.algo, false);
        showToast(`文件已保存，版本已更新为 ${state.editing.algo.version || "新版本"}`);
      } catch (error) {
        showToast(error.message);
      }
    }

    async function registerCompletionProvider() {
      const m = await loadMonaco();
      try {
        const data = await api("/api/v1/stubs/completions");
        state.completionItems = data.items || data.completions || data.algorithms || [];
      } catch (error) {
        state.completionItems = [];
      }
      if (state.completionDisposable) state.completionDisposable.dispose();
      const completionPrivacy = item => privacyLabel(item);
      state.completionDisposable = m.languages.registerCompletionItemProvider("python", {
        triggerCharacters: ["."],
        provideCompletionItems(model, position) {
          const lineText = model.getLineContent(position.lineNumber);
          const textBefore = lineText.substring(0, position.column - 1);
          // Match the full alg.xxx.yyy expression up to cursor
          const algMatch = textBefore.match(/\balg(?:\.\w+)*\.?\w*$/);
          if (!algMatch) return { suggestions: [] };
          const startColumn = position.column - algMatch[0].length;
          const range = {
            startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
            startColumn, endColumn: position.column
          };
          return {
            suggestions: state.completionItems.map(item => {
              const call = item.callPrefix || item.call_prefix || "";
              if (!call) return null;
              const ns = item.namespace || call.split(".")[1] || "";
              const params = item.params || [];
              const insertText = item.callSnippet ||
                `${call}(${params.map((p, i) => `\${${i + 1}:${p.name || "arg"}}`).join(", ")})`;
              const zhName = item.zhName || item.zh_name || "";
              const zhDesc = item.zhDescription || item.zh_description || "";
              const tags = (item.zhTags || item.zh_tags || []).join("、");
              return {
                label: { label: call, description: zhName ? `${zhName} | ${ns}` : ns },
                filterText: call,
                sortText: call,
                kind: m.languages.CompletionItemKind.Function,
                insertText,
                insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: completionPrivacy(item),
                documentation: {
                  value: [zhName ? `**${zhName}**` : "", zhDesc, tags ? `\n标签: ${tags}` : ""].filter(Boolean).join("\n\n")
                },
                range
              };
            }).filter(Boolean)
          };
        }
      });
    }

    function validateNamespace() {
      const value = qs("#nsInput").value.trim();
      const hasChinese = /[\u4e00-\u9fa5\uff00-\uffef]/.test(value);
      const ok = /^[a-z_][a-z0-9_]*$/.test(value);
      qs("#nsBox").classList.toggle("invalid", !ok);
      qs("#nsErr").textContent = ok ? "" : hasChinese ? "函数名不能包含中文，请使用小写字母和下划线" : "函数名只能使用小写字母、数字和下划线（如 lgbm_train）";
      return ok;
    }

    async function saveNamespace() {
      if (!validateNamespace()) return;
      const isOwner = canManageAlgorithm(state.editing.algo);
      if (!isOwner) {
        await _saveAsPrivateDraft();
        return;
      }
      const newNamespace = `${namespacePrefix(state.editing.algo)}${qs("#nsInput").value.trim()}`;
      try {
        const result = await api(`/api/v1/algorithms/${safeId(state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ namespace: newNamespace })
        });
        state.editing.id = result.algorithm.id;
        state.editing.algo = result.algorithm;
        showToast("函数调用名已更新");
      } catch (error) {
        showToast(error.message);
      }
    }

    function closeEditor() {
      const page = state.editing?.returnPage || state.editing?.page || state.page;
      if (state.editor) {
        state.editor.dispose();
        state.editor = null;
      }
      state.models.forEach(model => {
        if (model && !model.isDisposed()) model.dispose();
      });
      state.models.clear();
      state.fileMeta.clear();
      state.viewStates.clear();
      state.editing = null;
      window._activeMonaco = null;
      // 清理分块编辑器（如有）
      if (state.blockEditor) cleanupBlockEditor();
      // 清理 IDE 底部面板
      if (state.terminalWs) { state.terminalWs.close(); state.terminalWs = null; }
      if (state.executeWs) { state.executeWs.close(); state.executeWs = null; }
      if (state.xterm) { state.xterm.dispose(); state.xterm = null; }
      state.xtermFitAddon = null;
      state.terminalInited = false;
      state.bottomPanelOpen = false;
      // 恢复 main 的 padding
      const main = qs("#main");
      if (main) main.classList.remove("editor-active");
      state.pendingScrollRestore = page;
      switchPage(page);
      restoreMainScroll(page);
    }

    async function saveAndCloseEditor() {
      if (state.blockEditor) {
        await saveBlockEditor();
      } else {
        await saveCurrentFile();
      }
      closeEditor();
    }
