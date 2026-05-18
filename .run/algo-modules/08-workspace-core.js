/*
 * AlgoLib module: 08-workspace-core.js
 * ???????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function defaultAlgorithmCode(name) {
      const funcName = name || "my_algorithm";
      return `def ${funcName}(data: list, threshold: float = 0.5) -> dict:\n    \"\"\"在这里编写算法逻辑。\n\n    Args:\n        data: 输入数据。\n        threshold: 阈值参数。\n    \"\"\"\n    passed = [item for item in data if float(item) >= threshold]\n    return {\n        \"input_count\": len(data),\n        \"passed_count\": len(passed),\n        \"passed\": passed,\n    }\n`;
    }

    function newTemplateFiles(kind, name, templateKey) {
      const funcName = name || (kind === "complex" ? "complex_algorithm" : "my_algorithm");
      if (kind === "complex" || templateKey === "complex") return defaultComplexFiles(funcName);
      const code = templateKey === "quality"
        ? `def ${funcName}(rows: list[dict], required_columns: list[str]) -> dict:\n    \"\"\"数据质量检查示例。\"\"\"\n    issues = []\n    for row_index, row in enumerate(rows):\n        for column in required_columns:\n            if column not in row or row[column] in (None, \"\"):\n                issues.append({\"row\": row_index, \"column\": column, \"rule\": \"required\"})\n    return {\"row_count\": len(rows), \"issue_count\": len(issues), \"issues\": issues}\n`
        : defaultAlgorithmCode(funcName);
      return [{ relative_path: `${funcName}.py`, content: code }];
    }

    async function openAlgorithmWorkspace(page) {
      const parentP = parentPageOf(page);
      const moduleKind = parentP === "templates" ? "template" : "component";
      newAlgoState.returnPage = page;
      let cats = state.categories[parentP] || [];
      if (!cats.length) {
        try {
          const catData = await api(`/api/v1/categories?module_kind=${currentModuleKind(page)}`);
          cats = normalizeListPayload(catData, "categories");
          state.categories[parentP] = cats;
        } catch (_e) { cats = []; }
      }
      const defaultNs = parentP === "templates" ? "templates" : "custom";
      const catOptions = cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
      newAlgoState.files = newTemplateFiles("simple", "my_algorithm", "basic");
      newAlgoState.currentFile = newAlgoState.files[0].relative_path;
      newAlgoState.importedFromPicker = false;
      newAlgoState.functions = [];
      newAlgoState.widgetParams = [];
      newAlgoState.widgetOverrides = {};
      qs("#main").innerHTML = `
        <div class="new-workspace">
          <div class="editor-top">
            <button onclick="window.switchPage('${page}')">返回</button>
            <strong>${parentP === "templates" ? "新建算法模板" : "新建算法"}</strong>
            <span class="spacer"></span>
            <button onclick="window.testWorkspaceSource()">测试当前文件</button>
            <button onclick="window.checkWorkspaceCode()">检查代码</button>
            <button class="primary" onclick="window.saveWorkspaceAlgorithm('${moduleKind}')">保存草稿</button>
          </div>
          ${parentP === "templates" ? `<details class="template-usage-details" open>
            <summary>📖 算法模板说明（点击折叠）</summary>
            <div class="template-usage-body">
              <strong>新建算法模板界面使用说明：</strong><br>
              1. <strong>算法形态</strong>：选择"普通单文件"或"复杂多文件"。单文件模板只有一个 .py 文件；复杂多文件模板为包结构，包含 main.py 和辅助模块。<br>
              2. <strong>代码模板</strong>：提供预置代码框架，切换后代码区会自动更新。<br>
              3. <strong>函数/包名</strong>：生成的函数名或包名，只能使用小写字母、数字和下划线。<br>
              4. <strong>所属分类</strong>：算法模板所属的分类命名空间，可新建分类。<br>
              5. <strong>测试参数 JSON</strong>：点击"测试当前文件"时使用此处的参数作为函数入参，格式为 JSON 对象。<br>
              6. <strong>代码编辑区</strong>：直接编辑算法代码。多文件模板可在左侧文件列表切换文件。<br>
              7. 填写完毕后点击"<strong>保存草稿</strong>"将模板保存到系统，之后可在算法模板列表中进一步编辑和发布。
            </div>
          </details>` : ""}
          <div class="new-form-grid">
            <label>创建模式<select id="wsCreateMode" onchange="window.onWorkspaceModeChange()"><option value="template">选择模板</option><option value="import">外部导入</option></select></label>
            <label>算法形态<select id="wsKind" onchange="window.applyWorkspaceTemplate()"><option value="simple">普通单文件</option><option value="complex">复杂多文件</option></select></label>
            <label>代码模板<select id="wsTemplate" onchange="window.applyWorkspaceTemplate()"><option value="basic">基础算法</option><option value="quality">数据质量</option><option value="complex">复杂算法示例</option></select></label>
            <label>函数/包名<input id="wsName" value="my_algorithm" /></label>
            <label>所属分类
              <select id="wsCategory" onchange="window.onWsCatChange()">
                ${catOptions}
                <option value="__new__">＋ 新建分类...</option>
              </select>
            </label>
            <label>版本<input value="1.0.0 初始版本" disabled /></label>
            <label>中文名称<input id="wsZhName" value="${parentP === "templates" ? "自定义算法模板" : "自定义算法"}" /></label>
            <label id="wsNewCatRow" class="full" style="display:none">新分类信息
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input id="wsCategoryName" placeholder="中文显示名，如 统计算法" style="flex:1;min-width:140px" />
                <input id="wsCategoryNs" placeholder="英文命名空间，如 statistics" style="flex:1;min-width:140px" />
              </div>
            </label>
            <label class="wide">标签<input id="wsTags" value="${parentP === "templates" ? "模板,自定义" : "自定义,组件"}" /></label>
            <label class="full">描述<textarea id="wsDesc" rows="2">说明算法用途、输入输出和适用场景。</textarea></label>
            <label class="full">测试参数 JSON<textarea id="wsKwargs" rows="3">{"data":[0.1,0.6,0.9],"threshold":0.5}</textarea></label>
          </div>
          <div class="widget-config-panel">
            <div class="widget-config-header">
              <div>
                <div class="widget-config-title">参数控件配置</div>
                <div class="widget-config-desc">写好函数后点击“识别参数”，可手动指定测试页每个参数使用的输入控件。</div>
              </div>
              <button type="button" onclick="window.parseAndRenderWidgetConfig()">识别参数</button>
            </div>
            <div id="wsWidgetConfigList" class="widget-config-list">
              <div class="empty" style="padding:10px">尚未识别参数</div>
            </div>
          </div>
          <div class="code-check-row" id="wsImportHelp">
            <span>外部导入：选择一个 .py 文件或整个算法文件夹，系统会读取代码、识别入口函数，并按所填分类封装为 <code>alg.分类.函数</code>。</span>
            <button onclick="window.pickWorkspaceFile()">选择文件</button>
            <button onclick="window.pickWorkspaceFolder()">选择文件夹</button>
            <button onclick="window.inferWorkspaceNameFromCode()">重新识别函数名</button>
            <input id="wsFilePicker" type="file" accept=".py" style="display:none" onchange="window.handleWorkspaceImportFiles(this.files)" />
            <input id="wsFolderPicker" type="file" webkitdirectory directory multiple style="display:none" onchange="window.handleWorkspaceImportFiles(this.files)" />
          </div>
          <div class="code-check-row" id="wsImportMeta" style="display:none">
            <label style="display:flex;align-items:center;gap:6px">入口文件<select id="wsEntryFile" onchange="window.onWorkspaceEntryChange()"></select></label>
            <label style="display:flex;align-items:center;gap:6px">导出函数<select id="wsExportFunc" onchange="window.onWorkspaceExportChange()"></select></label>
            <span id="wsImportSummary" class="desc"></span>
          </div>
          <div class="file-editor-grid">
            <div class="file-list-panel" id="wsFileList"></div>
            <div id="wsCodeHost" class="workspace-monaco-host"></div>
          </div>
          <div id="wsOutput" class="output hidden"></div>
        </div>
      `;
      const defOpt = [...(qs("#wsCategory")?.options || [])].find(o => o.value === defaultNs);
      if (defOpt) qs("#wsCategory").value = defaultNs;
      renderWorkspaceFiles();
      await initWorkspaceMonaco(moduleKind);
    }

    function unwrapWidgetType(typeText) {
      let text = String(typeText || "Any").trim();
      let nullable = false;
      const optionalMatch = text.match(/^Optional\s*\[(.*)\]$/i);
      if (optionalMatch) {
        nullable = true;
        text = optionalMatch[1].trim();
      }
      const unionMatch = text.match(/^Union\s*\[(.*)\]$/i);
      if (unionMatch) {
        const parts = splitTopLevelParams(unionMatch[1]);
        nullable = nullable || parts.some(item => /^(None|NoneType|type\(None\))$/.test(item.trim()));
        text = (parts.find(item => !/^(None|NoneType|type\(None\))$/.test(item.trim())) || "Any").trim();
      }
      if (text.includes("|")) {
        const parts = text.split("|").map(item => item.trim()).filter(Boolean);
        nullable = nullable || parts.some(item => /^(None|NoneType)$/.test(item));
        text = parts.find(item => !/^(None|NoneType)$/.test(item)) || "Any";
      }
      return { type: text, nullable };
    }

    function splitFirstTopLevel(text, separator) {
      let depth = 0;
      const value = String(text || "");
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
        else if (ch === separator && depth === 0) return [value.slice(0, i), value.slice(i + 1)];
      }
      return [value, ""];
    }

    function widgetOptionsForType(typeText) {
      const unwrapped = unwrapWidgetType(typeText);
      const type = unwrapped.type.toLowerCase();
      if (/literal\s*\[/.test(type)) return ["literal"];
      if (/\bint\b/.test(type)) return ["int"];
      if (/\bfloat\b|\bnumber\b/.test(type)) return ["float"];
      if (/\bbool\b/.test(type)) return ["bool"];
      if (/list\[dict\]|list\s*\[\s*dict|dataframe|pd\.dataframe/.test(type)) return ["dataframe", "list", "images"];
      if (/\blist\b|\btuple\b|\bset\b/.test(type)) return ["list", "images", "dataframe"];
      if (/\bdict\b/.test(type)) return ["dict", "json"];
      if (/\bstr\b|\bany\b|^$/.test(type)) return ["str", "text", "color", "password", "url", "datetime", "image", "file"];
      return ["str", "text", "json"];
    }

    function parseParamsFromCode(code) {
      const source = String(code || "");
      const targetName = qs("#wsName")?.value.trim();
      const matches = Array.from(source.matchAll(/def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:->\s*[^:]+)?\s*:/g));
      if (!matches.length) return [];
      const selected = matches.find(match => match[1] === targetName) || matches[0];
      return splitTopLevelParams(selected[2] || "").map(raw => {
        const text = raw.trim();
        if (!text || text === "/" || text === "*" || text.startsWith("*")) return null;
        const [leftRaw, defaultRaw] = splitFirstTopLevel(text, "=");
        const [nameRaw, typeRaw] = splitFirstTopLevel(leftRaw, ":");
        const name = nameRaw.replace(/^\*\*?/, "").trim();
        if (!name || name === "self" || name === "cls") return null;
        const type = (typeRaw || "Any").trim() || "Any";
        const unwrapped = unwrapWidgetType(type);
        const recommended = inferParamWidget({ name, type: unwrapped.type });
        const options = widgetOptionsForType(type);
        const widget = options.includes(recommended) ? recommended : options[0];
        return { name, type, default: defaultRaw.trim(), widget, nullable: unwrapped.nullable, options };
      }).filter(Boolean);
    }

    function collectWorkspaceWidgetOverrides() {
      const overrides = {};
      qsa(".widget-select", qs("#wsWidgetConfigList") || document).forEach(select => {
        const name = select.dataset.param || "";
        if (name && select.value) overrides[name] = select.value;
      });
      newAlgoState.widgetOverrides = overrides;
      return overrides;
    }

    function renderWidgetConfigRows(params) {
      const list = qs("#wsWidgetConfigList");
      if (!list) return;
      if (!params.length) {
        list.innerHTML = '<div class="empty" style="padding:10px">未识别到函数参数</div>';
        return;
      }
      list.innerHTML = params.map(param => {
        const selected = newAlgoState.widgetOverrides[param.name] || param.widget;
        const options = (param.options || ["str"]).map(widget => (
          `<option value="${esc(widget)}"${widget === selected ? " selected" : ""}>${esc(WIDGET_ZH[widget] || widget)}</option>`
        )).join("");
        return `
          <div class="widget-config-row">
            <span class="widget-param-name" title="${esc(param.name)}">${esc(param.name)}</span>
            <span class="widget-param-type" title="${esc(param.type)}">${esc(param.type || "Any")}${param.default ? ` = ${esc(param.default)}` : ""}</span>
            <select class="widget-select" data-param="${esc(param.name)}" onchange="window.onWidgetOverrideChange(this)">
              ${options}
            </select>
            <label class="widget-nullable"><input type="checkbox" disabled ${param.nullable ? "checked" : ""}> 可为空</label>
          </div>`;
      }).join("");
    }

    function parseAndRenderWidgetConfig() {
      updateWorkspaceFileContent();
      const params = parseParamsFromCode(getWorkspaceCode());
      if (!params.length) showToast("没有识别到可配置的函数参数");
      newAlgoState.widgetParams = params;
      params.forEach(param => {
        if (!newAlgoState.widgetOverrides[param.name]) newAlgoState.widgetOverrides[param.name] = param.widget;
      });
      renderWidgetConfigRows(params);
    }

    function onWidgetOverrideChange(select) {
      if (!select?.dataset?.param) return;
      newAlgoState.widgetOverrides[select.dataset.param] = select.value;
    }

    function onWsCatChange() {
      const v = qs("#wsCategory")?.value;
      const row = qs("#wsNewCatRow");
      if (row) row.style.display = v === "__new__" ? "" : "none";
    }

    function applyWorkspaceTemplate() {
      if (qs("#wsCreateMode")?.value === "import") return;
      const templateKey = qs("#wsTemplate").value;
      if (templateKey === "complex") qs("#wsKind").value = "complex";
      const kind = qs("#wsKind").value;
      const fallback = kind === "complex" ? "complex_algorithm" : "my_algorithm";
      const name = qs("#wsName").value.trim() || fallback;
      newAlgoState.files = newTemplateFiles(kind, name, templateKey);
      newAlgoState.currentFile = newAlgoState.files[0].relative_path;
      newAlgoState.widgetParams = [];
      newAlgoState.widgetOverrides = {};
      renderWidgetConfigRows([]);
      renderWorkspaceFiles();
      initWorkspaceMonaco();
    }

    function onWorkspaceModeChange() {
      const mode = qs("#wsCreateMode")?.value || "template";
      newAlgoState.mode = mode;
      const templateSelect = qs("#wsTemplate");
      if (templateSelect) templateSelect.disabled = mode === "import";
      const meta = qs("#wsImportMeta");
      if (meta) meta.style.display = mode === "import" && newAlgoState.importedFromPicker ? "" : "none";
      if (mode === "import") {
        newAlgoState.files = [];
        newAlgoState.currentFile = "";
        newAlgoState.functions = [];
        newAlgoState.widgetParams = [];
        newAlgoState.widgetOverrides = {};
        newAlgoState.importedFromPicker = false;
        qs("#wsKind").value = "simple";
        renderWidgetConfigRows([]);
        renderWorkspaceFiles();
        initWorkspaceMonaco();
      } else {
        applyWorkspaceTemplate();
      }
    }
