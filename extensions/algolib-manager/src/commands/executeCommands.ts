// executeCommands.ts – 执行相关命令

import * as vscode from 'vscode';
import { executeRaw, invokeAlgorithm } from '../api';
import { OutputPanel } from '../panels/OutputPanel';
import { getToken } from '../auth';
import { getBaseUrl } from '../config';
import type { Algorithm } from '../types';

export function registerExecuteCommands(context: vscode.ExtensionContext): void {
  const outputPanel = OutputPanel.getInstance();

  // 运行当前文件
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.runFile', async (algo?: Algorithm) => {
      if (!getToken()) {
        vscode.window.showWarningMessage('请先登录 AlgoLib');
        return;
      }

      let code: string | undefined;
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'python') {
        code = editor.document.getText();
      } else if (algo?.id) {
        // 通过 invoke 执行
        const params = await collectParams(algo);
        if (params === undefined) return;
        outputPanel.show(context);
        outputPanel.clear();
        try {
          const result = await invokeAlgorithm(algo.id, params);
          outputPanel.showResult({ success: true, result });
        } catch (err) {
          outputPanel.showResult({ success: false, stderr: String(err) });
        }
        return;
      }

      if (!code) {
        vscode.window.showWarningMessage('无可运行的 Python 文件');
        return;
      }

      outputPanel.show(context);
      outputPanel.clear();

      try {
        const result = await executeRaw(code);
        if (result.stdout) outputPanel.appendOutput('stdout', result.stdout);
        if (result.stderr) outputPanel.appendOutput('stderr', result.stderr);
        outputPanel.showResult(result);
      } catch (err) {
        outputPanel.showResult({ success: false, stderr: String(err) });
      }
    })
  );

  // 运行代码块（当前选区或光标所在块）
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.runBlock', async () => {
      if (!getToken()) {
        vscode.window.showWarningMessage('请先登录 AlgoLib');
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      const code = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      outputPanel.show(context);
      outputPanel.clear();

      try {
        const result = await executeRaw(code);
        if (result.stdout) outputPanel.appendOutput('stdout', result.stdout);
        if (result.stderr) outputPanel.appendOutput('stderr', result.stderr);
        outputPanel.showResult(result);
      } catch (err) {
        outputPanel.showResult({ success: false, stderr: String(err) });
      }
    })
  );

  // 带参数运行
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.runWithParams', async (algo?: Algorithm) => {
      if (!getToken()) {
        vscode.window.showWarningMessage('请先登录 AlgoLib');
        return;
      }

      const paramsStr = await vscode.window.showInputBox({
        prompt: '输入 JSON 参数（如 {"x": 1, "y": 2}）',
        placeHolder: '{}',
        value: '{}',
      });
      if (paramsStr === undefined) return;

      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(paramsStr) as Record<string, unknown>;
      } catch {
        vscode.window.showErrorMessage('参数格式错误，请输入合法的 JSON');
        return;
      }

      outputPanel.show(context);
      outputPanel.clear();

      if (algo?.id) {
        try {
          const result = await invokeAlgorithm(algo.id, params);
          outputPanel.showResult({ success: true, result });
        } catch (err) {
          outputPanel.showResult({ success: false, stderr: String(err) });
        }
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const code = editor.document.getText();
        try {
          const result = await executeRaw(code, params);
          if (result.stdout) outputPanel.appendOutput('stdout', result.stdout);
          if (result.stderr) outputPanel.appendOutput('stderr', result.stderr);
          outputPanel.showResult(result);
        } catch (err) {
          outputPanel.showResult({ success: false, stderr: String(err) });
        }
      }
    })
  );

  // 打开输出面板
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.openOutput', () => {
      outputPanel.show(context);
    })
  );
}

async function collectParams(algo: Algorithm): Promise<Record<string, unknown> | undefined> {
  const paramsStr = await vscode.window.showInputBox({
    prompt: `输入 "${algo.zhName || algo.funcName}" 的 JSON 参数`,
    placeHolder: '{}',
    value: '{}',
  });
  if (paramsStr === undefined) return undefined;
  try {
    return JSON.parse(paramsStr) as Record<string, unknown>;
  } catch {
    vscode.window.showErrorMessage('参数格式错误，请输入合法的 JSON');
    return undefined;
  }
}
