"use strict";
/**
 * AlgoLib VS Code Extension
 * Wraps AlgoChangeListener to provide alg. completion in the editor.
 */

const vscode = require("vscode");

const DEFAULT_URL = "http://localhost:8000";
const ALGO_LIST_PATH = "/api/v1/algorithms";
const COMPLETIONS_PATH = "/api/v1/stubs/completions";
const SSE_PATH = "/api/v1/events/algo-changes";
const RECONNECT_DELAY_MS = 5000;

let statusBar;
let completionDisposable;
let sseAbortController;
let reconnectTimer;
let completionItems = [];

async function fetchCompletions() {
  try {
    const resp = await fetch(`${DEFAULT_URL}${COMPLETIONS_PATH}`);
    if (!resp.ok) return;
    const data = await resp.json();
    completionItems = data.items || data.completions || data.algorithms || [];
    updateStatusBar(completionItems.length);
    refreshCompletionProvider();
  } catch {
    // service not running
  }
}

function updateStatusBar(count) {
  if (!statusBar) return;
  if (count > 0) {
    statusBar.text = `$(beaker) AlgoLib (${count})`;
    statusBar.tooltip = `已同步 ${count} 个算法 · Alt+A 打开列表`;
  } else {
    statusBar.text = `$(beaker) AlgoLib`;
    statusBar.tooltip = "AlgoLib: 等待算法服务...";
  }
}

function refreshCompletionProvider(context) {
  if (completionDisposable) {
    completionDisposable.dispose();
  }
  completionDisposable = vscode.languages.registerCompletionItemProvider(
    ["python", "javascript", "typescript"],
    {
      provideCompletionItems(document, position) {
        const lineText = document.lineAt(position).text;
        const prefix = lineText.slice(0, position.character);
        if (!/\balg(o)?\.?\w*$/.test(prefix)) return [];
        return completionItems.map(item => {
          const call = item.callPrefix || item.call_prefix || item.label || "";
          const params = item.params || [];
          const snippetText = item.callSnippet || item.insertText || `${call}(${params.map((p, i) => `\${${i + 1}:${p.name || "arg"}}`).join(", ")})`;
          const ci = new vscode.CompletionItem(call, vscode.CompletionItemKind.Function);
          ci.insertText = new vscode.SnippetString(snippetText);
          ci.documentation = new vscode.MarkdownString(item.zhDescription || item.zh_description || item.snippetBody || "");
          ci.detail = item.detail || call;
          return ci;
        });
      }
    },
    "."
  );
  if (context) context.subscriptions.push(completionDisposable);
}

function startSSE() {
  if (sseAbortController) {
    try { sseAbortController.abort(); } catch {}
  }
  sseAbortController = new AbortController();
  const url = `${DEFAULT_URL}${SSE_PATH}`;
  fetch(url, { signal: sseAbortController.signal }).then(async resp => {
    if (!resp.ok || !resp.body) throw new Error("SSE connection failed");
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.algorithms) {
              completionItems = payload.algorithms;
              updateStatusBar(completionItems.length);
              refreshCompletionProvider();
            }
          } catch {}
        }
      }
    }
  }).catch(() => {
    reconnectTimer = setTimeout(startSSE, RECONNECT_DELAY_MS);
  });
}

async function showAlgorithmQuickPick() {
  if (completionItems.length === 0) {
    await fetchCompletions();
  }
  const items = completionItems.map(item => {
    const call = item.callPrefix || item.call_prefix || "";
    return {
      label: `$(beaker) ${call}`,
      description: item.zh_description || item.zhDescription || "",
      detail: item.detail || "",
      item
    };
  });
  if (items.length === 0) {
    vscode.window.showInformationMessage("暂无算法。请确认 algo_service 已运行（端口 8000）。");
    return;
  }
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "选择算法以插入调用片段 (Alt+A)",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const call = selected.item.callPrefix || selected.item.call_prefix || "";
    const params = selected.item.params || [];
    const snippetText = selected.item.callSnippet || `${call}(${params.map((p, i) => `\${${i + 1}:${p.name || "arg"}}`).join(", ")})`;
    await editor.insertSnippet(new vscode.SnippetString(snippetText));
  }
}

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "algolib.showAlgorithms";
  statusBar.text = "$(sync~spin) AlgoLib";
  statusBar.tooltip = "AlgoLib: 连接算法服务中...";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.showAlgorithms", showAlgorithmQuickPick)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.refreshAlgorithms", async () => {
      await fetchCompletions();
      vscode.window.showInformationMessage(`AlgoLib: 已刷新，共 ${completionItems.length} 个算法`);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.insertSnippet", async (item) => {
      if (item) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const call = item.callPrefix || item.call_prefix || item.name || "";
        const params = item.params || [];
        const snippetText = item.callSnippet || `${call}(${params.map((p, i) => `\${${i + 1}:${p.name || "arg"}}`).join(", ")})`;
        await editor.insertSnippet(new vscode.SnippetString(snippetText));
      } else {
        await showAlgorithmQuickPick();
      }
    })
  );

  // Initial load
  fetchCompletions().then(() => {
    startSSE();
  });

  refreshCompletionProvider(context);
}

function deactivate() {
  if (sseAbortController) sseAbortController.abort();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (completionDisposable) completionDisposable.dispose();
  if (statusBar) statusBar.dispose();
}

module.exports = { activate, deactivate };
