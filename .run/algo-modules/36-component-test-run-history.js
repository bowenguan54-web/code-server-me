/*
 * AlgoLib module: 36-component-test-run-history.js
 * ??????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function _onImagePasteInDz(event, name) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) { _processImageFile(name, file); event.preventDefault(); }
          break;
        }
      }
    }

    // Global paste: capture clipboard images into first empty image param
    document.addEventListener("paste", function(e) {
      if (!state.testPanelOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const params = state._compTestAlgo?.params || [];
          for (const p of params) {
            if ((p.widget_hint || inferParamWidget(p)) === "image") {
              const st = _getFileState(p.name);
              if (!st.file && !st.url && !st.path) {
                _processImageFile(p.name, file);
                e.preventDefault();
                break;
              }
            }
          }
          break;
        }
      }
    });

    function toggleTPParamSkip(name, skipped) {
      const card = qs(`#tp-card-${name}`);
      if (card) card.classList.toggle("skipped", skipped);
    }

    function switchTPParamTab(name, tab, btn) {
      const tabBar = btn?.closest?.(".tp-tab-bar") || qs(`#tp-tab-bar-${name}`);
      if (tabBar) tabBar.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      if (btn instanceof HTMLElement) btn.classList.add("active");
      const pane = qs(`#tp-param-pane-${name}`);
      if (!pane) return;
      const typeEl = qs(`#tp-card-${name} [data-tp-param]`) || qs(`#tp-card-${name} [data-tp-type]`);
      const type = typeEl?.dataset?.tpType || typeEl?.dataset?.type || "list";
      if (tab === "json") {
        const tableData = state._tpTableData?.[name];
        const json = tableData ? JSON.stringify(tableData, null, 2) : "";
        pane.innerHTML = `<textarea rows="3" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}"
          style="width:100%;box-sizing:border-box;font-size:11px;resize:vertical"
          placeholder="JSON">${esc(json)}</textarea>`;
      } else if (tab === "table") {
        const ta = pane.querySelector("[data-tp-param]");
        if (ta) {
          try {
            const parsed = JSON.parse(ta.value);
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
              state._tpTableData = state._tpTableData || {};
              state._tpTableData[name] = parsed;
            }
          } catch {}
        }
        pane.innerHTML = _renderTPEditableTable(name, state._tpTableData?.[name] || []);
      } else if (tab === "file") {
        pane.innerHTML = `<div style="display:flex;gap:4px">
          <label style="cursor:pointer;padding:2px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px">📄 选择文件<input type="file" style="display:none" onchange="window.onCtFileUpload(event,'${esc(name)}','single')"/></label>
          <label style="cursor:pointer;padding:2px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px">📁 选择文件夹<input type="file" webkitdirectory style="display:none" onchange="window.onCtFileUpload(event,'${esc(name)}','folder')"/></label>
        </div>`;
      }
    }

    function _renderTPEditableTable(paramName, data) {
      if (!data || !data.length) {
        return `<div style="color:var(--text-dim);font-size:11px">暂无数据</div>
          <button type="button" onclick="window.addTPTableRow('${esc(paramName)}')" style="font-size:11px;margin-top:4px">+ 添加行</button>`;
      }
      const cols = [...new Set(data.flatMap(r => Object.keys(r)))];
      return `<div style="overflow-x:auto">
        <table class="tp-editable-table">
          <thead><tr>
            ${cols.map(c => `<th>${esc(c)}</th>`).join("")}
            <th style="width:20px"></th>
          </tr></thead>
          <tbody id="tp-tbody-${esc(paramName)}">
            ${data.map((row, ri) => `<tr>
              ${cols.map(c => `<td><input value="${esc(String(row[c] ?? ""))}" onchange="window.updateTPTableCell('${esc(paramName)}',${ri},'${esc(c)}',this.value)"></td>`).join("")}
              <td><button type="button" onclick="window.removeTPTableRow('${esc(paramName)}',${ri})"
                style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:10px;padding:0">✕</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <button type="button" onclick="window.addTPTableRow('${esc(paramName)}')" style="font-size:11px;margin-top:4px">+ 添加行</button>`;
    }

    function updateTPTableCell(paramName, rowIdx, col, value) {
      const data = state._tpTableData?.[paramName];
      if (!data || !data[rowIdx]) return;
      const num = Number(value);
      data[rowIdx][col] = (value !== "" && !isNaN(num)) ? num : value;
    }

    function addTPTableRow(paramName) {
      const data = state._tpTableData?.[paramName];
      if (!data) return;
      const newRow = {};
      if (data.length > 0) Object.keys(data[0]).forEach(c => { newRow[c] = ""; });
      data.push(newRow);
      const pane = qs(`#tp-param-pane-${paramName}`);
      if (pane) pane.innerHTML = _renderTPEditableTable(paramName, data);
    }

    function removeTPTableRow(paramName, rowIdx) {
      const data = state._tpTableData?.[paramName];
      if (!data) return;
      data.splice(rowIdx, 1);
      const pane = qs(`#tp-param-pane-${paramName}`);
      if (pane) pane.innerHTML = _renderTPEditableTable(paramName, data);
    }

    async function collectTestPanelParams() {
      const params = state._compTestAlgo?.params || [];
      if (!params.length) {
        const ta = qs("#tpJsonFallback");
        if (!ta) return {};
        try { return JSON.parse(ta.value) || {}; } catch { return {}; }
      }
      const payload = {};
      for (const p of params) {
        const name = p.name;
        const skipCb = qs(`[data-tp-skip="${name}"]`);
        if (skipCb?.checked) continue;

        // New file state handling
        const fst = state._tpFileState?.[name];
        if (fst) {
          const widget = p.widget_hint || inferParamWidget(p);
          if (["image","audio","video","file"].includes(widget)) {
            const mode = fst.mode || "base64";
            if (mode === "path" && fst.path) { payload[name] = fst.path; continue; }
            if (mode === "url") { payload[name] = fst.url || ""; continue; }
            if (mode === "base64" && fst.file) {
              if (!fst.base64) fst.base64 = await _readFileAsBase64(fst.file);
              payload[name] = fst.base64;
              continue;
            }
            continue; // no file selected — skip
          }
          if (widget === "images") {
            const files = fst.files || [];
            const base64s = await Promise.all(files.map(f => _readFileAsBase64(f)));
            payload[name] = base64s;
            continue;
          }
        }

        // Legacy upload
        const upload = state.compTestFileUploads?.[name];
        if (upload) { payload[name] = upload.multi ? upload.paths : upload.path; continue; }

        const tableEl = qs(`#tp-param-pane-${name} table`);
        if (tableEl && state._tpTableData?.[name]) { payload[name] = state._tpTableData[name]; continue; }
        const type = String(p.type || p.annotation || "str");
        if (/bool/i.test(type)) {
          const checked = qs(`input[name="tp-bool-${name}"]:checked`);
          payload[name] = checked ? checked.value === "true" : false;
          continue;
        }
        const input = qs(`[data-tp-param="${name}"]`);
        if (input) payload[name] = parseParamValueByType(type, input.value);
      }
      return payload;
    }

    function fillTestExample() {
      const algo = state._compTestAlgo;
      if (!algo?.inputExample) return;
      try {
        const parsed = JSON.parse(algo.inputExample);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          _renderRightTestParams(parsed);
        } else {
          const params = algo?.params || [];
          if (params.length > 0) _renderRightTestParams({ [params[0].name]: parsed });
        }
      } catch { /* ignore */ }
    }

    function toggleTestHistory(btn) {
      const menu = qs("#tpHistoryMenu");
      if (!menu) return;
      if (!menu.classList.contains("hidden")) { menu.classList.add("hidden"); return; }
      const key = _tpHistoryKey();
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.length) {
        menu.innerHTML = `<div class="tp-hist-item" style="pointer-events:none">暂无历史记录</div>`;
      } else {
        menu.innerHTML = items.map((item, i) => {
          const preview = Object.entries(item.params || {}).map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 12)}`).join(", ").slice(0, 55);
          return `<div class="tp-hist-item" onclick="window.applyTestHistory(${i})">${esc(item.time?.slice(0, 16) || "")} · ${esc(preview)}</div>`;
        }).join("");
      }
      menu.classList.remove("hidden");
      setTimeout(() => {
        document.addEventListener("click", function closeMenu(e) {
          if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.add("hidden");
            document.removeEventListener("click", closeMenu);
          }
        });
      }, 0);
    }

    function applyTestHistory(index) {
      const key = _tpHistoryKey();
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      const entry = items[index];
      if (!entry) return;
      qs("#tpHistoryMenu")?.classList.add("hidden");
      _renderRightTestParams(entry.params || {});
    }

    function _tpHistoryKey() {
      const algo = state._compTestAlgo;
      return `algolib_tph_${algo?.id || algo?.funcName || "unknown"}`;
    }

    function _saveTestHistory(params) {
      const key = _tpHistoryKey();
      // Strip large binary values (base64 images/files) before saving to localStorage
      const sanitized = {};
      for (const [k, v] of Object.entries(params || {})) {
        if (typeof v === "string" && v.length > 512) {
          sanitized[k] = "[binary data omitted]";
        } else if (Array.isArray(v) && v.some(x => typeof x === "string" && x.length > 512)) {
          sanitized[k] = v.map(x => (typeof x === "string" && x.length > 512) ? "[binary data omitted]" : x);
        } else {
          sanitized[k] = v;
        }
      }
      try {
        const items = JSON.parse(localStorage.getItem(key) || "[]");
        items.unshift({ time: new Date().toISOString(), params: sanitized });
        localStorage.setItem(key, JSON.stringify(items.slice(0, 10)));
      } catch (e) {
        // Quota exceeded or other storage error — silently ignore
      }
    }

    async function runTestPanel() {
      const btn = qs("#tpRunBtn");
      const status = qs("#tpStatus");
      if (!btn) return;
      const started = performance.now();
      btn.disabled = true;
      btn.textContent = "运行中...";
      if (status) status.textContent = "";
      try {
        const algo = state._compTestAlgo;
        const sourceContent = state._compTestSource;
        const fnName = algo?.funcName || algo?.name || "main";
        const timeout = Number(qs("#tpTimeout")?.value || "5");
        const kwargs = await collectTestPanelParams();
        _saveTestHistory(kwargs);
        const algoStatus = algo?.publishStatus || algo?.status || "";
        const isPublished = algoStatus === "published";
        let body, url;
        if (sourceContent) {
          url = "/api/v1/run-source";
          body = { content: sourceContent, function: fnName, kwargs, timeout };
        } else if (algo?.id) {
          url = "/api/v1/run";
          body = isPublished
            ? { namespace: algo.namespace, function: fnName, params: kwargs }
            : { namespace: algo.namespace, function: fnName, params: kwargs, allow_unpublished: true };
        } else { showToast("无法确定运行方式"); return; }
        const result = await api(url, { method: "POST", body: JSON.stringify(body) });
        const elapsed = result.elapsed_ms ?? Math.round(performance.now() - started);
        if (status) status.textContent = `✅ ${elapsed} ms`;
        _showTPResult(result.result ?? result);
      } catch (err) {
        if (status) status.textContent = `❌ ${Math.round(performance.now() - started)} ms`;
        _showTPResultError(err.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "▶ 运行"; }
      }
    }

    async function debugFromTestPanel() {
      const params = await collectTestPanelParams();
      state._pendingDebugParams = params;
      closeTestPanel();
      startDebug();
    }
