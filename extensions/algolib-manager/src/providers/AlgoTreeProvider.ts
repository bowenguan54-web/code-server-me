// AlgoTreeProvider.ts – 算法浏览树

import * as vscode from 'vscode';
import { listAlgorithms, listCategories } from '../api';
import type { Algorithm, Category } from '../types';

type NodeKind = 'category' | 'algorithm';

export class AlgoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    public readonly algorithm?: Algorithm,
    public readonly category?: Category,
    label?: string
  ) {
    super(
      label ?? (kind === 'algorithm' ? (algorithm?.zhName || algorithm?.funcName || '') : (category?.zhName || category?.zh_name || category?.namespace || '')),
      kind === 'category' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    if (kind === 'algorithm' && algorithm) {
      this.contextValue = 'algorithm';
      this.description = algorithm.namespace;
      this.tooltip = buildAlgorithmTooltip(algorithm);
      this.iconPath = getAlgorithmIcon(algorithm);
      this.command = {
        command: 'algolib.openAlgorithm',
        title: '打开算法',
        arguments: [algorithm],
      };
    } else if (kind === 'category') {
      this.contextValue = 'category';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }
}

function buildAlgorithmTooltip(algo: Algorithm): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`**${algo.zhName || algo.funcName}**\n\n`);
  if (algo.zhDescription) md.appendMarkdown(`${algo.zhDescription}\n\n`);
  if (algo.version) md.appendMarkdown(`版本: \`${algo.version}\`  `);
  md.appendMarkdown(`状态: \`${algo.publishStatus}\`\n\n`);
  if (algo.params && algo.params.length > 0) {
    md.appendMarkdown(`**参数:**\n`);
    for (const p of algo.params) {
      md.appendMarkdown(`- \`${p.name}\`${p.type ? ` (${p.type})` : ''}${p.description ? `: ${p.description}` : ''}\n`);
    }
  }
  return md;
}

function getAlgorithmIcon(algo: Algorithm): vscode.ThemeIcon {
  switch (algo.publishStatus) {
    case 'published':   return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    case 'reviewing':   return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.blue'));
    case 'rejected':    return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    case 'draft':       return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.yellow'));
    case 'unpublished': return new vscode.ThemeIcon('circle-slash');
    default:            return new vscode.ThemeIcon('symbol-function');
  }
}

export class AlgoTreeProvider implements vscode.TreeDataProvider<AlgoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AlgoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private algorithms: Algorithm[] = [];
  private categories: Category[] = [];
  private filterOwnerId?: string;

  constructor(private readonly mode: 'all' | 'mine') {}

  setOwnerId(id: string | undefined): void {
    this.filterOwnerId = id;
  }

  async refresh(): Promise<void> {
    try {
      const params = this.filterOwnerId ? { ownerId: this.filterOwnerId } : {};
      [this.algorithms, this.categories] = await Promise.all([
        listAlgorithms(params),
        listCategories(),
      ]);
    } catch {
      this.algorithms = [];
      this.categories = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AlgoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AlgoTreeItem): AlgoTreeItem[] {
    if (!element) {
      // 顶级：分类
      const topLevel = this.categories.filter(c => !c.parent_namespace);
      const items: AlgoTreeItem[] = topLevel.map(c => new AlgoTreeItem('category', undefined, c));
      // 未分类算法
      const categorizedNs = new Set(this.categories.map(c => c.namespace));
      const uncategorized = this.algorithms.filter(a => !categorizedNs.has(a.namespace));
      items.push(...uncategorized.map(a => new AlgoTreeItem('algorithm', a)));
      return items;
    }

    if (element.kind === 'category' && element.category) {
      const ns = element.category.namespace;
      // 子分类
      const subCats = this.categories.filter(c => c.parent_namespace === ns);
      const subItems: AlgoTreeItem[] = subCats.map(c => new AlgoTreeItem('category', undefined, c));
      // 该分类下算法
      const algos = this.algorithms.filter(a => a.namespace === ns);
      subItems.push(...algos.map(a => new AlgoTreeItem('algorithm', a)));
      return subItems;
    }

    return [];
  }
}
