/*
 * AlgoLib module: 39-output-utils-run.js
 * 全屏测试页运行、输出路由和基础输出工具。
 * 从模块文件构建到 .run/algo-lib-check.js / .run/algo-lib-inline-check.js。
 */

    // ===== 辅助函数 =====
    function _isBase64Image(s) {
      if (typeof s !== "string") return false;
      if (s.startsWith("data:image")) return true;
      const trimmed = s.replace(/\s/g, "").replace(/=+$/, "");
      if (trimmed.length < 100) return false;
      return /^(\/9j\/|iVBOR|R0lGOD|UklGR)/.test(trimmed);
    }

    function _ensureDataUrl(base64Str) {
      if (typeof base64Str !== "string") return "";
      if (base64Str.startsWith("data:image")) return base64Str;
      const trimmed = base64Str.replace(/\s/g, "");
      let mime = "image/png";
      if (trimmed.startsWith("/9j/")) mime = "image/jpeg";
      else if (trimmed.startsWith("R0lGOD")) mime = "image/gif";
      else if (trimmed.startsWith("UklGR")) mime = "image/webp";
      return "data:" + mime + ";base64," + trimmed;
    }

    function _escapeJsString(value) {
      return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(String(text ?? ""))
        .then(() => showToast("已复制到剪贴板"))
        .catch(() => showToast("复制失败"));
    }

    function downloadBlob(data, filename, mimeType) {
      const blob = (data instanceof Blob) ? data : new Blob([data], { type: mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function downloadBase64File(base64, filename, mimeType) {
      let raw = String(base64 || "");
      if (raw.startsWith("data:") && raw.includes(",")) raw = raw.split(",")[1] || "";
      raw = raw.replace(/\s/g, "");
      const padding = raw.length % 4;
      if (padding) raw += "=".repeat(4 - padding);
      const byteChars = atob(raw);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      downloadBlob(byteArr, filename || "download", mimeType || "application/octet-stream");
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

    // ===== 参数收集函数 =====
    function collectTestParams() {
      const algo = state._testAlgo;
      if (!algo) return { args: [], kwargs: {} };
      const kwargs = {};
      for (const param of (algo.params || [])) {
        const card = Array.from(document.querySelectorAll(".param-card"))
          .find(el => el.dataset.paramName === param.name);
        if (card) {
          const skipCheckbox = card.querySelector(".param-skip-checkbox");
          if (skipCheckbox && skipCheckbox.checked) continue;
        }
        let val = state._testParamValues[param.name];
        if (val === undefined) continue;
        const hint = param.widget_hint || inferParamWidget(param) || "str";
        switch (hint) {
          case "int":
            val = (val === "" || val === null) ? null : parseInt(String(val), 10);
            break;
          case "float":
            val = (val === "" || val === null) ? null : parseFloat(String(val));
            break;
          case "bool":
            break;
          case "list":
          case "dict":
          case "json":
          case "dataframe":
            if (typeof val === "string") {
              try {
                val = JSON.parse(val);
              } catch (err) {
                val = parseParamValueByType(param.type, val);
              }
            }
            break;
          case "image":
          case "file":
          case "audio":
          case "video":
            break;
          case "images":
            if (!Array.isArray(val)) val = [val];
            break;
          default:
            val = String(val ?? "");
            break;
        }
        kwargs[param.name] = val;
      }
      return { args: [], kwargs };
    }

    // ===== 运行函数 =====
    async function runFullTest() {
      const algo = state._testAlgo;
      if (!algo) {
        showToast("未选择算法");
        return;
      }
      const btn = document.getElementById("testRunBtn");
      const elapsedEl = document.getElementById("testElapsed");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "运行中...";
      }
      if (elapsedEl) elapsedEl.textContent = "运行中...";
      try {
        const payload = collectTestParams();
        const id = algo.id || algo.registryId;
        const response = await api("/api/v1/algorithms/" + encodeURIComponent(id) + "/execute", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        state._testResult = response;
        if (elapsedEl) elapsedEl.textContent = "耗时 " + (response.elapsed_ms || 0).toFixed(1) + " ms";
        renderTestOutput(response);
      } catch (err) {
        state._testResult = { success: false, error: err.message, result: null, output_hint: "error" };
        if (elapsedEl) elapsedEl.textContent = "执行失败";
        renderTestOutput(state._testResult);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "运行测试";
        }
      }
    }

    // ===== 输出路由 =====
    function renderTestOutput(response) {
      const tab = state._testOutputTab || "raw";
      switchOutputTab(tab);
    }

    function switchOutputTab(tabName) {
      state._testOutputTab = tabName;
      document.querySelectorAll("#outputTabs .output-tab").forEach(el => {
        el.classList.toggle("active", el.dataset.tab === tabName);
      });
      const response = state._testResult;
      const container = document.getElementById("outputContent");
      if (!container) return;
      if (!response) {
        container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">点击「运行测试」查看结果</div>';
        return;
      }
      const result = response.result;
      switch (tabName) {
        case "raw": renderRawOutput(response); break;
        case "json": renderOutputJson(container, result); break;
        case "table": tryRenderTable(container, result); break;
        case "line": tryRenderLineChart(container, result); break;
        case "bar": tryRenderBarChart(container, result); break;
        case "pie": tryRenderPieChart(container, result); break;
        case "image": tryRenderImage(container, result); break;
        case "file": tryRenderFileDownload(container, result); break;
        default: renderRawOutput(response); break;
      }
    }

    // ===== 原始输出渲染 =====
    function renderRawOutput(response) {
      const container = document.getElementById("outputContent");
      if (!container) return;
      let html = "";
      if (response.stdout) {
        html += '<div class="output-section-label">打印输出</div>';
        html += '<div class="output-text">' + esc(response.stdout) + "</div>";
      }
      if (response.error) {
        html += '<div class="output-section-label">错误信息</div>';
        html += '<div class="output-error">' + esc(response.error) + "</div>";
      }
      if (response.result !== null && response.result !== undefined) {
        html += '<div class="output-section-label">返回值</div>';
        if (typeof response.result === "string") {
          html += '<div class="output-text">' + esc(response.result) + "</div>";
        } else {
          html += '<div class="output-json">' + esc(JSON.stringify(response.result, null, 2)) + "</div>";
        }
        html += '<div class="output-action-bar"><button class="output-action-btn" onclick="copyToClipboard(JSON.stringify(state._testResult.result, null, 2))">复制返回值</button></div>';
      }
      if (!html) html = '<div style="color:var(--text-secondary);text-align:center;padding:40px">无输出</div>';
      container.innerHTML = html;
    }

    // ===== 结构化输出渲染（旧入口保留兼容） =====
    function renderStructuredOutput(response) {
      const container = document.getElementById("outputContent");
      if (!container) return;
      if (!response.success && response.error) {
        container.innerHTML = '<div class="output-error">' + esc(response.error) + "</div>";
        return;
      }
      const result = response.result;
      const hint = response.output_hint || inferOutputHintFromSample(result) || "text";
      switch (hint) {
        case "text": renderOutputText(container, result); break;
        case "json": renderOutputJson(container, result); break;
        case "table": renderOutputTable(container, result); break;
        case "image": renderOutputImage(container, result); break;
        case "images": renderOutputImages(container, result); break;
        case "chart": renderOutputChart(container, result); break;
        case "html": renderOutputHtml(container, result); break;
        case "file": renderOutputFile(container, result); break;
        case "error": container.innerHTML = '<div class="output-error">' + esc(response.error || "执行出错") + "</div>"; break;
        case "mixed": renderOutputMixed(container, result); break;
        default: renderOutputJson(container, result); break;
      }
    }
