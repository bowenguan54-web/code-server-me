// AlgoHoverProvider.ts – 算法调用悬停文档

import * as vscode from 'vscode';
import { listAlgorithms } from '../api';
import type { Algorithm } from '../types';

export class AlgoHoverProvider implements vscode.HoverProvider {
  private cache: Algorithm[] = [];
  private lastFetch = 0;
  private readonly cacheTtl = 60_000;

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

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    await this.ensureCache();
    if (this.cache.length === 0) return undefined;

    const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!wordRange) return undefined;

    const word = document.getText(wordRange);
    const algo = this.cache.find(a => a.funcName === word || a.zhName === word);
    if (!algo) return undefined;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**$(symbol-function) ${algo.zhName || algo.funcName}** *(AlgoLib)*\n\n`);
    if (algo.zhDescription) md.appendMarkdown(`${algo.zhDescription}\n\n`);
    if (algo.params && algo.params.length > 0) {
      md.appendMarkdown('| 参数 | 类型 | 描述 |\n|---|---|---|\n');
      for (const p of algo.params) {
        md.appendMarkdown(`| \`${p.name}\` | ${p.type ?? '-'} | ${p.description ?? '-'} |\n`);
      }
    }
    if (algo.version) md.appendMarkdown(`\n版本: \`${algo.version}\``);

    return new vscode.Hover(md, wordRange);
  }
}
