// extension.ts – AlgoLib 扩展激活入口

import * as vscode from 'vscode';
import { getAutoLogin, getBaseUrl } from './config';
import { autoLogin, login, logout, getToken, getUser, onAuthChange } from './auth';
import { healthCheck } from './api';
import { AlgoTreeProvider } from './providers/AlgoTreeProvider';
import { AlgoCompletionProvider } from './providers/AlgoCompletionProvider';
import { AlgoCodeLensProvider } from './providers/AlgoCodeLensProvider';
import { AlgoHoverProvider } from './providers/AlgoHoverProvider';
import { registerSaveInterceptor } from './panels/EditorPanel';
import { registerAlgorithmCommands } from './commands/algorithmCommands';
import { registerExecuteCommands } from './commands/executeCommands';
import { registerReviewCommands } from './commands/reviewCommands';
import { registerCategoryCommands } from './commands/categoryCommands';

let statusBarItem: vscode.StatusBarItem;
let sseAbort: AbortController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[AlgoLib] Extension activating...');

  // ── 状态栏 ────────────────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'algolib.browse';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();
  statusBarItem.show();

  // ── Tree Providers ────────────────────────────────────────────────────────
  const explorerProvider = new AlgoTreeProvider('all');
  const myAlgosProvider = new AlgoTreeProvider('mine');

  vscode.window.registerTreeDataProvider('algolib.explorer', explorerProvider);
  vscode.window.registerTreeDataProvider('algolib.myAlgos', myAlgosProvider);

  // ── Language Providers ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'python' },
      new AlgoCompletionProvider(),
      '.'
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'python' },
      new AlgoCodeLensProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'python' },
      new AlgoHoverProvider()
    )
  );

  // ── Save Interceptor ──────────────────────────────────────────────────────
  registerSaveInterceptor(context);

  // ── Commands ──────────────────────────────────────────────────────────────
  registerAlgorithmCommands(context, explorerProvider);
  registerExecuteCommands(context);
  registerReviewCommands(context, explorerProvider);
  registerCategoryCommands(context, explorerProvider);

  // 登录命令
  context.subscriptions.push(
    vscode.commands.registerCommand('algolib.login', async () => {
      const username = await vscode.window.showInputBox({ prompt: '用户名', placeHolder: 'username' });
      if (!username) return;
      const password = await vscode.window.showInputBox({ prompt: '密码', password: true });
      if (!password) return;

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '正在登录 AlgoLib...', cancellable: false },
        async () => {
          const result = await login(username, password);
          if (result.success) {
            vscode.window.showInformationMessage(`AlgoLib: 登录成功，欢迎 ${username}`);
            await explorerProvider.refresh();
            await myAlgosProvider.refresh();
          } else {
            vscode.window.showErrorMessage(`登录失败: ${result.message}`);
          }
        }
      );
    })
  );

  // ── auth 变化监听 ──────────────────────────────────────────────────────────
  context.subscriptions.push(
    onAuthChange.event(({ user }) => {
      vscode.commands.executeCommand('setContext', 'algolib.active', !!user);
      updateStatusBar();
      if (user) {
        myAlgosProvider.setOwnerId(user.id);
        void explorerProvider.refresh();
        void myAlgosProvider.refresh();
        connectSse(context, explorerProvider, myAlgosProvider);
      } else {
        disconnectSse();
      }
    })
  );

  // ── 健康检查 + 自动登录 ────────────────────────────────────────────────────
  const baseUrl = getBaseUrl();
  const isHealthy = await healthCheck().catch(() => false);
  if (!isHealthy) {
    console.warn(`[AlgoLib] Backend not reachable at ${baseUrl}`);
    updateStatusBar('离线');
  } else if (getAutoLogin()) {
    const loggedIn = await autoLogin();
    if (loggedIn) {
      const user = getUser();
      updateStatusBar(user?.username);
      myAlgosProvider.setOwnerId(user?.id);
      await explorerProvider.refresh();
      await myAlgosProvider.refresh();
      connectSse(context, explorerProvider, myAlgosProvider);
      vscode.commands.executeCommand('setContext', 'algolib.active', true);
    } else {
      updateStatusBar('未登录');
    }
  }

  console.log('[AlgoLib] Extension activated');
}

export function deactivate(): void {
  disconnectSse();
  console.log('[AlgoLib] Extension deactivated');
}

// ── 状态栏 ──────────────────────────────────────────────────────────────────

function updateStatusBar(username?: string): void {
  const label = username
    ? `$(beaker) AlgoLib: ${username}`
    : '$(beaker) AlgoLib: 未登录';
  statusBarItem.text = label;
  statusBarItem.tooltip = 'AlgoLib 算法管理 — 点击打开浏览器';
}

// ── SSE 实时刷新 ─────────────────────────────────────────────────────────────

function connectSse(
  _context: vscode.ExtensionContext,
  explorerProvider: AlgoTreeProvider,
  myAlgosProvider: AlgoTreeProvider
): void {
  disconnectSse();

  const token = getToken();
  if (!token) return;

  sseAbort = new AbortController();
  const url = `${getBaseUrl()}/api/v1/algorithms/events?token=${encodeURIComponent(token)}`;

  (async () => {
    try {
      const resp = await fetch(url, {
        signal: sseAbort!.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!resp.ok || !resp.body) return;

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        if (text.includes('algorithms:changed')) {
          void explorerProvider.refresh();
          void myAlgosProvider.refresh();
        }
      }
    } catch {
      // aborted or network error — ignore
    }
  })();
}

function disconnectSse(): void {
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = undefined;
  }
}
