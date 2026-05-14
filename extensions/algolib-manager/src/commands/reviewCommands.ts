// reviewCommands.ts – 审核相关命令

import * as vscode from 'vscode';
import { ReviewPanel } from '../panels/ReviewPanel';
import { approveAlgorithm, rejectAlgorithm } from '../api';
import { AlgoTreeProvider } from '../providers/AlgoTreeProvider';

export function registerReviewCommands(
  context: vscode.ExtensionContext,
  treeProvider: AlgoTreeProvider
): void {
  // 打开审核面板
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.openReview', async () => {
      await ReviewPanel.open(context);
    })
  );

  // 批准（从树节点右键）
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.approve', async (algoOrId?: { id?: string } | string) => {
      const id = typeof algoOrId === 'string' ? algoOrId : algoOrId?.id;
      if (!id) return;
      try {
        await approveAlgorithm(id);
        vscode.window.showInformationMessage(`算法 ${id} 已批准`);
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`批准失败: ${String(err)}`);
      }
    })
  );

  // 发布
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.publish', async (algoOrId?: { id?: string } | string) => {
      const id = typeof algoOrId === 'string' ? algoOrId : algoOrId?.id;
      if (!id) return;
      try {
        await approveAlgorithm(id);
        vscode.window.showInformationMessage(`算法已发布`);
        await treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`发布失败: ${String(err)}`);
      }
    })
  );
}
