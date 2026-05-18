/*
 * AlgoLib module: 29-full-test-core.js
 * ???????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function openTestPage(algo) {
      if (!algo) { showToast("\u672a\u627e\u5230\u53ef\u6d4b\u8bd5\u7684\u7b97\u6cd5"); return; }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const mainEl = qs("#main");
      if (mainEl) mainEl.scrollTop = 0;
      document.body.style.overflow = "hidden";
      const host = document.getElementById("testFullpage");
      const main = document.getElementById("main");
      if (!host || !main) return;
      if (host.parentElement !== main) main.appendChild(host);

      let inputExample = {};
      try {
        if (algo.inputExample) inputExample = JSON.parse(algo.inputExample);
      } catch (e) {
        inputExample = {};
      }

      state._testAlgo = algo;
      state._testParamValues = {};
      state._testResult = null;
      state._testOutputTab = "output";
      state._testInputExample = inputExample && typeof inputExample === "object" && !Array.isArray(inputExample) ? inputExample : {};
      state._compTestAlgo = algo;
      state._compTestSource = null;
      state.compTestFileUploads = {};
      state._tpFileState = {};
      state.testPanelOpen = true;

      ensureTestExampleButton();
      host.style.display = "flex";
      document.getElementById("testAlgoName").textContent = algo.zhName || algo.funcName || algo.name || algo.id || "\u7b97\u6cd5";
      document.getElementById("testAlgoNs").textContent = algo.callPrefix || algo.displayNamespace || "";
      renderTestParamCards(algo.params || []);
      document.getElementById("outputContent").innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">\u70b9\u51fb\u300c\u8fd0\u884c\u6d4b\u8bd5\u300d\u67e5\u770b\u7ed3\u679c</div>';
      document.getElementById("testElapsed").textContent = "";
      switchOutputTab("output");
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
        fillBtn.textContent = "\u586b\u5165\u793a\u4f8b";
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
        skipText.textContent = "\u8df3\u8fc7\u6b64\u53c2\u6570";
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
      btn.textContent = "\u586b\u5165\u5168\u90e8\u793a\u4f8b";
      btn.onclick = fillAllTestExamples;
      runBarActions.insertBefore(btn, runBtn);
    }
