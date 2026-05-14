// algorithmCommands.ts – 算法相关命令

import * as vscode from 'vscode';
import {
  createAlgorithm,
  deleteAlgorithm,
  updateAlgorithmMetadata,
  submitForReview,
  getAlgorithm,
} from '../api';
import { openAlgorithmEditor } from '../panels/EditorPanel';
import { BlockEditorPanel } from '../panels/BlockEditorPanel';
import { BrowsePanel } from '../panels/BrowsePanel';
import { AlgoTreeProvider } from '../providers/AlgoTreeProvider';
import type { Algorithm } from '../types';

export function registerAlgorithmCommands(
  context: vscode.ExtensionContext,
  treeProvider: AlgoTreeProvider
): void {
  // 打开算法
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.openAlgorithm', async (algo?: Algorithm) => {
      if (!algo) {
        const id = await vscode.window.showInputBox({ prompt: '输入算法 ID' });
        if (!id) return;
        try {
          algo = await getAlgorithm(id);
        } catch (err) {
          vscode.window.showErrorMessage(`找不到算法: ${String(err)}`);
          return;
        }
      }
      await openAlgorithmEditor(algo, context);
    })
  );

  // 分块编辑
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.editBlocks', async (algo?: Algorithm) => {
      if (!algo) {
        const id = await vscode.window.showInputBox({ prompt: '输入算法 ID' });
        if (!id) return;
        try {
          algo = await getAlgorithm(id);
        } catch (err) {
          vscode.window.showErrorMessage(`找不到算法: ${String(err)}`);
          return;
        }
      }
      await BlockEditorPanel.open(algo, context);
    })
  );

  // 浏览
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.browse', async () => {
      await BrowsePanel.open(context);
    })
  );

  // 新建算法
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.createAlgorithm', async () => {
      const namespace = await vscode.window.showInputBox({ prompt: '命名空间 (如 my/algo)', placeHolder: 'my/algo' });
      if (!namespace) return;
      const funcName = await vscode.window.showInputBox({ prompt: '函数名 (snake_case)', placeHolder: 'my_algo' });
      if (!funcName) return;
      const zhName = await vscode.window.showInputBox({ prompt: '中文名称（可选）' });
      const zhDesc = await vscode.window.showInputBox({ prompt: '中文描述（可选）' });

      const kinds = ['component', 'template', 'snippet'] as const;
      const kind = await vscode.window.showQuickPick(kinds as unknown as string[], { placeHolder: '模块类型' }) as 'component' | 'template' | 'snippet' | undefined;

      try {
        const algo = await createAlgorithm({
          namespace,
          func_name: funcName,
          module_kind: kind ?? 'component',
          zh_name: zhName || undefined,
          zh_description: zhDesc || undefined,
        });
        vscode.window.showInformationMessage(`算法 "${algo.funcName}" 创建成功`);
        await treeProvider.refresh();
        await openAlgorithmEditor(algo, context);
      } catch (err) {
        vscode.window.showErrorMessage(`创建失败: ${String(err)}`);
      }
    })
  );

  // 删除算法
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.deleteAlgorithm', async (algo?: Algorithm) => {
      const name = algo?.zhName || algo?.funcName || algo?.id || '?';
      const confirmed = await vscode.window.showWarningMessage(
        `确定删除算法 "${name}"？此操作不可撤销。`,
        { modal: true },
        '确定删除'
      );
      if (confirmed !== '确定删除') return;
      if (!algo?.id) return;
      try {
        await deleteAlgorithm(algo.id);
        vscode.window.showInformationMessage(`算法 "${name}" 已删除`);
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`删除失败: ${String(err)}`);
      }
    })
  );

  // 提交审核
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.submitReview', async (algo?: Algorithm) => {
      if (!algo?.id) {
        const id = await vscode.window.showInputBox({ prompt: '算法 ID' });
        if (!id) return;
        algo = { id } as Algorithm;
      }
      try {
        await submitForReview(algo.id);
        vscode.window.showInformationMessage('已提交审核');
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`提交失败: ${String(err)}`);
      }
    })
  );

  // 编辑元数据
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.editAlgorithm', async (algo?: Algorithm) => {
      if (!algo?.id) return;
      const zhName = await vscode.window.showInputBox({ prompt: '中文名称', value: algo.zhName });
      if (zhName === undefined) return;
      const zhDesc = await vscode.window.showInputBox({ prompt: '中文描述', value: algo.zhDescription });
      if (zhDesc === undefined) return;
      try {
        await updateAlgorithmMetadata(algo.id, { zh_name: zhName, zh_description: zhDesc });
        vscode.window.showInformationMessage('元数据已更新');
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`更新失败: ${String(err)}`);
      }
    })
  );

  // 刷新
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.refresh', async () => {
      await treeProvider.refresh();
    })
  );
}
