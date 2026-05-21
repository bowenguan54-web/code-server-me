/*
 * AlgoLib module: 08-workspace-core.js
 * 新建算法工作区基础模板、参数控件配置和创建模式切换。
 * 从模块文件构建到 .run/algo-lib-check.js / .run/algo-lib-inline-check.js。
 */

function defaultAlgorithmCode(name) {
  const funcName = name || "my_algorithm";
  return `def ${funcName}(data: list, threshold: float = 0.5) -> dict:
    """在这里编写算法逻辑。

    Args:
        data: 输入数据。
        threshold: 阈值参数。
    """
    passed = [item for item in data if float(item) >= threshold]
    return {
        "input_count": len(data),
        "passed_count": len(passed),
        "passed": passed,
    }
`;
}

function defaultQualityCode(name) {
  const funcName = name || "data_quality_check";
  return `def ${funcName}(rows: list[dict], required_columns: list[str]) -> dict:
    """数据质量检查示例。

    Args:
        rows: 表格数据，每一项为一行。
        required_columns: 必填字段列表。
    """
    issues = []
    for row_index, row in enumerate(rows):
        for column in required_columns:
            if column not in row or row[column] in (None, ""):
                issues.append({"row": row_index, "column": column, "rule": "required"})
    return {
        "row_count": len(rows),
        "issue_count": len(issues),
        "issues": issues,
    }
`;
}

function newTemplateFiles(name, templateKey) {
  const funcName = name || "my_algorithm";
  const mainCode = templateKey === "quality"
    ? defaultQualityCode(funcName)
    : defaultAlgorithmCode(funcName);
  return [
    { relative_path: "main.py", content: mainCode },
    { relative_path: "utils.py", content: "# 辅助工具模块\n" }
  ];
}

function defaultWorkspaceBlocks(name, templateKey) {
  const funcName = name || "my_algorithm";
  const code = templateKey === "quality"
    ? defaultQualityCode(funcName)
    : defaultAlgorithmCode(funcName);
  return [{
    id: "blk_" + Math.random().toString(36).slice(2, 8),
    order: 1,
    title: templateKey === "quality" ? "步骤 1：数据质量检查" : "步骤 1：算法逻辑",
    description: templateKey === "quality" ? "在此编写数据质量校验逻辑" : "在此编写核心算法代码",
    hint: "定义算法入口函数，设置参数和返回值",
    code,
    locked: false,
  }];
}

async function openAlgorithmWorkspace(page) {
  const parentP = parentPageOf(page);
  const moduleKind = parentP === "templates" ? "template" : "component";
  if (state.blockEditor) cleanupBlockEditor();
  newAlgoState.returnPage = page;
  let cats = state.categories[parentP] || [];
  if (!cats.length) {
    try {
      const catData = await api(`/api/v1/categories?module_kind=${currentModuleKind(page)}`);
      cats = normalizeListPayload(catData, "categories");
      state.categories[parentP] = cats;
    } catch (_e) {
      cats = [];
    }
  }
  const defaultNs = parentP === "templates" ? "templates" : "custom";
  const catOptions = cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
  newAlgoState.files = newTemplateFiles("my_algorithm", "basic");
  newAlgoState.currentFile = newAlgoState.files[0].relative_path;
  newAlgoState.mode = "template";
  newAlgoState.importedFromPicker = false;
  newAlgoState.functions = [];
  newAlgoState.widgetParams = [];
  newAlgoState.widgetOverrides = {};
  newAlgoState.paramExamples = {};
  newAlgoState.editMode = "code";
  qs("#main").innerHTML = `
      <div class="new-workspace">
      <div class="editor-top">
        <button onclick="window.closeAlgorithmWorkspace('${page}')">返回</button>
        <strong>${parentP === "templates" ? "新建算法模板" : "新建算法"}</strong>
        <span class="spacer"></span>
        <button onclick="window.testWorkspaceSource()">测试当前文件</button>
        <button onclick="window.checkWorkspaceCode()">检查代码</button>
        <button class="primary" onclick="window.saveWorkspaceAlgorithm('${moduleKind}')">保存草稿</button>
      </div>
      ${parentP === "templates" ? `<details class="template-usage-details" open>
        <summary>算法模板说明（点击折叠）</summary>
        <div class="template-usage-body">
          <strong>新建算法模板界面使用说明：</strong><br>
          1. <strong>创建模式</strong>：选择“选择模板”可从内置骨架开始，选择“外部导入”可读取本地 .py 文件或整个算法文件夹。<br>
          2. <strong>代码模板</strong>：提供基础算法和数据质量两类多文件骨架，都会生成 main.py 和 utils.py。<br>
          3. <strong>函数/包名</strong>：生成的函数名或包名，只能使用小写字母、数字和下划线。<br>
          4. <strong>所属分类</strong>：算法模板所属的分类命名空间，可新建分类。<br>
          5. <strong>参数示例</strong>：点击“识别参数”后，为每个参数填写示例值；点击“测试当前文件”会直接使用这些示例值。<br>
          6. <strong>代码编辑区</strong>：可在左侧文件列表中切换、新增和删除 Python 文件。<br>
          7. 填写完毕后点击 <strong>保存草稿</strong> 将模板保存到系统，之后可在算法模板列表中继续编辑和发布。
        </div>
      </details>` : ""}
      <div class="new-form-grid">
        <label>创建模式<select id="wsCreateMode" onchange="window.onWorkspaceModeChange()"><option value="template">选择模板</option><option value="import">外部导入</option></select></label>
        <input type="hidden" id="wsKind" value="complex" />
        <label>代码模板<select id="wsTemplate" onchange="window.applyWorkspaceTemplate()"><option value="basic">基础算法</option><option value="quality">数据质量</option></select></label>
        ${parentP === "templates" ? `<label>编辑模式<select id="wsEditMode" onchange="window.onWsEditModeChange()"><option value="code">普通代码</option><option value="blocks">分块设计</option></select></label>` : ""}
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
      <div id="wsBlockDesignerShell" style="display:none;flex:1;min-height:420px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);">
        <div id="blockEditorControls" style="display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);"></div>
        <div id="wsBlockDesigner" style="min-height:420px;overflow:auto;"></div>
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

function defaultExampleForParam(param) {
  const widget = newAlgoState.widgetOverrides?.[param.name] || param.widget || "str";
  const defaultValue = String(param.default || "").trim();
  if (newAlgoState.paramExamples && Object.prototype.hasOwnProperty.call(newAlgoState.paramExamples, param.name)) {
    return newAlgoState.paramExamples[param.name];
  }
  if (defaultValue && defaultValue !== "None") {
    return defaultValue.replace(/^['"]|['"]$/g, "");
  }
  if (widget === "int") return "10";
  if (widget === "float") return "0.5";
  if (widget === "bool") return "true";
  if (widget === "list" || widget === "images") return "[0.1, 0.6, 0.9]";
  if (widget === "dataframe") return JSON.stringify([{ name: "张三", score: 85 }, { name: "李四", score: 92 }], null, 2);
  if (widget === "dict" || widget === "json") return JSON.stringify({ key: "value" }, null, 2);
  if (widget === "text") return "这是一段示例长文本";
  return "";
}

function parseWorkspaceExampleValue(param, rawValue) {
  const widget = newAlgoState.widgetOverrides?.[param.name] || param.widget || "str";
  const raw = String(rawValue ?? "").trim();
  if (raw === "") return undefined;
  if (widget === "int") {
    const value = parseInt(raw, 10);
    return Number.isNaN(value) ? undefined : value;
  }
  if (widget === "float") {
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  }
  if (widget === "bool") return raw === "true";
  if (widget === "list" || widget === "images") return parseParamValueByType("list", raw);
  if (widget === "dataframe") {
    try { return JSON.parse(raw); } catch (_error) { return parseParamValueByType("DataFrame", raw); }
  }
  if (widget === "dict" || widget === "json") return parseParamValueByType("dict", raw);
  return rawValue;
}

function collectWorkspaceParamExamples() {
  const examples = {};
  (newAlgoState.widgetParams || []).forEach(param => {
    const raw = newAlgoState.paramExamples?.[param.name];
    const parsed = parseWorkspaceExampleValue(param, raw);
    if (parsed !== undefined && parsed !== null && parsed !== "") examples[param.name] = parsed;
  });
  return examples;
}

function formatWorkspaceExampleValue(value, widget) {
  if (value === undefined || value === null) return "";
  if (value === "") return "";
  if (typeof value === "object" || ["list", "dict", "json", "dataframe", "images"].includes(widget)) {
    try { return JSON.stringify(value, null, 2); } catch (_error) { return String(value); }
  }
  return String(value);
}

function renderWorkspaceExampleInput(param, widget, value) {
  const safeName = esc(param.name);
  const safeValue = esc(formatWorkspaceExampleValue(value, widget));
  if (widget === "bool") {
    return `
      <select class="widget-example-input" data-param="${safeName}" onchange="window.onParamExampleChange(this)">
        <option value="">不填写</option>
        <option value="true"${String(value) === "true" ? " selected" : ""}>true</option>
        <option value="false"${String(value) === "false" ? " selected" : ""}>false</option>
      </select>`;
  }
  if (widget === "int" || widget === "float") {
    return `<input class="widget-example-input" data-param="${safeName}" type="number" step="${widget === "int" ? "1" : "any"}" value="${safeValue}" placeholder="" oninput="window.onParamExampleChange(this)" />`;
  }
  if (["list", "dict", "json", "dataframe", "text", "images"].includes(widget)) {
    return `
      <div class="widget-example-box">
        <textarea class="widget-example-input" data-param="${safeName}" rows="2" placeholder="" oninput="window.onParamExampleChange(this)">${safeValue}</textarea>
        ${["list", "dict", "json", "dataframe", "images"].includes(widget) ? `<button type="button" onclick="window.formatParamExample('${safeName}')">格式化</button>` : ""}
      </div>`;
  }
  return `<input class="widget-example-input" data-param="${safeName}" type="text" value="${safeValue}" placeholder="" oninput="window.onParamExampleChange(this)" />`;
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
    const exampleValue = "";
    delete newAlgoState.paramExamples[param.name];
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
        <div class="widget-example-cell">
          <span class="widget-example-label">示例</span>
          ${renderWorkspaceExampleInput(param, selected, exampleValue)}
        </div>
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
  renderWidgetConfigRows(newAlgoState.widgetParams || []);
}

function onParamExampleChange(input) {
  if (!input?.dataset?.param) return;
  newAlgoState.paramExamples[input.dataset.param] = input.value;
}

function formatParamExample(paramName) {
  const input = qsa(".widget-example-input", qs("#wsWidgetConfigList") || document)
    .find(item => item.dataset.param === paramName);
  if (!input) return;
  try {
    input.value = JSON.stringify(JSON.parse(input.value || "null"), null, 2);
    onParamExampleChange(input);
  } catch (_error) {
    showToast("示例值不是合法 JSON，无法格式化");
  }
}

function onWsCatChange() {
  const v = qs("#wsCategory")?.value;
  const row = qs("#wsNewCatRow");
  if (row) row.style.display = v === "__new__" ? "" : "none";
}

function closeAlgorithmWorkspace(page) {
  if (state.blockEditor) cleanupBlockEditor();
  switchPage(page || newAlgoState.returnPage || "components-general");
}

function setWorkspaceBlockDesignerVisible(visible) {
  const grid = qs(".file-editor-grid");
  const shell = qs("#wsBlockDesignerShell");
  if (grid) grid.style.display = visible ? "none" : "";
  if (shell) shell.style.display = visible ? "block" : "none";
}

function getWorkspaceBlockCode() {
  if (!state.blockEditor) return "";
  syncEditorsToBlocks();
  return [...state.blockEditor.blocks]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(block => {
      const code = block.code || "";
      return code.endsWith("\n") ? code : `${code}\n`;
    })
    .join("");
}

function initWorkspaceBlockDesigner(blocks) {
  const designer = qs("#wsBlockDesigner");
  if (!designer) return;
  const name = qs("#wsName")?.value.trim() || "my_algorithm";
  const templateKey = qs("#wsTemplate")?.value || "basic";
  const initialBlocks = Array.isArray(blocks) && blocks.length ? blocks : defaultWorkspaceBlocks(name, templateKey);
  initBlockEditor(designer, {
    id: "__new_template__",
    type: "template",
    moduleKind: "template",
    ownerId: state.currentUser?.id,
    owner_id: state.currentUser?.id,
  }, initialBlocks);
}

function onWsEditModeChange() {
  const mode = qs("#wsEditMode")?.value || "code";
  if (qs("#wsCreateMode")?.value === "import" && mode === "blocks") {
    qs("#wsEditMode").value = "code";
    showToast("外部导入模式暂不支持分块设计，请先保存后再编辑分块");
    return;
  }
  newAlgoState.editMode = mode;
  if (mode === "blocks") {
    updateWorkspaceFileContent();
    const currentCode = getWorkspaceCode();
    const name = qs("#wsName")?.value.trim() || "my_algorithm";
    const templateKey = qs("#wsTemplate")?.value || "basic";
    const blocks = defaultWorkspaceBlocks(name, templateKey);
    if (currentCode.trim()) blocks[0].code = currentCode.endsWith("\n") ? currentCode : `${currentCode}\n`;
    setWorkspaceBlockDesignerVisible(true);
    initWorkspaceBlockDesigner(blocks);
  } else {
    const fullCode = state.blockEditor ? getWorkspaceBlockCode() : getWorkspaceCode();
    if (state.blockEditor) cleanupBlockEditor();
    newAlgoState.files = [{ relative_path: "main.py", content: fullCode || defaultAlgorithmCode(qs("#wsName")?.value.trim() || "my_algorithm") }];
    newAlgoState.currentFile = "main.py";
    setWorkspaceBlockDesignerVisible(false);
    renderWorkspaceFiles();
    initWorkspaceMonaco();
  }
}

function hasWorkspaceExtraFiles() {
  const paths = (newAlgoState.files || []).map(file => file.relative_path).sort();
  return paths.length > 2 || paths.some(path => !["main.py", "utils.py"].includes(path));
}

function applyWorkspaceTemplate(force = false) {
  if (qs("#wsCreateMode")?.value === "import") return;
  updateWorkspaceFileContent();
  const doApply = () => {
    const templateKey = qs("#wsTemplate")?.value || "basic";
    const name = qs("#wsName")?.value.trim() || "my_algorithm";
    if (qs("#wsKind")) qs("#wsKind").value = "complex";
    newAlgoState.files = newTemplateFiles(name, templateKey);
    newAlgoState.currentFile = newAlgoState.files[0].relative_path;
    newAlgoState.widgetParams = [];
    newAlgoState.widgetOverrides = {};
    newAlgoState.paramExamples = {};
    renderWidgetConfigRows([]);
    renderWorkspaceFiles();
    if (qs("#wsEditMode")?.value === "blocks") {
      setWorkspaceBlockDesignerVisible(true);
      initWorkspaceBlockDesigner(defaultWorkspaceBlocks(name, templateKey));
    } else {
      setWorkspaceBlockDesignerVisible(false);
      initWorkspaceMonaco();
    }
  };
  if (!force && hasWorkspaceExtraFiles()) {
    showConfirm("切换模板会清空当前所有文件，是否继续？", doApply);
    return;
  }
  doApply();
}

function onWorkspaceModeChange() {
  const mode = qs("#wsCreateMode")?.value || "template";
  newAlgoState.mode = mode;
  const templateSelect = qs("#wsTemplate");
  if (templateSelect) templateSelect.disabled = mode === "import";
  const editModeSelect = qs("#wsEditMode");
  const meta = qs("#wsImportMeta");
  if (meta) meta.style.display = mode === "import" && newAlgoState.importedFromPicker ? "" : "none";
  if (mode === "import") {
    if (editModeSelect) {
      editModeSelect.value = "code";
      editModeSelect.disabled = true;
    }
    if (state.blockEditor) cleanupBlockEditor();
    setWorkspaceBlockDesignerVisible(false);
    newAlgoState.files = [];
    newAlgoState.currentFile = "";
    newAlgoState.functions = [];
    newAlgoState.widgetParams = [];
    newAlgoState.widgetOverrides = {};
    newAlgoState.paramExamples = {};
    newAlgoState.importedFromPicker = false;
    renderWidgetConfigRows([]);
    renderWorkspaceFiles();
    initWorkspaceMonaco();
  } else {
    if (editModeSelect) editModeSelect.disabled = false;
    if (qs("#wsKind")) qs("#wsKind").value = "complex";
    applyWorkspaceTemplate(true);
  }
}

function addWorkspaceFile() {
  updateWorkspaceFileContent();
  const raw = window.prompt("请输入新文件名（如 helper.py）", "helper.py");
  if (!raw) return;
  const filename = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(filename)) {
    showToast("文件名必须以 .py 结尾，且只能使用字母、数字、下划线、点和短横线");
    return;
  }
  if (filename === "__init__.py") {
    showToast("不能新建 __init__.py");
    return;
  }
  if ((newAlgoState.files || []).some(file => file.relative_path === filename)) {
    showToast("文件已存在，请换一个文件名");
    return;
  }
  newAlgoState.files.push({ relative_path: filename, content: `# ${filename}\n` });
  newAlgoState.currentFile = filename;
  renderWorkspaceFiles();
  initWorkspaceMonaco();
}

function deleteWorkspaceFile(path) {
  if (path === "main.py") {
    showToast("main.py 是入口文件，不能删除");
    return;
  }
  showConfirm(`确定删除文件 ${path} 吗？`, () => {
    updateWorkspaceFileContent();
    newAlgoState.files = (newAlgoState.files || []).filter(file => file.relative_path !== path);
    if (newAlgoState.currentFile === path) {
      newAlgoState.currentFile = newAlgoState.files[0]?.relative_path || "";
    }
    renderWorkspaceFiles();
    initWorkspaceMonaco();
  });
}

function renderWorkspaceFilesWithActions() {
  const panel = qs("#wsFileList");
  if (!panel) return;
  const files = newAlgoState.files || [];
  const listHtml = files.length ? files.map(file => {
    const path = file.relative_path;
    const active = path === newAlgoState.currentFile ? "active" : "";
    const deleteBtn = path === "main.py" ? "" : `<button class="danger" style="font-size:11px;padding:2px 7px;line-height:1.5;flex-shrink:0" onclick="event.stopPropagation();window.deleteWorkspaceFile('${esc(path)}')" title="删除文件">删除</button>`;
    return `
      <div class="${active}" onclick="window.switchWorkspaceFile('${esc(path)}')" style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:6px;margin-bottom:6px;padding:8px 9px;border:1px solid var(--border);border-radius:6px;background:${active ? "rgba(30,144,255,.16)" : "var(--bg)"};cursor:pointer">
        <div style="min-width:0;font-family:monospace;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(path)}">${esc(path)}</div>
        <button class="ghost" style="font-size:11px;padding:2px 7px;line-height:1.5;flex-shrink:0" onclick="event.stopPropagation();window.renameWorkspaceFile('${esc(path)}')" title="重命名">改名</button>
        ${deleteBtn}
      </div>`;
  }).join("") : '<div class="empty" style="padding:14px">尚未导入文件</div>';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;min-width:0">
      <span style="font-size:12px;color:var(--text-secondary);white-space:nowrap">文件列表</span>
      <button type="button" class="primary" style="font-size:12px;padding:5px 9px;margin-left:auto;white-space:nowrap;flex-shrink:0" onclick="window.addWorkspaceFile()">＋ 新增文件</button>
    </div>
    ${listHtml}
  `;
  const file = files.find(item => item.relative_path === newAlgoState.currentFile);
  if (newAlgoState.editor && file && newAlgoState.models?.has(newAlgoState.currentFile)) {
    newAlgoState.editor.setModel(newAlgoState.models.get(newAlgoState.currentFile));
  }
}

function installWorkspaceFileRendererOverride() {
  window.renderWorkspaceFiles = renderWorkspaceFilesWithActions;
  window.addWorkspaceFile = addWorkspaceFile;
  window.deleteWorkspaceFile = deleteWorkspaceFile;
  window.onWsEditModeChange = onWsEditModeChange;
  window.initWorkspaceBlockDesigner = initWorkspaceBlockDesigner;
  window.closeAlgorithmWorkspace = closeAlgorithmWorkspace;
  window.onParamExampleChange = onParamExampleChange;
  window.formatParamExample = formatParamExample;
  window.collectWorkspaceParamExamples = collectWorkspaceParamExamples;
}

setTimeout(installWorkspaceFileRendererOverride, 0);
