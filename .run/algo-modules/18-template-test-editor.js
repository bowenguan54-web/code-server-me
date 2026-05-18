/*
 * AlgoLib module: 18-template-test-editor.js
 * ????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function publishAsComponent(id, button) {
      button?.blur();
      const item = (state.data.templates || []).find(e => e.id === id);
      if (!item) { showToast("未找到模板条目"); return; }

      // 获取组件分类
      let compCats = state.categories.components || [];
      if (!compCats.length) {
        try {
          const catData = await api("/api/v1/categories?module_kind=component");
          compCats = normalizeListPayload(catData, "categories");
          state.categories.components = compCats;
        } catch (_e) { compCats = []; }
      }

      // 获取模板源码
      let templateCode = "";
      try {
        const src = await api(`/api/v1/algorithm-source/${safeId(id)}`);
        templateCode = src.source || src.folder_files?.[0]?.content || "";
      } catch (_e) {}

      const defaultName = String(item.funcName || item.id || "").split(".").pop() || "my_algorithm";
      const catOptions = compCats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
      const usageTips = item.zhDescription || item.description || "";
      const defaultTags = (item.zhTags || []).join(",");
      const defaultInput = item.inputExample || '{"data":[0.1,0.6,0.9],"threshold":0.5}';

      qs("#main").innerHTML = `
        <div class="new-workspace">
          <div class="editor-top">
            <button onclick="window.switchPage('templates')">返回</button>
            <strong>基于模板新建组件：${esc(item.zhName || defaultName)}</strong>
            <span class="spacer"></span>
            <button onclick="window.testTplSource()">测试代码</button>
            <button onclick="window.checkTplCode()">检查代码</button>
            <button class="ghost" onclick="window.saveTplDraft('${esc(id)}')">保存草稿</button>
            <button class="primary" onclick="window.confirmPublishAsComponent('${esc(id)}')">提交审核</button>
          </div>
          <details class="template-usage-details" open>
            <summary>📖 模板使用说明（点击折叠）</summary>
            <div class="template-usage-body">${esc(usageTips || "暂无使用说明")}</div>
          </details>
          <div class="new-form-grid">
            <label>组件函数名<input id="tplName" value="${esc(defaultName)}" /></label>
            <label>所属分类
              <select id="tplCategory" onchange="window.onTplCatChange()">
                ${catOptions}
                <option value="__new__">＋ 新建分类...</option>
              </select>
            </label>
            <label id="tplNewCatRow" class="full" style="display:none">新分类信息
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input id="tplCategoryName" placeholder="中文显示名，如 统计算法" style="flex:1;min-width:140px" />
                <input id="tplCategoryNs" placeholder="英文命名空间，如 statistics" style="flex:1;min-width:140px" />
              </div>
            </label>
            <label>版本<input id="tplVersion" value="1.0.0" /></label>
            <label>中文名称<input id="tplZhName" value="${esc(item.zhName || "")}" /></label>
            <label class="wide">标签<input id="tplTags" value="${esc(defaultTags)}" placeholder="逗号分隔" /></label>
            <label class="full">描述<textarea id="tplDesc" rows="2">${esc(usageTips)}</textarea></label>
            <label class="full">输入示例 JSON<textarea id="tplInputExample" rows="2">${esc(defaultInput)}</textarea></label>
          </div>
          <div class="file-editor-grid">
            <div class="file-list-panel" id="tplFileList">
              <button class="active">${esc(defaultName)}.py</button>
            </div>
            <div id="tplCodeHost" class="workspace-monaco-host"></div>
          </div>
          <div id="tplOutput" class="output hidden"></div>
        </div>
      `;
      // 恢复分类默认选中
      const firstCat = compCats[0];
      if (firstCat && qs("#tplCategory")) qs("#tplCategory").value = firstCat.namespace;
      await initTplMonaco(templateCode);
    }

    function onTplCatChange() {
      const v = qs("#tplCategory")?.value;
      const row = qs("#tplNewCatRow");
      if (row) row.style.display = v === "__new__" ? "" : "none";
    }

    async function initTplMonaco(content = "") {
      const host = qs("#tplCodeHost");
      if (!host) return;
      const m = await loadMonaco();
      if (state.tplEditor) {
        state.tplEditor.dispose();
        state.tplEditor = null;
      }
      if (state.tplModel && !state.tplModel.isDisposed()) state.tplModel.dispose();
      state.tplModel = m.editor.createModel(content || "", "python", m.Uri.parse(`inmemory://algolib-template/${Date.now()}.py`));
      state.tplEditor = m.editor.create(host, {
        model: state.tplModel,
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
      window._activeMonaco = state.tplEditor;
      state.tplEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
        const templateId = state.data.templates?.find(item => (item.funcName || item.id || "").split(".").pop() === (qs("#tplName")?.value || ""))?.id;
        if (templateId) saveTplDraft(templateId);
      });
      state.tplEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
      state.tplEditor.onDidChangeModelContent(() => checkTplCode(false));
      checkTplCode(false);
    }

    function getTplCode() {
      return state.tplEditor?.getValue() || qs("#tplCode")?.value || "";
    }

    function checkTplCode(showResult = true) {
      const model = state.tplEditor?.getModel();
      const diagnostics = localPythonDiagnostics(getTplCode());
      if (model) applyDiagnosticsToModel(model, diagnostics);
      if (showResult) showToast(diagnostics.length ? `发现 ${diagnostics.length} 个代码问题` : "代码检查通过");
      return diagnostics;
    }

    function inferTplParamType(value) {
      if (typeof value === "boolean") return "bool";
      if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
      if (Array.isArray(value)) return "list";
      if (value && typeof value === "object") return "dict";
      return "str";
    }

    function splitTopLevelParams(paramText) {
      const items = [];
      let current = "";
      let depth = 0;
      for (const ch of paramText || "") {
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) {
          if (current.trim()) items.push(current.trim());
          current = "";
          continue;
        }
        current += ch;
      }
      if (current.trim()) items.push(current.trim());
      return items;
    }

    function getTplFunctionParams(functionName) {
      const source = getTplCode();
      if (!source.trim()) return [];
      const escapedName = String(functionName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!escapedName) return [];
      const re = new RegExp(`def\\s+${escapedName}\\s*\\(([^)]*)\\)\\s*(?:->\\s*[^:]+)?\\s*:`, "m");
      const m = source.match(re);
      if (!m) return [];
      return splitTopLevelParams(m[1]).map(raw => {
        let text = raw.trim();
        if (!text || text === "/") return null;
        text = text.replace(/^\*\*?/, "");
        const [left] = text.split("=");
        const [namePart, annPart] = left.split(":");
        const name = (namePart || "").trim();
        const type = (annPart || "").trim() || "str";
        if (!name || name === "self" || name === "cls") return null;
        return { name, type };
      }).filter(Boolean);
    }

    function buildTplParamValues(paramsMeta, inputObj) {
      const values = {};
      const parsed = (inputObj && typeof inputObj === "object" && !Array.isArray(inputObj)) ? inputObj : {};
      const orderedValues = Object.values(parsed);
      paramsMeta.forEach((param, index) => {
        if (Object.prototype.hasOwnProperty.call(parsed, param.name)) {
          values[param.name] = parsed[param.name];
          return;
        }
        if (index < orderedValues.length) {
          values[param.name] = orderedValues[index];
          return;
        }
        values[param.name] = /bool/i.test(param.type) ? false : (/list|dict/i.test(param.type) ? "" : "");
      });
      return values;
    }

    function renderTplTestParams(values = {}, paramsMeta = []) {
      const wrap = qs("#tplTestParams");
      if (!wrap) return;
      const normalizedMeta = Array.isArray(paramsMeta) ? paramsMeta : [];
      const entries = normalizedMeta.length
        ? normalizedMeta.map(param => [param.name, values?.[param.name], param.type || inferTplParamType(values?.[param.name])])
        : Object.entries(values || {}).map(([name, rawValue]) => [name, rawValue, inferTplParamType(rawValue)]);
      if (!entries.length) { wrap.innerHTML = '<div class="empty">未解析到函数参数，请检查函数名或源码。</div>'; return; }
      wrap.innerHTML = entries.map(([name, rawValue, type]) => {
        const typeText = String(type || "str");
        const upload = (state.tplFileUploads || {})[name];
        const uploadLabel = upload
          ? (upload.multi ? `✅ ${upload.paths.length} 个文件` : `✅ ${esc(upload.filename)}`)
          : null;
        const uploadRow = upload
          ? `<span style="font-size:11px;color:#16a34a">${uploadLabel}</span>
             <button type="button" class="ghost" style="padding:1px 7px;font-size:11px;color:var(--text-dim)" onclick="window.clearTplFileUpload('${esc(name)}')" title="移除">✕</button>`
          : `<label title="单文件" style="cursor:pointer;padding:1px 7px;font-size:12px;border:1px solid var(--border);border-radius:4px">📄<input type="file" style="display:none" onchange="window.onTplUnifiedFileUpload(event,'${esc(name)}','single')"/></label>
             <label title="多张图片" style="cursor:pointer;padding:1px 7px;font-size:12px;border:1px solid var(--border);border-radius:4px">📚<input type="file" multiple style="display:none" onchange="window.onTplUnifiedFileUpload(event,'${esc(name)}','multi')"/></label>
             <label title="整个文件夹" style="cursor:pointer;padding:1px 7px;font-size:12px;border:1px solid var(--border);border-radius:4px">📁<input type="file" webkitdirectory style="display:none" onchange="window.onTplUnifiedFileUpload(event,'${esc(name)}','folder')"/></label>`;
        const head = `<div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;flex-wrap:wrap">
          <label style="margin:0;flex:1;min-width:80px">${esc(name)} · ${esc(typeText)}</label>
          <div style="display:flex;gap:3px;align-items:center">${uploadRow}</div>
        </div>`;
        if (upload) {
          const pathInfo = upload.multi
            ? upload.paths.map(p => `<div style="font-size:11px;color:#888">${esc(p)}</div>`).join("")
            : `<div style="font-size:11px;color:#888">路径: ${esc(upload.path)}</div>`;
          return `<div class="param-field">${head}${pathInfo}</div>`;
        }
        if (/bool/i.test(typeText)) {
          return `<div class="param-field">${head}<select data-param="${esc(name)}" data-type="bool"><option value="false"${rawValue === false ? " selected" : ""}>false</option><option value="true"${rawValue === true ? " selected" : ""}>true</option></select></div>`;
        }
        if (/list|dict|DataFrame|dataframe/i.test(typeText)) {
          const textValue = rawValue === "" ? "" : (typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue, null, 2));
          const placeholder = /DataFrame|dataframe/i.test(typeText)
            ? "支持 CSV / JSON 数组"
            : (/list/i.test(typeText) ? "支持 JSON 数组，或逗号/换行分隔，如 0.1,0.6,0.9" : "支持 JSON 对象，或 key=value / key:value 多行输入");
          return `<div class="param-field">${head}<textarea rows="4" data-param="${esc(name)}" data-type="${esc(typeText)}" placeholder="${esc(placeholder)}">${esc(textValue || "")}</textarea></div>`;
        }
        if (/int|float|number/i.test(typeText)) {
          return `<div class="param-field">${head}<input type="number" data-param="${esc(name)}" data-type="${esc(typeText)}" value="${esc(String(rawValue ?? ""))}" /></div>`;
        }
        return `<div class="param-field">${head}<input data-param="${esc(name)}" data-type="${esc(typeText)}" value="${esc(String(rawValue ?? ""))}" /></div>`;
      }).join("");
    }

    async function _uploadFilesHelper(files) {
      const IMAGE_EXTS = /\.(png|jpe?g|gif|bmp|webp|tiff?|svg)$/i;
      const fileList = Array.from(files).filter(f => {
        // For folder uploads only keep image files; for explicit multi keep all
        return true;
      });
      const results = [];
      for (const file of fileList) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(BASE + "/api/v1/test/upload-temp", {
          method: "POST",
          headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
          body: fd
        });
        if (!r.ok) { const txt = await r.text(); throw new Error(txt); }
        const data = await r.json();
        results.push({ path: data.path, filename: data.filename || file.name });
      }
      return results;
    }

    async function onTplUnifiedFileUpload(event, paramName, mode) {
      const files = event.target?.files;
      if (!files || !files.length) return;
      const isMulti = mode === "multi" || mode === "folder" || files.length > 1;
      showToast(`正在上传 ${files.length} 个文件...`);
      try {
        const results = await _uploadFilesHelper(files);
        if (!state.tplFileUploads) state.tplFileUploads = {};
        const savedValues = {};
        qsa("#tplTestParams [data-param]").forEach(el => { savedValues[el.dataset.param] = el.value; });
        if (isMulti) {
          state.tplFileUploads[paramName] = { multi: true, paths: results.map(r => r.path), filenames: results.map(r => r.filename) };
        } else {
          state.tplFileUploads[paramName] = { multi: false, path: results[0].path, filename: results[0].filename };
        }
        const paramsMeta = getTplFunctionParams(currentFunction()?.func_name || currentFunction()?.name || "");
        renderTplTestParams(savedValues, paramsMeta);
        showToast(`已上传 ${results.length} 个文件`);
      } catch (e) { showToast("上传出错: " + e.message); }
    }

    function clearTplFileUpload(paramName) {
      if (state.tplFileUploads) delete state.tplFileUploads[paramName];
      const savedValues = {};
      qsa("#tplTestParams [data-param]").forEach(el => { savedValues[el.dataset.param] = el.value; });
      const paramsMeta = getTplFunctionParams(currentFunction()?.func_name || currentFunction()?.name || "");
      renderTplTestParams(savedValues, paramsMeta);
    }

    function collectTplTestParams() {
      const payload = {};
      qsa("#tplTestParams [data-param]").forEach(input => {
        const name = input.dataset.param;
        const type = input.dataset.type || "str";
        payload[name] = parseParamValueByType(type, input.value);
      });
      return payload;
    }

    function openTplParamImport(paramName) {
      state.tplImportTarget = paramName;
      const input = qs("#tplParamFileInput");
      if (input) input.click();
    }

    async function onTplParamFileSelected(event) {
      const file = event?.target?.files?.[0];
      const paramName = state.tplImportTarget;
      if (!file || !paramName) return;
      const field = qs(`#tplTestParams [data-param="${CSS.escape(paramName)}"]`);
      if (!field) return;
      const type = field.dataset.type || "str";
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        try {
          const parsed = JSON.parse(text);
          field.value = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
        } catch (_error) {
          field.value = text;
        }
      } else {
        field.value = text;
      }
      state.tplImportTarget = "";
      event.target.value = "";
      if (/list|dict|DataFrame|dataframe/i.test(type)) {
        try {
          const parsed = parseParamValueByType(type, field.value);
          field.value = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
        } catch (_error) { /* keep raw text */ }
      }
      showToast(`已导入 ${file.name} 到参数 ${paramName}`);
    }

    function setTplTestMode(_mode) { /* unified mode — no-op */ }

    function openTplBinaryUpload(paramName) {
      state.tplImportTarget = paramName;
      const input = qs("#tplBinaryFileInput");
      if (input) input.click();
    }

    async function onTplBinaryFileSelected(event) {
      const file = event?.target?.files?.[0];
      const paramName = state.tplImportTarget;
      event.target.value = "";
      state.tplImportTarget = "";
      if (!file || !paramName) return;
      const statusEl = qs("#tplRunStatus");
      if (statusEl) statusEl.textContent = `正在上传 ${file.name}...`;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const resp = await fetch(BASE + "/api/v1/test/upload-temp", {
          method: "POST",
          headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
          body: formData,
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        state.tplFileUploads[paramName] = { multi: false, path: result.path, filename: result.filename || file.name };
        if (statusEl) statusEl.textContent = "";
        showToast(`已上传 ${file.name}`);
        const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
        renderTplTestParams({}, getTplFunctionParams(fnName));
      } catch (err) {
        if (statusEl) statusEl.textContent = `上传失败: ${err.message}`;
        showToast(`上传失败: ${err.message}`);
      }
    }
