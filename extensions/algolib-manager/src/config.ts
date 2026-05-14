// config.ts – 配置管理

import * as vscode from 'vscode';
import * as path from 'path';

export function getBaseUrl(): string {
  return vscode.workspace.getConfiguration('algolib').get<string>('baseUrl', 'http://127.0.0.1:8000');
}

export function getAutoLogin(): boolean {
  return vscode.workspace.getConfiguration('algolib').get<boolean>('autoLogin', true);
}

export function getSessionFilePath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return path.join(folders[0].uri.fsPath, '.run', 'algolib-current-session.json');
}
