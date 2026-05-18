/*
 * AlgoLib module: 37-component-test-output-resize.js
 * ?????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function switchTestResultTab(tab) {
      state._tpResultTab = tab;
      qs(".tp-result-tabs button.active")?.classList.remove("active");
      qs(`.tp-result-tabs button[data-tp-tab="${tab}"]`)?.classList.add("active");
      const area = qs("#tpResultArea");
      if (!area) return;
      const result = state._tpLastResult;
      if (result === undefined) return;
      if (tab === "output") {
        area.style.background = "";
        area.innerHTML = _renderResultValue(result);
      } else if (tab === "structured") {
        area.style.background = "";
        _renderTPStructured(area, result);
      } else if (tab === "table") {
        area.style.background = "";
        _renderTPTable(area, result);
      } else if (tab === "chart") {
        area.style.background = "";
        _renderTPChart(area, result);
      }
    }

    function _isBase64Image(v) {
      if (typeof v !== "string") return false;
      if (v.startsWith("data:image/")) return true;
      // Raw base64 string that looks like image data (long, valid base64 chars)
      if (v.length > 500 && /^[A-Za-z0-9+/]+=*$/.test(v.slice(0, 100))) return true;
      return false;
    }

    function _renderResultValue(v) {
      // Handle __output_type__ dicts (e.g. image_processor returns {__output_type__: "image", src: "data:..."})
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const ot = v.__output_type__;
        if (ot === "image" && v.src) {
          const titleHtml = v.title ? `<div class="tp-result-title">${esc(v.title)}</div>` : "";
          return `${titleHtml}<img class="tp-result-img" src="${esc(v.src)}" alt="${esc(v.alt || 'result')}">`;
        }
        if (ot === "text" && v.content) {
          const titleHtml = v.title ? `<div class="tp-result-title">${esc(v.title)}</div>` : "";
          return `${titleHtml}<pre style="margin:0;white-space:pre-wrap;word-break:break-all">${esc(v.content)}</pre>`;
        }
        if (ot === "table") {
          return _renderTableHtml(v);
        }
        // Object with src/image/img key that is a data URI
        const imgSrc = v.src || v.image || v.img;
        if (!ot && imgSrc && _isBase64Image(imgSrc)) {
          const src = imgSrc.startsWith("data:") ? imgSrc : `data:image/png;base64,${imgSrc}`;
          return `<img class="tp-result-img" src="${esc(src)}" alt="result">`;
        }
      }
      if (_isBase64Image(v)) {
        const src = v.startsWith("data:") ? v : `data:image/png;base64,${v}`;
        return `<img class="tp-result-img" src="${esc(src)}" alt="result">`;
      }
      if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://")) && /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(v)) {
        return `<img class="tp-result-img" src="${esc(v)}" alt="result">`;
      }
      return `<pre style="margin:0;white-space:pre-wrap;word-break:break-all">${esc(typeof v === "string" ? v : JSON.stringify(v, null, 2))}</pre>`;
    }

    function _tableSpecFromResult(result) {
      let columns = [];
      let rows = [];
      let title = "";
      if (result && typeof result === "object" && !Array.isArray(result)) {
        title = result.title || "";
        if (Array.isArray(result.columns)) columns = result.columns.map(String);
        const rawRows = Array.isArray(result.rows) ? result.rows : (Array.isArray(result.data) ? result.data : []);
        rows = rawRows;
      } else if (Array.isArray(result)) {
        rows = result;
      }
      if (!rows.length) return { title, columns, rows: [] };
      if (!columns.length) {
        if (rows.every(row => row && typeof row === "object" && !Array.isArray(row))) {
          columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
        } else if (Array.isArray(rows[0])) {
          columns = rows[0].map((_, index) => `列 ${index + 1}`);
        } else {
          columns = ["值"];
        }
      }
      const normalizedRows = rows.map(row => {
        if (Array.isArray(row)) return columns.map((_, index) => row[index]);
        if (row && typeof row === "object") return columns.map(col => row[col]);
        return [row];
      });
      return { title, columns, rows: normalizedRows };
    }

    function _renderTableHtml(result) {
      const spec = _tableSpecFromResult(result);
      if (!spec.columns.length) {
        return `<pre style="color:var(--warning);margin:0">无法转换为表格</pre>`;
      }
      const title = spec.title ? `<div class="tp-result-title">${esc(spec.title)}</div>` : "";
      const thead = `<thead><tr>${spec.columns.map(col => `<th>${esc(col)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${spec.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell === undefined || cell === null ? "" : String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `${title}<div style="overflow:auto;max-height:100%"><table class="api-table" style="font-size:11px">${thead}${tbody}</table></div>`;
    }

    function _renderTPTable(area, result) {
      area.innerHTML = _renderTableHtml(result);
    }

    function _showTPResult(result) {
      state._tpLastResult = result;
      const area = qs("#tpResultArea");
      if (!area) return;
      const preferredTab = result && typeof result === "object" && result.__output_type__ === "table" ? "table" : "output";
      state._tpResultTab = preferredTab;
      qs(".tp-result-tabs button.active")?.classList.remove("active");
      qs(`.tp-result-tabs button[data-tp-tab="${preferredTab}"]`)?.classList.add("active");
      area.style.background = "";
      if (preferredTab === "table") _renderTPTable(area, result);
      else area.innerHTML = _renderResultValue(result);
    }

    function _showTPResultError(msg) {
      state._tpLastResult = null;
      const area = qs("#tpResultArea");
      if (!area) return;
      area.style.background = "rgba(248,81,73,.08)";
      area.innerHTML = `<pre style="margin:0;color:var(--danger,#f85149);white-space:pre-wrap">${esc(msg)}</pre>`;
    }

    function _renderTPStructured(area, result) {
      if (result === null || result === undefined) { area.innerHTML = `<span style="color:var(--text-dim)">null</span>`; return; }
      if (result && typeof result === "object" && result.__output_type__ === "table") {
        _renderTPTable(area, result);
        return;
      }
      if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object" && result[0] !== null) {
        const cols = [...new Set(result.flatMap(r => Object.keys(r)))];
        const thead = `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
        const tbody = `<tbody>${result.map(row => `<tr>${cols.map(c => `<td>${esc(String(row[c] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody>`;
        area.innerHTML = `<div style="overflow:auto"><table class="api-table" style="font-size:11px">${thead}${tbody}</table></div>`;
      } else if (result && typeof result === "object" && !Array.isArray(result)) {
        const rows = Object.entries(result).map(([k, v]) => {
          const vDisplay = _isBase64Image(v)
            ? `<img class="tp-result-img" src="${v.startsWith("data:") ? esc(v) : `data:image/png;base64,${esc(v)}`}" alt="${esc(k)}">`
            : `<span style="font-size:11px">${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</span>`;
          return `<tr><td style="color:var(--text-dim);white-space:nowrap;padding-right:8px;font-size:11px">${esc(k)}</td><td>${vDisplay}</td></tr>`;
        }).join("");
        area.innerHTML = `<table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>`;
      } else {
        area.innerHTML = `<pre style="margin:0;white-space:pre-wrap">${esc(JSON.stringify(result, null, 2))}</pre>`;
      }
    }

    function _renderTPChart(area, result) {
      if (!window.echarts) { area.innerHTML = `<span style="color:var(--warning)">ECharts 未加载</span>`; return; }
      const option = _jsonToChartOption(result);
      if (!option) { area.innerHTML = `<pre style="color:var(--warning);margin:0">无法转换为图表</pre>`; return; }
      const host = document.createElement("div");
      host.style.cssText = "width:100%;height:200px";
      area.innerHTML = "";
      area.appendChild(host);
      try {
        const chart = echarts.init(host, "dark");
        chart.setOption(option);
      } catch (e) { area.innerHTML = `<pre style="color:var(--danger);margin:0">${esc(e.message)}</pre>`; }
    }

    function startRightResize(event) {
      event.preventDefault();
      const main = qs("#editorMain");
      if (!main) return;
      const startX = event.clientX;
      const startW = state.testPanelWidth || 420;
      document.body.style.userSelect = "none";
      function move(e) {
        requestAnimationFrame(() => {
          const newW = Math.max(320, Math.min(600, startW - (e.clientX - startX)));
          state.testPanelWidth = newW;
          main.style.setProperty("--rpanel-w", `${newW}px`);
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

    async function onCtFileUpload(event, paramName, mode) {
      const files = event.target?.files;
      if (!files || !files.length) return;
      const isMulti = mode === "multi" || mode === "folder" || files.length > 1;
      const statusEl = qs("#tpStatus");
      if (statusEl) statusEl.textContent = `正在上传 ${files.length} 个文件...`;
      try {
        const results = await _uploadFilesHelper(files);
        if (!state.compTestFileUploads) state.compTestFileUploads = {};
        if (isMulti) {
          state.compTestFileUploads[paramName] = { multi: true, paths: results.map(r => r.path), filenames: results.map(r => r.filename) };
        } else {
          state.compTestFileUploads[paramName] = { multi: false, path: results[0].path, filename: results[0].filename };
        }
        if (statusEl) statusEl.textContent = "";
        showToast(`已上传 ${results.length} 个文件`);
        const cur = collectTestPanelParams();
        _renderRightTestParams(cur);
      } catch (err) {
        showToast("文件上传失败: " + err.message);
        if (statusEl) statusEl.textContent = "";
      }
    }

    function clearCtFileUpload(paramName) {
      if (state.compTestFileUploads) delete state.compTestFileUploads[paramName];
      const cur = collectTestPanelParams();
      _renderRightTestParams(cur);
    }

    // Backward-compat aliases (used by tpl test and other code paths)
    function renderCompTestParams(values = {}) { _renderRightTestParams(values); }
    function collectCompTestParams() { return collectTestPanelParams(); }
    function runCompTest() { return runTestPanel(); }
    function setCompTestMode(_mode) { /* no-op */ }
    function loadCompTestExample() { fillTestExample(); }
    async function onCompTestBinaryFileSelected(event, paramName) { return onCtFileUpload(event, paramName); }

