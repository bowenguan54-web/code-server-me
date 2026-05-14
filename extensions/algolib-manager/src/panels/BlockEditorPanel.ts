// BlockEditorPanel.ts – 分块编辑器 Webview

import * as vscode from 'vscode';
import { getAlgorithmFiles, saveAlgorithmFile } from '../api';
import { executeRaw } from '../api';
import { OutputPanel } from './OutputPanel';
import type { Algorithm, CodeBlock } from '../types';

const BLOCK_SEP = /^# --- BLOCK: (.+?) ---\s*$/m;
const BLOCK_SEP_FULL = /^# --- BLOCK: .+? ---\s*\n?/gm;

export class BlockEditorPanel {
  private static panels = new Map<string, BlockEditorPanel>();

  private panel: vscode.WebviewPanel;
  private algorithm: Algorithm;
  private context: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel, algorithm: Algorithm, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.algorithm = algorithm;
    this.context = context;

    panel.onDidDispose(() => BlockEditorPanel.panels.delete(algorithm.id));
    panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
  }

  static async open(algorithm: Algorithm, context: vscode.ExtensionContext): Promise<void> {
    const existing = BlockEditorPanel.panels.get(algorithm.id);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'algolib.blockEditor',
      `[块] ${algorithm.zhName || algorithm.funcName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    const instance = new BlockEditorPanel(panel, algorithm, context);
    BlockEditorPanel.panels.set(algorithm.id, instance);

    await instance.loadFiles();
  }

  private async loadFiles(): Promise<void> {
    let files: { filename: string; content: string }[] = [];
    try {
      files = await getAlgorithmFiles(this.algorithm.id);
    } catch {
      vscode.window.showErrorMessage(`加载算法文件失败`);
      return;
    }

    const entryFile = files.find(f => f.filename.endsWith('.py')) ?? files[0];
    if (!entryFile) return;

    const blocks = parseBlocks(entryFile.content);
    this.panel.webview.html = this.getHtml(blocks);
  }

  private async handleMessage(msg: { command: string; [k: string]: unknown }): Promise<void> {
    switch (msg.command) {
      case 'save': {
        const blocks = msg.blocks as CodeBlock[];
        const merged = mergeBlocks(blocks);
        try {
          const files = await getAlgorithmFiles(this.algorithm.id);
          const entryFile = files.find(f => f.filename.endsWith('.py')) ?? files[0];
          if (entryFile) {
            await saveAlgorithmFile(this.algorithm.id, entryFile.filename, merged);
            this.panel.webview.postMessage({ command: 'saveOk' });
          }
        } catch (err) {
          this.panel.webview.postMessage({ command: 'saveError', message: String(err) });
        }
        break;
      }
      case 'runBlock': {
        const code = String(msg.code ?? '');
        const outputPanel = OutputPanel.getInstance();
        outputPanel.showStream(this.context);
        outputPanel.clear();
        try {
          const result = await executeRaw(code);
          outputPanel.showResult(result);
        } catch (err) {
          outputPanel.showResult({ success: false, stderr: String(err) });
        }
        break;
      }
      case 'runAll': {
        const blocks = msg.blocks as CodeBlock[];
        const code = mergeBlocks(blocks);
        const outputPanel = OutputPanel.getInstance();
        outputPanel.showStream(this.context);
        outputPanel.clear();
        try {
          const result = await executeRaw(code);
          outputPanel.showResult(result);
        } catch (err) {
          outputPanel.showResult({ success: false, stderr: String(err) });
        }
        break;
      }
    }
  }

  private getHtml(blocks: CodeBlock[]): string {
    const cspSource = this.panel.webview.cspSource;
    const cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'shared.css')
    );
    const blocksJson = JSON.stringify(blocks);

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; img-src ${cspSource} data:;" />
<link rel="stylesheet" href="${cssUri}"/>
<title>分块编辑器</title>
<style>
body { padding: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.top-bar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.blocks-container { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.block-card { border: 1px solid var(--border); border-radius: 4px; background: var(--card-bg); }
.block-header { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); background: var(--sidebar-bg); }
.block-title-input { flex: 1; background: transparent; border: none; font-size: 12px; font-weight: 600; color: var(--fg); padding: 2px 4px; }
.block-title-input:focus { outline: 1px solid var(--accent); border-radius: 2px; }
.block-editor { width: 100%; min-height: 120px; resize: vertical; padding: 8px; font-family: monospace; font-size: 13px; background: var(--bg); color: var(--fg); border: none; outline: none; }
.drag-handle { cursor: grab; color: var(--text-dim); font-size: 14px; padding: 0 4px; }
</style>
</head>
<body>
<div class="top-bar">
  <strong style="font-size:13px;">分块编辑器</strong>
  <div class="toolbar-spacer"></div>
  <button onclick="addBlock()">+ 添加块</button>
  <button onclick="runAll()">▶ 全部运行</button>
  <button onclick="saveAll()">💾 保存</button>
  <span id="status" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
</div>
<div class="blocks-container" id="blocksContainer"></div>
<script>
const vscode = acquireVsCodeApi();
let blocks = ${blocksJson};
let dragSrcIdx = null;

function render() {
  const container = document.getElementById('blocksContainer');
  container.innerHTML = '';
  blocks.forEach((block, i) => {
    const card = document.createElement('div');
    card.className = 'block-card';
    card.draggable = true;
    card.dataset.idx = i;
    card.innerHTML = \`
      <div class="block-header">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <input class="block-title-input" value="\${escHtml(block.title)}" placeholder="块名称" onchange="updateTitle(\${i}, this.value)"/>
        <button class="btn-icon" onclick="runBlock(\${i})" title="运行此块">▶</button>
        <button class="btn-icon" onclick="deleteBlock(\${i})" title="删除此块">✕</button>
      </div>
      <textarea class="block-editor" onchange="updateCode(\${i}, this.value)">\${escHtml(block.code)}</textarea>
    \`;
    card.addEventListener('dragstart', () => { dragSrcIdx = i; });
    card.addEventListener('dragover', e => { e.preventDefault(); });
    card.addEventListener('drop', () => { if (dragSrcIdx !== null && dragSrcIdx !== i) swapBlocks(dragSrcIdx, i); });
    container.appendChild(card);
  });
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function updateTitle(i, v) { blocks[i].title = v; }
function updateCode(i, v) { blocks[i].code = v; }
function addBlock() { blocks.push({ title: '新块 ' + (blocks.length + 1), code: '' }); render(); }
function deleteBlock(i) { blocks.splice(i, 1); render(); }
function swapBlocks(a, b) { [blocks[a], blocks[b]] = [blocks[b], blocks[a]]; render(); }
function runBlock(i) { syncTextareas(); vscode.postMessage({ command: 'runBlock', code: blocks[i].code }); }
function runAll() { syncTextareas(); vscode.postMessage({ command: 'runAll', blocks }); }
function saveAll() { syncTextareas(); vscode.postMessage({ command: 'save', blocks }); }
function syncTextareas() {
  document.querySelectorAll('.block-editor').forEach((ta, i) => { blocks[i].code = ta.value; });
  document.querySelectorAll('.block-title-input').forEach((inp, i) => { blocks[i].title = inp.value; });
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.command === 'saveOk') document.getElementById('status').textContent = '已保存 ✓';
  else if (msg.command === 'saveError') document.getElementById('status').textContent = '保存失败: ' + msg.message;
});

render();
</script>
</body>
</html>`;
  }
}

function parseBlocks(code: string): CodeBlock[] {
  const parts = code.split(BLOCK_SEP_FULL);
  const titles: string[] = [];
  let m: RegExpExecArray | null;
  const sepRe = new RegExp(BLOCK_SEP.source, 'gm');
  while ((m = sepRe.exec(code)) !== null) {
    titles.push(m[1]);
  }

  if (titles.length === 0) {
    return [{ title: '主体', code: code.trim() }];
  }

  const blocks: CodeBlock[] = [];
  // parts[0] is content before first BLOCK sep, skip if empty
  const codeParts = parts.filter((_, i) => i > 0 || parts[0].trim());
  const start = parts[0].trim() ? 1 : 0;
  for (let i = 0; i < titles.length; i++) {
    blocks.push({ title: titles[i], code: (codeParts[start + i] ?? '').trimEnd() });
  }
  return blocks;
}

function mergeBlocks(blocks: CodeBlock[]): string {
  return blocks.map(b => `# --- BLOCK: ${b.title} ---\n${b.code}`).join('\n\n');
}
