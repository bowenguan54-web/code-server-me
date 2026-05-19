/*
 * AlgoLib module: 29-full-test-core.js
 * 全屏测试页打开关闭、参数卡片和示例填充。
 * 从模块文件构建到 .run/algo-lib-check.js / .run/algo-lib-inline-check.js。
 */

    function _createTestFullpageElement() {
      const host = document.createElement("div");
      host.id = "testFullpage";
      host.className = "test-fullpage";
      host.style.display = "none";
      host.style.position = "fixed";
      host.style.top = "0";
      host.style.left = "0";
      host.style.width = "100vw";
      host.style.height = "100vh";
      host.style.zIndex = "9999";
      host.style.overflow = "auto";
      host.innerHTML = `
        <div class="test-header">
          <div style="display:flex;align-items:center;gap:12px">
            <span id="testAlgoName" style="font-weight:600;font-size:16px"></span>
            <span id="testAlgoNs" style="font-size:12px;color:var(--text-secondary)"></span>
          </div>
          <button class="test-close-btn" onclick="closeTestPage()">关闭测试</button>
        </div>
        <div class="test-body">
          <div class="test-input-panel" id="testInputPanel">
            <div class="test-section-title">参数输入</div>
            <div id="testParamCards"></div>
          </div>
          <div class="test-divider" id="testDivider"></div>
          <div class="test-output-panel" id="testOutputPanel">
            <div class="test-section-title">运行结果</div>
            <div class="output-tabs" id="outputTabs">
              <button class="output-tab active" data-tab="raw" onclick="switchOutputTab('raw')">原始输出</button>
              <button class="output-tab" data-tab="json" onclick="switchOutputTab('json')">JSON 树</button>
              <button class="output-tab" data-tab="table" onclick="switchOutputTab('table')">表格</button>
              <button class="output-tab" data-tab="line" onclick="switchOutputTab('line')">折线图</button>
              <button class="output-tab" data-tab="bar" onclick="switchOutputTab('bar')">柱状图</button>
              <button class="output-tab" data-tab="pie" onclick="switchOutputTab('pie')">饼图</button>
              <button class="output-tab" data-tab="image" onclick="switchOutputTab('image')">图片</button>
              <button class="output-tab" data-tab="file" onclick="switchOutputTab('file')">文件下载</button>
            </div>
            <div class="output-content" id="outputContent">
              <div style="color:var(--text-secondary);text-align:center;padding:40px">点击「运行测试」查看结果</div>
            </div>
          </div>
        </div>
        <div class="test-run-bar">
          <div><span class="test-elapsed" id="testElapsed"></span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="test-run-btn" id="testRunBtn" onclick="runFullTest()">运行测试</button>
          </div>
        </div>
      `;
      return host;
    }

    function openTestPage(algo) {
      if (!algo) {
        showToast("未找到可测试的算法");
        return;
      }

      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const mainEl = qs("#main");
      if (mainEl) mainEl.scrollTop = 0;
      document.body.style.overflow = "hidden";

      let host = document.getElementById("testFullpage");
      if (!host) {
        host = _createTestFullpageElement();
      }
      if (host.parentElement !== document.body) {
        document.body.appendChild(host);
      }

      let inputExample = {};
      try {
        if (algo.inputExample) inputExample = JSON.parse(algo.inputExample);
      } catch (e) {
        inputExample = {};
      }

      state._testAlgo = algo;
      state._testParamValues = {};
      state._testResult = null;
      state._testOutputTab = "raw";
      state._testInputExample = inputExample && typeof inputExample === "object" && !Array.isArray(inputExample) ? inputExample : {};
      state._compTestAlgo = algo;
      state._compTestSource = null;
      state.compTestFileUploads = {};
      state._tpFileState = {};
      state.testPanelOpen = true;

      const nameEl = document.getElementById("testAlgoName");
      const nsEl = document.getElementById("testAlgoNs");
      const outputEl = document.getElementById("outputContent");
      const elapsedEl = document.getElementById("testElapsed");

      host.style.display = "flex";
      if (nameEl) nameEl.textContent = algo.zhName || algo.funcName || algo.name || algo.id || "算法";
      if (nsEl) nsEl.textContent = algo.callPrefix || algo.displayNamespace || "";
      renderTestParamCards(algo.params || []);
      if (outputEl) outputEl.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">点击「运行测试」查看结果</div>';
      if (elapsedEl) elapsedEl.textContent = "";
      switchOutputTab("raw");
      ensureTestExampleButton();
      initTestDivider();
    }

    function closeTestPage() {
      const host = document.getElementById("testFullpage");
      if (host) host.style.display = "none";
      document.body.style.overflow = "";
      state._testAlgo = null;
      state._testParamValues = {};
      state._testResult = null;
      state._testInputExample = {};
      state.testPanelOpen = false;
    }

    function renderTestParamCards(params) {
      const container = document.getElementById("testParamCards");
      if (!container) return;
      container.innerHTML = "";
      if (!params || !params.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "color:var(--text-secondary);text-align:center;padding:32px";
        empty.textContent = "该算法无需输入参数";
        container.appendChild(empty);
        return;
      }
      for (const param of params) {
        const card = renderOneParamCard(param);
        container.appendChild(card);
        if (hasTestInputExample(param.name)) fillTestParamExample(param.name);
      }
    }

    function renderOneParamCard(param) {
      const card = document.createElement("div");
      card.className = "param-card";
      card.dataset.paramName = param.name || "";
      const widgetHint = param.widget_hint || inferParamWidget(param);
      card.dataset.widgetHint = widgetHint;

      const header = document.createElement("div");
      header.className = "param-card-header";
      const left = document.createElement("div");
      const nameEl = document.createElement("span");
      nameEl.className = "param-name";
      nameEl.textContent = param.name || "";
      const badge = document.createElement("span");
      badge.className = "param-type-badge";
      badge.textContent = WIDGET_ZH[widgetHint] || param.type || widgetHint;
      left.appendChild(nameEl);
      left.appendChild(badge);
      header.appendChild(left);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";

      const hasExample = hasTestInputExample(param.name);
      if (hasExample) {
        const fillBtn = document.createElement("button");
        fillBtn.type = "button";
        fillBtn.className = "json-toolbar-btn";
        fillBtn.textContent = "填入示例";
        fillBtn.onclick = () => fillTestParamExample(param.name);
        right.appendChild(fillBtn);
      }

      const canSkip = param.nullable || param.default === "None" || param.default === null;
      let skipInput = null;
      if (canSkip) {
        const skip = document.createElement("label");
        skip.className = "param-skip-label";
        skipInput = document.createElement("input");
        skipInput.type = "checkbox";
        skipInput.className = "param-skip-checkbox";
        skipInput.dataset.testSkip = param.name || "";
        const skipText = document.createElement("span");
        skipText.textContent = "跳过此参数";
        skip.appendChild(skipInput);
        skip.appendChild(skipText);
        right.appendChild(skip);
      }
      header.appendChild(right);
      card.appendChild(header);

      const desc = param.description || param.desc || param.zh_description || "";
      if (desc) {
        const descEl = document.createElement("div");
        descEl.className = "param-desc";
        descEl.textContent = desc;
        card.appendChild(descEl);
      }

      const inputArea = document.createElement("div");
      inputArea.className = "param-input-area";
      switch (widgetHint) {
        case "int": renderIntInput(param, inputArea); break;
        case "float": renderFloatInput(param, inputArea); break;
        case "str": renderStrInput(param, inputArea); break;
        case "text": renderTextInput(param, inputArea); break;
        case "bool": renderBoolInput(param, inputArea); break;
        case "list":
        case "dict":
        case "json":
        case "dataframe": renderJsonInput(param, inputArea); break;
        case "image": renderImageInput(param, inputArea); break;
        case "images": renderImagesInput(param, inputArea); break;
        case "file":
        case "audio":
        case "video": renderFileInput(param, inputArea); break;
        case "literal": renderLiteralInput(param, inputArea); break;
        case "url": renderUrlInput(param, inputArea); break;
        case "datetime": renderDatetimeInput(param, inputArea); break;
        case "color": renderColorInput(param, inputArea); break;
        case "password": renderPasswordInput(param, inputArea); break;
        default: renderStrInput(param, inputArea); break;
      }
      if (skipInput) {
        skipInput.addEventListener("change", () => {
          inputArea.style.opacity = skipInput.checked ? "0.4" : "1";
          inputArea.style.pointerEvents = skipInput.checked ? "none" : "";
        });
      }
      card.appendChild(inputArea);
      return card;
    }

    function hasTestInputExample(paramName) {
      return !!paramName && Object.prototype.hasOwnProperty.call(state._testInputExample || {}, paramName);
    }

    function normalizeExampleValueForWidget(value, widgetHint) {
      if (widgetHint === "int") return value === "" || value === null || value === undefined ? null : parseInt(String(value), 10);
      if (widgetHint === "float") return value === "" || value === null || value === undefined ? null : parseFloat(String(value));
      if (widgetHint === "bool") return value === true || value === "true" || value === "True" || value === 1 || value === "1";
      if (widgetHint === "images") return Array.isArray(value) ? value : [value];
      if (["list", "dict", "json", "dataframe"].includes(widgetHint)) return value;
      return value === null || value === undefined ? "" : String(value);
    }

    function stringifyExampleValue(value) {
      if (value === null || value === undefined) return "";
      if (typeof value === "string") return value;
      return JSON.stringify(value, null, 2);
    }

    function fillTestParamExample(paramName) {
      if (!hasTestInputExample(paramName)) return;
      const card = document.querySelector(`.param-card[data-param-name="${CSS.escape(paramName)}"]`);
      if (!card) return;
      const widgetHint = card.dataset.widgetHint || "str";
      const value = state._testInputExample[paramName];
      const normalized = normalizeExampleValueForWidget(value, widgetHint);
      state._testParamValues[paramName] = normalized;

      const skip = card.querySelector(".param-skip-checkbox");
      if (skip) {
        skip.checked = false;
        skip.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (widgetHint === "bool") {
        const buttons = Array.from(card.querySelectorAll(".input-bool-btn"));
        buttons.forEach((btn, index) => btn.classList.toggle("active", index === (normalized ? 0 : 1)));
        return;
      }

      if (["list", "dict", "json", "dataframe"].includes(widgetHint)) {
        const ta = card.querySelector("textarea");
        if (ta) {
          ta.value = stringifyExampleValue(value);
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }

      if (widgetHint === "literal") {
        const select = card.querySelector("select");
        if (select) {
          select.value = String(value ?? "");
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      if (widgetHint === "image" && typeof value === "string" && /^https?:\/\//i.test(value)) {
        const urlBtn = card.querySelector('.image-mode-btn[data-mode="url"]');
        if (urlBtn) urlBtn.click();
        const urlInput = card.querySelector(".image-url-input");
        if (urlInput) {
          urlInput.value = value;
          urlInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }

      const input = card.querySelector("input.input-number, input.input-text, input.input-url, textarea.input-textarea, textarea.input-json-box, input[type='password'], input[type='datetime-local'], input[type='color']");
      if (input) {
        input.value = stringifyExampleValue(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    function fillAllTestExamples() {
      const examples = state._testInputExample || {};
      Object.keys(examples).forEach(name => fillTestParamExample(name));
    }

    function ensureTestExampleButton() {
      const runBarActions = document.querySelector(".test-run-bar > div:last-child");
      const runBtn = document.getElementById("testRunBtn");
      if (!runBarActions || !runBtn || document.getElementById("testFillAllExampleBtn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "testFillAllExampleBtn";
      btn.className = "json-toolbar-btn";
      btn.textContent = "填入全部示例";
      btn.onclick = fillAllTestExamples;
      runBarActions.insertBefore(btn, runBtn);
    }
