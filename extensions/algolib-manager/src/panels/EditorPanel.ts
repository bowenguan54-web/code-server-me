// EditorPanel.ts – 算法编辑器（普通模式：直接用 VS Code 原生编辑器）

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { getAlgorithm, getAlgorithmFiles, saveAlgorithmFile } from '../api';
import type { Algorithm } from '../types';

interface OpenedAlgoFile {
  algorithmId: string;
  filename: string;
  tmpPath: string;
  savedVersion: string;
}

const openedFiles = new Map<string, OpenedAlgoFile>();

export async function openAlgorithmEditor(
  algorithm: Algorithm,
  context: vscode.ExtensionContext
): Promise<void> {
  const algo = algorithm.id
    ? algorithm
    : await getAlgorithm(algorithm.id).catch(() => algorithm);

  let files: { filename: string; content: string }[] = [];
  try {
    files = await getAlgorithmFiles(algo.id);
  } catch {
    vscode.window.showErrorMessage(`获取算法文件失败: ${algo.id}`);
    return;
  }

  if (files.length === 0) {
    vscode.window.showWarningMessage('该算法暂无文件');
    return;
  }

  const tmpDir = path.join(os.tmpdir(), 'algolib-edit', algo.id.replace(/[/\\:]/g, '_'));
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  for (const f of files) {
    const tmpPath = path.join(tmpDir, f.filename);
    fs.writeFileSync(tmpPath, f.content, 'utf8');

    const key = tmpPath;
    openedFiles.set(key, {
      algorithmId: algo.id,
      filename: f.filename,
      tmpPath,
      savedVersion: f.content,
    });
  }

  // 打开入口文件（通常是第一个 .py 文件）
  const entryFile = files.find(f => f.filename.endsWith('.py')) ?? files[0];
  const docUri = vscode.Uri.file(path.join(tmpDir, entryFile.filename));
  await vscode.window.showTextDocument(docUri, { preview: false });
}

/**
 * 拦截保存事件：若是临时算法文件则同步至后端
 */
export function registerSaveInterceptor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async event => {
      const doc = event.document;
      const fsPath = doc.uri.fsPath;
      const opened = openedFiles.get(fsPath);
      if (!opened) return;

      const content = doc.getText();
      if (content === opened.savedVersion) return;

      event.waitUntil(
        (async () => {
          try {
            await saveAlgorithmFile(opened.algorithmId, opened.filename, content);
            opened.savedVersion = content;
            vscode.window.setStatusBarMessage(`$(check) AlgoLib: ${opened.filename} 已保存`, 3000);
          } catch (err) {
            vscode.window.showErrorMessage(`保存失败: ${String(err)}`);
          }
          return [];
        })()
      );
    })
  );
}
