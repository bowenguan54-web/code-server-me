// OutputPanel.ts – 执行结果输出面板

import * as vscode from 'vscode';
import type { ExecuteResult } from '../types';

export class OutputPanel {
  private static instance: OutputPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;

  static getInstance(): OutputPanel {
    if (!OutputPanel.instance) {
      OutputPanel.instance = new OutputPanel();
    }
    return OutputPanel.instance;
  }

  show(context: vscode.ExtensionContext, result?: ExecuteResult): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'algolib.output',
        'AlgoLib 输出',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'media'),
          ],
        }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
    }
    this.panel.webview.html = this.getHtml(context, result);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  showStream(context: vscode.ExtensionContext): void {
    this.show(context);
  }

  appendOutput(kind: 'stdout' | 'stderr', text: string): void {
    this.panel?.webview.postMessage({ command: 'append', kind, text });
  }

  showResult(result: ExecuteResult): void {
    this.panel?.webview.postMessage({ command: 'result', data: result });
  }

  clear(): void {
    this.panel?.webview.postMessage({ command: 'clear' });
  }

  private getHtml(context: vscode.ExtensionContext, initial?: ExecuteResult): string {
    const cspSource = this.panel!.webview.cspSource;
    const cssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'shared.css')
    );
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; img-src ${cspSource} data:; font-src ${cspSource};" />
<link rel="stylesheet" href="${cssUri}"/>
<title>AlgoLib 输出</title>
<style>
body { padding: 10px; }
#output-area { font-family: monospace; font-size: 13px; white-space: pre-wrap; }
.out-stdout { color: var(--fg); }
.out-stderr { color: #f14c4c; }
.out-result { margin-top: 12px; padding: 10px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 4px; }
.out-result.success { border-color: #4ec9b0; }
.out-result.failure { border-color: #f14c4c; }
.result-label { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
.elapsed { font-size: 11px; color: var(--text-dim); margin-top: 6px; }
#chart-container { width: 100%; min-height: 300px; }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="clearOutput()" class="btn-secondary">清空</button>
  <span id="status" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
</div>
<hr class="divider"/>
<div id="output-area"></div>
<div id="result-area"></div>
<div id="chart-container" style="display:none;"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
const outputArea = document.getElementById('output-area');
const resultArea = document.getElementById('result-area');
const statusEl = document.getElementById('status');
const chartContainer = document.getElementById('chart-container');

function clearOutput() {
  outputArea.textContent = '';
  resultArea.innerHTML = '';
  chartContainer.style.display = 'none';
  statusEl.textContent = '';
}

function appendText(kind, text) {
  const span = document.createElement('span');
  span.className = kind === 'stdout' ? 'out-stdout' : 'out-stderr';
  span.textContent = text;
  outputArea.appendChild(span);
  outputArea.scrollTop = outputArea.scrollHeight;
}

function renderResult(data) {
  const div = document.createElement('div');
  div.className = 'out-result ' + (data.success ? 'success' : 'failure');
  
  const label = document.createElement('div');
  label.className = 'result-label';
  label.textContent = data.success ? '✔ 执行成功' : '✗ 执行失败';
  div.appendChild(label);

  if (data.result !== undefined && data.result !== null) {
    const outputType = (typeof data.result === 'object' && data.result !== null) 
      ? data.result.__output_type__ 
      : null;

    if (outputType === 'chart' && data.result.option) {
      chartContainer.style.display = 'block';
      chartContainer.innerHTML = '';
      const chartEl = document.createElement('div');
      chartEl.style.cssText = 'width:100%;height:350px;';
      chartContainer.appendChild(chartEl);
      try {
        const chart = echarts.init(chartEl);
        chart.setOption(data.result.option);
      } catch (e) {
        chartEl.textContent = '图表渲染失败: ' + String(e);
      }
    } else if (outputType === 'table' && Array.isArray(data.result.rows)) {
      renderTable(div, data.result.columns || [], data.result.rows);
    } else if (outputType === 'image' && data.result.src) {
      const img = document.createElement('img');
      img.src = data.result.src;
      img.style.maxWidth = '100%';
      div.appendChild(img);
    } else if (outputType === 'html' && data.result.html) {
      const pre = document.createElement('div');
      pre.innerHTML = data.result.html;
      div.appendChild(pre);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
      div.appendChild(pre);
    }
  }

  if (typeof data.elapsed_ms === 'number') {
    const el = document.createElement('div');
    el.className = 'elapsed';
    el.textContent = '耗时: ' + data.elapsed_ms.toFixed(1) + ' ms';
    div.appendChild(el);
  }

  resultArea.innerHTML = '';
  resultArea.appendChild(div);
  statusEl.textContent = data.success ? '完成' : '失败';
}

function renderTable(container, columns, rows) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = String(col);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const cells = Array.isArray(row) ? row : (columns.length > 0 ? columns.map(c => row[c]) : Object.values(row));
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? '' : String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.command === 'append') appendText(msg.kind, msg.text);
  else if (msg.command === 'result') renderResult(msg.data);
  else if (msg.command === 'clear') clearOutput();
  else if (msg.command === 'start') {
    clearOutput();
    statusEl.textContent = '运行中…';
  }
});

${initial ? `renderResult(${JSON.stringify(initial)});` : ''}
</script>
</body>
</html>`;
  }
}
