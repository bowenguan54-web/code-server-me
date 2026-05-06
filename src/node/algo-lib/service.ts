import * as path from "path"
import { promises as fs } from "fs"
import { HttpCode, HttpError } from "../../common/http"
import { sanitizeString } from "../util"
import { resolveAlgoLibActor } from "./actors"
import { AlgoLibStore } from "./store"
import { rootPath } from "../constants"
import {
  AlgoLibActor,
  AlgoLibAlgorithm,
  AlgoLibAlgorithmFolder,
  AlgoLibAlgorithmReview,
  AlgoLibAlgorithmVersion,
  AlgoLibCategory,
  AlgoLibCounters,
  AlgoLibScope,
  AlgoLibSnippet,
  AlgoLibSnippetFolder,
  AlgoLibSnippetVersion,
  AlgoLibState,
  AlgoLibTemplate,
  AlgoLibTemplateVersion,
  BumpType,
  Visibility,
} from "./types"
import { bumpVersion } from "./version"

const now = (): string => new Date().toISOString()

const sanitizeSlug = (value: unknown, fallback = "component"): string => {
  const sanitized = sanitizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return sanitized || fallback
}

const visibilityToScope = (visibility: Visibility): "private" | "team" =>
  visibility === "shared" ? "team" : "private"

const scopeToVisibility = (scope: unknown, fallback: Visibility = "private"): Visibility => {
  if (scope === "team") {
    return "shared"
  }
  if (scope === "private") {
    return "private"
  }
  return fallback
}

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeString(entry))
      .filter(Boolean)
      .slice(0, 20)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => sanitizeString(entry))
      .filter(Boolean)
      .slice(0, 20)
  }

  return []
}

const sanitizeOptionalString = (value: unknown): string | undefined => {
  const sanitized = sanitizeString(value)
  return sanitized || undefined
}

const sanitizeCallName = (value: unknown): string | undefined => {
  const sanitized = sanitizeString(value)
  if (!sanitized) {
    return undefined
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sanitized)) {
    throw new HttpError("Call name must be a valid identifier (start with letter/underscore, use only letters, numbers, underscores)", HttpCode.BadRequest)
  }
  return sanitized
}

const sanitizeRequiredString = (value: unknown, fieldName: string): string => {
  const sanitized = sanitizeString(value)
  if (!sanitized) {
    throw new HttpError(`${fieldName} is required`, HttpCode.BadRequest)
  }
  return sanitized
}

const sanitizeInteger = (value: unknown, fieldName: string, fallback?: number): number => {
  if (typeof value === "undefined" || value === null || value === "") {
    if (typeof fallback !== "undefined") {
      return fallback
    }
    throw new HttpError(`${fieldName} is required`, HttpCode.BadRequest)
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new HttpError(`${fieldName} must be an integer`, HttpCode.BadRequest)
  }

  return parsed
}

const sanitizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((entry) => sanitizeString(entry)).filter(Boolean)
}

const isVisibleSnippetFolder = (folder: AlgoLibSnippetFolder, actor: AlgoLibActor): boolean => {
  return folder.visibility === "shared" || folder.ownerId === actor.id
}

const isVisibleSnippet = (snippet: AlgoLibSnippet, actor: AlgoLibActor): boolean => {
  return snippet.visibility === "shared" || snippet.ownerId === actor.id
}

const isVisibleAlgorithm = (algorithm: AlgoLibAlgorithm, actor: AlgoLibActor): boolean => {
  return actor.isAdmin || algorithm.ownerId === actor.id
}

const isVisibleAlgorithmFolder = (folder: AlgoLibAlgorithmFolder, actor: AlgoLibActor): boolean => {
  return actor.isAdmin || folder.ownerId === actor.id
}

const requireAdmin = (actor: AlgoLibActor): void => {
  if (!actor.isAdmin) {
    throw new HttpError("Administrator access is required", HttpCode.Forbidden)
  }
}

const nextId = <K extends keyof AlgoLibCounters>(state: AlgoLibState, key: K): number => {
  state.counters[key] += 1
  return state.counters[key]
}

const getTemplateOrThrow = (state: AlgoLibState, templateId: number): AlgoLibTemplate => {
  const template = state.templates.find((item) => item.id === templateId && !item.deletedAt)
  if (!template) {
    throw new HttpError("Template not found", HttpCode.NotFound)
  }
  return template
}

const getSnippetOrThrow = (state: AlgoLibState, snippetId: number): AlgoLibSnippet => {
  const snippet = state.snippets.find((item) => item.id === snippetId && !item.deletedAt)
  if (!snippet) {
    throw new HttpError("Snippet not found", HttpCode.NotFound)
  }
  return snippet
}

const getAlgorithmOrThrow = (state: AlgoLibState, algorithmId: number): AlgoLibAlgorithm => {
  const algorithm = state.algorithms.find((item) => item.id === algorithmId && !item.deletedAt)
  if (!algorithm) {
    throw new HttpError("Algorithm not found", HttpCode.NotFound)
  }
  return algorithm
}

const requireOwnedPrivateSnippetFolder = (
  state: AlgoLibState,
  actor: AlgoLibActor,
  folderId: number | undefined,
): AlgoLibSnippetFolder | undefined => {
  if (!folderId) {
    return undefined
  }

  const folder = state.snippetFolders.find((item) => item.id === folderId)
  if (!folder) {
    throw new HttpError("Snippet folder not found", HttpCode.NotFound)
  }

  if (folder.visibility === "shared") {
    requireAdmin(actor)
    return folder
  }

  if (folder.ownerId !== actor.id) {
    throw new HttpError("You do not have access to this snippet folder", HttpCode.Forbidden)
  }

  return folder
}

const requireOwnedAlgorithmFolder = (
  state: AlgoLibState,
  actor: AlgoLibActor,
  folderId: number | undefined,
): AlgoLibAlgorithmFolder | undefined => {
  if (!folderId) {
    return undefined
  }

  const folder = state.algorithmFolders.find((item) => item.id === folderId)
  if (!folder) {
    throw new HttpError("Algorithm folder not found", HttpCode.NotFound)
  }

  if (folder.ownerId !== actor.id && !actor.isAdmin) {
    throw new HttpError("You do not have access to this algorithm folder", HttpCode.Forbidden)
  }

  return folder
}

const ensureCategoryExists = (state: AlgoLibState, categoryId: number): AlgoLibCategory => {
  const category = state.categories.find((item) => item.id === categoryId && item.scope === "template")
  if (!category) {
    throw new HttpError("Category not found", HttpCode.NotFound)
  }
  return category
}

const getUnassignedCategory = (state: AlgoLibState): AlgoLibCategory => {
  const category = state.categories.find((item) => item.scope === "template" && item.name === "\u672a\u5206\u7c7b")
  if (!category) {
    throw new HttpError("Fallback category not found", HttpCode.ServerError)
  }
  return category
}

const createAuditLog = (
  state: AlgoLibState,
  actor: AlgoLibActor,
  action: string,
  resourceType: AlgoLibScope | "category" | "folder" | "review",
  resourceId: number,
  detail: Record<string, unknown>,
): void => {
  state.auditLogs.push({
    id: nextId(state, "auditLogs"),
    actorId: actor.id,
    action,
    resourceType,
    resourceId,
    detail,
    createdAt: now(),
  })
}

const templateVersionRecord = (
  state: AlgoLibState,
  template: AlgoLibTemplate,
  actor: AlgoLibActor,
  version: string,
  changeReason: string,
  changeSummary: string,
): AlgoLibTemplateVersion => ({
  id: nextId(state, "templateVersions"),
  templateId: template.id,
  version,
  content: template.content,
  example: template.example,
  paramsSchema: template.paramsSchema,
  changeReason,
  changeSummary,
  changedBy: actor.id,
  createdAt: now(),
})

const snippetVersionRecord = (
  state: AlgoLibState,
  snippet: AlgoLibSnippet,
  actor: AlgoLibActor,
  version: string,
  changeReason: string,
  changeSummary: string,
): AlgoLibSnippetVersion => ({
  id: nextId(state, "snippetVersions"),
  snippetId: snippet.id,
  version,
  content: snippet.content,
  changeReason,
  changeSummary,
  changedBy: actor.id,
  createdAt: now(),
})

const algorithmVersionRecord = (
  state: AlgoLibState,
  algorithm: AlgoLibAlgorithm,
  actor: AlgoLibActor,
  version: string,
  changeReason: string,
  changeSummary: string,
): AlgoLibAlgorithmVersion => ({
  id: nextId(state, "algorithmVersions"),
  algorithmId: algorithm.id,
  version,
  content: algorithm.content,
  inputSpec: algorithm.inputSpec,
  outputSpec: algorithm.outputSpec,
  changeReason,
  changeSummary,
  changedBy: actor.id,
  createdAt: now(),
})

export interface AlgoLibBootstrap {
  actor: AlgoLibActor
  overview: {
    templateCount: number
    sharedSnippetCount: number
    privateSnippetCount: number
    myAlgorithmCount: number
    pendingReviewCount: number
  }
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
}

export interface CategoryPayload {
  scope?: AlgoLibScope
  name?: string
  englishName?: string
  parentId?: number
  level?: number
  sortOrder?: number
  description?: string
}

export interface TemplatePayload {
  name?: string
  zhName?: string
  packageId?: string
  categoryId?: number
  difficulty?: number
  language?: string
  description?: string
  templateBody?: string
  paramsSchema?: string
  content?: string
  example?: string
  tags?: string[] | string
  bumpType?: BumpType
  changeReason?: string
  changeSummary?: string
  status?: "active" | "disabled"
}

export interface SnippetFolderPayload {
  name?: string
  visibility?: Visibility
  scope?: "private" | "team"
  parentId?: number
}

export interface SnippetPayload {
  name?: string
  zhName?: string
  folderId?: number
  visibility?: Visibility
  scope?: "private" | "team"
  language?: string
  description?: string
  body?: string
  content?: string
  tags?: string[] | string
  bumpType?: BumpType
  changeReason?: string
  changeSummary?: string
  status?: "active" | "disabled"
}

export interface AlgorithmFolderPayload {
  name?: string
  callName?: string
  parentId?: number
}

export interface AlgorithmPayload {
  name?: string
  zhName?: string
  packageId?: string
  folderId?: number
  namespace?: string
  type?: string
  description?: string
  inputSpec?: string
  outputSpec?: string
  dependencies?: string
  content?: string
  example?: string
  tags?: string[] | string
  bumpType?: BumpType
  changeReason?: string
  changeSummary?: string
}

export interface AlgorithmSubmissionPayload {
  summary?: string
  reason?: string
  type?: string
  description?: string
  inputSpec?: string
  outputSpec?: string
  dependencies?: string
}

export interface AlgorithmReviewPayload {
  decision?: "approved" | "rejected"
  reason?: string
  summary?: string
  applications?: string[]
}

export class AlgoLibService {
  private readonly algorithmsRoot = path.join(rootPath, "algorithms_root")

  public constructor(private readonly store: AlgoLibStore) {}

  private async notifyAlgoServiceReload(): Promise<void> {
    try {
      await fetch("http://127.0.0.1:8000/api/v1/algorithms/reload", { method: "POST" })
    } catch (error) {
      console.warn("Failed to reload algo service.", error)
    }
  }

  private async deploySingleFileAlgorithm(algorithm: AlgoLibAlgorithm): Promise<void> {
    const namespace = sanitizeRequiredString(algorithm.namespace || "component", "Algorithm namespace")
    const algorithmDir = path.join(this.algorithmsRoot, ...namespace.split("."), sanitizeSlug(algorithm.name, "component"))
    await fs.mkdir(algorithmDir, { recursive: true })

    const moduleFileName = `${sanitizeSlug(algorithm.name, "component")}.py`
    const sourcePath = path.join(algorithmDir, moduleFileName)
    const configPath = path.join(algorithmDir, "folder_config.json")

    await fs.writeFile(sourcePath, algorithm.content, "utf8")
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          namespace,
          type: "component",
          published: true,
          name: algorithm.name,
          zh_name: algorithm.zhName || algorithm.name,
          version: algorithm.currentVersion,
          description: algorithm.description,
          tags: algorithm.tags,
        },
        null,
        2,
      ),
      "utf8",
    )
  }

  private async deployPackageAlgorithm(algorithm: AlgoLibAlgorithm): Promise<void> {
    const packageId = sanitizeRequiredString(algorithm.packageId, "Package id")
    const packageResponse = await fetch(`http://127.0.0.1:8000/api/v1/packages/${encodeURIComponent(packageId)}`)
    const packagePayload = await packageResponse.json().catch(() => ({}))
    if (!packageResponse.ok) {
      throw new HttpError(
        packagePayload.detail || `Unable to load package: ${packageId}`,
        HttpCode.BadGateway,
      )
    }

    const packageInfo = packagePayload.package || {}
    const manifestPatch = {
      namespace: sanitizeRequiredString(algorithm.namespace || packageInfo.namespace || "component", "Algorithm namespace"),
      version: algorithm.currentVersion,
      zh_name: algorithm.zhName || algorithm.name,
      zh_description: algorithm.description,
      zh_tags: algorithm.tags,
      published: true,
      module_kind: "component",
    }

    const updateResponse = await fetch(
      `http://127.0.0.1:8000/api/v1/packages/${encodeURIComponent(packageId)}/manifest`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifestPatch),
      },
    )
    const updatePayload = await updateResponse.json().catch(() => ({}))
    if (!updateResponse.ok) {
      throw new HttpError(
        updatePayload.detail || `Unable to publish package: ${packageId}`,
        HttpCode.BadGateway,
      )
    }
  }

  private async deployAlgorithmRuntime(algorithm: AlgoLibAlgorithm): Promise<void> {
    await fs.mkdir(this.algorithmsRoot, { recursive: true })
    if (algorithm.packageId) {
      await this.deployPackageAlgorithm(algorithm)
    } else {
      await this.deploySingleFileAlgorithm(algorithm)
    }
    await this.notifyAlgoServiceReload()
  }

  public async getBootstrap(actor: AlgoLibActor): Promise<AlgoLibBootstrap> {
    const state = await this.store.read()
    const templates = state.templates.filter((item) => !item.deletedAt)
    const visibleSnippets = state.snippets.filter((item) => !item.deletedAt && isVisibleSnippet(item, actor))
    const visibleSnippetIds = new Set(visibleSnippets.map((item) => item.id))
    const visibleAlgorithms = state.algorithms.filter((item) => !item.deletedAt && isVisibleAlgorithm(item, actor))
    const visibleAlgorithmIds = new Set(visibleAlgorithms.map((item) => item.id))
    const categoryMap = new Map(state.categories.map((item) => [item.id, item]))
    const folderMap = new Map(state.algorithmFolders.map((item) => [item.id, item]))

    return {
      actor,
      overview: {
        templateCount: templates.length,
        sharedSnippetCount: visibleSnippets.filter((item) => item.visibility === "shared").length,
        privateSnippetCount: visibleSnippets.filter((item) => item.visibility === "private").length,
        myAlgorithmCount: visibleAlgorithms.filter((item) => item.ownerId === actor.id).length,
        pendingReviewCount: actor.isAdmin
          ? state.algorithms.filter((item) => !item.deletedAt && item.status === "reviewing").length
          : visibleAlgorithms.filter((item) => item.status === "reviewing").length,
      },
      categories: state.categories
        .filter((item) => item.scope === "template")
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
      templates: templates.map((item) => ({
        ...item,
        zhName: item.zhName || item.name,
        packageId: item.packageId,
        templateBody: item.templateBody || item.content,
        paramsSchema: item.paramsSchema || item.example || "",
      })),
      templateVersions: state.templateVersions.filter((item) =>
        templates.some((template) => template.id === item.templateId),
      ),
      snippetFolders: state.snippetFolders.filter((item) => isVisibleSnippetFolder(item, actor)),
      snippets: visibleSnippets.map((item) => ({
        ...item,
        zhName: item.zhName || item.name,
        body: item.body || item.content,
        scope: item.scope || visibilityToScope(item.visibility),
      })),
      snippetVersions: state.snippetVersions.filter((item) => visibleSnippetIds.has(item.snippetId)),
      algorithmFolders: state.algorithmFolders.filter((item) => isVisibleAlgorithmFolder(item, actor)),
      algorithms: visibleAlgorithms.map((item) => {
        const folder = item.folderId ? folderMap.get(item.folderId) : undefined
        const fallbackNamespace = folder?.callName || categoryMap.get(item.folderId || 0)?.englishName || "component"
        const namespace = item.namespace || sanitizeSlug(fallbackNamespace, "component")
        const functionName = sanitizeSlug(item.name, "run")
        return {
          ...item,
          zhName: item.zhName || item.name,
          packageId: item.packageId,
          namespace,
          apiPath: item.apiPath || `/api/v1/invoke/alg.${namespace}.${functionName}`,
          status: item.status || "draft",
        }
      }),
      algorithmVersions: state.algorithmVersions.filter((item) => visibleAlgorithmIds.has(item.algorithmId)),
      algorithmReviews: state.algorithmReviews.filter(
        (item) => actor.isAdmin || visibleAlgorithmIds.has(item.algorithmId),
      ),
    }
  }

  public async createCategory(actor: AlgoLibActor, payload: CategoryPayload): Promise<AlgoLibCategory> {
    requireAdmin(actor)

    return this.store.write((state) => {
      const timestamp = now()
      const category: AlgoLibCategory = {
        id: nextId(state, "categories"),
        scope: payload.scope || "template",
        name: sanitizeRequiredString(payload.name, "Category name"),
        englishName: sanitizeOptionalString(payload.englishName),
        parentId: payload.parentId,
        level: sanitizeInteger(payload.level, "Category level", 1),
        sortOrder: sanitizeInteger(payload.sortOrder, "Category sort order", state.categories.length + 1),
        description: sanitizeOptionalString(payload.description),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.categories.push(category)
      createAuditLog(state, actor, "category.create", "category", category.id, { name: category.name })
      return category
    })
  }

  public async updateCategory(
    actor: AlgoLibActor,
    categoryId: number,
    payload: CategoryPayload,
  ): Promise<AlgoLibCategory> {
    requireAdmin(actor)

    return this.store.write((state) => {
      const category = state.categories.find((item) => item.id === categoryId)
      if (!category) {
        throw new HttpError("Category not found", HttpCode.NotFound)
      }

      category.name = sanitizeRequiredString(payload.name ?? category.name, "Category name")
      category.englishName = sanitizeOptionalString(payload.englishName ?? category.englishName)
      category.level = sanitizeInteger(payload.level ?? category.level, "Category level", category.level)
      category.sortOrder = sanitizeInteger(
        payload.sortOrder ?? category.sortOrder,
        "Category sort order",
        category.sortOrder,
      )
      category.description = sanitizeOptionalString(payload.description ?? category.description)
      category.parentId = typeof payload.parentId === "number" ? payload.parentId : category.parentId
      category.updatedAt = now()

      createAuditLog(state, actor, "category.update", "category", category.id, { name: category.name })
      return category
    })
  }

  public async deleteCategory(actor: AlgoLibActor, categoryId: number): Promise<void> {
    requireAdmin(actor)

    await this.store.write((state) => {
      const categoryIndex = state.categories.findIndex((item) => item.id === categoryId)
      if (categoryIndex === -1) {
        throw new HttpError("Category not found", HttpCode.NotFound)
      }

      const category = state.categories[categoryIndex]
      const fallbackCategory = getUnassignedCategory(state)
      if (category.id === fallbackCategory.id) {
        throw new HttpError("Fallback category cannot be deleted", HttpCode.BadRequest)
      }

      state.templates.forEach((item) => {
        if (item.categoryId === categoryId && !item.deletedAt) {
          item.categoryId = fallbackCategory.id
          item.updatedAt = now()
          item.updatedBy = actor.id
        }
      })

      state.categories.forEach((item) => {
        if (item.parentId === categoryId) {
          item.parentId = undefined
          item.level = 1
          item.updatedAt = now()
        }
      })

      state.categories.splice(categoryIndex, 1)
      createAuditLog(state, actor, "category.delete", "category", category.id, { name: category.name })
    })
  }

  public async createTemplate(actor: AlgoLibActor, payload: TemplatePayload): Promise<AlgoLibTemplate> {
    requireAdmin(actor)

    return this.store.write((state) => {
      ensureCategoryExists(state, sanitizeInteger(payload.categoryId, "Category"))
      const timestamp = now()
      const template: AlgoLibTemplate = {
        id: nextId(state, "templates"),
        name: sanitizeRequiredString(payload.name, "Template name"),
        zhName: sanitizeOptionalString(payload.zhName) || sanitizeRequiredString(payload.name, "Template name"),
        packageId: sanitizeOptionalString(payload.packageId),
        categoryId: sanitizeInteger(payload.categoryId, "Category"),
        difficulty: sanitizeInteger(payload.difficulty, "Difficulty", 1),
        language: sanitizeRequiredString(payload.language, "Language"),
        description: sanitizeRequiredString(payload.description, "Description"),
        templateBody: sanitizeRequiredString(payload.templateBody ?? payload.content, "Template content"),
        paramsSchema: sanitizeRequiredString(payload.paramsSchema ?? payload.example, "Parameter schema"),
        content: sanitizeRequiredString(payload.templateBody ?? payload.content, "Template content"),
        example: sanitizeRequiredString(payload.example ?? payload.paramsSchema, "Parameter schema"),
        tags: normalizeTags(payload.tags),
        currentVersion: "1.0.0",
        status: payload.status || "active",
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.templates.push(template)
      state.templateVersions.push(
        templateVersionRecord(
          state,
          template,
          actor,
          template.currentVersion,
          sanitizeRequiredString(payload.changeReason || "Initial version", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Created template", "Change summary"),
        ),
      )
      createAuditLog(state, actor, "template.create", "template", template.id, { name: template.name })
      return template
    })
  }

  public async updateTemplate(
    actor: AlgoLibActor,
    templateId: number,
    payload: TemplatePayload,
  ): Promise<AlgoLibTemplate> {
    requireAdmin(actor)

    return this.store.write((state) => {
      const template = getTemplateOrThrow(state, templateId)
      ensureCategoryExists(
        state,
        sanitizeInteger(payload.categoryId ?? template.categoryId, "Category", template.categoryId),
      )

      template.name = sanitizeRequiredString(payload.name ?? template.name, "Template name")
      template.zhName = sanitizeOptionalString(payload.zhName ?? template.zhName ?? template.name) || template.name
      template.packageId = sanitizeOptionalString(payload.packageId ?? template.packageId)
      template.categoryId = sanitizeInteger(payload.categoryId ?? template.categoryId, "Category", template.categoryId)
      template.difficulty = sanitizeInteger(
        payload.difficulty ?? template.difficulty,
        "Difficulty",
        template.difficulty,
      )
      template.language = sanitizeRequiredString(payload.language ?? template.language, "Language")
      template.description = sanitizeRequiredString(payload.description ?? template.description, "Description")
      template.templateBody = sanitizeRequiredString(
        payload.templateBody ?? payload.content ?? template.templateBody ?? template.content,
        "Template content",
      )
      template.content = template.templateBody
      template.paramsSchema = sanitizeRequiredString(
        payload.paramsSchema ?? template.paramsSchema ?? payload.example ?? template.example,
        "Parameter schema",
      )
      template.example = sanitizeRequiredString(
        payload.example ?? payload.paramsSchema ?? template.example ?? template.paramsSchema,
        "Parameter schema",
      )
      template.tags = normalizeTags(payload.tags ?? template.tags)
      template.status = payload.status || template.status
      template.updatedBy = actor.id
      template.updatedAt = now()

      const version = bumpVersion(template.currentVersion, payload.bumpType || "patch")
      template.currentVersion = version
      state.templateVersions.push(
        templateVersionRecord(
          state,
          template,
          actor,
          version,
          sanitizeRequiredString(payload.changeReason || "Template updated", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Updated template fields", "Change summary"),
        ),
      )

      createAuditLog(state, actor, "template.update", "template", template.id, { version })
      return template
    })
  }

  public async deleteTemplate(actor: AlgoLibActor, templateId: number): Promise<void> {
    requireAdmin(actor)

    await this.store.write((state) => {
      const template = getTemplateOrThrow(state, templateId)
      template.deletedAt = now()
      template.status = "disabled"
      template.updatedAt = now()
      template.updatedBy = actor.id
      createAuditLog(state, actor, "template.delete", "template", template.id, { name: template.name })
    })
  }

  public async restoreTemplateVersion(
    actor: AlgoLibActor,
    templateId: number,
    version: string,
    reason: string,
    summary: string,
  ): Promise<AlgoLibTemplate> {
    requireAdmin(actor)

    return this.store.write((state) => {
      const template = getTemplateOrThrow(state, templateId)
      const historicalVersion = state.templateVersions.find(
        (item) => item.templateId === templateId && item.version === version,
      )
      if (!historicalVersion) {
        throw new HttpError("Template version not found", HttpCode.NotFound)
      }

      template.content = historicalVersion.content
      template.templateBody = historicalVersion.content
      template.paramsSchema = historicalVersion.paramsSchema || template.paramsSchema
      template.example = historicalVersion.example
      template.updatedAt = now()
      template.updatedBy = actor.id
      template.currentVersion = bumpVersion(template.currentVersion, "patch")

      state.templateVersions.push(
        templateVersionRecord(
          state,
          template,
          actor,
          template.currentVersion,
          sanitizeRequiredString(reason, "Change reason"),
          sanitizeRequiredString(summary, "Change summary"),
        ),
      )
      createAuditLog(state, actor, "template.restore", "template", template.id, { restoredFrom: version })
      return template
    })
  }

  public async publishTemplateAsAlgorithm(
    actor: AlgoLibActor,
    templateId: number,
    payload: {
      name?: string
      zhName?: string
      packageId?: string
      namespace?: string
      folderId?: number
      description?: string
    } = {},
  ): Promise<AlgoLibAlgorithm> {
    return this.store.write((state) => {
      const template = getTemplateOrThrow(state, templateId)
      const folder = requireOwnedAlgorithmFolder(state, actor, payload.folderId)
      const category = state.categories.find((item) => item.id === template.categoryId)
      const namespace =
        sanitizeOptionalString(payload.namespace) ||
        sanitizeSlug(folder?.callName || category?.englishName || category?.name || "template_component", "template_component")
      const name = sanitizeRequiredString(payload.name ?? template.name, "Component name")
      const timestamp = now()
      const algorithm: AlgoLibAlgorithm = {
        id: nextId(state, "algorithms"),
        name,
        zhName: sanitizeOptionalString(payload.zhName) || template.zhName || template.name,
        ownerId: actor.id,
        folderId: folder?.id,
        packageId: sanitizeOptionalString(payload.packageId) || template.packageId,
        namespace,
        type: category?.name || "算法组件",
        description: sanitizeRequiredString(payload.description ?? template.description, "Description"),
        inputSpec: template.paramsSchema || "请补充输入参数说明",
        outputSpec: "请补充输出说明",
        dependencies: undefined,
        content: template.templateBody || template.content,
        example: template.example,
        tags: [...template.tags],
        currentVersion: "1.0.0",
        status: "draft",
        templateSourceId: template.id,
        linkedApplications: [],
        apiPath: `/api/v1/invoke/alg.${namespace}.${sanitizeSlug(name, "run")}`,
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.algorithms.push(algorithm)
      state.algorithmVersions.push(
        algorithmVersionRecord(
          state,
          algorithm,
          actor,
          algorithm.currentVersion,
          "Created from template",
          `Published from template #${template.id}`,
        ),
      )
      createAuditLog(state, actor, "template.publish", "algorithm", algorithm.id, {
        templateId: template.id,
        name: algorithm.name,
      })
      return algorithm
    })
  }

  public async createSnippetFolder(actor: AlgoLibActor, payload: SnippetFolderPayload): Promise<AlgoLibSnippetFolder> {
    const visibility = payload.visibility || scopeToVisibility(payload.scope, "private")
    if (visibility === "shared") {
      requireAdmin(actor)
    }

    return this.store.write((state) => {
      const timestamp = now()
      const folder: AlgoLibSnippetFolder = {
        id: nextId(state, "snippetFolders"),
        name: sanitizeRequiredString(payload.name, "Folder name"),
        visibility,
        ownerId: visibility === "private" ? actor.id : undefined,
        parentId: payload.parentId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.snippetFolders.push(folder)
      createAuditLog(state, actor, "snippet-folder.create", "folder", folder.id, { name: folder.name, visibility })
      return folder
    })
  }

  public async updateSnippetFolder(
    actor: AlgoLibActor,
    folderId: number,
    payload: SnippetFolderPayload,
  ): Promise<AlgoLibSnippetFolder> {
    return this.store.write((state) => {
      const folder = state.snippetFolders.find((item) => item.id === folderId)
      if (!folder) {
        throw new HttpError("Snippet folder not found", HttpCode.NotFound)
      }

      if (folder.visibility === "shared") {
        requireAdmin(actor)
      } else if (folder.ownerId !== actor.id) {
        throw new HttpError("You do not have access to this snippet folder", HttpCode.Forbidden)
      }

      folder.name = sanitizeRequiredString(payload.name ?? folder.name, "Folder name")
      folder.updatedAt = now()
      createAuditLog(state, actor, "snippet-folder.update", "folder", folder.id, { name: folder.name })
      return folder
    })
  }

  public async deleteSnippetFolder(actor: AlgoLibActor, folderId: number): Promise<void> {
    await this.store.write((state) => {
      const folderIndex = state.snippetFolders.findIndex((item) => item.id === folderId)
      if (folderIndex === -1) {
        throw new HttpError("Snippet folder not found", HttpCode.NotFound)
      }

      const folder = state.snippetFolders[folderIndex]
      if (folder.visibility === "shared") {
        requireAdmin(actor)
      } else if (folder.ownerId !== actor.id) {
        throw new HttpError("You do not have access to this snippet folder", HttpCode.Forbidden)
      }

      const inUse = state.snippets.some((item) => item.folderId === folderId && !item.deletedAt)
      if (inUse) {
        throw new HttpError("Snippet folder is still referenced by snippets", HttpCode.BadRequest)
      }

      state.snippetFolders.splice(folderIndex, 1)
      createAuditLog(state, actor, "snippet-folder.delete", "folder", folderId, {})
    })
  }

  public async createSnippet(actor: AlgoLibActor, payload: SnippetPayload): Promise<AlgoLibSnippet> {
    const visibility = payload.visibility || "private"
    if (visibility === "shared") {
      requireAdmin(actor)
    }

    return this.store.write((state) => {
      const folder = requireOwnedPrivateSnippetFolder(state, actor, payload.folderId)
      if (folder && folder.visibility !== visibility) {
        throw new HttpError("Snippet visibility must match the selected folder visibility", HttpCode.BadRequest)
      }

      const timestamp = now()
      const snippet: AlgoLibSnippet = {
        id: nextId(state, "snippets"),
        name: sanitizeRequiredString(payload.name, "Snippet name"),
        zhName: sanitizeOptionalString(payload.zhName) || sanitizeRequiredString(payload.name, "Snippet name"),
        folderId: folder?.id,
        visibility,
        scope: visibilityToScope(visibility),
        ownerId: visibility === "private" ? actor.id : undefined,
        language: sanitizeRequiredString(payload.language, "Language"),
        description: sanitizeRequiredString(payload.description, "Description"),
        body: sanitizeRequiredString(payload.body ?? payload.content, "Snippet content"),
        content: sanitizeRequiredString(payload.body ?? payload.content, "Snippet content"),
        tags: normalizeTags(payload.tags),
        currentVersion: "1.0.0",
        status: payload.status || "active",
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.snippets.push(snippet)
      state.snippetVersions.push(
        snippetVersionRecord(
          state,
          snippet,
          actor,
          snippet.currentVersion,
          sanitizeRequiredString(payload.changeReason || "Initial version", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Created snippet", "Change summary"),
        ),
      )
      createAuditLog(state, actor, "snippet.create", "snippet", snippet.id, { name: snippet.name, visibility })
      return snippet
    })
  }

  public async updateSnippet(actor: AlgoLibActor, snippetId: number, payload: SnippetPayload): Promise<AlgoLibSnippet> {
    return this.store.write((state) => {
      const snippet = getSnippetOrThrow(state, snippetId)
      if (snippet.visibility === "shared") {
        requireAdmin(actor)
      } else if (snippet.ownerId !== actor.id) {
        throw new HttpError("You do not have access to this snippet", HttpCode.Forbidden)
      }

      const nextVisibility = payload.visibility || scopeToVisibility(payload.scope, snippet.visibility)
      if (nextVisibility === "shared") {
        requireAdmin(actor)
      }

      const folder = requireOwnedPrivateSnippetFolder(state, actor, payload.folderId ?? snippet.folderId)
      if (folder && folder.visibility !== nextVisibility) {
        throw new HttpError("Snippet visibility must match the selected folder visibility", HttpCode.BadRequest)
      }

      snippet.name = sanitizeRequiredString(payload.name ?? snippet.name, "Snippet name")
      snippet.zhName = sanitizeOptionalString(payload.zhName ?? snippet.zhName ?? snippet.name) || snippet.name
      snippet.folderId = folder?.id
      snippet.visibility = nextVisibility
      snippet.scope = visibilityToScope(nextVisibility)
      snippet.ownerId = nextVisibility === "private" ? snippet.ownerId || actor.id : undefined
      snippet.language = sanitizeRequiredString(payload.language ?? snippet.language, "Language")
      snippet.description = sanitizeRequiredString(payload.description ?? snippet.description, "Description")
      snippet.body = sanitizeRequiredString(payload.body ?? payload.content ?? snippet.body ?? snippet.content, "Snippet content")
      snippet.content = snippet.body
      snippet.tags = normalizeTags(payload.tags ?? snippet.tags)
      snippet.status = payload.status || snippet.status
      snippet.updatedBy = actor.id
      snippet.updatedAt = now()
      snippet.currentVersion = bumpVersion(snippet.currentVersion, payload.bumpType || "patch")

      state.snippetVersions.push(
        snippetVersionRecord(
          state,
          snippet,
          actor,
          snippet.currentVersion,
          sanitizeRequiredString(payload.changeReason || "Snippet updated", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Updated snippet fields", "Change summary"),
        ),
      )
      createAuditLog(state, actor, "snippet.update", "snippet", snippet.id, { version: snippet.currentVersion })
      return snippet
    })
  }

  public async deleteSnippet(actor: AlgoLibActor, snippetId: number): Promise<void> {
    await this.store.write((state) => {
      const snippet = getSnippetOrThrow(state, snippetId)
      if (snippet.visibility === "shared") {
        requireAdmin(actor)
      } else if (snippet.ownerId !== actor.id) {
        throw new HttpError("You do not have access to this snippet", HttpCode.Forbidden)
      }

      snippet.deletedAt = now()
      snippet.status = "disabled"
      snippet.updatedAt = now()
      snippet.updatedBy = actor.id
      createAuditLog(state, actor, "snippet.delete", "snippet", snippet.id, { name: snippet.name })
    })
  }

  public async restoreSnippetVersion(
    actor: AlgoLibActor,
    snippetId: number,
    version: string,
    reason: string,
    summary: string,
  ): Promise<AlgoLibSnippet> {
    return this.store.write((state) => {
      const snippet = getSnippetOrThrow(state, snippetId)
      if (snippet.visibility === "shared") {
        requireAdmin(actor)
      } else if (snippet.ownerId !== actor.id) {
        throw new HttpError("You do not have access to this snippet", HttpCode.Forbidden)
      }

      const historicalVersion = state.snippetVersions.find(
        (item) => item.snippetId === snippetId && item.version === version,
      )
      if (!historicalVersion) {
        throw new HttpError("Snippet version not found", HttpCode.NotFound)
      }

      snippet.content = historicalVersion.content
      snippet.body = historicalVersion.content
      snippet.updatedAt = now()
      snippet.updatedBy = actor.id
      snippet.currentVersion = bumpVersion(snippet.currentVersion, "patch")

      state.snippetVersions.push(
        snippetVersionRecord(
          state,
          snippet,
          actor,
          snippet.currentVersion,
          sanitizeRequiredString(reason, "Change reason"),
          sanitizeRequiredString(summary, "Change summary"),
        ),
      )
      createAuditLog(state, actor, "snippet.restore", "snippet", snippet.id, { restoredFrom: version })
      return snippet
    })
  }

  public async createAlgorithmFolder(
    actor: AlgoLibActor,
    payload: AlgorithmFolderPayload,
  ): Promise<AlgoLibAlgorithmFolder> {
    return this.store.write((state) => {
      const timestamp = now()
      const folder: AlgoLibAlgorithmFolder = {
        id: nextId(state, "algorithmFolders"),
        name: sanitizeRequiredString(payload.name, "Folder name"),
        callName: sanitizeCallName(payload.callName),
        ownerId: actor.id,
        parentId: payload.parentId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.algorithmFolders.push(folder)
      createAuditLog(state, actor, "algorithm-folder.create", "folder", folder.id, { name: folder.name })
      return folder
    })
  }

  public async updateAlgorithmFolder(
    actor: AlgoLibActor,
    folderId: number,
    payload: AlgorithmFolderPayload,
  ): Promise<AlgoLibAlgorithmFolder> {
    return this.store.write((state) => {
      const folder = state.algorithmFolders.find((item) => item.id === folderId)
      if (!folder) {
        throw new HttpError("Algorithm folder not found", HttpCode.NotFound)
      }
      if (folder.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm folder", HttpCode.Forbidden)
      }

      folder.name = sanitizeRequiredString(payload.name ?? folder.name, "Folder name")
      folder.callName = typeof payload.callName !== "undefined" ? sanitizeCallName(payload.callName) : folder.callName
      folder.updatedAt = now()
      createAuditLog(state, actor, "algorithm-folder.update", "folder", folder.id, { name: folder.name })
      return folder
    })
  }

  public async deleteAlgorithmFolder(actor: AlgoLibActor, folderId: number): Promise<void> {
    await this.store.write((state) => {
      const folderIndex = state.algorithmFolders.findIndex((item) => item.id === folderId)
      if (folderIndex === -1) {
        throw new HttpError("Algorithm folder not found", HttpCode.NotFound)
      }

      const folder = state.algorithmFolders[folderIndex]
      if (folder.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm folder", HttpCode.Forbidden)
      }

      const inUse = state.algorithms.some((item) => item.folderId === folderId && !item.deletedAt)
      if (inUse) {
        throw new HttpError("Algorithm folder is still referenced by algorithms", HttpCode.BadRequest)
      }

      state.algorithmFolders.splice(folderIndex, 1)
      createAuditLog(state, actor, "algorithm-folder.delete", "folder", folderId, {})
    })
  }

  public async createAlgorithm(actor: AlgoLibActor, payload: AlgorithmPayload): Promise<AlgoLibAlgorithm> {
    return this.store.write((state) => {
      const folder = requireOwnedAlgorithmFolder(state, actor, payload.folderId)
      const timestamp = now()
      const algorithm: AlgoLibAlgorithm = {
        id: nextId(state, "algorithms"),
        name: sanitizeRequiredString(payload.name, "Algorithm name"),
        zhName: sanitizeOptionalString(payload.zhName) || sanitizeRequiredString(payload.name, "Algorithm name"),
        ownerId: actor.id,
        folderId: folder?.id,
        packageId: sanitizeOptionalString(payload.packageId),
        namespace: sanitizeOptionalString(payload.namespace) || sanitizeSlug(folder?.callName || payload.type, "component"),
        type: sanitizeRequiredString(payload.type, "Algorithm type"),
        description: sanitizeRequiredString(payload.description, "Description"),
        inputSpec: sanitizeRequiredString(payload.inputSpec, "Input specification"),
        outputSpec: sanitizeRequiredString(payload.outputSpec, "Output specification"),
        dependencies: sanitizeOptionalString(payload.dependencies),
        content: sanitizeRequiredString(payload.content, "Algorithm content"),
        example: sanitizeOptionalString(payload.example),
        tags: normalizeTags(payload.tags),
        currentVersion: "1.0.0",
        status: "draft",
        linkedApplications: [],
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state.algorithms.push(algorithm)
      state.algorithmVersions.push(
        algorithmVersionRecord(
          state,
          algorithm,
          actor,
          algorithm.currentVersion,
          sanitizeRequiredString(payload.changeReason || "Initial version", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Created algorithm", "Change summary"),
        ),
      )
      createAuditLog(state, actor, "algorithm.create", "algorithm", algorithm.id, { name: algorithm.name })
      return algorithm
    })
  }

  public async updateAlgorithm(
    actor: AlgoLibActor,
    algorithmId: number,
    payload: AlgorithmPayload,
  ): Promise<AlgoLibAlgorithm> {
    return this.store.write((state) => {
      const algorithm = getAlgorithmOrThrow(state, algorithmId)
      if (algorithm.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm", HttpCode.Forbidden)
      }

      const folder = requireOwnedAlgorithmFolder(state, actor, payload.folderId ?? algorithm.folderId)
      algorithm.name = sanitizeRequiredString(payload.name ?? algorithm.name, "Algorithm name")
      algorithm.zhName = sanitizeOptionalString(payload.zhName ?? algorithm.zhName ?? algorithm.name) || algorithm.name
      algorithm.packageId = sanitizeOptionalString(payload.packageId ?? algorithm.packageId)
      algorithm.folderId = folder?.id
      algorithm.namespace =
        sanitizeOptionalString(payload.namespace ?? algorithm.namespace) ||
        sanitizeSlug(folder?.callName || algorithm.type, "component")
      algorithm.type = sanitizeRequiredString(payload.type ?? algorithm.type, "Algorithm type")
      algorithm.description = sanitizeRequiredString(payload.description ?? algorithm.description, "Description")
      algorithm.inputSpec = sanitizeRequiredString(payload.inputSpec ?? algorithm.inputSpec, "Input specification")
      algorithm.outputSpec = sanitizeRequiredString(payload.outputSpec ?? algorithm.outputSpec, "Output specification")
      algorithm.dependencies = sanitizeOptionalString(payload.dependencies ?? algorithm.dependencies)
      algorithm.content = sanitizeRequiredString(payload.content ?? algorithm.content, "Algorithm content")
      algorithm.example = sanitizeOptionalString(payload.example ?? algorithm.example)
      algorithm.tags = normalizeTags(payload.tags ?? algorithm.tags)
      algorithm.updatedBy = actor.id
      algorithm.updatedAt = now()
      algorithm.currentVersion = bumpVersion(algorithm.currentVersion, payload.bumpType || "patch")
      algorithm.status = "draft"
      algorithm.linkedApplications = []
      algorithm.packageFile = undefined
      algorithm.apiPath = `/api/v1/invoke/alg.${algorithm.namespace}.${sanitizeSlug(algorithm.name, "run")}`
      algorithm.reviewerId = undefined
      algorithm.reviewComment = undefined
      algorithm.approvedAt = undefined
      algorithm.rejectedAt = undefined

      state.algorithmVersions.push(
        algorithmVersionRecord(
          state,
          algorithm,
          actor,
          algorithm.currentVersion,
          sanitizeRequiredString(payload.changeReason || "Algorithm updated", "Change reason"),
          sanitizeRequiredString(payload.changeSummary || "Updated algorithm fields", "Change summary"),
        ),
      )
      createAuditLog(state, actor, "algorithm.update", "algorithm", algorithm.id, { version: algorithm.currentVersion })
      return algorithm
    })
  }

  public async deleteAlgorithm(actor: AlgoLibActor, algorithmId: number): Promise<void> {
    await this.store.write((state) => {
      const algorithm = getAlgorithmOrThrow(state, algorithmId)
      if (algorithm.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm", HttpCode.Forbidden)
      }

      algorithm.deletedAt = now()
      algorithm.updatedAt = now()
      algorithm.updatedBy = actor.id
      createAuditLog(state, actor, "algorithm.delete", "algorithm", algorithm.id, { name: algorithm.name })
    })
  }

  public async restoreAlgorithmVersion(
    actor: AlgoLibActor,
    algorithmId: number,
    version: string,
    reason: string,
    summary: string,
  ): Promise<AlgoLibAlgorithm> {
    return this.store.write((state) => {
      const algorithm = getAlgorithmOrThrow(state, algorithmId)
      if (algorithm.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm", HttpCode.Forbidden)
      }

      const historicalVersion = state.algorithmVersions.find(
        (item) => item.algorithmId === algorithmId && item.version === version,
      )
      if (!historicalVersion) {
        throw new HttpError("Algorithm version not found", HttpCode.NotFound)
      }

      algorithm.content = historicalVersion.content
      algorithm.inputSpec = historicalVersion.inputSpec
      algorithm.outputSpec = historicalVersion.outputSpec
      algorithm.updatedAt = now()
      algorithm.updatedBy = actor.id
      algorithm.currentVersion = bumpVersion(algorithm.currentVersion, "patch")
      algorithm.status = "draft"
      algorithm.linkedApplications = []
      algorithm.packageFile = undefined
      algorithm.apiPath = `/api/v1/invoke/alg.${algorithm.namespace || "component"}.${sanitizeSlug(algorithm.name, "run")}`

      state.algorithmVersions.push(
        algorithmVersionRecord(
          state,
          algorithm,
          actor,
          algorithm.currentVersion,
          sanitizeRequiredString(reason, "Change reason"),
          sanitizeRequiredString(summary, "Change summary"),
        ),
      )
      createAuditLog(state, actor, "algorithm.restore", "algorithm", algorithm.id, { restoredFrom: version })
      return algorithm
    })
  }

  public async submitAlgorithm(
    actor: AlgoLibActor,
    algorithmId: number,
    payload: AlgorithmSubmissionPayload,
  ): Promise<AlgoLibAlgorithm> {
    let packagePayload: Record<string, unknown> | undefined

    const algorithm = await this.store.write(async (state) => {
      const item = getAlgorithmOrThrow(state, algorithmId)
      if (item.ownerId !== actor.id && !actor.isAdmin) {
        throw new HttpError("You do not have access to this algorithm", HttpCode.Forbidden)
      }

      item.type = sanitizeRequiredString(payload.type ?? item.type, "Algorithm type")
      item.description = sanitizeRequiredString(payload.description ?? item.description, "Description")
      item.inputSpec = sanitizeRequiredString(payload.inputSpec ?? item.inputSpec, "Input specification")
      item.outputSpec = sanitizeRequiredString(payload.outputSpec ?? item.outputSpec, "Output specification")
      item.dependencies = sanitizeOptionalString(payload.dependencies ?? item.dependencies)
      item.status = "reviewing"
      item.submittedAt = now()
      item.updatedAt = now()
      item.updatedBy = actor.id
      item.reviewComment = sanitizeOptionalString(payload.summary)
      item.reviewerId = undefined
      item.approvedAt = undefined
      item.rejectedAt = undefined
      item.linkedApplications = []

      packagePayload = {
        algorithmId: item.id,
        name: item.name,
        version: item.currentVersion,
        type: item.type,
        description: item.description,
        inputSpec: item.inputSpec,
        outputSpec: item.outputSpec,
        dependencies: item.dependencies,
        tags: item.tags,
        content: item.content,
        submittedBy: actor.id,
        submittedAt: item.submittedAt,
        summary: sanitizeOptionalString(payload.summary),
        reason: sanitizeOptionalString(payload.reason),
      }

      state.algorithmReviews.push({
        id: nextId(state, "algorithmReviews"),
        algorithmId: item.id,
        decision: "submitted",
        actorId: actor.id,
        reason: sanitizeRequiredString(payload.reason || "Submitted for review", "Submission reason"),
        summary: sanitizeRequiredString(payload.summary || "Ready for administrator review", "Submission summary"),
        dependencies: item.dependencies,
        applications: [],
        createdAt: now(),
      })
      createAuditLog(state, actor, "algorithm.submit", "review", item.id, { version: item.currentVersion })
      return item
    })

    const fileName = `algorithm-${algorithm.id}-v${algorithm.currentVersion.replace(/\./g, "_")}.json`
    const fullPath = await this.store.writePackageArtifact(fileName, packagePayload)

    return this.store.write((state) => {
      const refreshed = getAlgorithmOrThrow(state, algorithm.id)
      refreshed.packageFile = path.basename(fullPath)
      const latestReview = [...state.algorithmReviews].reverse().find((item) => item.algorithmId === algorithm.id)
      if (latestReview) {
        latestReview.packageFile = path.basename(fullPath)
      }
      return refreshed
    })
  }

  public async reviewAlgorithm(
    actor: AlgoLibActor,
    algorithmId: number,
    payload: AlgorithmReviewPayload,
  ): Promise<AlgoLibAlgorithm> {
    requireAdmin(actor)

    return this.store.write(async (state) => {
      const algorithm = getAlgorithmOrThrow(state, algorithmId)
      if (algorithm.status !== "reviewing") {
        throw new HttpError("Only reviewing algorithms can be reviewed", HttpCode.BadRequest)
      }

      const decision = payload.decision
      if (decision !== "approved" && decision !== "rejected") {
        throw new HttpError("A valid review decision is required", HttpCode.BadRequest)
      }

      const reviewReason = sanitizeRequiredString(payload.reason, "Review reason")
      const reviewSummary = sanitizeRequiredString(payload.summary, "Review summary")
      const applications = sanitizeStringList(payload.applications)

      if (decision === "approved") {
        await this.deployAlgorithmRuntime(algorithm)
      }

      algorithm.status = decision === "approved" ? "published" : "deprecated"
      algorithm.reviewerId = actor.id
      algorithm.reviewComment = reviewSummary
      algorithm.updatedBy = actor.id
      algorithm.updatedAt = now()
      algorithm.linkedApplications = decision === "approved" ? applications : []
      algorithm.approvedAt = decision === "approved" ? now() : undefined
      algorithm.rejectedAt = decision === "rejected" ? now() : undefined

      state.algorithmReviews.push({
        id: nextId(state, "algorithmReviews"),
        algorithmId: algorithm.id,
        decision,
        actorId: actor.id,
        reason: reviewReason,
        summary: reviewSummary,
        dependencies: algorithm.dependencies,
        applications,
        packageFile: algorithm.packageFile,
        createdAt: now(),
      })
      createAuditLog(state, actor, "algorithm.review", "review", algorithm.id, { decision, applications })
      return algorithm
    })
  }
}

export const createAlgoLibService = (userDataDir: string): AlgoLibService => {
  return new AlgoLibService(new AlgoLibStore(userDataDir))
}

export { resolveAlgoLibActor }
