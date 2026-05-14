// AlgoCodeLensProvider.ts – 算法文件 CodeLens

import * as vscode from 'vscode';

export class AlgoCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // 查找 @algo_meta 装饰器
    const algoMetaRe = /@algo_meta/g;
    let match: RegExpExecArray | null;

    while ((match = algoMetaRe.exec(text)) !== null) {
      const pos = document.positionAt(match.index);
      const range = new vscode.Range(pos, pos);

      lenses.push(new vscode.CodeLens(range, {
        title: '▶ 运行',
        command: 'algolib.runFile',
        tooltip: '运行当前算法文件',
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '📝 编辑元数据',
        command: 'algolib.editAlgorithm',
        tooltip: '打开算法元数据编辑器',
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '🧪 带参数测试',
        command: 'algolib.runWithParams',
        tooltip: '输入参数并运行',
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '📤 提交审核',
        command: 'algolib.submitReview',
        tooltip: '将算法提交至审核队列',
      }));
    }

    return lenses;
  }
}
