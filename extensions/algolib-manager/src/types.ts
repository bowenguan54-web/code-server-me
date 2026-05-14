// types.ts – 共享 TypeScript 类型定义

export type PublishStatus = 'draft' | 'reviewing' | 'published' | 'rejected' | 'unpublished';
export type ModuleKind = 'component' | 'template' | 'snippet';

export interface AlgorithmParam {
  name: string;
  type?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface Algorithm {
  id: string;
  namespace: string;
  funcName: string;
  zhName?: string;
  zhDescription?: string;
  zhTags?: string[];
  publishStatus: PublishStatus;
  type?: ModuleKind;
  moduleKind?: ModuleKind;
  sourceFile?: string;
  params?: AlgorithmParam[];
  inputExample?: string;
  version?: string;
  ownerId?: string;
  ownerName?: string;
  reviewStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AlgorithmFile {
  filename: string;
  content: string;
  isEntry?: boolean;
  relative_path?: string;
}

export interface Category {
  namespace: string;
  zh_name?: string;
  zhName?: string;
  parent_namespace?: string;
  module_kind?: ModuleKind;
  children?: Category[];
}

export interface Snippet {
  id: string;
  name: string;
  zhName?: string;
  description?: string;
  code: string;
  tags?: string[];
}

export interface ExecuteResult {
  success: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  elapsed_ms?: number;
  exit_code?: number;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  displayName?: string;
}

export interface SessionData {
  token: string;
  user?: User;
  expires_at?: string;
}

export interface CreateAlgorithmRequest {
  namespace: string;
  func_name: string;
  module_kind: ModuleKind;
  source_code?: string;
  zh_name?: string;
  zh_description?: string;
  zh_tags?: string[];
}

export interface MetadataUpdate {
  zh_name?: string;
  zh_description?: string;
  zh_tags?: string[];
  input_example?: string;
}

export interface CreateCategoryRequest {
  namespace: string;
  zh_name: string;
  parent_namespace?: string;
  module_kind?: ModuleKind;
}

export interface CodeBlock {
  title: string;
  code: string;
}

// Webview 消息类型
export type WebviewToExtMessage =
  | { command: 'save'; data: { blocks: CodeBlock[]; algorithmId: string } }
  | { command: 'run'; data: { mode: 'file' | 'block' | 'selection'; blockIndex?: number; algorithmId: string } }
  | { command: 'runParams'; data: { params: Record<string, unknown>; algorithmId: string } }
  | { command: 'ready' }
  | { command: 'openOutput' }
  | { command: 'requestFiles'; data: { algorithmId: string } };

export type ExtToWebviewMessage =
  | { command: 'loadFiles'; data: { files: AlgorithmFile[]; algorithmId: string; algorithmMeta: Algorithm } }
  | { command: 'executeStart' }
  | { command: 'executeOutput'; data: { stream: 'stdout' | 'stderr'; text: string } }
  | { command: 'executeResult'; data: ExecuteResult }
  | { command: 'saveResult'; data: { success: boolean; message: string } }
  | { command: 'themeChanged'; data: { kind: 'light' | 'dark' | 'high-contrast' } }
  | { command: 'error'; data: { message: string } };
