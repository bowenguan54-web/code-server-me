export type AlgoLibScope = "template" | "snippet" | "algorithm"
export type BumpType = "major" | "minor" | "patch"
export type ResourceStatus = "active" | "disabled"
export type SnippetScope = "team" | "private"
export type Visibility = "shared" | "private"
export type AlgorithmReviewDecision = "submitted" | "approved" | "rejected"
export type AlgorithmLifecycleStatus = "draft" | "reviewing" | "published" | "deprecated"

export interface AlgoLibCategory {
  id: number
  scope: AlgoLibScope
  name: string
  englishName?: string
  parentId?: number
  level: number
  sortOrder: number
  description?: string
  createdAt: string
  updatedAt: string
}

export interface AlgoLibTemplate {
  id: number
  name: string
  zhName?: string
  packageId?: string
  categoryId: number
  difficulty: number
  language: string
  description: string
  templateBody?: string
  paramsSchema?: string
  content: string
  example: string
  tags: string[]
  currentVersion: string
  status: ResourceStatus
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AlgoLibTemplateVersion {
  id: number
  templateId: number
  version: string
  content: string
  example: string
  paramsSchema?: string
  changeReason: string
  changeSummary: string
  changedBy: string
  createdAt: string
}

export interface AlgoLibSnippetFolder {
  id: number
  name: string
  visibility: Visibility
  ownerId?: string
  parentId?: number
  createdAt: string
  updatedAt: string
}

export interface AlgoLibSnippet {
  id: number
  name: string
  zhName?: string
  folderId?: number
  visibility: Visibility
  scope?: SnippetScope
  ownerId?: string
  language: string
  description: string
  body?: string
  content: string
  tags: string[]
  currentVersion: string
  status: ResourceStatus
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AlgoLibSnippetVersion {
  id: number
  snippetId: number
  version: string
  content: string
  changeReason: string
  changeSummary: string
  changedBy: string
  createdAt: string
}

export interface AlgoLibAlgorithmFolder {
  id: number
  name: string
  callName?: string
  ownerId: string
  parentId?: number
  createdAt: string
  updatedAt: string
}

export interface AlgoLibAlgorithm {
  id: number
  name: string
  zhName?: string
  ownerId: string
  folderId?: number
  packageId?: string
  namespace?: string
  type: string
  description: string
  inputSpec: string
  outputSpec: string
  dependencies?: string
  content: string
  example?: string
  tags: string[]
  currentVersion: string
  status: AlgorithmLifecycleStatus
  templateSourceId?: number
  packageFile?: string
  apiPath?: string
  linkedApplications: string[]
  createdBy: string
  updatedBy: string
  reviewerId?: string
  reviewComment?: string
  submittedAt?: string
  approvedAt?: string
  rejectedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AlgoLibAlgorithmVersion {
  id: number
  algorithmId: number
  version: string
  content: string
  inputSpec: string
  outputSpec: string
  dependencies?: string
  changeReason: string
  changeSummary: string
  changedBy: string
  createdAt: string
}

export interface AlgoLibAlgorithmReview {
  id: number
  algorithmId: number
  decision: AlgorithmReviewDecision
  actorId: string
  reason: string
  summary: string
  dependencies?: string
  applications: string[]
  packageFile?: string
  createdAt: string
}

export interface AlgoLibAuditLog {
  id: number
  actorId: string
  action: string
  resourceType: AlgoLibScope | "category" | "folder" | "review"
  resourceId: number
  detail: Record<string, unknown>
  createdAt: string
}

export interface AlgoLibCounters {
  categories: number
  templates: number
  templateVersions: number
  snippetFolders: number
  snippets: number
  snippetVersions: number
  algorithmFolders: number
  algorithms: number
  algorithmVersions: number
  algorithmReviews: number
  auditLogs: number
}

export interface AlgoLibState {
  schemaVersion: number
  categories: AlgoLibCategory[]
  templates: AlgoLibTemplate[]
  templateVersions: AlgoLibTemplateVersion[]
  snippetFolders: AlgoLibSnippetFolder[]
  snippets: AlgoLibSnippet[]
  snippetVersions: AlgoLibSnippetVersion[]
  algorithmFolders: AlgoLibAlgorithmFolder[]
  algorithms: AlgoLibAlgorithm[]
  algorithmVersions: AlgoLibAlgorithmVersion[]
  algorithmReviews: AlgoLibAlgorithmReview[]
  auditLogs: AlgoLibAuditLog[]
  counters: AlgoLibCounters
}

export interface AlgoLibActor {
  id: string
  isAdmin: boolean
  displayName: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
