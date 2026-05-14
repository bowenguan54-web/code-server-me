// categoryCommands.ts – 分类相关命令

import * as vscode from 'vscode';
import { createCategory } from '../api';
import { AlgoTreeProvider } from '../providers/AlgoTreeProvider';

export function registerCategoryCommands(
  context: vscode.ExtensionContext,
  treeProvider: AlgoTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.createCategory', async () => {
      const namespace = await vscode.window.showInputBox({
        prompt: '分类命名空间 (如 machine_learning)',
        placeHolder: 'my_category',
      });
      if (!namespace) return;

      const zhName = await vscode.window.showInputBox({
        prompt: '分类中文名',
        placeHolder: '我的分类',
      });
      if (!zhName) return;

      const parentNs = await vscode.window.showInputBox({
        prompt: '父分类命名空间（可选，留空为顶级分类）',
        placeHolder: '',
      });

      try {
        await createCategory({
          namespace,
          zh_name: zhName,
          parent_namespace: parentNs || undefined,
        });
        vscode.window.showInformationMessage(`分类 "${zhName}" 创建成功`);
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`创建分类失败: ${String(err)}`);
      }
    })
  );

  // 插入代码片段（占位）
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.insertSnippet', async () => {
      vscode.window.showInformationMessage('插入代码片段功能暂未实现');
    })
  );
}
