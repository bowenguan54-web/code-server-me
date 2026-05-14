// AlgoCompletionProvider.ts – 算法代码补全

import * as vscode from 'vscode';
import { listAlgorithms } from '../api';
import type { Algorithm } from '../types';

export class AlgoCompletionProvider implements vscode.CompletionItemProvider {
  private cache: Algorithm[] = [];
  private lastFetch = 0;
  private readonly cacheTtl = 30_000; // 30s

  private async ensureCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetch > this.cacheTtl) {
      try {
        this.cache = await listAlgorithms();
        this.lastFetch = now;
      } catch {
        // keep stale cache
      }
    }
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | undefined> {
    // 检查触发前缀是否为 "alg"
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    if (!linePrefix.match(/\balg\w*\.?\w*$/i)) return undefined;

    await this.ensureCache();
    if (this.cache.length === 0) return undefined;

    return this.cache.map(algo => {
      const item = new vscode.CompletionItem(
        algo.zhName || algo.funcName,
        vscode.CompletionItemKind.Function
      );

      item.detail = `[AlgoLib] ${algo.namespace}`;
      item.documentation = buildDoc(algo);

      // 构建调用片段
      const callSnippet = buildCallSnippet(algo);
      item.insertText = new vscode.SnippetString(callSnippet);
      item.filterText = `${algo.funcName} ${algo.zhName || ''}`;
      item.sortText = `0_${algo.funcName}`;

      return item;
    });
  }
}

function buildDoc(algo: Algorithm): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  if (algo.zhDescription) md.appendMarkdown(`${algo.zhDescription}\n\n`);
  if (algo.params && algo.params.length > 0) {
    md.appendMarkdown('**参数:**\n');
    for (const p of algo.params) {
      md.appendMarkdown(`- \`${p.name}\`${p.type ? ` *(${p.type})*` : ''}${p.description ? ` — ${p.description}` : ''}\n`);
    }
  }
  return md;
}

function buildCallSnippet(algo: Algorithm): string {
  if (!algo.params || algo.params.length === 0) {
    return `${algo.funcName}()`;
  }
  const paramParts = algo.params.map((p, i) => `${p.name}=\${${i + 1}:${p.default !== undefined ? String(p.default) : p.name}}`);
  return `${algo.funcName}(${paramParts.join(', ')})`;
}
