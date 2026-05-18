/*
 * AlgoLib module: 30-full-test-basic-inputs.js
 * ???????????????JSON ?????/?????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function _cleanDefaultValue(value) {
      if (value === undefined || value === null || value === "None") return "";
      let text = String(value);
      if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) text = text.slice(1, -1);
      return text;
    }

    function renderIntInput(param, container) {
      const input = document.createElement("input");
      input.type = "number"; input.step = "1"; input.className = "input-number";
      input.placeholder = "请输入整数";
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value === "" ? null : parseInt(input.value, 10); });
      if (input.value !== "") state._testParamValues[param.name] = parseInt(input.value, 10);
      container.appendChild(input);
    }

    function renderFloatInput(param, container) {
      const input = document.createElement("input");
      input.type = "number"; input.step = "any"; input.className = "input-number";
      input.placeholder = "请输入数字";
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value === "" ? null : parseFloat(input.value); });
      if (input.value !== "") state._testParamValues[param.name] = parseFloat(input.value);
      container.appendChild(input);
    }

    function renderStrInput(param, container) {
      const input = document.createElement("input");
      input.type = "text"; input.className = "input-text"; input.placeholder = "请输入文本";
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value; });
      if (input.value) state._testParamValues[param.name] = input.value;
      container.appendChild(input);
    }

    function renderTextInput(param, container) {
      const ta = document.createElement("textarea");
      ta.className = "input-textarea"; ta.rows = 4; ta.placeholder = "请输入长文本";
      ta.value = _cleanDefaultValue(param.default);
      ta.addEventListener("input", () => { state._testParamValues[param.name] = ta.value; });
      if (ta.value) state._testParamValues[param.name] = ta.value;
      container.appendChild(ta);
    }

    function renderBoolInput(param, container) {
      const group = document.createElement("div"); group.className = "input-bool-group";
      const btnTrue = document.createElement("button"); btnTrue.type = "button"; btnTrue.className = "input-bool-btn"; btnTrue.textContent = "是 (True)";
      const btnFalse = document.createElement("button"); btnFalse.type = "button"; btnFalse.className = "input-bool-btn"; btnFalse.textContent = "否 (False)";
      function setVal(val) {
        state._testParamValues[param.name] = val;
        btnTrue.classList.toggle("active", val === true);
        btnFalse.classList.toggle("active", val === false);
      }
      btnTrue.onclick = () => setVal(true);
      btnFalse.onclick = () => setVal(false);
      if (param.default === "True" || param.default === true) setVal(true);
      else if (param.default === "False" || param.default === false) setVal(false);
      group.appendChild(btnTrue); group.appendChild(btnFalse);
      container.appendChild(group);
    }

    function renderJsonInput(param, container) {
      const ta = document.createElement("textarea");
      ta.className = "input-json-box"; ta.rows = 6;
      if (param.widget_hint === "dataframe") ta.placeholder = '请输入表格数据，支持 JSON 数组或 CSV 格式\n例如：[{"name":"张三","age":25},{"name":"李四","age":30}]';
      else if (param.widget_hint === "list") ta.placeholder = "请输入列表，支持 JSON 格式\n例如：[1, 2, 3] 或每行一个值";
      else if (param.widget_hint === "dict") ta.placeholder = '请输入字典，支持 JSON 格式\n例如：{"key": "value"}';
      else ta.placeholder = "请输入 JSON 数据";
      const def = _cleanDefaultValue(param.default);
      if (def) ta.value = def;
      ta.addEventListener("input", () => { state._testParamValues[param.name] = ta.value; });
      if (ta.value) state._testParamValues[param.name] = ta.value;
      container.appendChild(ta);

      const toolbar = document.createElement("div"); toolbar.className = "json-toolbar";
      const fmtBtn = document.createElement("button"); fmtBtn.type = "button"; fmtBtn.className = "json-toolbar-btn"; fmtBtn.textContent = "格式化";
      fmtBtn.onclick = () => {
        try {
          ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
          state._testParamValues[param.name] = ta.value;
        } catch (e) { showToast("JSON 格式错误"); }
      };
      const importBtn = document.createElement("button"); importBtn.type = "button"; importBtn.className = "json-toolbar-btn"; importBtn.textContent = "从文件导入";
      importBtn.onclick = () => {
        const fi = document.createElement("input"); fi.type = "file"; fi.accept = ".json,.csv,.txt";
        fi.onchange = () => {
          const file = fi.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => { ta.value = e.target.result; state._testParamValues[param.name] = ta.value; };
          reader.readAsText(file);
        };
        fi.click();
      };
      toolbar.appendChild(fmtBtn); toolbar.appendChild(importBtn);
      container.appendChild(toolbar);
    }

