// BrowsePanel.ts – 算法浏览 Webview

import * as vscode from 'vscode';
import { listAlgorithms, listCategories } from '../api';
import { openAlgorithmEditor } from './EditorPanel';
import type { Algorithm } from '../types';

export class BrowsePanel {
  private static instance: BrowsePanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static async open(context: vscode.ExtensionContext): Promise<void> {
    if (!BrowsePanel.instance) {
      BrowsePanel.instance = new BrowsePanel(context);
    }
    await BrowsePanel.instance.show();
  }

  private async show(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'algolib.browse',
        'AlgoLib 算法浏览器',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; BrowsePanel.instance = undefined; });
      this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    let algorithms: Algorithm[] = [];
    try {
      algorithms = await listAlgorithms();
    } catch {
      vscode.window.showErrorMessage('加载算法列表失败');
    }

    this.panel.webview.html = this.getHtml(algorithms);
    this.panel.reveal();
  }

  private async handleMessage(msg: { command: string; [k: string]: unknown }): Promise<void> {
    if (msg.command === 'open' && msg.id) {
      const algo = { id: String(msg.id), namespace: '', funcName: '', publishStatus: 'draft' } as Algorithm;
      await openAlgorithmEditor(algo, this.context);
    } else if (msg.command === 'refresh') {
      await this.show();
    }
  }

  private getHtml(algorithms: Algorithm[]): string {
    const cspSource = this.panel!.webview.cspSource;
    const cssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'shared.css')
    );
    const algosJson = JSON.stringify(algorithms);

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:;" />
<link rel="stylesheet" href="${cssUri}"/>
<title>算法浏览器</title>
<style>
body { padding: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-top: 10px; }
.algo-card { cursor: pointer; }
.algo-card:hover { border-color: var(--accent); }
.algo-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.algo-ns { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
.algo-desc { font-size: 12px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.filter-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
</style>
</head>
<body>
<div class="toolbar">
  <div class="filter-bar">
    <div class="search-wrap">
      <span>🔍</span>
      <input type="text" id="search" placeholder="搜索算法..." oninput="filterAlgos()"/>
    </div>
    <select id="statusFilter" onchange="filterAlgos()">
      <option value="">全部状态</option>
      <option value="published">已发布</option>
      <option value="draft">草稿</option>
      <option value="reviewing">审核中</option>
    </select>
  </div>
  <div class="toolbar-spacer"></div>
  <button onclick="refresh()">刷新</button>
  <span id="count" style="font-size:11px;color:var(--text-dim);"></span>
</div>

<div class="grid" id="grid"></div>

<script>
const vscode = acquireVsCodeApi();
const allAlgos = ${algosJson};
let filtered = [...allAlgos];

const statusColors = {
  published: 'badge-green',
  draft: 'badge-yellow',
  reviewing: 'badge-blue',
  rejected: 'badge-red',
  unpublished: ''
};
const statusLabels = {
  published: '已发布', draft: '草稿', reviewing: '审核中', rejected: '已拒绝', unpublished: '未发布'
};

function filterAlgos() {
  const q = document.getElementById('search').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  filtered = allAlgos.filter(a => {
    const matchQ = !q || (a.zhName||'').toLowerCase().includes(q) || (a.funcName||'').toLowerCase().includes(q) || (a.namespace||'').toLowerCase().includes(q) || (a.zhDescription||'').toLowerCase().includes(q);
    const matchS = !status || a.publishStatus === status;
    return matchQ && matchS;
  });
  render();
}

function render() {
  const grid = document.getElementById('grid');
  document.getElementById('count').textContent = filtered.length + ' / ' + allAlgos.length + ' 个算法';
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">无匹配算法</div>';
    return;
  }
  grid.innerHTML = filtered.map(a => \`
    <div class="card algo-card" onclick="openAlgo('\${escAttr(a.id)}')">
      <div class="algo-name">
        \${escHtml(a.zhName || a.funcName)}
        <span class="badge \${statusColors[a.publishStatus]||''}" style="margin-left:6px;">\${statusLabels[a.publishStatus]||a.publishStatus}</span>
      </div>
      <div class="algo-ns">\${escHtml(a.namespace)}</div>
      <div class="algo-desc">\${escHtml(a.zhDescription || '')}</div>
    </div>
  \`).join('');
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }
function openAlgo(id) { vscode.postMessage({ command: 'open', id }); }
function refresh() { vscode.postMessage({ command: 'refresh' }); }

render();
</script>
</body>
</html>`;
  }
}
