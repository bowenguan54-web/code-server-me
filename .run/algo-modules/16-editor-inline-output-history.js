/*
 * AlgoLib module: 16-editor-inline-output-history.js
 * ??????????????????/??????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function switchOutput(mode) {
      state.outputMode = mode;
      qsa(".tabs button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
      renderOutput(mode);
    }

    function renderOutput(mode) {
      const value = state.lastRunResult;
      const out = qs("#output");
      if (!out) return;
      if (mode === "json") {
        out.innerHTML = `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
        return;
      }
      if (Array.isArray(value) && Array.isArray(value[0])) {
        const flat = value.flat().map(Number);
        const min = Math.min(...flat);
        const max = Math.max(...flat);
        out.innerHTML = `<div class="heatmap" style="grid-template-columns: repeat(${value[0].length}, minmax(24px, 1fr))">${value.flat().map(cell => {
          const ratio = max === min ? .5 : (Number(cell) - min) / (max - min);
          const color = `color-mix(in srgb, var(--primary) ${Math.round((1 - ratio) * 100)}%, var(--accent))`;
          return `<div class="heatcell" title="${esc(cell)}" style="background:${color}"></div>`;
        }).join("")}</div>`;
        return;
      }
      if (Array.isArray(value)) {
        const points = value.map(Number);
        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const coords = points.map((point, index) => {
          const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
          const y = 100 - ((point - min) / (max - min || 1)) * 90;
          return `${x},${y}`;
        }).join(" ");
        out.innerHTML = `<svg class="linechart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
        return;
      }
      if (value && typeof value === "object") {
        out.innerHTML = `<table class="kv-table"><tbody>${Object.entries(value).map(([key, val]) => `<tr><th>${esc(key)}</th><td>${esc(JSON.stringify(val))}</td></tr>`).join("")}</tbody></table>`;
        return;
      }
      out.innerHTML = `<pre>${esc(value)}</pre>`;
    }

    // ── Smart render helpers ────────────────────────────────────────────────
    function _jsonToTableData(result) {
      if (!result || typeof result !== "object") return null;
      // explicit table output
      if (result.__output_type__ === "table" && Array.isArray(result.columns) && Array.isArray(result.rows))
        return { columns: result.columns, rows: result.rows };
      const data = result.result !== undefined ? result.result : result;
      if (Array.isArray(data) && data.length && typeof data[0] === "object" && !Array.isArray(data[0])) {
        const columns = Object.keys(data[0]);
        const rows = data.map(row => columns.map(c => row[c]));
        return { columns, rows };
      }
      if (Array.isArray(data) && data.length && Array.isArray(data[0])) {
        const columns = data[0].map((_, i) => `col${i}`);
        const rows = data;
        return { columns, rows };
      }
      if (!Array.isArray(data) && typeof data === "object") {
        const values = Object.values(data);
        if (values.every(v => typeof v !== "object")) {
          return { columns: ["键", "值"], rows: Object.entries(data) };
        }
        if (values.every(v => Array.isArray(v))) {
          const keys = Object.keys(data);
          const len = Math.max(...values.map(v => v.length));
          const columns = ["index", ...keys];
          const rows = Array.from({ length: len }, (_, i) => [i, ...keys.map(k => data[k][i] ?? "")]);
          return { columns, rows };
        }
      }
      return null;
    }

    function _jsonToChartOption(result) {
      if (!result || typeof result !== "object") return null;
      if (result.__output_type__ === "chart" && result.option) return result.option;
      const data = result.result !== undefined ? result.result : result;
      if (Array.isArray(data) && data.every(v => typeof v === "number")) {
        return { xAxis: { type: "category", data: data.map((_, i) => i) }, yAxis: { type: "value" }, series: [{ type: "line", data, smooth: true }], tooltip: { trigger: "axis" } };
      }
      if (!Array.isArray(data) && typeof data === "object") {
        const entries = Object.entries(data);
        if (entries.every(([, v]) => typeof v === "number")) {
          return { xAxis: { type: "category", data: entries.map(([k]) => k) }, yAxis: { type: "value" }, series: [{ type: "bar", data: entries.map(([, v]) => v) }], tooltip: { trigger: "axis" } };
        }
        if (entries.every(([, v]) => Array.isArray(v) && v.every(x => typeof x === "number"))) {
          const len = Math.max(...entries.map(([, v]) => v.length));
          return {
            xAxis: { type: "category", data: Array.from({ length: len }, (_, i) => i) },
            yAxis: { type: "value" },
            legend: {},
            series: entries.map(([name, vals]) => ({ name, type: "line", data: vals, smooth: true })),
            tooltip: { trigger: "axis" }
          };
        }
      }
      if (Array.isArray(data) && data.length && typeof data[0] === "object") {
        const keys = Object.keys(data[0]);
        const xKey = keys[0];
        const yKeys = keys.slice(1).filter(k => typeof data[0][k] === "number");
        if (yKeys.length) {
          return {
            xAxis: { type: "category", data: data.map(r => r[xKey]) },
            yAxis: { type: "value" },
            legend: yKeys.length > 1 ? {} : undefined,
            series: yKeys.map(k => ({ name: k, type: "line", data: data.map(r => r[k]), smooth: true })),
            tooltip: { trigger: "axis" }
          };
        }
      }
      return null;
    }

    function showResultWithRenderBtn(container, result) {
      let jsonStr;
      try { jsonStr = JSON.stringify(result, null, 2); } catch { jsonStr = String(result); }
      container.innerHTML = "";

      const ot = result?.__output_type__;

      // ── Image mode: auto-render, provide JSON toggle ──
      if (ot === "image" && result?.src) {
        const bar = document.createElement("div");
        bar.className = "render-mode-bar";
        bar.innerHTML = `
          <button class="render-mode-btn active" data-rmode="image">🖼️ 图片</button>
          <button class="render-mode-btn" data-rmode="json">{ } JSON</button>`;
        container.appendChild(bar);
        const content = document.createElement("div");
        container.appendChild(content);
        function showImageView() {
          bar.querySelectorAll(".render-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.rmode === "image"));
          content.innerHTML = "";
          if (result.title) {
            const p = document.createElement("p");
            p.style.cssText = "color:var(--accent);margin:4px 0 8px;font-size:13px";
            p.textContent = result.title;
            content.appendChild(p);
          }
          const img = document.createElement("img");
          img.src = result.src;
          img.alt = result.alt || "";
          img.style.cssText = `max-width:${Number(result.width) || 600}px;border-radius:6px;display:block`;
          content.appendChild(img);
        }
        function showJsonView() {
          bar.querySelectorAll(".render-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.rmode === "json"));
          content.innerHTML = `<pre>${esc(jsonStr)}</pre>`;
        }
        bar.addEventListener("click", e => {
          const btn = e.target.closest(".render-mode-btn");
          if (!btn) return;
          if (btn.dataset.rmode === "image") showImageView(); else showJsonView();
        });
        showImageView();
        return;
      }

      // render-mode bar
      const bar = document.createElement("div");
      bar.className = "render-mode-bar";
      bar.innerHTML = `
        <button class="render-mode-btn active" data-rmode="json">{ } JSON</button>
        <button class="render-mode-btn" data-rmode="table">📋 渲染为表格</button>
        <button class="render-mode-btn" data-rmode="chart">📊 渲染为图表</button>`;
      container.appendChild(bar);

      const content = document.createElement("div");
      container.appendChild(content);

      function showJson() {
        bar.querySelectorAll(".render-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.rmode === "json"));
        content.innerHTML = `<pre>${esc(jsonStr)}</pre>`;
      }
      function showTable() {
        bar.querySelectorAll(".render-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.rmode === "table"));
        const td = _jsonToTableData(result);
        if (!td) { content.innerHTML = `<pre style="color:var(--warning)">无法转换为表格</pre>`; return; }
        const thead = `<thead><tr>${td.columns.map(c => `<th>${esc(String(c))}</th>`).join("")}</tr></thead>`;
        const tbody = `<tbody>${td.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell == null ? "" : String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
        content.innerHTML = `<div style="overflow:auto"><table class="output-table">${thead}${tbody}</table></div>`;
      }
      function showChart() {
        bar.querySelectorAll(".render-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.rmode === "chart"));
        const option = _jsonToChartOption(result);
        if (!option) { content.innerHTML = `<pre style="color:var(--warning)">无法转换为图表</pre>`; return; }
        const host = document.createElement("div");
        host.className = "echart-host";
        content.innerHTML = "";
        content.appendChild(host);
        try {
          const chart = echarts.init(host, "dark");
          chart.setOption(option);
          const ro = new ResizeObserver(() => chart.resize());
          ro.observe(host);
        } catch (e) { content.innerHTML = `<pre style="color:var(--danger)">${esc(e.message)}</pre>`; }
      }

      bar.addEventListener("click", e => {
        const btn = e.target.closest(".render-mode-btn");
        if (!btn) return;
        if (btn.dataset.rmode === "json") showJson();
        else if (btn.dataset.rmode === "table") showTable();
        else if (btn.dataset.rmode === "chart") showChart();
      });

      // auto-select mode based on __output_type__
      if (ot === "table") showTable();
      else if (ot === "chart") showChart();
      else showJson();
    }

    function testCaseKey() {
      return `algolib_tc_${state.editing?.id || "source"}_${currentFunction().func_name || currentFunction().name}`;
    }
    function saveTestCase() {
      const key = testCaseKey();
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      items.unshift({ time: new Date().toISOString(), params: collectParams() });
      localStorage.setItem(key, JSON.stringify(items.slice(0, 10)));
      loadHistoryOptions();
      showToast("测试用例已保存");
    }
    function loadHistoryOptions() {
      const select = qs("#history");
      if (!select) return;
      const items = JSON.parse(localStorage.getItem(testCaseKey()) || "[]");
      select.innerHTML = '<option value="">历史记录</option>' + items.map((item, index) => `<option value="${index}">${esc(item.time)}</option>`).join("");
    }
    function loadTestCase() {
      const index = qs("#history").value;
      if (index === "") return;
      const items = JSON.parse(localStorage.getItem(testCaseKey()) || "[]");
      renderParams(items[Number(index)]?.params || {});
    }
