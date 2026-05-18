/*
 * AlgoLib module: 32-full-test-run-output-compat.js
 * ????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function runFullTest() {
      const btn = document.getElementById("testRunBtn");
      const elapsedEl = document.getElementById("testElapsed");
      const started = performance.now();
      if (btn) { btn.disabled = true; btn.textContent = "运行中..."; }
      if (elapsedEl) elapsedEl.textContent = "";
      try {
        const algo = state._testAlgo;
        if (!algo) throw new Error("未选择算法");
        const kwargs = collectFullTestParams();
        const status = algo.publishStatus || algo.status || "";
        const body = {
          namespace: algo.namespace,
          function: algo.funcName || algo.name || "main",
          params: kwargs
        };
        if (status !== "published") body.allow_unpublished = true;
        const result = await api("/api/v1/run", { method: "POST", body: JSON.stringify(body) });
        state._testResult = result;
        const elapsed = result.elapsed_ms ?? Math.round(performance.now() - started);
        if (elapsedEl) elapsedEl.textContent = "耗时：" + elapsed + " ms";
        const hint = result.output_hint || inferOutputHintFromSample(result.result ?? result);
        if (hint === "chart") switchOutputTab("chart");
        else if (hint === "table") switchOutputTab("structured");
        else switchOutputTab("output");
      } catch (err) {
        state._testResult = { success: false, error: err.message, output_hint: "error", result: null };
        if (elapsedEl) elapsedEl.textContent = "运行失败：" + Math.round(performance.now() - started) + " ms";
        switchOutputTab("output");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "运行测试"; }
      }
    }

    function switchOutputTab(tab) {
      state._testOutputTab = tab;
      document.querySelectorAll("#outputTabs .output-tab").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
      renderFullTestOutput();
    }

    function renderFullTestOutput() {
      const content = document.getElementById("outputContent");
      if (!content) return;
      const pack = state._testResult;
      if (!pack) {
        content.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">点击「运行测试」查看结果</div>';
        return;
      }
      const result = pack.result ?? pack;
      const hint = pack.output_hint || inferOutputHintFromSample(result);
      if (hint === "error" || pack.success === false) {
        content.innerHTML = `<div class="output-error">${esc(pack.error || "执行失败")}</div>`;
        return;
      }
      if (state._testOutputTab === "structured") {
        if (hint === "table" || Array.isArray(result)) content.innerHTML = renderFullOutputTable(result);
        else content.innerHTML = `<div class="output-json json-tree">${renderJsonTree(result)}</div>`;
      } else if (state._testOutputTab === "chart") {
        content.innerHTML = renderFullOutputChart(result, hint);
      } else {
        content.innerHTML = renderFullOutputRaw(result, hint);
      }
    }

    function inferOutputHintFromSample(sample) {
      if (sample === null || sample === undefined) return "error";
      if (typeof sample === "string") {
        if (_isBase64Image(sample)) return "image";
        if (sample.trim().startsWith("<") && /<\/?[a-z][\s\S]*>/i.test(sample)) return "html";
        return "text";
      }
      if (Array.isArray(sample)) {
        if (sample.every(v => typeof v === "string" && _isBase64Image(v))) return "images";
        if (sample.every(v => v && typeof v === "object" && !Array.isArray(v))) return "table";
        if (sample.every(v => typeof v === "number")) return "chart";
        return "json";
      }
      if (typeof sample === "object") {
        if (sample.__output_type__ === "table") return "table";
        if ("filename" in sample && ("content" in sample || "base64" in sample)) return "file";
        if (["x", "y", "labels", "values"].some(k => k in sample)) return "chart";
        return "json";
      }
      return "text";
    }

    function renderFullOutputRaw(result, hint) {
      if (hint === "image") {
        const src = String(result).startsWith("data:") ? result : "data:image/png;base64," + result;
        return `<img class="output-image" src="${esc(src)}" alt="运行结果图片" onclick="window.showImageFullscreen('${esc(src)}')">`;
      }
      if (hint === "images" && Array.isArray(result)) {
        return `<div class="output-images-grid">${result.map(src => {
          const full = String(src).startsWith("data:") ? src : "data:image/png;base64," + src;
          return `<img class="output-image" src="${esc(full)}" alt="运行结果图片" onclick="window.showImageFullscreen('${esc(full)}')">`;
        }).join("")}</div>`;
      }
      if (hint === "html") return `<iframe style="width:100%;min-height:360px;border:1px solid var(--border);border-radius:6px;background:#fff" srcdoc="${esc(result)}"></iframe>`;
      if (hint === "file" && result && typeof result === "object") return renderFullOutputFile(result);
      if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") return `<div class="output-text">${esc(String(result))}</div>`;
      return `<pre class="output-json">${esc(JSON.stringify(result, null, 2))}</pre>`;
    }

    function renderFullOutputTable(result) {
      const spec = _tableSpecFromResult(result);
      if (!spec.columns.length) return '<div class="output-text">无法转换为表格</div>';
      const thead = `<thead><tr>${spec.columns.map(col => `<th>${esc(col)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${spec.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell === undefined || cell === null ? "" : String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `<div style="overflow:auto;max-height:70vh"><table class="output-table">${thead}${tbody}</table></div>`;
    }

    function renderFullOutputChart(result, hint) {
      if (hint !== "chart") return '<div class="output-text">当前结果不适合转换为图表</div>';
      if (Array.isArray(result)) {
        const max = Math.max(...result.map(Number), 1);
        return `<div>${result.map((v, i) => `<div style="display:flex;align-items:center;gap:8px;margin:8px 0"><span style="width:40px;color:var(--text-secondary)">${i + 1}</span><div style="height:18px;background:var(--primary);width:${Math.max(4, Number(v) / max * 80)}%;border-radius:3px"></div><span>${esc(v)}</span></div>`).join("")}</div>`;
      }
      const labels = result.labels || result.x || [];
      const values = result.values || result.y || [];
      const max = Math.max(...values.map(Number), 1);
      return `<div>${values.map((v, i) => `<div style="display:flex;align-items:center;gap:8px;margin:8px 0"><span style="width:80px;color:var(--text-secondary)">${esc(labels[i] ?? i + 1)}</span><div style="height:18px;background:var(--accent);width:${Math.max(4, Number(v) / max * 80)}%;border-radius:3px"></div><span>${esc(v)}</span></div>`).join("")}</div>`;
    }

    function renderFullOutputFile(result) {
      const filename = result.filename || "result.txt";
      const content = result.content || result.base64 || "";
      const href = result.base64 ? `data:application/octet-stream;base64,${result.base64}` : `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
      return `<div class="output-action-bar"><a class="output-download-btn" download="${esc(filename)}" href="${esc(href)}">下载文件</a></div><div class="output-text">${esc(filename)}</div>`;
    }

    function renderJsonTree(value) {
      if (value === null) return '<span class="json-tree-null">null</span>';
      if (typeof value === "string") return `<span class="json-tree-str">"${esc(value)}"</span>`;
      if (typeof value === "number") return `<span class="json-tree-num">${esc(value)}</span>`;
      if (typeof value === "boolean") return `<span class="json-tree-bool">${esc(value)}</span>`;
      if (Array.isArray(value)) {
        return `[<div class="json-tree-children">${value.map((item, i) => `<div><span class="json-tree-key">${i}</span>: ${renderJsonTree(item)}</div>`).join("")}</div>]`;
      }
      if (typeof value === "object") {
        return `{<div class="json-tree-children">${Object.entries(value).map(([k, v]) => `<div><span class="json-tree-key">${esc(k)}</span>: ${renderJsonTree(v)}</div>`).join("")}</div>}`;
      }
      return esc(String(value));
    }

    function showImageFullscreen(src) {
      const mask = document.createElement("div");
      mask.className = "image-fullscreen-mask";
      const img = document.createElement("img");
      img.src = src;
      mask.appendChild(img);
      mask.onclick = () => mask.remove();
      document.body.appendChild(mask);
    }

