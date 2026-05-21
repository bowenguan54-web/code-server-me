/*
 * AlgoLib module: 15-editor-inline-test-panel.js
 * ????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function setTestHeight(height) {
      state.testHeight = Math.max(0, Math.min(500, Number(height) || 0));
      const view = qs("#editorView");
      if (view) {
        view.style.setProperty("--test-height", `${state.testHeight}px`);
        view.style.setProperty("--vbar-h", state.testHeight > 0 ? "8px" : "2px");
      }
      const panel = qs("#testPanel");
      if (!panel) return;
      panel.classList.toggle("open", state.testHeight > 0);
      // Layout all active editors
      _layoutAllEditors();
    }

    function toggleTestPanel() {
      const next = (state.testHeight || 0) > 0 ? 0 : 220;
      setTestHeight(next);
    }

    function startTestResize(event) {
      event.preventDefault();
      const view = qs("#editorView");
      if (!view) return;
      const viewRect = view.getBoundingClientRect();
      document.body.style.userSelect = "none";
      function move(e) {
        requestAnimationFrame(() => {
          // Distance from bottom of editorView to mouse = test panel height
          const next = Math.max(0, Math.min(500, viewRect.bottom - e.clientY));
          state.testHeight = next;
          view.style.setProperty("--test-height", `${next}px`);
          const panel = qs("#testPanel");
          if (panel) panel.classList.toggle("open", next > 0);
        });
      }
      function up() {
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        _layoutAllEditors();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }

    function startTreeResize(event) {
      event.preventDefault();
      const main = qs("#editorMain");
      if (!main) return;
      const mainRect = main.getBoundingClientRect();
      const startX = event.clientX;
      const initial = parseInt(getComputedStyle(main).getPropertyValue("--tree-width")) || 232;
      document.body.style.userSelect = "none";
      function move(e) {
        requestAnimationFrame(() => {
          const width = Math.max(120, Math.min(320, initial + e.clientX - startX));
          main.style.setProperty("--tree-width", `${width}px`);
        });
      }
      function up() {
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        _layoutAllEditors();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }

    function _layoutAllEditors() {
      state.editor?.layout();
      state.tplEditor?.layout();
      if (state.blockEditor) {
        state.blockEditor.editors.forEach(ed => { try { ed.layout(); } catch (_) {} });
        try { state.blockEditor.sourceEditor?.layout(); } catch (_) {}
      }
    }

    function currentFunctions() {
      return state.fileMeta.get(state.currentFile)?.functions || normalizeFunctions([{ func_name: state.editing?.algo?.funcName, params: state.editing?.algo?.params || [] }]);
    }
    function currentFunction() {
      const name = qs("#funcSelect")?.value;
      return currentFunctions().find(fn => (fn.func_name || fn.name) === name) || currentFunctions()[0] || { func_name: state.editing?.algo?.funcName, params: [] };
    }

    function renderTestPanel() {
      const panel = qs("#testPanel");
      if (!panel || !state.editing) return;
      const functions = currentFunctions();
      panel.innerHTML = `
        <select id="funcSelect" onchange="window.renderParams()">
          ${functions.map(fn => `<option value="${esc(fn.func_name || fn.name)}">${esc(fn.func_name || fn.name)}</option>`).join("")}
        </select>
        ${state.editing?.algo?.inputExample ? `<div class="control-row" style="margin-bottom:4px;gap:8px"><button class="ghost" style="padding:2px 10px;font-size:12px" onclick="window.loadInputExample()">📋 加载输入示例</button><span style="color:var(--text-dim);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px">${esc(state.editing.algo.inputExample.slice(0,80))}</span></div>` : ""}
        <div id="params" class="param-grid"></div>
        <div class="control-row" style="margin:8px 0 4px;gap:8px;align-items:center">
          <button onclick="window.recognizeEditorParams()">识别参数</button>
          <button onclick="window.saveEditorParamConfig()">保存参数配置</button>
          <span style="color:var(--text-dim);font-size:12px">可从当前代码重新识别参数，修改控件类型和输入示例</span>
        </div>
        <div id="editorWidgetConfig" class="widget-config-list"></div>
        <div class="control-row">
          <button class="primary" id="runBtn" onclick="window.runTest()">▶ 运行</button>
          <select id="timeout"><option value="5">5s</option><option value="30">30s</option><option value="60">60s</option></select>
          <button onclick="window.saveTestCase()">保存测试用例</button>
          <button onclick="window.saveCurrentAsInputExample()">保存为输入示例</button>
          <select id="history" onchange="window.loadTestCase()"><option value="">历史记录</option></select>
          <button onclick="window.generateExampleData()">生成示例数据</button>
        </div>
        <div class="tabs">
          <button class="active" data-mode="json" onclick="window.switchOutput('json')">JSON</button>
          <button data-mode="viz" onclick="window.switchOutput('viz')">可视化</button>
        </div>
        <div class="output" id="output"><pre>等待运行</pre></div>
        <div id="runStatus" class="field-error"></div>
      `;
      renderParams();
      // Auto-fill from stored inputExample if available
      if (state.editing?.algo?.inputExample) {
        try {
          const parsed = JSON.parse(state.editing.algo.inputExample);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            renderParams(parsed);
          }
        } catch { /* ignore invalid json */ }
      }
      loadHistoryOptions();
    }

    function renderParams(values = {}) {
      const fn = currentFunction();
      const params = fn.params || [];
      qs("#params").innerHTML = params.map(param => {
        const name = param.name || "";
        const type = String(param.type || param.annotation || "str");
        const rawValue = values[name];
        const value = rawValue ?? "";
        if (/bool/i.test(type)) {
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><select data-param="${esc(name)}" data-type="${esc(type)}"><option value="false">false</option><option value="true" ${rawValue === true || rawValue === "true" ? "selected" : ""}>true</option></select></div>`;
        }
        if (/list|dict|DataFrame|dataframe/i.test(type)) {
          const textVal = (rawValue !== undefined && rawValue !== null && typeof rawValue === "object") ? JSON.stringify(rawValue) : String(value);
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><textarea rows="4" data-param="${esc(name)}" data-type="${esc(type)}" placeholder="${/DataFrame|dataframe/.test(type) ? "粘贴 CSV" : "JSON"}">${esc(textVal)}</textarea></div>`;
        }
        if (/int|float|number/i.test(type)) {
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input type="number" data-param="${esc(name)}" data-type="${esc(type)}" value="${esc(value)}" /></div>`;
        }
        return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input data-param="${esc(name)}" data-type="${esc(type)}" value="${esc(value)}" /></div>`;
      }).join("") || '<div class="empty">当前函数无参数</div>';
    }

    function refreshEditorStatusButtons() {
      if (!state.editing) return;
      const topBar = document.querySelector(".editor-top");
      if (!topBar) return;
      const e = state.editing;
      const status = getStatus(e.algo);
      const id = e.id;
      const isComponentEditor = e.page === "components" || e.page === "my-algos" || e.page === "templates";
      // Remove both static (data-status-btn) and previously dynamic (data-dynamic) buttons
      topBar.querySelectorAll("[data-status-btn],[data-dynamic]").forEach(b => b.remove());
      const insertBefore = topBar.querySelector(".spacer") || topBar.querySelector(".more-menu-wrap");
      const addBtn = (text, cls, fn) => {
        const btn = document.createElement("button");
        btn.dataset.statusBtn = "1";
        if (cls) btn.className = cls;
        btn.textContent = text;
        btn.onclick = fn;
        topBar.insertBefore(btn, insertBefore);
      };
      const isAdminUser = state.currentUser?.role === "admin";
      if (isComponentEditor && isAdminUser && !isPublicItem(e.algo)) {
        addBtn("正式发布", "success", () => window.openAdminPublishModal(id));
      } else if (isComponentEditor && canSubmitAlgorithm(e.algo)) {
        addBtn(status === "rejected" ? "重新提交" : "提交审核", "", () => window.openSubmitModal(id));
      } else if (isComponentEditor && !isAdminUser && ownsAlgorithm(e.algo) && status === "reviewing") {
        addBtn("撤回审核", "", () => window.withdrawReview(id));
      }
    }

    function collectParams() {
      const payload = {};
      qsa("[data-param]").forEach(input => {
        const name = input.dataset.param;
        const type = input.dataset.type || "";
        payload[name] = parseParamValueByType(type, input.value);
      });
      return payload;
    }

    async function saveCurrentAsInputExample() {
      if (!state.editing?.id) {
        showToast("未打开算法");
        return;
      }
      const params = collectParams();
      const inputExample = JSON.stringify(params);
      try {
        await api(`/api/v1/algorithms/${safeId(state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ input_example: inputExample })
        });
        if (state.editing.algo) state.editing.algo.inputExample = inputExample;
        showToast("输入示例已保存");
        renderTestPanel();
      } catch (err) {
        showToast(err.message || "保存输入示例失败");
      }
    }

    function _currentEditorCodeForParams() {
      return state.models.get(state.currentFile)?.getValue() || state.editor?.getValue?.() || "";
    }

    function _editorInputExampleObject() {
      try {
        const parsed = JSON.parse(state.editing?.algo?.inputExample || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_error) {
        return {};
      }
    }

    function _formatEditorExampleValue(value, widget) {
      if (value === undefined || value === null) return "";
      if (value === "") return "";
      if (typeof value === "object" || ["list", "dict", "json", "dataframe", "images"].includes(widget)) {
        try { return JSON.stringify(value); } catch (_error) { return String(value); }
      }
      return String(value);
    }

    function openEditorParamConfig() {
      if (!state.editing) {
        showToast("未打开算法");
        return;
      }
      setTestHeight(Math.max(state.testHeight || 0, 300));
      renderTestPanel();
      window.setTimeout(() => {
        recognizeEditorParams();
        const config = qs("#editorWidgetConfig");
        if (config) config.scrollIntoView({ block: "nearest" });
      }, 0);
    }

    function _renderEditorExampleInput(param, widget, value) {
      const safeName = esc(param.name);
      const safeValue = esc(_formatEditorExampleValue(value, widget));
      if (widget === "bool") {
        return `
          <select class="widget-example-input" data-editor-example="${safeName}" onchange="window.onEditorParamExampleChange(this)">
            <option value=""></option>
            <option value="true" ${value === true || value === "true" ? "selected" : ""}>true</option>
            <option value="false" ${value === false || value === "false" ? "selected" : ""}>false</option>
          </select>`;
      }
      if (widget === "int" || widget === "float") {
        return `<input class="widget-example-input" data-editor-example="${safeName}" type="number" step="${widget === "int" ? "1" : "any"}" value="${safeValue}" placeholder="" oninput="window.onEditorParamExampleChange(this)" />`;
      }
      if (["list", "dict", "json", "dataframe", "text", "images"].includes(widget)) {
        return `
          <div class="widget-example-box">
            <textarea class="widget-example-input" data-editor-example="${safeName}" rows="2" placeholder="" oninput="window.onEditorParamExampleChange(this)">${safeValue}</textarea>
            ${["list", "dict", "json", "dataframe", "images"].includes(widget) ? `<button type="button" onclick="window.formatEditorParamExample('${safeName}')">格式化</button>` : ""}
          </div>`;
      }
      return `<input class="widget-example-input" data-editor-example="${safeName}" type="text" value="${safeValue}" placeholder="" oninput="window.onEditorParamExampleChange(this)" />`;
    }

    function recognizeEditorParams() {
      if (typeof parseParamsFromCode !== "function") {
        showToast("参数识别工具未加载");
        return;
      }
      const params = parseParamsFromCode(_currentEditorCodeForParams());
      if (!params.length) {
        showToast("未识别到函数参数");
        renderEditorWidgetConfigRows([]);
        return;
      }
      const existingOverrides = state.editing?.algo?.widgetOverrides || state.editing?.algo?.widget_overrides || {};
      const examples = _editorInputExampleObject();
      state.editorWidgetParams = params;
      state.editorWidgetOverrides = { ...existingOverrides };
      state.editorParamExamples = {};
      params.forEach(param => {
        if (!state.editorWidgetOverrides[param.name]) state.editorWidgetOverrides[param.name] = param.widget;
        if (Object.prototype.hasOwnProperty.call(examples, param.name)) {
          state.editorParamExamples[param.name] = _formatEditorExampleValue(examples[param.name], state.editorWidgetOverrides[param.name] || param.widget);
        }
      });
      renderEditorWidgetConfigRows(params);
    }

    function renderEditorWidgetConfigRows(params = state.editorWidgetParams || []) {
      const list = qs("#editorWidgetConfig");
      if (!list) return;
      if (!params.length) {
        list.innerHTML = "";
        return;
      }
      list.innerHTML = `
        <div class="widget-config-panel" style="margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-card2)">
          <strong style="display:block;margin-bottom:8px">参数控件配置</strong>
          ${params.map(param => {
            const selected = (state.editorWidgetOverrides || {})[param.name] || param.widget || "str";
            const options = (param.options || (typeof widgetOptionsForType === "function" ? widgetOptionsForType(param.type) : ["str"])).map(widget => (
              `<option value="${esc(widget)}" ${widget === selected ? "selected" : ""}>${esc(((typeof WIDGET_ZH !== "undefined") && WIDGET_ZH[widget]) || widget)}</option>`
            )).join("");
            const rawExample = (state.editorParamExamples || {})[param.name] ?? "";
            return `
              <div class="widget-config-row" style="grid-template-columns:minmax(120px,1fr) minmax(90px,.7fr) minmax(150px,1fr) minmax(220px,1.4fr) auto">
                <div><strong>${esc(param.name)}</strong></div>
                <code>${esc(param.type || "str")}${param.default ? ` = ${esc(param.default)}` : ""}</code>
                <select data-editor-param="${esc(param.name)}" onchange="window.onEditorWidgetOverrideChange(this)">${options}</select>
                <div class="widget-example-cell">
                  <span class="widget-example-label">示例</span>
                  ${_renderEditorExampleInput(param, selected, rawExample)}
                </div>
                <label class="widget-nullable"><input type="checkbox" disabled ${param.nullable ? "checked" : ""}> 可为空</label>
              </div>`;
          }).join("")}
        </div>`;
    }

    function onEditorWidgetOverrideChange(select) {
      if (!select?.dataset?.editorParam) return;
      state.editorWidgetOverrides = state.editorWidgetOverrides || {};
      state.editorWidgetOverrides[select.dataset.editorParam] = select.value;
      renderEditorWidgetConfigRows();
    }

    function onEditorParamExampleChange(input) {
      if (!input?.dataset?.editorExample) return;
      state.editorParamExamples = state.editorParamExamples || {};
      if (input.value === "") delete state.editorParamExamples[input.dataset.editorExample];
      else state.editorParamExamples[input.dataset.editorExample] = input.value;
    }

    function formatEditorParamExample(paramName) {
      const input = qsa("[data-editor-example]").find(el => el.dataset.editorExample === paramName);
      if (!input) return;
      try {
        input.value = JSON.stringify(JSON.parse(input.value), null, 2);
        onEditorParamExampleChange(input);
      } catch (_error) {
        showToast("JSON 格式错误");
      }
    }

    async function saveEditorParamConfig() {
      if (!state.editing?.id) {
        showToast("未打开算法");
        return;
      }
      if (!state.editorWidgetParams?.length) {
        recognizeEditorParams();
      }
      const params = state.editorWidgetParams || [];
      const overrides = {};
      params.forEach(param => {
        const widget = (state.editorWidgetOverrides || {})[param.name] || param.widget;
        if (widget) overrides[param.name] = widget;
      });
      const examples = {};
      params.forEach(param => {
        const raw = (state.editorParamExamples || {})[param.name];
        if (raw === undefined || raw === null || raw === "") return;
        const widget = overrides[param.name] || param.widget || param.type || "str";
        examples[param.name] = parseParamValueByType(param.type || widget, raw);
      });
      const inputExample = JSON.stringify(examples);
      try {
        await api(`/api/v1/algorithms/${safeId(state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ widget_overrides: overrides, input_example: inputExample })
        });
        if (state.editing.algo) {
          state.editing.algo.widgetOverrides = overrides;
          state.editing.algo.widget_overrides = overrides;
          state.editing.algo.inputExample = inputExample;
          state.editing.algo.params = params.map(param => ({
            ...param,
            widget_hint: overrides[param.name] || param.widget || param.widget_hint
          }));
        }
        showToast("参数配置已保存");
        renderTestPanel();
      } catch (err) {
        showToast(err.message || "保存参数配置失败");
      }
    }

    function generateExampleData() {
      // Prefer stored inputExample from creation
      const savedExample = state.editing?.algo?.inputExample;
      if (savedExample) {
        try {
          const parsed = JSON.parse(savedExample);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            // Plain object: keys match param names
            renderParams(parsed);
            return;
          }
          // Array or primitive: assign to the first param
          const params = currentFunction().params || [];
          if (params.length > 0) {
            renderParams({ [params[0].name]: parsed });
            return;
          }
        } catch { /* fall through to auto-generate */ }
      }
      const values = {};
      (currentFunction().params || []).forEach(param => {
        const type = String(param.type || param.annotation || "str");
        if (/DataFrame|dataframe/i.test(type)) values[param.name] = "a,b,c\n1,2,3\n4,5,6\n7,8,9\n2,3,4\n5,6,7";
        else if (/list|List/i.test(type)) {
          if (/float/i.test(type)) values[param.name] = "[1.0, 2.0, 3.0]";
          else if (/int/i.test(type)) values[param.name] = "[1, 2, 3]";
          else if (/str/i.test(type)) values[param.name] = "[\"a\", \"b\", \"c\"]";
          else values[param.name] = "[1, 2, 3]";
        }
        else if (/dict|Dict/i.test(type)) values[param.name] = "{\"key\": \"value\"}";
        else if (/int/i.test(type)) values[param.name] = 10;
        else if (/float|number/i.test(type)) values[param.name] = 1.0;
        else if (/bool/i.test(type)) values[param.name] = true;
        else values[param.name] = "example";
      });
      renderParams(values);
    }

    async function runTest() {
      const button = qs("#runBtn");
      const started = performance.now();
      button.disabled = true;
      button.textContent = "运行中...";
      try {
        const fn = currentFunction();
        const functionName = fn.func_name || fn.name;
        const params = collectParams();
        const content = state.models.get(state.currentFile)?.getValue() || "";
        const algoStatus = state.editing?.algo?.publishStatus || state.editing?.algo?.status || "";
        const isPublished = algoStatus === "published";
        const body = state.editing?.algo?.id
          ? isPublished
            ? { namespace: state.editing.algo.namespace, function: functionName, params }
            : { namespace: state.editing.algo.namespace, function: functionName, params, allow_unpublished: true }
          : { content, function: functionName, kwargs: params };
        const result = await api(state.editing?.algo?.id ? "/api/v1/run" : "/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify(body)
        });
        state.lastRunResult = result.result;
        renderOutput(state.outputMode);
        qs("#runStatus").textContent = `✅ ${result.elapsed_ms ?? Math.round(performance.now() - started)} ms`;
      } catch (error) {
        qs("#runStatus").textContent = `❌ ${Math.round(performance.now() - started)} ms`;
        qs("#output").innerHTML = `<pre>${esc(error.message)}</pre>`;
      } finally {
        button.disabled = false;
        button.textContent = "▶ 运行";
      }
    }
