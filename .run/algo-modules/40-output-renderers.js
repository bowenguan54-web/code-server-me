/*
 * AlgoLib module: 40-output-renderers.js
 * ?????????JSON??????????HTML???????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function renderOutputText(container, result) {
      const val = (result === null || result === undefined) ? "null" : String(result);
      container.innerHTML = "";
      const text = document.createElement("div");
      text.style.fontSize = "24px";
      text.style.fontWeight = "600";
      text.style.padding = "20px 0";
      text.style.color = "var(--text)";
      text.textContent = val;
      const bar = document.createElement("div");
      bar.className = "output-action-bar";
      const btn = document.createElement("button");
      btn.className = "output-action-btn";
      btn.textContent = "复制";
      btn.onclick = () => copyToClipboard(val);
      bar.appendChild(btn);
      container.appendChild(text);
      container.appendChild(bar);
    }

    function renderOutputJson(container, result) {
      container.innerHTML = "";
      const bar = document.createElement("div");
      bar.className = "output-action-bar";
      const copyBtn = document.createElement("button");
      copyBtn.className = "output-action-btn";
      copyBtn.textContent = "复制JSON";
      copyBtn.onclick = () => copyToClipboard(JSON.stringify(result, null, 2));
      bar.appendChild(copyBtn);
      container.appendChild(bar);
      const tree = document.createElement("div");
      tree.className = "json-tree";
      tree.appendChild(renderJsonTree(result, 0));
      container.appendChild(tree);
    }

    function renderJsonTree(value, depth) {
      if (depth > 10) {
        const s = document.createElement("span");
        s.textContent = "...";
        return s;
      }
      const frag = document.createDocumentFragment();
      if (value === null || value === undefined) {
        const s = document.createElement("span");
        s.className = "json-tree-null";
        s.textContent = "null";
        frag.appendChild(s);
        return frag;
      }
      if (typeof value === "boolean") {
        const s = document.createElement("span");
        s.className = "json-tree-bool";
        s.textContent = String(value);
        frag.appendChild(s);
        return frag;
      }
      if (typeof value === "number") {
        const s = document.createElement("span");
        s.className = "json-tree-num";
        s.textContent = String(value);
        frag.appendChild(s);
        return frag;
      }
      if (typeof value === "string") {
        if (_isBase64Image(value)) {
          const img = document.createElement("img");
          img.src = _ensureDataUrl(value);
          img.className = "output-image";
          img.style.maxHeight = "120px";
          img.onclick = () => showImageFullscreen(img.src);
          frag.appendChild(img);
          return frag;
        }
        const s = document.createElement("span");
        s.className = "json-tree-str";
        s.textContent = '"' + (value.length > 200 ? value.slice(0, 200) + "..." : value) + '"';
        frag.appendChild(s);
        return frag;
      }
      if (Array.isArray(value)) {
        const toggle = document.createElement("span");
        toggle.className = "json-tree-toggle";
        toggle.textContent = "▼";
        const label = document.createElement("span");
        label.className = "json-tree-key";
        label.textContent = "[" + value.length + " 项]";
        const childDiv = document.createElement("div");
        childDiv.className = "json-tree-children";
        value.forEach((item, i) => {
          const row = document.createElement("div");
          const idx = document.createElement("span");
          idx.className = "json-tree-key";
          idx.textContent = i + ": ";
          row.appendChild(idx);
          row.appendChild(renderJsonTree(item, depth + 1));
          childDiv.appendChild(row);
        });
        toggle.onclick = () => {
          childDiv.classList.toggle("collapsed");
          toggle.textContent = childDiv.classList.contains("collapsed") ? "▶" : "▼";
        };
        frag.appendChild(toggle);
        frag.appendChild(label);
        frag.appendChild(childDiv);
        return frag;
      }
      if (typeof value === "object") {
        const keys = Object.keys(value);
        const toggle = document.createElement("span");
        toggle.className = "json-tree-toggle";
        toggle.textContent = "▼";
        const label = document.createElement("span");
        label.className = "json-tree-key";
        label.textContent = "{" + keys.length + " 个字段}";
        const childDiv = document.createElement("div");
        childDiv.className = "json-tree-children";
        keys.forEach(key => {
          const row = document.createElement("div");
          const k = document.createElement("span");
          k.className = "json-tree-key";
          k.textContent = key + ": ";
          row.appendChild(k);
          row.appendChild(renderJsonTree(value[key], depth + 1));
          childDiv.appendChild(row);
        });
        toggle.onclick = () => {
          childDiv.classList.toggle("collapsed");
          toggle.textContent = childDiv.classList.contains("collapsed") ? "▶" : "▼";
        };
        frag.appendChild(toggle);
        frag.appendChild(label);
        frag.appendChild(childDiv);
        return frag;
      }
      const s = document.createElement("span");
      s.textContent = String(value);
      frag.appendChild(s);
      return frag;
    }

    function _normalizeOutputTableData(result) {
      if (result && typeof result === "object" && !Array.isArray(result)) {
        if (Array.isArray(result.rows)) {
          const headers = Array.isArray(result.columns) ? result.columns : (result.rows[0] && typeof result.rows[0] === "object" && !Array.isArray(result.rows[0]) ? Object.keys(result.rows[0]) : []);
          const rows = result.rows.map(row => Array.isArray(row) ? row : headers.map(h => row?.[h]));
          return { headers, rows };
        }
        if (Array.isArray(result.data)) return _normalizeOutputTableData(result.data);
      }
      if (!Array.isArray(result) || !result.length) return null;
      if (typeof result[0] === "object" && !Array.isArray(result[0])) {
        const headers = Object.keys(result[0]);
        const rows = result.map(r => headers.map(h => r[h]));
        return { headers, rows };
      }
      if (Array.isArray(result[0])) {
        let headers = result[0].map((_, i) => "列" + (i + 1));
        let rows = result;
        if (result.length > 1 && result[0].every(c => typeof c === "string" && isNaN(Number(c)))) {
          headers = result[0];
          rows = result.slice(1);
        }
        return { headers, rows };
      }
      return null;
    }

    function renderOutputTable(container, result) {
      const spec = _normalizeOutputTableData(result);
      if (!spec || !spec.headers.length) {
        renderOutputJson(container, result);
        return;
      }
      const headers = spec.headers;
      const rows = spec.rows || [];
      const maxShow = 100;
      const truncated = rows.length > maxShow;
      const showRows = truncated ? rows.slice(0, maxShow) : rows;
      let html = '<div class="output-action-bar"><button class="output-action-btn" onclick="copyTableAsTsv()">复制表格</button><span style="font-size:12px;color:var(--text-secondary)">共 ' + rows.length + " 行</span></div>";
      html += '<div style="max-height:500px;overflow:auto"><table class="output-table"><thead><tr>';
      headers.forEach(h => { html += "<th>" + esc(h) + "</th>"; });
      html += "</tr></thead><tbody>";
      showRows.forEach(row => {
        html += "<tr>";
        row.forEach(cell => { html += "<td>" + esc(cell ?? "") + "</td>"; });
        html += "</tr>";
      });
      html += "</tbody></table></div>";
      if (truncated) {
        html += '<div style="text-align:center;padding:8px"><button class="output-action-btn" onclick="this.parentElement.previousElementSibling.style.maxHeight=\'none\';this.remove()">显示全部（共 ' + rows.length + " 行）</button></div>";
      }
      container.innerHTML = html;
      window._lastTableHeaders = headers;
      window._lastTableRows = rows;
    }

    function copyTableAsTsv() {
      if (!window._lastTableHeaders) return;
      let tsv = window._lastTableHeaders.join("\t") + "\n";
      window._lastTableRows.forEach(row => {
        tsv += row.map(c => String(c ?? "")).join("\t") + "\n";
      });
      copyToClipboard(tsv);
    }

    function renderOutputImage(container, result) {
      const raw = String(result ?? "");
      const src = _ensureDataUrl(raw);
      const downloadRaw = raw.startsWith("data:") ? (raw.split(",")[1] || raw) : raw;
      container.innerHTML = '<div><img class="output-image" src="' + _escapeJsString(src).replace(/"/g, "&quot;") + '" onclick="showImageFullscreen(this.src)" /></div>' +
        '<div class="output-action-bar"><button class="output-action-btn" onclick="downloadBase64File(\'' + _escapeJsString(downloadRaw) + "', 'output.png', 'image/png')\">下载图片</button></div>";
    }

    function renderOutputImages(container, result) {
      if (!Array.isArray(result)) {
        renderOutputImage(container, result);
        return;
      }
      let html = '<div style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)">共 ' + result.length + " 张图片</div>";
      html += '<div class="output-images-grid">';
      result.forEach(item => {
        const src = _ensureDataUrl(String(item));
        html += '<div style="cursor:pointer" onclick="showImageFullscreen(\'' + _escapeJsString(src) + '\')"><img src="' + _escapeJsString(src).replace(/"/g, "&quot;") + '" style="width:100%;border-radius:6px" /></div>';
      });
      html += "</div>";
      container.innerHTML = html;
    }

    function renderOutputChart(container, result) {
      if (typeof echarts === "undefined") {
        container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">页面未加载 ECharts 库，无法绘制图表。<br>降级显示 JSON 数据：</div>';
        const jsonDiv = document.createElement("div");
        jsonDiv.className = "output-json";
        jsonDiv.textContent = JSON.stringify(result, null, 2);
        container.appendChild(jsonDiv);
        return;
      }
      const chartDiv = document.createElement("div");
      chartDiv.style.width = "100%";
      chartDiv.style.height = "400px";
      container.innerHTML = "";
      container.appendChild(chartDiv);
      const chart = echarts.init(chartDiv);
      let option = {};
      if (Array.isArray(result) && result.every(v => typeof v === "number")) {
        option = { xAxis: { type: "category", data: result.map((_, i) => i) }, yAxis: { type: "value" }, series: [{ data: result, type: "line", smooth: true }], tooltip: { trigger: "axis" } };
      } else if (result && typeof result === "object" && !Array.isArray(result)) {
        if (result.labels && result.values) {
          option = { tooltip: { trigger: "item" }, series: [{ type: "pie", data: result.labels.map((l, i) => ({ name: l, value: result.values[i] })) }] };
        } else if (result.x && result.y) {
          option = { xAxis: { type: "category", data: result.x }, yAxis: { type: "value" }, series: [{ data: result.y, type: "line", smooth: true }], tooltip: { trigger: "axis" } };
        } else {
          renderOutputJson(container, result);
          return;
        }
      } else if (Array.isArray(result) && result.length && typeof result[0] === "object") {
        const keys = Object.keys(result[0]).filter(k => typeof result[0][k] === "number");
        const categories = result.map((_, i) => i);
        option = { xAxis: { type: "category", data: categories }, yAxis: { type: "value" }, legend: { data: keys }, series: keys.map(k => ({ name: k, type: "bar", data: result.map(r => r[k]) })), tooltip: { trigger: "axis" } };
      } else {
        renderOutputJson(container, result);
        return;
      }
      chart.setOption(option);
      window.addEventListener("resize", () => chart.resize(), { passive: true });
    }

    function renderOutputHtml(container, result) {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-same-origin";
      iframe.style.width = "100%";
      iframe.style.border = "1px solid var(--border)";
      iframe.style.borderRadius = "6px";
      iframe.style.minHeight = "200px";
      container.innerHTML = "";
      container.appendChild(iframe);
      iframe.srcdoc = String(result);
      iframe.onload = () => {
        try {
          iframe.style.height = iframe.contentDocument.body.scrollHeight + 20 + "px";
        } catch (err) {
          iframe.style.height = "300px";
        }
      };
    }

    function renderOutputFile(container, result) {
      if (result && typeof result === "object" && result.filename && (result.content || result.base64)) {
        const b64 = result.base64 || btoa(result.content);
        container.innerHTML = '<div style="padding:20px;text-align:center"><div style="font-size:16px;margin-bottom:12px">' + esc(result.filename) + "</div>" +
          '<button class="output-download-btn" onclick="downloadBase64File(\'' + _escapeJsString(b64) + "', '" + _escapeJsString(result.filename) + "')\">下载文件</button></div>";
      } else {
        renderOutputJson(container, result);
      }
    }

    function renderOutputMixed(container, result) {
      container.innerHTML = "";
      if (result && typeof result === "object" && !Array.isArray(result)) {
        Object.entries(result).forEach(([key, val]) => {
          const section = document.createElement("div");
          section.style.marginBottom = "16px";
          const label = document.createElement("div");
          label.className = "output-section-label";
          label.textContent = key;
          section.appendChild(label);
          const content = document.createElement("div");
          if (_isBase64Image(val)) {
            renderOutputImage(content, val);
          } else if (Array.isArray(val) && val.length && typeof val[0] === "object") {
            renderOutputTable(content, val);
          } else if (typeof val === "object") {
            content.className = "json-tree";
            content.appendChild(renderJsonTree(val, 0));
          } else {
            const t = document.createElement("div");
            t.className = "output-text";
            t.textContent = String(val);
            content.appendChild(t);
          }
          section.appendChild(content);
          container.appendChild(section);
        });
      } else {
        renderOutputJson(container, result);
      }
    }

    // ===== 任务 7：图表 Tab =====
    function renderChartOutput(response) {
      const container = document.getElementById("outputContent");
      if (!container) return;
      if (!response || !response.result) {
        container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">无数据</div>';
        return;
      }
      const result = response.result;
      const hint = response.output_hint;
      if (hint === "chart") {
        renderOutputChart(container, result);
        return;
      }
      if (Array.isArray(result) && result.every(v => typeof v === "number")) {
        renderOutputChart(container, result);
        return;
      }
      if (Array.isArray(result) && result.length && typeof result[0] === "object") {
        const numKeys = Object.keys(result[0]).filter(k => typeof result[0][k] === "number");
        if (numKeys.length) {
          renderOutputChart(container, result);
          return;
        }
      }
      container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">当前结果不适合绘制图表</div>';
    }
