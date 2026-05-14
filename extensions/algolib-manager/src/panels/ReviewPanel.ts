// ReviewPanel.ts – 管理员审核面板

import * as vscode from 'vscode';
import { listPendingReviews, approveAlgorithm, rejectAlgorithm } from '../api';
import { getUser } from '../auth';
import type { Algorithm } from '../types';

export class ReviewPanel {
  private static instance: ReviewPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static async open(context: vscode.ExtensionContext): Promise<void> {
    const user = getUser();
    if (!user || user.role !== 'admin') {
      vscode.window.showWarningMessage('仅管理员可访问审核面板');
      return;
    }

    if (!ReviewPanel.instance) {
      ReviewPanel.instance = new ReviewPanel(context);
    }
    await ReviewPanel.instance.show();
  }

  private async show(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'algolib.review',
        'AlgoLib 审核队列',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; ReviewPanel.instance = undefined; });
      this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    let reviews: Algorithm[] = [];
    try {
      reviews = await listPendingReviews();
    } catch {
      vscode.window.showErrorMessage('加载审核队列失败');
    }

    this.panel.webview.html = this.getHtml(reviews);
    this.panel.reveal();
  }

  private async handleMessage(msg: { command: string; [k: string]: unknown }): Promise<void> {
    switch (msg.command) {
      case 'approve': {
        const id = String(msg.id ?? '');
        try {
          await approveAlgorithm(id);
          vscode.window.showInformationMessage(`算法 ${id} 已批准`);
          await this.show();
        } catch (err) {
          vscode.window.showErrorMessage(`批准失败: ${String(err)}`);
        }
        break;
      }
      case 'reject': {
        const id = String(msg.id ?? '');
        const reason = await vscode.window.showInputBox({ prompt: '拒绝原因', placeHolder: '请输入拒绝原因' });
        if (reason === undefined) return;
        try {
          await rejectAlgorithm(id, reason);
          vscode.window.showInformationMessage(`算法 ${id} 已拒绝`);
          await this.show();
        } catch (err) {
          vscode.window.showErrorMessage(`拒绝失败: ${String(err)}`);
        }
        break;
      }
      case 'refresh':
        await this.show();
        break;
    }
  }

  private getHtml(reviews: Algorithm[]): string {
    const cspSource = this.panel!.webview.cspSource;
    const cssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'shared.css')
    );
    const reviewsJson = JSON.stringify(reviews);

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:;" />
<link rel="stylesheet" href="${cssUri}"/>
<title>审核队列</title>
<style>
body { padding: 10px; }
.review-row { padding: 12px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 12px; }
.review-info { flex: 1; }
.review-name { font-weight: 600; font-size: 13px; }
.review-ns { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.review-desc { font-size: 12px; margin-top: 6px; }
.review-actions { display: flex; gap: 6px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="toolbar">
  <strong>审核队列</strong>
  <span id="count" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
  <div class="toolbar-spacer"></div>
  <button onclick="refresh()">刷新</button>
</div>
<div id="list" style="margin-top:10px;"></div>
<script>
const vscode = acquireVsCodeApi();
const reviews = ${reviewsJson};

function render() {
  const list = document.getElementById('list');
  document.getElementById('count').textContent = reviews.length + ' 条待审核';
  if (reviews.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无待审核算法</div>';
    return;
  }
  list.innerHTML = reviews.map(r => \`
    <div class="review-row">
      <div class="review-info">
        <div class="review-name">\${escHtml(r.zhName || r.funcName)}</div>
        <div class="review-ns">\${escHtml(r.namespace)}</div>
        <div class="review-desc">\${escHtml(r.zhDescription || '')}</div>
      </div>
      <div class="review-actions">
        <button class="btn-success" onclick="approve('\${escAttr(r.id)}')">批准</button>
        <button class="btn-danger" onclick="reject('\${escAttr(r.id)}')">拒绝</button>
      </div>
    </div>
  \`).join('');
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }
function approve(id) { vscode.postMessage({ command: 'approve', id }); }
function reject(id) { vscode.postMessage({ command: 'reject', id }); }
function refresh() { vscode.postMessage({ command: 'refresh' }); }

render();
</script>
</body>
</html>`;
  }
}
