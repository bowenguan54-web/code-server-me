/*
 * AlgoLib module: 33-component-test-core.js
 * ??????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    // ── Right Test Panel (replaces modal, Req 5 / Req 3) ────────────────
    function openComponentTestModal() {
      if (!state.editing) return;
      openTestPage(state.editing.algo);
    }

    async function openComponentTestModalById(id, page) {
      const allItems = [...(state.data.components || []), ...(state.data.templates || [])];
      let algo = allItems.find(a => a.id === id);
      if (!algo) { showToast("找不到该算法信息"); return; }
      openTestPage(algo);
    }

    function openTestPanel(algo, sourceContent) {
      state._compTestAlgo = algo;
      state._compTestSource = sourceContent;
      state.compTestFileUploads = {};
      state._tpFileState = {};
      state._tpResultTab = "output";
      state._tpTableData = {};
      state._tpLastResult = undefined;
      state.testPanelOpen = true;
      _renderOverlayTestPanel();
      document.addEventListener("keydown", _testOverlayEscHandler);
    }

    function closeTestPanel() {
      state.testPanelOpen = false;
      const mask = qs("#testOverlayMask");
      const overlay = qs("#testOverlay");
      if (mask) mask.classList.remove("visible");
      if (overlay) overlay.classList.remove("open");
      document.removeEventListener("keydown", _testOverlayEscHandler);
    }

    function _testOverlayEscHandler(e) {
      if (e.key === "Escape") closeTestPanel();
    }

    function _renderOverlayTestPanel() {
      const algo = state._compTestAlgo;
      const name = algo?.zhName || algo?.funcName || algo?.name || "算法";
      const hasExample = !!(algo?.inputExample);

      // Title
      const titleEl = qs("#testOverlayTitle");
      if (titleEl) titleEl.textContent = `测试：${name}`;

      // Toolbar: example + history buttons
      const toolbar = qs("#testOverlayToolbar");
      if (toolbar) toolbar.innerHTML = `
        ${hasExample ? `<button class="ghost" style="font-size:12px;padding:2px 10px" onclick="window.fillTestExample()">📋 填入示例</button>` : ""}
        <div style="position:relative;display:inline-block">
          <button class="ghost" style="font-size:12px;padding:2px 10px" onclick="window.toggleTestHistory(this)">🕐 历史 ▾</button>
          <div id="tpHistoryMenu" class="tp-history-menu hidden"></div>
        </div>
      `;

      // Params area — give it the id tpParamsArea for compatibility
      const paramsEl = qs("#testOverlayParams");
      if (paramsEl) paramsEl.id = "tpParamsArea";

      // Actions: run/debug/timeout
      const actions = qs("#testOverlayActions");
      if (actions) actions.innerHTML = `
        <button class="primary" id="tpRunBtn" onclick="window.runTestPanel()">▶ 运行</button>
        <button class="btn-debug" id="tpDebugBtn" onclick="window.debugFromTestPanel()">🐛 调试</button>
        <select id="tpTimeout" style="font-size:12px;padding:2px 6px;flex-shrink:0">
          <option value="5">5s</option><option value="30" selected>30s</option><option value="60">60s</option>
        </select>
        <span id="tpStatus" style="font-size:11px;color:var(--text-dim);margin-left:auto"></span>
      `;

      // Result tabs
      const tabs = qs("#testOverlayResultTabs");
      if (tabs) tabs.innerHTML = `
        <button data-tp-tab="table" onclick="window.switchTestResultTab('table')">表格</button>
        <button class="active" data-tp-tab="output" onclick="window.switchTestResultTab('output')">输出</button>
        <button data-tp-tab="structured" onclick="window.switchTestResultTab('structured')">结构化</button>
        <button data-tp-tab="chart" onclick="window.switchTestResultTab('chart')">图表</button>
      `;

      // Result content area — give it the id tpResultArea for compatibility
      const resultContent = qs("#testOverlayResultContent");
      if (resultContent) {
        resultContent.id = "tpResultArea";
        resultContent.innerHTML = `<pre style="margin:0;color:var(--text-dim)">等待运行…</pre>`;
      }

      // Show overlay
      const mask = qs("#testOverlayMask");
      const overlay = qs("#testOverlay");
      if (mask) mask.classList.add("visible");
      if (overlay) overlay.classList.add("open");

      // Render params
      _renderRightTestParams();
      if (hasExample) fillTestExample();
    }

    function _renderRightTestParams(values = {}) {
      const area = qs("#tpParamsArea");
      if (!area) return;
      const params = state._compTestAlgo?.params || [];
      if (!params.length) {
        const fallback = Object.keys(values).length ? JSON.stringify(values, null, 2) : "";
        area.innerHTML = `
          <div style="color:var(--text-dim);font-size:12px;margin-bottom:6px">无结构化参数，请直接输入 JSON</div>
          <textarea id="tpJsonFallback" rows="6" style="width:100%;box-sizing:border-box;font-size:12px;resize:vertical" placeholder="{}">${esc(fallback)}</textarea>
        `;
        return;
      }
      area.innerHTML = params.map(p => _renderTPParamCard(p, values[p.name])).join("");
    }

    // ── Widget type inference ─────────────────────────────────────
    function inferParamWidget(param, exampleValue) {
      const name = (param.name || "").toLowerCase();
      const type = String(param.type || param.annotation || "").toLowerCase();
      // Priority 1: explicit type hints
      if (/ndarray|np\.ndarray|image\.image|pil|cv2\.|opencv/.test(type)) return "image";
      if (/bytes/.test(type) && /image|img|photo|pic|frame/.test(name)) return "image";
      if (/literal\[/.test(type)) return "literal";
      if (/datetime|date/.test(type)) return "datetime";
      if (/bool/.test(type)) return "bool";
      if (/int/.test(type)) return "int";
      if (/float/.test(type)) return "float";
      if (/list\[dict\]|dataframe/.test(type)) return "dataframe";
      if (/list/.test(type)) {
        const tokens2 = name.split(/[_\s]+/);
        if (tokens2.some(t => ["images","imgs","photos","frames","pics"].includes(t))) return "images";
        return "list";
      }
      if (/dict/.test(type)) return "dict";
      // Priority 2: name-based keyword matching
      const tokens = name.split(/[_\s]+/);
      const hasToken = (...kw) => tokens.some(t => kw.includes(t));
      if (hasToken("image","img","photo","picture","pic","frame")) return "image";
      if (hasToken("images","imgs","photos","frames","pics")) return "images";
      if (hasToken("audio","sound","wav","mp3")) return "audio";
      if (hasToken("video","mp4","avi")) return "video";
      if (hasToken("file","filepath","filename","csv","excel","xlsx","pdf","document")) return "file";
      if (hasToken("url","link","href")) return "url";
      if (hasToken("color","colour")) return "color";
      if (hasToken("date","time","datetime")) return "datetime";
      if (hasToken("password","secret","token")) return "password";
      // Priority 3: example value type
      if (exampleValue !== undefined) {
        if (typeof exampleValue === "boolean") return "bool";
        if (typeof exampleValue === "number") return Number.isInteger(exampleValue) ? "int" : "float";
        if (Array.isArray(exampleValue)) return "list";
        if (exampleValue && typeof exampleValue === "object") return "dict";
      }
      if (/str/.test(type) || type === "" || type === "any") return "str";
      return "json";
    }

