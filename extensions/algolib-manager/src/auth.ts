// auth.ts – 认证管理

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getBaseUrl, getSessionFilePath } from './config';
import type { SessionData, User } from './types';

let _token: string | undefined;
let _user: User | undefined;

export const onAuthChange = new vscode.EventEmitter<{ token: string | undefined; user: User | undefined }>();

export function getToken(): string | undefined {
  return _token;
}

export function getUser(): User | undefined {
  return _user;
}

function setAuth(token: string | undefined, user: User | undefined): void {
  _token = token;
  _user = user;
  onAuthChange.fire({ token, user });
}

export async function autoLogin(): Promise<boolean> {
  const sessionFile = getSessionFilePath();
  if (!sessionFile) return false;

  let session: SessionData;
  try {
    const raw = fs.readFileSync(sessionFile, 'utf8');
    session = JSON.parse(raw) as SessionData;
  } catch {
    return false;
  }

  if (!session.token) return false;

  // 验证 token
  try {
    const resp = await fetch(`${getBaseUrl()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!resp.ok) return false;
    const user = (await resp.json()) as User;
    setAuth(session.token, user);
    return true;
  } catch {
    return false;
  }
}

export async function login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
  try {
    const body = new URLSearchParams({ username, password });
    const resp = await fetch(`${getBaseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({ detail: '登录失败' }))) as { detail?: string };
      return { success: false, message: err.detail ?? '登录失败' };
    }

    const data = (await resp.json()) as { access_token: string };
    const token = data.access_token;

    // 获取用户信息
    const meResp = await fetch(`${getBaseUrl()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = meResp.ok ? ((await meResp.json()) as User) : undefined;

    setAuth(token, user);

    // 保存 session
    const sessionFile = getSessionFilePath();
    if (sessionFile) {
      try {
        const dir = path.dirname(sessionFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const sessionData: SessionData = { token, user };
        fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf8');
      } catch {
        // ignore write errors
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

export function logout(): void {
  setAuth(undefined, undefined);

  // 删除 session 文件
  const sessionFile = getSessionFilePath();
  if (sessionFile && fs.existsSync(sessionFile)) {
    try { fs.unlinkSync(sessionFile); } catch { /* ignore */ }
  }
}
