/*
 * AlgoLib module: 40-output-renderers.js
 * 最终生效的文本、JSON、表格、图片、图表、HTML、文件和混合输出渲染。
 * 从模块文件构建到 .run/algo-lib-check.js / .run/algo-lib-inline-check.js。
 */

const LABEL_ALIASES = ["labels", "label", "categories", "category", "x", "names", "name", "keys", "months", "dates", "时间", "月份", "日期"];
const VALUE_ALIASES = ["values", "value", "data", "y", "counts", "count", "amounts", "amount", "销量", "数量"];
const CHART_BASE_OPTION = {
  backgroundColor: "transparent",
  textStyle: { color: "#ccc" },
  legend: { textStyle: { color: "#ccc" } }
};

function findFieldByAliases(obj, aliases) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, alias)) return obj[alias];
  }
  const keyMap = {};
  Object.keys(obj).forEach(key => { keyMap[key.toLowerCase()] = key; });
  for (const alias of aliases) {
    const found = keyMap[String(alias).toLowerCase()];
    if (found) return obj[found];
  }
  return undefined;
}

function isPlainOutputObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumericValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNumericValue);
}

function arraysHaveSameLength(arrays) {
  return arrays.length > 0 && arrays.every(arr => Array.isArray(arr) && arr.length === arrays[0].length);
}

function renderConvertHint(container, title, lines) {
  const body = (lines || []).map(line => "• " + esc(line)).join("<br>");
  container.innerHTML = [
    '<div style="color:var(--text-secondary);text-align:center;padding:32px">',
    '<div style="font-size:14px;margin-bottom:8px;color:var(--text)">' + esc(title) + "</div>",
    '<div style="font-size:12px;color:var(--text-dim);text-align:left;max-width:400px;margin:0 auto;line-height:1.8">',
    "支持的数据结构：<br>" + body,
    "</div>",
    "</div>"
  ].join("");
}

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
  copyBtn.textContent = "复制 JSON";
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
  if (Array.isArray(result) && result.length) {
    if (isPlainOutputObject(result[0])) {
      const headers = Array.from(new Set(result.flatMap(row => Object.keys(row || {}))));
      return { headers, rows: result.map(row => headers.map(h => row?.[h])) };
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
  }

  if (!isPlainOutputObject(result)) return null;

  if (Array.isArray(result.rows)) {
    const headers = Array.isArray(result.columns)
      ? result.columns
      : (isPlainOutputObject(result.rows[0]) ? Object.keys(result.rows[0]) : []);
    const rows = result.rows.map(row => Array.isArray(row) ? row : headers.map(h => row?.[h]));
    return { headers, rows };
  }

  const objectArrayKey = Object.keys(result).find(key => Array.isArray(result[key]) && result[key].length && isPlainOutputObject(result[key][0]));
  if (objectArrayKey) return _normalizeOutputTableData(result[objectArrayKey]);

  const arrayEntries = Object.entries(result).filter(([, value]) => Array.isArray(value) && value.every(item => item === null || typeof item !== "object"));
  if (arrayEntries.length >= 2 && arraysHaveSameLength(arrayEntries.map(([, value]) => value))) {
    const headers = arrayEntries.map(([key]) => key);
    const rowCount = arrayEntries[0][1].length;
    const rows = Array.from({ length: rowCount }, (_, rowIndex) => arrayEntries.map(([, values]) => values[rowIndex]));
    return { headers, rows };
  }

  const labels = findFieldByAliases(result, LABEL_ALIASES);
  const values = findFieldByAliases(result, VALUE_ALIASES);
  if (Array.isArray(labels) && Array.isArray(values) && labels.length === values.length) {
    return {
      headers: ["标签", "数值"],
      rows: labels.map((label, index) => [label, values[index]])
    };
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

function tryRenderTable(container, result) {
  const spec = _normalizeOutputTableData(result);
  if (!spec || !spec.headers.length) {
    renderConvertHint(container, "当前数据无法转换为表格", [
      '对象数组：[{"列1": 值, "列2": 值}, ...]',
      '多个等长数组：{"列1": [值, ...], "列2": [值, ...]}',
      '标签+数值：{"labels": [...], "values": [...]}',
      "二维数组：[[表头...], [数据...]]"
    ]);
    return;
  }
  renderOutputTable(container, result);
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
  container.innerHTML = "";
  const wrap = document.createElement("div");
  const img = document.createElement("img");
  img.className = "output-image";
  img.src = src;
  img.onclick = () => showImageFullscreen(img.src);
  wrap.appendChild(img);
  const bar = document.createElement("div");
  bar.className = "output-action-bar";
  const btn = document.createElement("button");
  btn.className = "output-action-btn";
  btn.textContent = "下载图片";
  btn.onclick = () => downloadBase64File(downloadRaw, "output.png", "image/png");
  bar.appendChild(btn);
  container.appendChild(wrap);
  container.appendChild(bar);
}

function renderOutputImages(container, result) {
  if (!Array.isArray(result)) {
    renderOutputImage(container, result);
    return;
  }
  container.innerHTML = "";
  const count = document.createElement("div");
  count.style.marginBottom = "8px";
  count.style.fontSize = "13px";
  count.style.color = "var(--text-secondary)";
  count.textContent = "共 " + result.length + " 张图片";
  const grid = document.createElement("div");
  grid.className = "output-images-grid";
  result.forEach(item => {
    const src = _ensureDataUrl(String(item));
    const holder = document.createElement("div");
    holder.style.cursor = "pointer";
    holder.onclick = () => showImageFullscreen(src);
    const img = document.createElement("img");
    img.src = src;
    img.style.width = "100%";
    img.style.borderRadius = "6px";
    holder.appendChild(img);
    grid.appendChild(holder);
  });
  container.appendChild(count);
  container.appendChild(grid);
}

function renderEchartsOption(container, result, option) {
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
  const chart = echarts.init(chartDiv, "dark");
  const finalOption = Object.assign({}, CHART_BASE_OPTION, option, {
    textStyle: Object.assign({}, CHART_BASE_OPTION.textStyle, option.textStyle || {}),
    legend: Object.assign({}, CHART_BASE_OPTION.legend, option.legend || {}, {
      textStyle: Object.assign({}, CHART_BASE_OPTION.legend.textStyle, option.legend?.textStyle || {})
    })
  });
  chart.setOption(finalOption);
  setTimeout(() => chart.resize(), 100);
  window.addEventListener("resize", () => chart.resize(), { passive: true });
}

function buildSeriesChartOption(result, seriesType) {
  const makeOption = (xData, series) => ({
    tooltip: { trigger: "axis" },
    legend: { data: series.map(item => item.name).filter(Boolean) },
    xAxis: { type: "category", data: xData },
    yAxis: { type: "value" },
    series: series.map(item => Object.assign({}, item, { type: seriesType, smooth: seriesType === "line" }))
  });

  if (isNumberArray(result)) {
    return makeOption(result.map((_, index) => index), [{ name: "数值", data: result }]);
  }

  if (isPlainOutputObject(result)) {
    const labels = findFieldByAliases(result, LABEL_ALIASES);
    const values = findFieldByAliases(result, VALUE_ALIASES);
    if (Array.isArray(labels) && isNumberArray(values) && labels.length === values.length) {
      return makeOption(labels, [{ name: "数值", data: values }]);
    }

    if (Array.isArray(result.x) && isNumberArray(result.y) && result.x.length === result.y.length) {
      return makeOption(result.x, [{ name: "数值", data: result.y }]);
    }

    const numericEntries = Object.entries(result).filter(([, value]) => isNumberArray(value));
    if (numericEntries.length === 1) {
      const [name, valuesOnly] = numericEntries[0];
      return makeOption(valuesOnly.map((_, index) => index), [{ name, data: valuesOnly }]);
    }
    if (numericEntries.length > 1 && arraysHaveSameLength(numericEntries.map(([, value]) => value))) {
      const xData = numericEntries[0][1].map((_, index) => index);
      return makeOption(xData, numericEntries.map(([name, data]) => ({ name, data })));
    }
  }

  if (Array.isArray(result) && result.length && isPlainOutputObject(result[0])) {
    const first = result[0];
    const labelKey = LABEL_ALIASES.find(key => Object.prototype.hasOwnProperty.call(first, key) && !isNumericValue(first[key]));
    const numericKeys = Object.keys(first).filter(key => result.every(row => isNumericValue(row?.[key])));
    if (numericKeys.length) {
      const xData = result.map((row, index) => labelKey ? row[labelKey] : index);
      return makeOption(xData, numericKeys.map(key => ({ name: key, data: result.map(row => row[key]) })));
    }
  }

  return null;
}

function tryRenderLineChart(container, result) {
  const option = buildSeriesChartOption(result, "line");
  if (!option) {
    renderConvertHint(container, "当前数据无法转换为折线图", [
      '{"labels": [...], "values": [...]}',
      '{"x": [...], "y": [...]}',
      "纯数字数组：[1, 2, 3]",
      "多个等长数字数组或对象数组中的数字字段"
    ]);
    return;
  }
  renderEchartsOption(container, result, option);
}

function tryRenderBarChart(container, result) {
  const option = buildSeriesChartOption(result, "bar");
  if (!option) {
    renderConvertHint(container, "当前数据无法转换为柱状图", [
      '{"labels": [...], "values": [...]}',
      '{"x": [...], "y": [...]}',
      "纯数字数组：[1, 2, 3]",
      "多个等长数字数组或对象数组中的数字字段"
    ]);
    return;
  }
  renderEchartsOption(container, result, option);
}

function buildPieOption(result) {
  const makePie = items => ({
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: "65%", data: items }]
  });

  if (isPlainOutputObject(result)) {
    const labels = findFieldByAliases(result, LABEL_ALIASES);
    const values = findFieldByAliases(result, VALUE_ALIASES);
    if (Array.isArray(labels) && isNumberArray(values) && labels.length === values.length) {
      return makePie(labels.map((label, index) => ({ name: label, value: values[index] })));
    }

    if (isPlainOutputObject(result.percentages)) {
      const parsed = Object.entries(result.percentages)
        .map(([name, value]) => ({ name, value: parseFloat(String(value).replace("%", "")) }))
        .filter(item => Number.isFinite(item.value));
      if (parsed.length) return makePie(parsed);
    }

    const entries = Object.entries(result).filter(([, value]) => isNumericValue(value));
    if (entries.length === Object.keys(result).length && entries.length > 0) {
      return makePie(entries.map(([name, value]) => ({ name, value })));
    }
  }

  if (Array.isArray(result) && result.length && isPlainOutputObject(result[0])) {
    const items = result.map(item => ({
      name: item.name ?? item.label ?? item.category ?? item.名称 ?? item.标签,
      value: item.value ?? item.数值 ?? item.数量
    })).filter(item => item.name !== undefined && isNumericValue(item.value));
    if (items.length) return makePie(items);
  }

  return null;
}

function tryRenderPieChart(container, result) {
  const option = buildPieOption(result);
  if (!option) {
    renderConvertHint(container, "当前数据无法转换为饼图", [
      '{"labels": [...], "values": [...]}',
      '{"手机": 4500, "笔记本": 3200}',
      '[{"name": "手机", "value": 4500}, ...]',
      '{"percentages": {"A": "30%", "B": "70%"}}'
    ]);
    return;
  }
  renderEchartsOption(container, result, option);
}

function renderOutputChart(container, result) {
  if (buildPieOption(result)) {
    tryRenderPieChart(container, result);
    return;
  }
  tryRenderLineChart(container, result);
}

function tryRenderImage(container, result) {
  if (typeof result === "string" && _isBase64Image(result)) {
    renderOutputImage(container, result);
    return;
  }
  if (Array.isArray(result) && result.length && result.every(item => typeof item === "string" && _isBase64Image(item))) {
    renderOutputImages(container, result);
    return;
  }
  if (isPlainOutputObject(result)) {
    const found = ["src", "image", "img"].map(key => result[key]).find(value => typeof value === "string" && _isBase64Image(value));
    if (found) {
      renderOutputImage(container, found);
      return;
    }
  }
  renderConvertHint(container, "当前数据无法转换为图片", [
    "base64 图片字符串",
    '{"image": "iVBOR..."} 或 {"src": "iVBOR..."}',
    '["iVBOR...", "iVBOR..."]'
  ]);
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
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.textAlign = "center";
    const name = document.createElement("div");
    name.style.fontSize = "16px";
    name.style.marginBottom = "12px";
    name.textContent = result.filename;
    const btn = document.createElement("button");
    btn.className = "output-download-btn";
    btn.textContent = "下载文件";
    btn.onclick = () => downloadBase64File(b64, result.filename);
    wrap.appendChild(name);
    wrap.appendChild(btn);
    container.appendChild(wrap);
  } else {
    renderOutputJson(container, result);
  }
}

function tryRenderFile(container, result) {
  if (isPlainOutputObject(result) && result.filename && (result.content || result.base64)) {
    renderOutputFile(container, result);
    return;
  }

  if (typeof result === "string" && result.replace(/\s/g, "").length > 100 && !_isBase64Image(result)) {
    container.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "output-download-btn";
    btn.textContent = "下载文件";
    btn.onclick = () => downloadBase64File(result, "output.bin", "application/octet-stream");
    container.appendChild(btn);
    return;
  }

  if (isPlainOutputObject(result)) {
    const path = result.path || result.file_path || result.filePath;
    if (path) {
      container.innerHTML = "";
      const label = document.createElement("div");
      label.className = "output-section-label";
      label.textContent = "文件路径";
      const text = document.createElement("div");
      text.className = "output-text";
      text.textContent = String(path);
      const bar = document.createElement("div");
      bar.className = "output-action-bar";
      if (/^(https?:\/\/|\/api\/)/i.test(String(path))) {
        const a = document.createElement("a");
        a.className = "output-download-btn";
        a.href = String(path);
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "打开文件";
        bar.appendChild(a);
      }
      const copyBtn = document.createElement("button");
      copyBtn.className = "output-action-btn";
      copyBtn.textContent = "复制路径";
      copyBtn.onclick = () => copyToClipboard(String(path));
      bar.appendChild(copyBtn);
      container.appendChild(label);
      container.appendChild(text);
      container.appendChild(bar);
      return;
    }
  }

  renderConvertHint(container, "当前数据无法转换为文件下载", [
    '{"filename": "result.txt", "content": "..."}',
    '{"filename": "result.bin", "base64": "..."}',
    "较长的 base64 文件字符串",
    '{"path": "/api/download/xxx"} 或 {"file_path": "..."}'
  ]);
}

function tryRenderFileDownload(container, result) {
  tryRenderFile(container, result);
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
      } else if (_normalizeOutputTableData(val)) {
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

// ===== 图表 Tab 旧入口保留兼容 =====
function renderChartOutput(response) {
  const container = document.getElementById("outputContent");
  if (!container) return;
  if (!response || response.result === null || response.result === undefined) {
    container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px">无数据</div>';
    return;
  }
  renderOutputChart(container, response.result);
}
