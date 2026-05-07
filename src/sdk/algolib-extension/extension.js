"use strict";
/**
 * AlgoLib VS Code Extension.
 * Provides alg. completions, algorithm call insertion, and snippet insertion.
 */

const vscode = require("vscode");

const DEFAULT_URL = "http://localhost:8000";
const COMPLETIONS_PATH = "/api/v1/stubs/completions";
const SNIPPETS_PATH = "/api/v1/snippets";
const SSE_PATH = "/api/v1/events/algo-changes";
const RECONNECT_DELAY_MS = 5000;

let statusBar;
let completionDisposable;
let sseAbortController;
let reconnectTimer;
let completionItems = [];
let snippetItems = [];

async function fetchCompletions() {
  try {
    const resp = await fetch(`${DEFAULT_URL}${COMPLETIONS_PATH}`);
    if (!resp.ok) return;
    const data = await resp.json();
    completionItems = data.items || data.completions || data.algorithms || [];
    updateStatusBar(completionItems.length);
    refreshCompletionProvider();
  } catch (error) {
    // The service may not be running yet.
  }
}

async function fetchSnippets(keyword = "") {
  try {
    const query = keyword ? `?q=${encodeURIComponent(keyword)}` : "";
    const resp = await fetch(`${DEFAULT_URL}${SNIPPETS_PATH}${query}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    snippetItems = Array.isArray(data) ? data : (data.items || data.snippets || []);
    return snippetItems;
  } catch (error) {
    return [];
  }
}

function updateStatusBar(count) {
  if (!statusBar) return;
  if (count > 0) {
    statusBar.text = `$(beaker) AlgoLib (${count})`;
    statusBar.tooltip = `AlgoLib: ${count} 个算法。Alt+A 插入算法调用，Ctrl+Alt+S 插入代码片段`;
  } else {
    statusBar.text = "$(beaker) AlgoLib";
    statusBar.tooltip = "AlgoLib: 等待算法服务。Ctrl+Alt+S 可插入代码片段";
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
    try {
      sseAbortController.abort();
    } catch (error) {
      // Ignore abort races during reconnect.
    }
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
          } catch (error) {
            // Skip malformed SSE payloads.
          }
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
    vscode.window.showInformationMessage("暂无算法。请确认 algo_service 已在 8000 端口运行。");
    return;
  }
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "选择算法以插入调用片段 (Alt+A)",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected) {
    await insertAlgorithmCall(selected.item);
  }
}

async function insertAlgorithmCall(item) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const call = item.callPrefix || item.call_prefix || item.name || "";
  const params = item.params || [];
  const snippetText = item.callSnippet || `${call}(${params.map((p, i) => `\${${i + 1}:${p.name || "arg"}}`).join(", ")})`;
  await editor.insertSnippet(new vscode.SnippetString(snippetText));
}

function snippetPreview(body) {
  return String(body || "").replace(/\s+/g, " ").slice(0, 80);
}

function currentLineIndent(editor) {
  const line = editor.document.lineAt(editor.selection.active.line).text;
  const match = line.match(/^\s*/);
  return match ? match[0] : "";
}

function alignSnippetIndent(body, editor) {
  const text = String(body || "");
  const indent = currentLineIndent(editor);
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length <= 1) return text;
  return lines.map((line, index) => {
    if (index === 0 || line.trim() === "") return line;
    return `${indent}${line}`;
  }).join("\n");
}

async function insertRawSnippet(body) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("请先打开一个代码编辑器。");
    return;
  }
  const text = alignSnippetIndent(body, editor);
  await editor.edit(editBuilder => {
    for (const selection of editor.selections) {
      editBuilder.replace(selection, text);
    }
  });
}

async function showSnippetQuickPick() {
  const snippets = await fetchSnippets();
  const items = snippets.map(item => ({
    label: `$(symbol-snippet) ${item.zh_name || item.zhName || item.name || item.id}`,
    description: item.name || "",
    detail: snippetPreview(item.body),
    item
  }));
  if (items.length === 0) {
    vscode.window.showInformationMessage("暂无代码片段，请先在 AlgoLib 的代码片段页面创建。");
    return;
  }
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "选择代码片段插入到当前光标处 (Ctrl+Alt+S)",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected) {
    await insertRawSnippet(selected.item.body || "");
  }
}

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "algolib.showAlgorithms";
  statusBar.text = "$(sync~spin) AlgoLib";
  statusBar.tooltip = "AlgoLib: 正在连接算法服务...";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.showAlgorithms", showAlgorithmQuickPick)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.refreshAlgorithms", async () => {
      await fetchCompletions();
      vscode.window.showInformationMessage(`AlgoLib: 已刷新，共 ${completionItems.length} 个算法。`);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("algolib.insertSnippet", async item => {
      if (item) {
        await insertAlgorithmCall(item);
      } else {
        await showSnippetQuickPick();
      }
    })
  );

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
