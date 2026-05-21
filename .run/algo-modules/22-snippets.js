/*
 * AlgoLib module: 22-snippets.js
 * 代码片段编辑、复制、审核、贡献历史与快捷插入逻辑。
 */

    function snippetHistoryRows(history) {
      const rows = Array.isArray(history) ? history.slice().reverse() : [];
      if (!rows.length) return '<tr><td colspan="5">暂无修改记录</td></tr>';
      return rows.map(item => {
        const fromVersion = item.from_version || "";
        const toVersion = item.to_version || "";
        const action = item.action || "";
        const versionText = fromVersion && toVersion && fromVersion !== toVersion
          ? `v${fromVersion} → v${toVersion}`
          : (toVersion ? `→ v${toVersion}` : "-");
        return `
          <tr>
            <td>${esc(item.operator_name || item.operator || "system")}</td>
            <td>${esc(item.timestamp || "")}</td>
            <td>${esc(action)}</td>
            <td>${esc(versionText)}</td>
            <td>${esc(item.note || "")}</td>
          </tr>
        `;
      }).join("");
    }

    async function editSnippet(id, fork = false) {
      let snippet = id ? (await api(`/api/v1/snippets/${safeId(id)}`)).snippet : {
        name: "", zh_name: "", body: "", language: "python", tags: [], scope: "private", version: "1.0", publish_status: "draft"
      };
      const status = getStatus(snippet);
      const publicEdit = status === "published" && !fork;
      let saveId = id || "";
      if (fork) {
        snippet = {
          ...snippet,
          id: "",
          name: snippet.name || "snippet",
          zh_name: `${snippet.zh_name || snippet.name || "代码片段"} 副本`,
          scope: "private",
          owner_id: state.currentUser?.id || "",
          publish_status: "draft",
          review_draft: null
        };
        saveId = "";
      }
      state.snippetEditing = { id: saveId, snippet, publicEdit };
      const title = publicEdit ? "编辑公有片段（需审核）" : (saveId ? "编辑代码片段" : "新建代码片段");
      const saveText = publicEdit ? "提交修改" : "保存";
      qs("#main").innerHTML = `
        <div class="editor-view snippet-editor" id="snippetEditorView">
          <div class="editor-top-info">
            <button onclick="window.closeSnippetEditor()">返回</button>
            <span class="breadcrumb">代码片段 / ${esc(snippet.zh_name || snippet.name || "新建片段")}</span>
            <span class="tag ${publicEdit ? "warning" : statusClass(getStatus(snippet))}">${esc(publicEdit ? "需审核" : statusLabel(getStatus(snippet)))}</span>
            <strong style="color:var(--text-dim);font-size:13px">${esc(title)}</strong>
            <span class="spacer"></span>
            <button onclick="window.showSnippetHistory('${esc(id || "")}')">修改记录</button>
            <button onclick="window.copySnippetFromEditor()">复制</button>
            <button class="primary" onclick="window.saveSnippet('${esc(saveId)}')">${esc(saveText)}</button>
          </div>
          <div class="snippet-meta">
            <div class="snippet-top-field"><label>触发名</label><input id="snName" value="${esc(snippet.name || "")}" placeholder="csv_to_records" /></div>
            <div class="snippet-top-field"><label>中文名</label><input id="snZhName" value="${esc(snippet.zh_name || "")}" placeholder="CSV 转记录片段" /></div>
            <div class="snippet-top-field"><label>权限</label><input value="${publicEdit ? "公有片段修改审核" : "私有（审核通过后变为公有）"}" disabled /></div>
            <div class="snippet-top-field"><label>语言</label><input id="snLanguage" value="${esc(snippet.language || "python")}" /></div>
            <div class="snippet-top-field"><label>标签</label><input id="snTags" value="${esc((snippet.tags || []).join(","))}" placeholder="CSV,DataFrame" /></div>
            <div class="snippet-top-field"><label>版本</label><input id="snVersion" value="${esc(snippet.version || "1.0")}" /></div>
          </div>
          <div class="snippet-code-shell">
            <div class="snippet-code-title"><span>代码内容</span><span class="tag">Python</span><span class="spacer"></span><span>Ctrl+S 保存，Ctrl+Alt+S 插入片段</span></div>
            <div class="monaco-host" id="snippetMonacoHost"></div>
          </div>
        </div>
      `;
      await initSnippetEditor(snippet.body || "");
    }

    async function saveSnippet(id) {
      if (state.snippetEditor) {
        const model = state.snippetEditor.getModel();
        if (model) state.snippetEditing.snippet.body = model.getValue();
      }
      const payload = {
        name: qs("#snName").value.trim(),
        zh_name: qs("#snZhName").value.trim(),
        language: qs("#snLanguage").value.trim() || "python",
        scope: "private",
        tags: qs("#snTags").value.split(",").map(item => item.trim()).filter(Boolean),
        version: qs("#snVersion").value.trim() || "1.0",
        body: state.snippetEditing?.snippet?.body || "",
        publish_status: id ? (state.snippetEditing?.snippet?.publish_status || state.snippetEditing?.snippet?.publishStatus || "draft") : "draft"
      };
      try {
        if (state.snippetEditing?.publicEdit && id) {
          await api(`/api/v1/snippets/${safeId(id)}/edit-draft`, {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showToast("公有代码片段修改已提交审核");
        } else {
          await api(id ? `/api/v1/snippets/${safeId(id)}` : "/api/v1/snippets", {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(payload)
          });
          showToast("代码片段已保存");
        }
        await loadModuleData("snippets");
        closeSnippetEditor();
      } catch (error) {
        showToast(error.message);
      }
    }

    async function initSnippetEditor(content) {
      const m = await loadMonaco();
      if (state.snippetEditor) {
        state.snippetEditor.dispose();
        state.snippetEditor = null;
      }
      const uri = m.Uri.parse(`inmemory://algolib/snippet/${encodeURIComponent(state.snippetEditing?.id || "new")}.py`);
      const existing = m.editor.getModel(uri);
      if (existing && !existing.isDisposed()) existing.dispose();
      const model = m.editor.createModel(content, "python", uri);
      state.snippetEditor = m.editor.create(qs("#snippetMonacoHost"), {
        model,
        theme: "algolib-dark",
        language: "python",
        automaticLayout: true,
        fontSize: 14,
        tabSize: 4,
        autoIndent: "full",
        folding: true,
        bracketPairColorization: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: false }
      });
      window._activeMonaco = state.snippetEditor;
      state.snippetEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveSnippet(state.snippetEditing?.id || ""));
      state.snippetEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
    }

    function closeSnippetEditor() {
      if (state.snippetEditor) {
        const model = state.snippetEditor.getModel();
        state.snippetEditor.dispose();
        if (model && !model.isDisposed()) model.dispose();
        state.snippetEditor = null;
      }
      state.snippetEditing = null;
      window._activeMonaco = state.editor || null;
      switchPage("snippets");
    }

    async function copySnippetFromEditor() {
      await copyTextToClipboard(state.snippetEditor?.getValue() || "");
    }

    async function insertSnippetById(id) {
      try {
        const data = await api(`/api/v1/snippets/${safeId(id)}`);
        insertSnippet(data.snippet.body || "");
      } catch (error) {
        showToast(error.message);
      }
    }

    function copyTextToClipboard(text) {
      const value = String(text || "");
      function fallbackCopy() {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
        document.body.appendChild(el);
        el.focus();
        el.select();
        try { document.execCommand("copy"); showToast("已复制到剪贴板"); }
        catch (_err) { showToast("复制失败，请手动选择代码后复制"); }
        document.body.removeChild(el);
      }
      if (navigator.clipboard) {
        return navigator.clipboard.writeText(value).then(() => showToast("已复制到剪贴板")).catch(() => fallbackCopy());
      }
      fallbackCopy();
      return Promise.resolve();
    }

    function insertSnippet(body) {
      if (!window._activeMonaco || !state.monaco) {
        copyTextToClipboard(body);
        return;
      }
      const editor = window._activeMonaco;
      const position = editor.getPosition();
      const line = editor.getModel().getLineContent(position.lineNumber);
      const indent = (line.match(/^\s*/) || [""])[0];
      const text = String(body).split("\n").map((lineText, index) => index === 0 ? lineText : indent + lineText).join("\n");
      editor.executeEdits("snippet-insert", [{
        range: new state.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text
      }]);
      editor.focus();
    }

    async function copySnippet(id) {
      try {
        const data = await api(`/api/v1/snippets/${safeId(id)}`);
        await copyTextToClipboard(data.snippet.body || "");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function forkSnippet(id) {
      await editSnippet(id, true);
    }

    async function deleteSnippet(id) {
      openModal(`
        <div class="modal-card">
          <h3>删除代码片段</h3>
          <p>确认删除这个代码片段？删除后不可恢复。</p>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="danger" onclick="window.confirmDeleteSnippet('${esc(id)}')">确认删除</button>
          </div>
        </div>
      `);
    }

    async function confirmDeleteSnippet(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}`, { method: "DELETE" });
        closeModal();
        showToast("代码片段已删除");
        await loadModuleData("snippets");
        renderNav();
        renderCards("snippets");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function refreshSnippetsAfterReview(message) {
      showToast(message);
      await loadModuleData("snippets");
      if (state.page === "snippets") renderCards("snippets");
    }

    async function submitSnippetReview(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}/submit`, { method: "POST" });
        await refreshSnippetsAfterReview("代码片段已提交审核");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function withdrawSnippetReview(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}/withdraw`, { method: "POST" });
        await refreshSnippetsAfterReview("代码片段已撤回");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function approveSnippetReview(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}/approve`, { method: "POST" });
        await refreshSnippetsAfterReview("代码片段审核已通过");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function rejectSnippetReview(id) {
      const comment = prompt("请输入驳回原因", "请补充代码片段说明或修正实现。") || "";
      try {
        await api(`/api/v1/snippets/${safeId(id)}/reject`, {
          method: "POST",
          body: JSON.stringify({ comment })
        });
        await refreshSnippetsAfterReview("代码片段已驳回");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function publishSnippet(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}/publish`, { method: "POST" });
        await refreshSnippetsAfterReview("代码片段已发布为公有");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function approveSnippetEdit(id) {
      try {
        await api(`/api/v1/snippets/${safeId(id)}/approve-edit`, { method: "POST" });
        await refreshSnippetsAfterReview("公有片段修改已通过");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function rejectSnippetEdit(id) {
      const comment = prompt("请输入驳回原因", "修改说明不足或实现需调整。") || "";
      try {
        await api(`/api/v1/snippets/${safeId(id)}/reject-edit`, {
          method: "POST",
          body: JSON.stringify({ comment })
        });
        await refreshSnippetsAfterReview("公有片段修改已驳回");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function showSnippetHistory(id) {
      if (!id) {
        showToast("请先保存代码片段");
        return;
      }
      try {
        const data = await api(`/api/v1/snippets/${safeId(id)}`);
        const snippet = data.snippet || {};
        const draft = snippet.review_draft || snippet.reviewDraft || null;
        openModal(`
          <div class="modal-card" style="max-width:880px">
            <h3>修改记录 / ${esc(snippet.zh_name || snippet.name || id)}</h3>
            ${draft ? `<p class="desc">当前修改草稿：${esc(draft.status || "")}${draft.reject_reason ? `，驳回原因：${esc(draft.reject_reason)}` : ""}</p>` : ""}
            <table class="api-table">
              <thead><tr><th>贡献人</th><th>时间</th><th>动作</th><th>版本</th><th>备注</th></tr></thead>
              <tbody>${snippetHistoryRows(snippet.history || [])}</tbody>
            </table>
            <div class="modal-actions"><button onclick="window.closeModal()">关闭</button></div>
          </div>
        `);
      } catch (error) {
        showToast(error.message);
      }
    }

    function openSnippetOverlay() {
      const overlay = qs("#snippetOverlay");
      overlay.classList.remove("hidden");
      overlay.innerHTML = `
        <div class="overlay-card">
          <input id="snippetSearchInput" placeholder="搜索代码片段，回车插入" autocomplete="off" />
          <div id="snippetSearchResults"></div>
        </div>
      `;
      const input = qs("#snippetSearchInput");
      input.focus();
      input.addEventListener("input", () => searchSnippetOverlay(input.value));
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSnippetOverlay();
        if (event.key === "ArrowDown") { state.snippetCursor = Math.min(state.snippetCursor + 1, state.snippetResults.length - 1); renderSnippetResults(); event.preventDefault(); }
        if (event.key === "ArrowUp") { state.snippetCursor = Math.max(state.snippetCursor - 1, 0); renderSnippetResults(); event.preventDefault(); }
        if (event.key === "Enter" && state.snippetResults[state.snippetCursor]) {
          insertSnippet(state.snippetResults[state.snippetCursor].body || "");
          closeSnippetOverlay();
        }
      });
      searchSnippetOverlay("");
    }

    function closeSnippetOverlay() {
      qs("#snippetOverlay").classList.add("hidden");
      qs("#snippetOverlay").innerHTML = "";
    }

    function openAlgoCallOverlay() {
      const overlay = qs("#snippetOverlay");
      overlay.classList.remove("hidden");
      overlay.innerHTML = `
        <div class="overlay-card">
          <div style="color:#94a3b8;font-size:11px;margin-bottom:8px">Ctrl+Alt+I | 搜索算法，回车插入调用代码</div>
          <input id="algoCallSearchInput" placeholder="搜索算法名称 / 调用前缀" autocomplete="off" style="width:100%;box-sizing:border-box" />
          <div id="algoCallResults" style="max-height:320px;overflow-y:auto;margin-top:6px"></div>
        </div>
      `;
      const input = qs("#algoCallSearchInput");
      input.focus();
      const closeOverlay = () => { overlay.classList.add("hidden"); overlay.innerHTML = ""; };
      input.addEventListener("input", () => _renderAlgoCallResults(input.value));
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") { closeOverlay(); }
        if (event.key === "ArrowDown") { state.algoCallCursor = Math.min(state.algoCallCursor + 1, state.algoCallResults.length - 1); _renderAlgoCallResults(input.value); event.preventDefault(); }
        if (event.key === "ArrowUp") { state.algoCallCursor = Math.max(state.algoCallCursor - 1, 0); _renderAlgoCallResults(input.value); event.preventDefault(); }
        if (event.key === "Enter") {
          const item = state.algoCallResults[state.algoCallCursor];
          if (item) { _insertAlgoCall(item); closeOverlay(); }
        }
      });
      if (!state.completionItems || state.completionItems.length === 0) {
        qs("#algoCallResults").innerHTML = '<div class="empty" style="color:#94a3b8;padding:12px">数据加载中...</div>';
        registerCompletionProvider().then(() => _renderAlgoCallResults(input.value || ""));
      } else {
        _renderAlgoCallResults("");
      }
    }

    function _renderAlgoCallResults(keyword) {
      const root = qs("#algoCallResults");
      if (!root) return;
      const q = (keyword || "").toLowerCase();
      const items = state.completionItems || [];
      const filtered = q
        ? items.filter(item => {
            const call = (item.callPrefix || item.call_prefix || "").toLowerCase();
            const desc = (item.zhDescription || item.zh_description || "").toLowerCase();
            return call.includes(q) || desc.includes(q);
          })
        : items;
      state.algoCallResults = filtered.slice(0, 30);
      if (state.algoCallCursor >= state.algoCallResults.length) state.algoCallCursor = 0;
      root.innerHTML = state.algoCallResults.map((item, index) => {
        const call = item.callPrefix || item.call_prefix || "";
        const desc = item.zhDescription || item.zh_description || "";
        const params = (item.params || []).map(p => p.name || "arg").join(", ");
        const privacy = isPublicItem(item) ? "公有" : "私有";
        return `
          <div class="snippet-result ${index === state.algoCallCursor ? "active" : ""}" onclick="window._pickAlgoCall(${index})" style="display:flex;flex-direction:column;gap:3px">
            <div style="display:flex;align-items:baseline;gap:10px">
              <code style="color:#7dd3fc;font:13px/1.4 Consolas,'Courier New',monospace;flex-shrink:0">[${esc(privacy)}] ${esc(call)}</code>
              <span style="color:#94a3b8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc.slice(0, 50))}</span>
            </div>
            ${params ? `<span style="color:#6ee7b7;font:11px/1.3 Consolas,'Courier New',monospace">(${esc(params)})</span>` : ""}
          </div>
        `;
      }).join("") || '<div class="empty" style="color:#94a3b8;padding:12px">暂无算法</div>';
    }

    function _insertAlgoCall(item) {
      const call = item.callPrefix || item.call_prefix || "";
      const params = (item.params || []).map(p => p.name || "arg").join(", ");
      insertSnippet(`${call}(${params})`);
    }

    window._pickAlgoCall = function(index) {
      const item = state.algoCallResults[index];
      if (!item) return;
      _insertAlgoCall(item);
      const overlay = qs("#snippetOverlay");
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
    };

    async function searchSnippetOverlay(keyword) {
      try {
        const data = await api(`/api/v1/snippets?q=${encodeURIComponent(keyword || "")}`);
        state.snippetResults = normalizeListPayload(data, "snippets");
        state.snippetCursor = 0;
        renderSnippetResults();
      } catch (error) {
        qs("#snippetSearchResults").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      }
    }

    function renderSnippetResults() {
      const root = qs("#snippetSearchResults");
      root.innerHTML = state.snippetResults.map((snippet, index) => {
        const privacy = snippet.publish_status === "published" || snippet.scope === "team" ? "公有" : "私有";
        return `
          <div class="snippet-result ${index === state.snippetCursor ? "active" : ""}" onclick="window.pickSnippet(${index})">
            <strong>[${esc(privacy)}] ${esc(snippet.zh_name || snippet.name)}</strong>
            <div class="snippet-preview">${esc(String(snippet.body || "").slice(0, 40))}</div>
          </div>
        `;
      }).join("") || '<div class="empty">暂无片段</div>';
    }

    function pickSnippet(index) {
      const snippet = state.snippetResults[index];
      if (!snippet) return;
      insertSnippet(snippet.body || "");
      closeSnippetOverlay();
    }
