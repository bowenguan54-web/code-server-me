// api.ts – 后端 API 封装层

import { getBaseUrl } from './config';
import { getToken } from './auth';
import type {
  Algorithm,
  AlgorithmFile,
  Category,
  Snippet,
  ExecuteResult,
  CreateAlgorithmRequest,
  MetadataUpdate,
  CreateCategoryRequest,
} from './types';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new ApiError(resp.status, detail);
  }

  const ct = resp.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return resp.json() as Promise<T>;
  }
  return undefined as T;
}

// ── 算法 ──────────────────────────────────────────────────────────────────

export async function listAlgorithms(params?: {
  namespace?: string;
  type?: string;
  publishStatus?: string;
  search?: string;
  ownerId?: string;
}): Promise<Algorithm[]> {
  const q = new URLSearchParams();
  if (params?.namespace) q.set('namespace', params.namespace);
  if (params?.type) q.set('type', params.type);
  if (params?.publishStatus) q.set('publish_status', params.publishStatus);
  if (params?.search) q.set('search', params.search);
  if (params?.ownerId) q.set('owner_id', params.ownerId);
  const qs = q.toString();
  return request<Algorithm[]>(`/api/v1/algorithms${qs ? '?' + qs : ''}`);
}

export async function getAlgorithm(id: string): Promise<Algorithm> {
  return request<Algorithm>(`/api/v1/algorithms/${encodeURIComponent(id)}`);
}

export async function createAlgorithm(req: CreateAlgorithmRequest): Promise<Algorithm> {
  return request<Algorithm>('/api/v1/algorithms', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function updateAlgorithmMetadata(id: string, update: MetadataUpdate): Promise<Algorithm> {
  return request<Algorithm>(`/api/v1/algorithms/${encodeURIComponent(id)}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

export async function deleteAlgorithm(id: string): Promise<void> {
  return request<void>(`/api/v1/algorithms/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getAlgorithmFiles(id: string): Promise<AlgorithmFile[]> {
  return request<AlgorithmFile[]>(`/api/v1/algorithms/${encodeURIComponent(id)}/files`);
}

export async function saveAlgorithmFile(id: string, filename: string, content: string): Promise<void> {
  return request<void>(`/api/v1/algorithms/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ── 分类 ─────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  return request<Category[]>('/api/v1/algorithms/categories');
}

export async function createCategory(req: CreateCategoryRequest): Promise<Category> {
  return request<Category>('/api/v1/algorithms/categories', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── 代码片段 ──────────────────────────────────────────────────────────────

export async function listSnippets(): Promise<Snippet[]> {
  return request<Snippet[]>('/api/v1/snippets');
}

export async function createSnippet(snippet: Omit<Snippet, 'id'>): Promise<Snippet> {
  return request<Snippet>('/api/v1/snippets', {
    method: 'POST',
    body: JSON.stringify(snippet),
  });
}

export async function deleteSnippet(id: string): Promise<void> {
  return request<void>(`/api/v1/snippets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── 提交/审核 ─────────────────────────────────────────────────────────────

export async function submitForReview(algorithmId: string): Promise<void> {
  return request<void>(`/api/v1/algorithms/${encodeURIComponent(algorithmId)}/submit-review`, {
    method: 'POST',
  });
}

export async function listPendingReviews(): Promise<Algorithm[]> {
  return listAlgorithms({ publishStatus: 'reviewing' });
}

export async function approveAlgorithm(algorithmId: string): Promise<void> {
  return request<void>(`/api/v1/publish/${encodeURIComponent(algorithmId)}/approve`, {
    method: 'POST',
  });
}

export async function rejectAlgorithm(algorithmId: string, reason: string): Promise<void> {
  return request<void>(`/api/v1/publish/${encodeURIComponent(algorithmId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── 执行 ──────────────────────────────────────────────────────────────────

export async function executeRaw(
  code: string,
  params: Record<string, unknown> = {},
  timeoutSec = 60
): Promise<ExecuteResult> {
  return request<ExecuteResult>('/api/v1/execute-raw', {
    method: 'POST',
    body: JSON.stringify({ code, params, timeout: timeoutSec }),
  });
}

export async function invokeAlgorithm(
  algorithmId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return request<unknown>(`/api/v1/algorithms/${encodeURIComponent(algorithmId)}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ params }),
  });
}

// ── 健康检查 ──────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    await request<unknown>('/health');
    return true;
  } catch {
    return false;
  }
}

export { ApiError };
