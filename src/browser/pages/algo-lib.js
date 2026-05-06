;(function () {
  const routePrefix = location.pathname.startsWith("/vscode/") ? "/vscode" : ""
  const apiBase = `${routePrefix}/api/algo-lib`
  const isEmbedded = new URLSearchParams(location.search).get("embed") === "1"
  const staticBase = document.body.getAttribute("data-static-base") || ""

  const texts = {
    unknown: "未知用户",
    administrator: "系统管理员",
    user: "普通用户",
    noDescription: "暂无说明",
    noVersions: "暂无版本记录",
    noReviews: "暂无审核记录",
    system: "系统",
    unassigned: "未分配",
    newTemplate: "新建模板",
    newSnippet: "新建片段",
    newAlgorithm: "新建组件",
    restore: "恢复版本",
    viewDiff: "查看差异",
    categoryLevel1: "当前将保存为一级分类",
    categoryLevelN: (level) => `当前将保存为 ${level} 级分类`,
    templatePreviewNew: "新模板首次保存后会生成 1.0.0 版本",
    templatePreviewExisting: (fromVersion, toVersion, bumpLabel) =>
      `当前版本 ${fromVersion}，系统推荐 ${bumpLabel}，保存后将变为 ${toVersion}`,
    snippetPreviewExisting: (fromVersion, toVersion) => `当前版本 ${fromVersion}，保存后将变为 ${toVersion}`,
    algorithmPreviewExisting: (fromVersion, toVersion) => `当前版本 ${fromVersion}，保存后将变为 ${toVersion}`,
    firstVersionDiff: "首个版本没有更早版本可供对比，当前展示的是与空白初稿的差异。",
  }

  const enumLabels = {
    private: "私有",
    shared: "共享",
    team: "共享",
    active: "启用中",
    disabled: "已停用",
    draft: "草稿",
    submitted: "审核中",
    reviewing: "审核中",
    approved: "已发布",
    published: "已发布",
    rejected: "已下架",
    deprecated: "已下架",
  }

  const bumpLabels = {
    patch: "补丁版本 patch",
    minor: "小版本 minor",
    major: "大版本 major",
  }

  const panelMeta = {
    templates: {
      description: "维护算法模板与分类。模板只作为开发骨架使用，不进入注册表，也不直接对外暴露接口。",
      actions: [
        { id: "template-new", label: "新建模板", hint: "创建一份新的算法模板。" },
        { id: "category-new", label: "新增分类", hint: "维护模板分类层级和排序。" },
      ],
    },
    snippets: {
      description: "管理共用代码片段库与个人收藏片段，支持按文件夹整理与版本回溯。",
      actions: [
        { id: "snippet-new", label: "新建片段", hint: "新增一个可复用代码片段。" },
        { id: "snippet-folder-new", label: "新增文件夹", hint: "给片段收藏空间建立新文件夹。" },
      ],
    },
    algorithms: {
      description: "管理算法组件的草稿、审核、发布与下架。只有已发布组件才应对外提供调用入口。",
      actions: [
        { id: "algorithm-new", label: "新建组件", hint: "创建一个新的算法组件草稿。" },
        { id: "algorithm-folder-new", label: "新增分类", hint: "整理组件保存空间和业务分类。" },
      ],
    },
  }

  const state = {
    bootstrap: null,
    loading: true,
    currentPanel: "algorithms",
    snippetScope: "private",
    algorithmScope: "mine",
    creatingCategory: false,
    creatingTemplate: false,
    creatingSnippet: false,
    creatingAlgorithm: false,
    selectedTemplateId: null,
    selectedSnippetId: null,
    selectedAlgorithmId: null,
    selectedCategoryId: null,
    editingCategoryId: null,
    selectedSnippetFolderId: null,
    selectedAlgorithmFolderId: null,
    expandedCategoryIds: new Set(),
    expandedSnippetFolderIds: new Set(),
    expandedAlgorithmFolderIds: new Set(),
    expandedAlgorithmLibraryTypes: new Set(),
    algorithmReviewFilter: "all",
    editors: new Map(),
    monacoPromise: null,
    algoCompletionRegistered: false,
    successTimer: null,
    errorTimer: null,
    titleTimer: null,
    activeDialog: null,
    panelViews: {
      templates: "list",
      snippets: "list",
      algorithms: "list",
    },
    galleryAlgorithms: [],
    galleryLoading: false,
    galleryError: null,
    galleryNamespace: "",
    gallerySearch: "",
    currentPackage: null,
    currentPackageFile: "",
    currentPackageBinding: null,
    packageTabs: new Set(),
    packageModified: new Set(),
    packageCompletionRegistered: false,
    currentGalleryAlgorithm: null,
    galleryEditorModified: false,
    galleryFolderFiles: [],
    currentGalleryFile: "",
    testHistoryCache: new Map(),
  }

  let _monacoEditor = null
  let _monacoModels = {}
  let _currentEditingFile = ""

  const $ = (selector) => document.querySelector(selector)
  const $$ = (selector) => Array.from(document.querySelectorAll(selector))
  const field = (form, name) => form.elements.namedItem(name)
  const value = (form, name) => {
    const control = field(form, name)
    return control ? control.value : ""
  }
  const setValue = (form, name, nextValue) => {
    const control = field(form, name)
    if (control) {
      control.value = nextValue ?? ""
    }
  }

  const escapeHtml = (text) =>
    String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")

  const splitCsv = (text) => String(text || "").split(",").map((item) => item.trim()).filter(Boolean)
  const countText = (count) => `共 ${count} 项`
  const parseDate = (input) => new Date(input || 0).getTime()
  const localizeEnum = (input) => enumLabels[input] || input || "-"
  const localizeStatusBadge = (version, status) => `${version} / ${localizeEnum(status)}`
  const sortByRecent = (left, right) => parseDate(right.updatedAt) - parseDate(left.updatedAt)
  const isAdmin = () => Boolean(state.bootstrap?.actor?.isAdmin)
  const currentActorId = () => state.bootstrap?.actor?.id
  const currentPanelView = (panel) => state.panelViews[panel] || "list"
  const isTemplateCategoryView = () => currentPanelView("templates") === "category"
  const algorithmStatusClass = (status) => {
    if (status === "submitted" || status === "reviewing") return "warning"
    if (status === "rejected" || status === "deprecated") return "danger"
    if (status === "approved" || status === "published") return "success"
    return "neutral"
  }

  const bumpVersion = (version, bumpType) => {
    const [major, minor, patch] = String(version || "1.0.0")
      .split(".")
      .map((item) => Number(item) || 0)

    if (bumpType === "major") {
      return `${major + 1}.0.0`
    }
    if (bumpType === "minor") {
      return `${major}.${minor + 1}.0`
    }
    return `${major}.${minor}.${patch + 1}`
  }

  const compareVersions = (left, right) => {
    const parse = (input) => String(input || "0.0.0").split(".").map((part) => Number(part) || 0)
    const [leftMajor, leftMinor, leftPatch] = parse(left)
    const [rightMajor, rightMinor, rightPatch] = parse(right)
    if (leftMajor !== rightMajor) return leftMajor - rightMajor
    if (leftMinor !== rightMinor) return leftMinor - rightMinor
    return leftPatch - rightPatch
  }

  const normalizeLanguage = (value) => {
    const normalized = String(value || "").trim().toLowerCase()
    if (!normalized) {
      return "plaintext"
    }
    if (["python", "py"].includes(normalized)) return "python"
    if (["javascript", "js"].includes(normalized)) return "javascript"
    if (["typescript", "ts"].includes(normalized)) return "typescript"
    if (normalized === "java") return "java"
    if (["c++", "cpp"].includes(normalized)) return "cpp"
    if (normalized === "c") return "c"
    if (["shell", "bash", "sh"].includes(normalized)) return "shell"
    if (normalized === "sql") return "sql"
    if (normalized === "json") return "json"
    if (["yaml", "yml"].includes(normalized)) return "yaml"
    if (normalized === "markdown" || normalized === "md") return "markdown"
    return "plaintext"
  }

  const sanitizeSlug = (value, fallback = "component") =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback

  const sanitizeNamespaceInput = (value) => String(value || "").trim().replace(/^alg\./, "")

  const fullAlgorithmNamespace = (item) => {
    if (!item) return ""
    return item.callPrefix || item.displayNamespace || (item.namespace && item.funcName ? `alg.${item.namespace}.${item.funcName}` : "")
  }

  const categoryNamespace = (value) => {
    const normalized = String(value || "").trim().replace(/^alg\./, "")
    return normalized.split(".").filter(Boolean)[0] || normalized
  }

  async function publishAsComponent(templateId) {
    try {
      const template = getTemplateById(Number(templateId))
      if (!template) {
        showError("未找到可发布的模板")
        return
      }
      if (Number(value($("#template-form"), "id")) === Number(templateId) && templateDraftHasChanges()) {
        const saved = await handleTemplateSave()
        if (!saved) {
          return
        }
      }
      openPublishAsComponentDialog(template)
    } catch (error) {
      showError(error.message || String(error))
    }
  }

  function openPublishAsComponentDialog(template) {
    const defaultName = sanitizeSlug(template.name || String(template.id || "component"), "component")
    const defaultNamespace = `alg.${sanitizeSlug(template.namespace || template.name || "statistics", "statistics")}`
    const modal = document.getElementById("folder-edit-modal")
    if (!modal) {
      return
    }
    modal.classList.remove("hidden")
    modal.setAttribute("aria-hidden", "false")
    const card = modal.querySelector(".modal-card")
    if (!card) return
    card.innerHTML = `
      <div class="card-header">
        <h4>发布为组件</h4>
        <button type="button" class="ghost-button" data-publish-cancel>取消</button>
      </div>
      <form id="publish-component-form" class="dialog-form" novalidate>
        <label>组件名称
          <input name="name" value="${escapeHtml(defaultName)}" required />
        </label>
        <label>中文名
          <input name="zh_name" value="${escapeHtml(template.zhName || template.name || "")}" />
        </label>
        <label>命名空间
          <input name="new_namespace" value="${escapeHtml(defaultNamespace)}" placeholder="如 alg.statistics" required />
        </label>
        <label>版本
          <input name="version" value="1.0.0" />
        </label>
        <label>描述
          <textarea name="description" rows="4">${escapeHtml(template.description || "")}</textarea>
        </label>
        <div class="button-row">
          <div style="flex:1"></div>
          <button type="button" class="ghost-button" data-publish-cancel>取消</button>
          <button type="submit" class="primary-button">确认发布</button>
        </div>
      </form>
    `
    const close = () => {
      modal.classList.add("hidden")
      modal.setAttribute("aria-hidden", "true")
    }
    card.querySelectorAll("[data-publish-cancel]").forEach((button) => button.addEventListener("click", close))
    card.querySelector("#publish-component-form")?.addEventListener("submit", async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const name = value(form, "name").trim()
      const newNamespace = value(form, "new_namespace").trim()
      field(form, "name").classList.toggle("error", !name)
      field(form, "new_namespace").classList.toggle("error", !/^alg\.[a-z_]+$/.test(newNamespace))
      if (!name || !/^alg\.[a-z_]+$/.test(newNamespace)) {
        showError("请填写组件名称，并使用 alg.category 格式的命名空间")
        return
      }
      try {
        const payload = {
          name,
          zh_name: value(form, "zh_name"),
          new_namespace: newNamespace,
          version: value(form, "version") || "1.0.0",
          description: value(form, "description"),
        }
        const response = await fetch(`${packageServiceBase}/algorithms/${encodeURIComponent(template.id)}/publish-as-component`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(result.detail || result.message || `HTTP ${response.status}`)
        }
        close()
        showToast("✅ 已创建为组件草稿，跳转中...", 3000)
        await loadGalleryAlgorithms().catch(() => {})
        setTimeout(() => {
          activatePanel("component-gallery")
          renderComponentGallery()
        }, 1200)
      } catch (error) {
        showError(error.message || String(error))
      }
    })
  }

  const inferLanguageFromFileName = (fileName) => {
    const suffix = String(fileName || "").toLowerCase().split(".").pop() || ""
    return normalizeLanguage(suffix)
  }

  const setLoading = (value) => {
    state.loading = Boolean(value)
    document.body.classList.toggle("is-loading", state.loading)
  }

  const formatClockPart = (value) => String(value).padStart(2, "0")

  function updateHeaderTime() {
    const now = new Date()
    const time = `${formatClockPart(now.getHours())}:${formatClockPart(now.getMinutes())}:${formatClockPart(now.getSeconds())}`
    const date = `${now.getFullYear()}-${formatClockPart(now.getMonth() + 1)}-${formatClockPart(now.getDate())}`
    const el = document.getElementById("header-time")
    const del = document.getElementById("header-date")
    if (el) el.textContent = time
    if (del) del.textContent = date
  }

  const ui_templateMetrics = {
    "数据清洗管道": { total: 1204, today: 82, health: "running", updated: "2026-04-20 16:30" },
    "缺失值填充器": { total: 638, today: 34, health: "running", updated: "2026-04-19 10:15" },
    "归一化处理器": { total: 421, today: 27, health: "running", updated: "2026-04-18 09:20" },
    "数据格式转换": { total: 92, today: 0, health: "stopped", updated: "2026-04-15 11:10" },
    "相关系数矩阵": { total: 318, today: 19, health: "running", updated: "2026-04-18 13:45" },
    "孤立点检测器": { total: 108, today: 0, health: "error", updated: "2026-04-17 18:25" },
    "时间序列平滑": { total: 205, today: 11, health: "running", updated: "2026-04-16 15:30" },
    "线性回归预测": { total: 876, today: 53, health: "running", updated: "2026-04-18 12:10" },
    "K-Means聚类": { total: 542, today: 38, health: "running", updated: "2026-04-17 20:40" },
  }

  const ui_snippetMetrics = {
    "DataFrame行列筛选器": { copies: 23, updated: "2026-04-18", folder: "数据预处理工具集" },
    "Axios统一请求封装": { copies: 41, updated: "2026-04-17", folder: "API请求封装" },
    "数据库分页查询模板": { copies: 18, updated: "2026-04-15", folder: "数据库操作" },
    "正则表达式工具函数": { copies: 56, updated: "2026-04-12", folder: "字符串处理" },
    "Numpy矩阵运算片段": { copies: 15, updated: "2026-04-10", folder: "数据预处理工具集" },
    "Redis缓存读写封装": { copies: 29, updated: "2026-04-08", folder: "系统工具" },
  }

  const ui_codeSamples = {
    python: [
      "import pandas as pd",
      "from sklearn.preprocessing import MinMaxScaler",
      "",
      "def run_pipeline(frame: pd.DataFrame):",
      "    cleaned = frame.drop_duplicates()",
      "    scaler = MinMaxScaler()",
      "    cleaned[cleaned.columns] = scaler.fit_transform(cleaned)",
      "    return cleaned.head(10)",
    ].join("\n"),
    javascript: [
      "export async function request(config) {",
      "  const token = getAccessToken()",
      "  const headers = { ...config.headers, Authorization: `Bearer ${token}` }",
      "  const response = await axios({ ...config, headers })",
      "  return response.data",
      "}",
    ].join("\n"),
    sql: [
      "SELECT id, name, created_at",
      "FROM algorithm_assets",
      "WHERE deleted_at IS NULL",
      "ORDER BY created_at DESC",
      "LIMIT :pageSize OFFSET :offset;",
    ].join("\n"),
  }

  const ui_healthClass = (status, total, today) => {
    if (status === "disabled") return "stopped"
    if (today === 0 && total > 0) return "error"
    return "running"
  }

  const ui_languageColorClass = (language) => {
    const normalized = normalizeLanguage(language)
    if (normalized === "python") return "status-badge success"
    if (normalized === "javascript" || normalized === "typescript") return "status-badge warning"
    if (normalized === "sql") return "status-badge success"
    return "status-badge neutral"
  }

  const ui_pickTemplateMetric = (template, index = 0) => {
    if (ui_templateMetrics[template?.name]) {
      return ui_templateMetrics[template.name]
    }
    const total = 120 + index * 47
    const today = Math.max(0, 9 + (index % 5) * 6)
    return {
      total,
      today,
      health: ui_healthClass(template?.status, total, today),
      updated: template?.updatedAt ? new Date(template.updatedAt).toLocaleString("zh-CN") : "2026-04-20 16:30",
    }
  }

  const ui_pickSnippetMetric = (snippet, index = 0) => {
    if (ui_snippetMetrics[snippet?.name]) {
      return ui_snippetMetrics[snippet.name]
    }
    return {
      copies: 12 + index * 3,
      updated: snippet?.updatedAt ? new Date(snippet.updatedAt).toLocaleDateString("zh-CN") : "2026-04-18",
      folder: texts.unassigned,
    }
  }

  const ui_renderMiniChart = (values) =>
    `<div class="algolib-mini-chart">${values
      .map((value, index) => `<span class="algolib-mini-bar${index === values.length - 1 ? " today" : ""}" style="height:${value}%"></span>`)
      .join("")}</div>`

  function ui_updateClock() {
    updateHeaderTime()
  }

  function ui_openPanel() {
    const panel = $("#algolib-right-panel")
    if (!panel) return
    panel.classList.add("open")
    if (!panel.style.width || panel.style.width === "0px") {
      panel.style.width = "300px"
    }
  }

  function ui_closePanel() {
    const panel = $("#algolib-right-panel")
    if (!panel) return
    panel.classList.remove("open")
    panel.style.width = "0px"
  }

  function ui_updateStatusBar(page = state.currentPanel) {
    const left = $("#algolib-statusbar-left")
    const right = $("#algolib-statusbar-right")
    const actorText = state.bootstrap?.actor ? `当前登录身份：${state.bootstrap.actor.isAdmin ? "管理员" : "普通用户"}` : "当前登录身份：加载中..."

    if (right) {
      right.textContent = actorText
    }

    if (!left) return
    if (page === "snippets") {
      const snippets = (state.bootstrap?.snippets || []).filter((item) => item.visibility === state.snippetScope)
      const favorites = (state.bootstrap?.snippets || []).filter((item) => item.visibility === "private").length
      const shared = (state.bootstrap?.snippets || []).filter((item) => item.visibility === "shared").length
      left.textContent = `代码片段 | 我的片段：${favorites || 36} | 已收藏：${Math.max(12, Math.min(12, favorites || 12))} | 共用库：${shared || 82} | 本月新增：8`
      return
    }
    if (page === "algorithms") {
      const algorithms = state.bootstrap?.algorithms || []
      const reviewing = algorithms.filter((item) => item.status === "reviewing" || item.status === "submitted").length
      const published = algorithms.filter((item) => item.status === "published" || item.status === "approved").length
      left.textContent = `算法组件 | 组件总数：${algorithms.length} | 审核中：${reviewing} | 已发布：${published} | 当前视图：${state.algorithmScope}`
      return
    }
    const templates = state.bootstrap?.templates || []
    const categories = state.bootstrap?.categories || []
    left.textContent = `算法模板 | 模板总数：${templates.length} | 分类数：${categories.length} | 可复用骨架：${templates.length} | 当前版本库：${templates.filter((item) => !item.deletedAt).length}`
  }

  function ui_showAlgoDetail(name, lang, ver, status, total, today, desc, cat, updated, health, algorithmId) {
    const body = $("#algolib-rp-body")
    const title = $("#algolib-rp-title")
    if (!body || !title) return
    title.textContent = name
    body.innerHTML = `
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">基本信息</div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">名称</span><span class="algolib-rp-value">${escapeHtml(name)}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">分类</span><span class="algolib-rp-value">${escapeHtml(cat || texts.unassigned)}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">语言</span><span class="algolib-rp-value">${escapeHtml(lang || "Python")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">版本</span><span class="algolib-rp-value">${escapeHtml(ver || "v1.0.0")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">形态</span><span class="algolib-rp-value">开发模板</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">最后更新</span><span class="algolib-rp-value">${escapeHtml(updated || "2026-04-20 16:30")}</span></div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">功能描述</div>
        <div class="algolib-rp-box">${escapeHtml(desc || texts.noDescription)}</div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">使用说明</div>
        <div class="algolib-rp-box">模板不会进入组件注册表，也不会直接暴露 API。请先在模板编辑器中补全骨架，再通过“发布为组件”生成组件草稿。</div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">操作</div>
        <div class="algolib-rp-actions">
          <button class="algolib-rp-btn accent" id="algolib-rp-edit-template">编辑模板</button>
          <button class="algolib-rp-btn" id="algolib-rp-open-template">查看详情</button>
        </div>
      </section>
    `
    $("#algolib-rp-edit-template")?.addEventListener("click", () => showPanelDetail("templates"))
    $("#algolib-rp-open-template")?.addEventListener("click", () => showPanelDetail("templates"))
    ui_openPanel()
  }

  function ui_showSnippetDetail(name, lang, folderName, desc, code, algorithmId) {
    const body = $("#algolib-rp-body")
    const title = $("#algolib-rp-title")
    if (!body || !title) return
    const sample = code || ui_codeSamples[normalizeLanguage(lang)] || ui_codeSamples.python
    title.textContent = name
    body.innerHTML = `
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">基本信息</div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">名称</span><span class="algolib-rp-value">${escapeHtml(name)}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">所属文件夹</span><span class="algolib-rp-value">${escapeHtml(folderName || texts.unassigned)}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">语言</span><span class="algolib-rp-value">${escapeHtml(lang || "Python")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">最后更新</span><span class="algolib-rp-value">${escapeHtml(new Date().toLocaleDateString("zh-CN"))}</span></div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">功能描述</div>
        <div class="algolib-rp-box">${escapeHtml(desc || texts.noDescription)}</div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">代码预览</div>
        <pre class="algolib-code-preview">${escapeHtml(sample)}</pre>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">操作</div>
        <div class="algolib-rp-actions">
          <button class="algolib-rp-btn accent" id="algolib-rp-insert-snippet">插入编辑器</button>
          <button class="algolib-rp-btn">复制代码</button>
          <button class="algolib-rp-btn" id="algolib-rp-edit-snippet">编辑</button>
          <button class="algolib-rp-btn">移动文件夹</button>
          <button class="algolib-rp-btn">删除</button>
        </div>
      </section>
    `
    $("#algolib-rp-edit-snippet")?.addEventListener("click", () => showPanelDetail("snippets"))
    $("#algolib-rp-insert-snippet")?.addEventListener("click", () => {
      if (!algorithmId) {
        showError("当前片段缺少插入标识")
        return
      }
      notifyHost({ type: "insertAlgorithm", algorithmId })
      showStatus(`已请求插入：${name}`)
    })
    ui_openPanel()
  }

  function ui_initLeftResize() {
    const sidebar = $(".algolib-sidebar")
    const handle = $("#algolib-left-resize")
    if (!sidebar || !handle) return
    let dragging = false
    let startX = 0
    let startW = 0

    handle.addEventListener("mousedown", (event) => {
      dragging = true
      startX = event.clientX
      startW = sidebar.offsetWidth
      document.body.classList.add("algolib-resizing")
    })

    document.addEventListener("mousemove", (event) => {
      if (!dragging) return
      const width = Math.min(320, Math.max(160, startW + (event.clientX - startX)))
      sidebar.style.width = `${width}px`
    })

    document.addEventListener("mouseup", () => {
      dragging = false
      document.body.classList.remove("algolib-resizing")
    })
  }

  function ui_initRightResize() {
    const panel = $("#algolib-right-panel")
    const handle = $("#algolib-right-resize")
    if (!panel || !handle) return
    let dragging = false
    let startX = 0
    let startW = 0

    handle.addEventListener("mousedown", (event) => {
      if (!panel.classList.contains("open")) return
      dragging = true
      startX = event.clientX
      startW = panel.offsetWidth
      panel.classList.add("algolib-dragging")
      document.body.classList.add("algolib-resizing")
    })

    document.addEventListener("mousemove", (event) => {
      if (!dragging) return
      const width = Math.min(420, Math.max(200, startW - (event.clientX - startX)))
      panel.style.width = `${width}px`
    })

    document.addEventListener("mouseup", () => {
      dragging = false
      panel.classList.remove("algolib-dragging")
      document.body.classList.remove("algolib-resizing")
    })
  }

  function ui_toggleSub(subId, arrId, el) {
    const sub = typeof subId === "string" ? document.getElementById(subId) : subId
    const arrow = typeof arrId === "string" ? document.getElementById(arrId) || el?.querySelector(".algolib-ni-arrow") : arrId
    if (!sub) return
    sub.classList.toggle("open")
    el?.classList.toggle("open", sub.classList.contains("open"))
    arrow?.classList.toggle("open", sub.classList.contains("open"))
  }

  function ui_toggleGrid(gridId, btn) {
    const grid = typeof gridId === "string" ? document.getElementById(gridId) : gridId
    if (!grid) return
    grid.classList.toggle("algolib-collapsed")
    grid.style.display = grid.classList.contains("algolib-collapsed") ? "none" : ""
    if (btn) {
      const expanded = !grid.classList.contains("algolib-collapsed")
      btn.classList.toggle("expanded", expanded)
      btn.setAttribute("aria-expanded", expanded ? "true" : "false")
    }
  }

  function ui_switchPage(page) {
    activatePanel(page)
    ui_updateStatusBar(page)
    if (page === "templates" && $("#algolib-right-panel")?.classList.contains("open")) {
      const template = getTemplateById(state.selectedTemplateId)
      if (template) {
        const category = (state.bootstrap?.categories || []).find((item) => item.id === template.categoryId)
        const metric = ui_pickTemplateMetric(template)
        ui_showAlgoDetail(template.zhName || template.name, template.language, template.currentVersion, template.status, metric.total, metric.today, template.description, category?.name || texts.unassigned, metric.updated, metric.health, `template.${template.id}`)
      }
      return
    }
    if (page === "snippets" && $("#algolib-right-panel")?.classList.contains("open")) {
      const snippet = getSnippetById(state.selectedSnippetId)
      if (snippet) {
        const folder = (state.bootstrap?.snippetFolders || []).find((item) => item.id === snippet.folderId)
        ui_showSnippetDetail(snippet.zhName || snippet.name, snippet.language, folder?.name || texts.unassigned, snippet.description, snippet.content, `snippet.${snippet.id}`)
      }
      return
    }
    if (page !== "templates" && page !== "snippets") {
      ui_closePanel()
    }
  }

  function ui_switchSnippetTab(tab) {
    state.snippetScope = tab === "shared" ? "shared" : "private"
    state.selectedSnippetFolderId = null
    state.selectedSnippetId = null
    renderSnippets()
    renderSidebar()
    ui_updateStatusBar("snippets")
  }

  const showStatus = (message, kind = "success") => {
    const node = $("#status-banner")
    if (!node) {
      return
    }
    clearTimeout(state.successTimer)
    clearTimeout(state.errorTimer)
    node.textContent = message
    node.classList.remove("hidden", "error", "success")
    node.classList.add(kind)
    const timeout = kind === "error" ? 3000 : 2000
    const timerKey = kind === "error" ? "errorTimer" : "successTimer"
    state[timerKey] = setTimeout(() => {
      node.classList.add("hidden")
      node.textContent = ""
    }, timeout)
  }

  const showError = (message) => {
    const banner = $("#error-banner")
    banner.textContent = message
    banner.classList.remove("hidden")
    clearTimeout(state.errorTimer)
    state.errorTimer = setTimeout(() => {
      banner.textContent = ""
      banner.classList.add("hidden")
    }, 3000)
  }

  const clearError = () => {
    const banner = $("#error-banner")
    banner.textContent = ""
    banner.classList.add("hidden")
  }

  const notifyHost = (message) => {
    if (!message) {
      return
    }
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: "algo-lib-page", ...message }, "*")
      }
    } catch (error) {
      console.warn("Failed to notify host.", error)
    }
  }

  const clearFieldError = (formSelector, name) => {
    const node = document.querySelector(`${formSelector} [data-error-for="${name}"]`)
    if (node) {
      node.textContent = ""
    }
  }

  const setFieldError = (formSelector, name, message) => {
    const node = document.querySelector(`${formSelector} [data-error-for="${name}"]`)
    if (node) {
      node.textContent = message
    }
  }

  const validateVersionFields = (formSelector) => {
    let valid = true
    ;[
      { name: "changeReason", message: "请填写变更原因" },
      { name: "changeSummary", message: "请填写变更摘要" },
    ].forEach((item) => {
      const currentValue = value($(formSelector), item.name).trim()
      if (!currentValue) {
        setFieldError(formSelector, item.name, item.message)
        valid = false
      } else {
        clearFieldError(formSelector, item.name)
      }
    })
    return valid
  }

  const validateRequiredFields = (formSelector, fields) => {
    let valid = true
    fields.forEach((item) => {
      const currentValue = value($(formSelector), item.name).trim()
      if (!currentValue) {
        setFieldError(formSelector, item.name, item.message)
        valid = false
      } else {
        clearFieldError(formSelector, item.name)
      }
    })
    return valid
  }

  const validateTemplateForm = () => validateRequiredFields("#template-form", [
    { name: "name", message: "请填写模板名称" },
    { name: "categoryId", message: "请选择分类" },
    { name: "description", message: "请填写模板说明" },
    { name: "content", message: "请填写模板内容" },
    { name: "example", message: "请填写参数结构约定" },
    { name: "changeReason", message: "请填写变更原因" },
    { name: "changeSummary", message: "请填写变更摘要" },
  ])

  const validateSnippetForm = () => validateRequiredFields("#snippet-form", [
    { name: "name", message: "请填写片段名称" },
    { name: "zhName", message: "请填写片段中文名" },
    { name: "description", message: "请填写片段说明" },
    { name: "content", message: "请填写片段内容" },
    { name: "changeReason", message: "请填写变更原因" },
    { name: "changeSummary", message: "请填写变更摘要" },
  ])

  const validateAlgorithmForm = () => validateRequiredFields("#algorithm-form", [
    { name: "name", message: "请填写组件英文名" },
    { name: "zhName", message: "请填写组件中文名" },
    { name: "type", message: "请填写组件类型" },
    { name: "description", message: "请填写功能描述" },
    { name: "inputSpec", message: "请填写输入规范" },
    { name: "outputSpec", message: "请填写输出规范" },
    { name: "content", message: "请填写组件源码" },
    { name: "changeReason", message: "请填写变更原因" },
    { name: "changeSummary", message: "请填写变更摘要" },
  ])

  const setFormReadOnly = (formSelector, readOnly) => {
    const form = $(formSelector)
    if (!form) {
      return
    }
    Array.from(form.elements).forEach((element) => {
      if (element.tagName === "BUTTON" || element.type === "hidden" || element.id === "algorithm-review") {
        return
      }
      if ("disabled" in element) {
        element.disabled = readOnly
      }
    })
  }

  const setEditorReadOnly = (formSelector, name, readOnly) => {
    const editorEntry = state.editors.get(getEditorKey(formSelector, name))
    if (editorEntry) {
      editorEntry.editor.updateOptions({ readOnly })
    }
  }

  const request = async (url, init = {}) => {
    const response = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    })

    if (response.status === 401) {
      // 未认证：重定向到登录页面
      const loginUrl = `${location.origin}${routePrefix}/login?to=${encodeURIComponent(location.href)}`
      if (isEmbedded && window.parent && window.parent !== window) {
        window.parent.postMessage({ source: "algo-lib-page", type: "requireLogin", loginUrl }, "*")
      } else {
        location.href = loginUrl
      }
      throw new Error("未登录，请重新登录")
    }

    if (!response.ok) {
      let message = `请求失败：${response.status}`
      try {
        const payload = await response.json()
        message = payload.message || payload.error || message
      } catch (error) {
        // Ignore non-JSON response bodies.
      }
      throw new Error(message)
    }

    if (response.status === 204) {
      return null
    }

    return await response.json()
  }

  const submitJson = async (url, method, payload) => {
    setLoading(true)
    try {
      const result = await request(url, {
        method,
        body: method === "DELETE" ? undefined : JSON.stringify(payload),
      })
      await loadBootstrap()
      notifyHost({ type: "resourceChanged", method, url })
      return result
    } finally {
      setLoading(false)
    }
  }

  const packageServiceBase = "http://127.0.0.1:8000/api/v1"

  const showToast = (message, durationOrKind = "success", fallbackDuration = 2000) => {
    const kind = typeof durationOrKind === "string" ? durationOrKind : "success"
    const duration = typeof durationOrKind === "number" ? durationOrKind : fallbackDuration
    const node = $("#status-banner")
    if (!node) {
      return
    }
    clearTimeout(state.successTimer)
    clearTimeout(state.errorTimer)
    node.textContent = message
    node.classList.remove("hidden", "error", "success")
    node.classList.add(kind)
    const timerKey = kind === "error" ? "errorTimer" : "successTimer"
    state[timerKey] = setTimeout(() => {
      node.classList.add("hidden")
      node.textContent = ""
    }, duration)
  }

  const packageFileIcon = (fileName) => {
    if (fileName === "algopack.json" || fileName.endsWith(".json")) return "{}"
    if (fileName.endsWith(".py")) return "py"
    if (fileName.endsWith(".md")) return "md"
    return "•"
  }

  const getPackageFileKey = (file) => file?.relative_path || file?.filename || ""

  const getCurrentPackageFile = () => {
    const pkg = state.currentPackage
    if (!pkg) return null
    return (pkg.files || []).find((file) => getPackageFileKey(file) === state.currentPackageFile) || null
  }

  const activePackageEditorContent = () => {
    if (_monacoEditor) {
      return _monacoEditor.getValue()
    }
    const fallback = document.getElementById("pkgFallbackEditor")
    return fallback ? fallback.value : ""
  }

  const upsertPackageFile = (file) => {
    if (!state.currentPackage || !file) return
    const key = getPackageFileKey(file)
    const files = state.currentPackage.files || []
    const index = files.findIndex((item) => getPackageFileKey(item) === key)
    if (index >= 0) {
      files[index] = file
    } else {
      files.push(file)
    }
  }

  const getPackageEntryFile = (pkg = state.currentPackage) =>
    (pkg?.files || []).find((file) => file.is_entry || getPackageFileKey(file) === pkg?.entry_file || file.filename === pkg?.entry_file) ||
    (pkg?.files || [])[0] ||
    null

  const getPackageEntryContent = (pkg = state.currentPackage) => getPackageEntryFile(pkg)?.content || ""

  const getCurrentPackageBindingRecord = () => {
    if (!state.currentPackageBinding) return null
    if (state.currentPackageBinding.module === "template") {
      return getTemplateById(state.currentPackageBinding.id)
    }
    return getAlgorithmById(state.currentPackageBinding.id)
  }

  async function syncBoundPackageResource(reason = "同步多文件入口文件") {
    const binding = state.currentPackageBinding
    const pkg = state.currentPackage
    const record = getCurrentPackageBindingRecord()
    if (!binding || !pkg || !record) return null

    const entryContent = getPackageEntryContent(pkg)
    if (binding.module === "template") {
      return submitJson(`${apiBase}/templates/${binding.id}`, "PATCH", {
        name: record.name,
        zhName: record.zhName || record.name,
        packageId: pkg.package_id,
        categoryId: record.categoryId,
        difficulty: record.difficulty || 1,
        language: record.language || "python",
        description: record.description || "",
        templateBody: entryContent,
        paramsSchema: record.paramsSchema || record.example || "{}",
        content: entryContent,
        example: record.example || record.paramsSchema || "{}",
        tags: record.tags || [],
        bumpType: "patch",
        changeReason: reason,
        changeSummary: `${reason}：${pkg.package_id}`,
        status: record.status || "active",
      })
    }

    return submitJson(`${apiBase}/algorithms/${binding.id}`, "PATCH", {
      name: record.name,
      zhName: record.zhName || record.name,
      packageId: pkg.package_id,
      namespace: pkg.namespace || record.namespace || "",
      folderId: record.folderId,
      type: record.type,
      description: record.description || "",
      inputSpec: record.inputSpec || "{}",
      outputSpec: record.outputSpec || "{}",
      dependencies: record.dependencies || "",
      content: entryContent,
      example: record.example || "",
      tags: record.tags || [],
      bumpType: "patch",
      changeReason: reason,
      changeSummary: `${reason}：${pkg.package_id}`,
    })
  }

  const renderPackageEditorShell = (pkg) => {
    const content = document.querySelector(".content")
    if (!content) return null
    const previous = document.getElementById("pkgEditor")
    if (previous) previous.remove()

    const editor = document.createElement("div")
    editor.className = "pkg-editor"
    editor.id = "pkgEditor"
    editor.innerHTML = `
      <div class="pkg-topbar">
        <span class="pkg-name" id="pkgName">${escapeHtml(pkg.zh_name || pkg.name || "算法包")}</span>
        <span class="pkg-ver-tag" id="pkgVer">v${escapeHtml(pkg.version || "1.0.0")}</span>
        <span class="pkg-type-badge">算法包</span>
        <label class="pkg-namespace-field">命名空间
          <input id="pkgNamespaceInput" class="pkg-namespace-input" value="${escapeHtml(pkg.namespace || "")}" />
        </label>
        <div class="pkg-topbar-actions">
          <button class="pkg-btn" data-pkg-action="close" type="button">← 返回列表</button>
          <button class="pkg-btn" data-pkg-action="save-file" type="button">保存</button>
          <button class="pkg-btn success" data-pkg-action="toggle-test" type="button">运行测试</button>
          <button class="pkg-btn accent" data-pkg-action="submit" type="button">提交审核</button>
        </div>
      </div>
      <div class="pkg-body">
        <div class="pkg-filetree" id="pkgFiletree">
          <div class="pft-header">
            <span class="pft-title">文件</span>
            <button class="pft-add-btn" data-pkg-action="add-file" title="新建文件" type="button">＋</button>
            <button class="pft-add-btn" data-pkg-action="upload-file" title="上传文件" type="button">↑</button>
          </div>
          <div class="pft-body" id="pftBody"></div>
        </div>
        <div class="pkg-resize-handle" id="pkgResizeH"></div>
        <div class="pkg-editor-area" id="pkgEditorArea">
          <div class="pkg-tab-bar" id="pkgTabBar"></div>
          <div class="monaco-container" id="monacoContainer"></div>
          <textarea class="pkg-fallback-editor hidden" id="pkgFallbackEditor" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="pkg-vresize" id="pkgVresize">
        <div class="vresize-label" data-pkg-action="toggle-test-label" role="button" tabindex="0">测试面板 <span id="testPanelToggleIcon">▼</span></div>
      </div>
      <div class="pkg-test-panel" id="pkgTestPanel"></div>
    `
    content.appendChild(editor)
    bindPackageEditorButtons(editor, "package")
    return editor
  }

  function bindPackageEditorButtons(root, mode) {
    root.querySelector("[data-pkg-action='close']")?.addEventListener("click", closePkgEditor)
    root.querySelector("[data-pkg-action='save-file']")?.addEventListener("click", () => {
      if (mode === "gallery") {
        saveGalleryAlgorithmSource()
      } else {
        savePkgFile()
      }
    })
    root.querySelector("[data-pkg-action='toggle-test']")?.addEventListener("click", () => {
      if (mode === "gallery") {
        toggleGalleryTestPanel()
      } else {
        toggleTestPanel()
      }
    })
    root.querySelector("[data-pkg-action='toggle-test-label']")?.addEventListener("click", () => {
      if (mode === "gallery") {
        toggleGalleryTestPanel()
      } else {
        toggleTestPanel()
      }
    })
    root.querySelector("[data-pkg-action='add-file']")?.addEventListener("click", () => {
      if (mode === "gallery") {
        addGallerySourceFile()
      } else {
        addPkgFile()
      }
    })
    root.querySelector("[data-pkg-action='upload-file']")?.addEventListener("click", () => uploadPkgFile())
    root.querySelector("[data-pkg-action='submit']")?.addEventListener("click", submitPackage)
    root.querySelector("[data-pkg-action='run-gallery-test']")?.addEventListener("click", () => runGalleryAlgorithmTest())
  }

  async function openPackageEditor(packageId, binding = null) {
    try {
      const response = await fetch(`${packageServiceBase}/packages/${encodeURIComponent(packageId)}`)
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
      }
      const payload = await response.json()
      const pkg = payload.package || payload.content || payload
      state.currentPackageBinding = binding
      state.currentPackage = pkg
      state.currentPackageFile = ""
      state.packageTabs = new Set()
      state.packageModified = new Set()
      _monacoEditor = null
      _monacoModels = {}
      _currentEditingFile = ""
      renderPackageEditorShell(pkg)
      initPkgFileTree(pkg)
      initPkgFileResize()
      initVResizeDrag()
      const entryFile = (pkg.files || []).find((file) => file.is_entry) || (pkg.files || [])[0]
      if (entryFile) {
        await openFileInEditor(entryFile)
      }
    } catch (error) {
      showToast(error.message || String(error), "error")
      console.error(error)
    }
  }

  function initPkgFileTree(pkg) {
    const body = document.getElementById("pftBody")
    if (!body) return
    const files = [...(pkg.files || [])].sort((left, right) => {
      if (left.relative_path === "algopack.json") return -1
      if (right.relative_path === "algopack.json") return 1
      if (left.is_entry) return -1
      if (right.is_entry) return 1
      return getPackageFileKey(left).localeCompare(getPackageFileKey(right))
    })
    body.innerHTML = files.map((file) => {
      const key = getPackageFileKey(file)
      const active = key === state.currentPackageFile ? " active" : ""
      const entry = file.is_entry ? " entry-file" : ""
      const modified = state.packageModified.has(key) ? '<span class="pft-modified-dot"></span>' : ""
      const locked = key === "algopack.json" || file.is_entry
      return `
        <div class="pft-file${active}${entry}" data-pkg-file="${escapeHtml(key)}" title="${escapeHtml(key)}">
          <span class="pft-ico">${escapeHtml(packageFileIcon(key))}</span>
          <span class="pft-fname">${escapeHtml(key)}</span>
          ${modified}
          ${locked ? "" : `<button class="pft-del-btn" data-pkg-delete="${escapeHtml(key)}" type="button">×</button>`}
        </div>
      `
    }).join("")

    body.querySelectorAll("[data-pkg-file]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target.closest("[data-pkg-delete]")) return
        switchPkgFile(node.getAttribute("data-pkg-file") || "")
      })
    })
    body.querySelectorAll("[data-pkg-delete]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation()
        const filename = button.getAttribute("data-pkg-delete") || ""
        await deletePkgFile(filename)
      })
    })
  }

  async function initMonacoEditor(containerId, initialContent, language = "python") {
    const monaco = await loadMonaco()
    if (!monaco) return null
    window._monaco = monaco

    monaco.editor.defineTheme("algolib-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6370", fontStyle: "italic" },
        { token: "keyword", foreground: "c678dd" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "e5c07b" },
        { token: "function", foreground: "61afef" },
        { token: "variable", foreground: "e06c75" },
      ],
      colors: {
        "editor.background": "#040e1f",
        "editor.foreground": "#c8d8f0",
        "editorLineNumber.foreground": "#3a5070",
        "editorLineNumber.activeForeground": "#5a7aaa",
        "editor.selectionBackground": "#1a3a6e",
        "editor.lineHighlightBackground": "#071428",
        "editorCursor.foreground": "#00f0c8",
        "editorIndentGuide.background": "#0d1e38",
        "editorIndentGuide.activeBackground": "#1a3a6e",
        "editor.findMatchBackground": "#1a3a6e",
        "editorSuggestWidget.background": "#0b1e3a",
        "editorSuggestWidget.border": "#1a3a6e",
        "editorSuggestWidget.selectedBackground": "#132d56",
        "editorHoverWidget.background": "#0b1e3a",
        "editorHoverWidget.border": "#1a3a6e",
      },
    })

    const container = document.getElementById(containerId)
    if (!container) return null
    _monacoEditor = monaco.editor.create(container, {
      value: initialContent,
      language,
      theme: "algolib-dark",
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      lineNumbersMinChars: 3,
      glyphMargin: true,
      folding: true,
      foldingStrategy: "indentation",
      roundedSelection: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: true,
      wordWrap: "on",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showKeywords: true, showSnippets: true, showClasses: true, showFunctions: true, showVariables: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      parameterHints: { enabled: true },
      hover: { enabled: true },
      links: false,
      scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
    })
    _monacoEditor.onDidChangeModelContent(() => markCurrentFileModified())
    _monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => savePkgFile())
    await injectAlgCompletions(_monacoEditor)
    return _monacoEditor
  }

  async function injectAlgCompletions(editor) {
    const monaco = window._monaco || window.monaco
    if (!monaco || state.packageCompletionRegistered) return
    state.packageCompletionRegistered = true

    try {
      const stub = await fetch(`${packageServiceBase}/stubs/alg.pyi`).then((r) => r.text())
      window._algStub = stub
    } catch (error) {
      console.warn("Failed to load alg stub.", error)
    }

    try {
      const data = await fetch(`${packageServiceBase}/algorithms`).then((r) => r.json())
      window._algRegistry = data.algorithms || []
    } catch (error) {
      window._algRegistry = []
      console.warn("Failed to load alg registry.", error)
    }

    monaco.languages.registerCompletionItemProvider("python", {
      triggerCharacters: ["."],
      provideCompletionItems(model, position) {
        const lineText = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        const algMatch = lineText.match(/\balg\.([a-zA-Z_\.]*)$/)
        if (!algMatch) return { suggestions: [] }

        const typed = algMatch[1]
        const allEntries = window._algRegistry || []
        const namespaces = [...new Set(allEntries.map((entry) => entry.namespace).filter(Boolean))]
        const replaceRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - typed.length,
          endColumn: position.column,
        }

        if (!typed || !typed.includes(".")) {
          const nsQuery = typed.toLowerCase()
          const nsSuggestions = namespaces
            .filter((namespace) => namespace.toLowerCase().startsWith(nsQuery))
            .map((namespace) => ({
              label: namespace,
              kind: monaco.languages.CompletionItemKind.Module,
              detail: "AlgoLib namespace",
              insertText: `${namespace}.`,
              sortText: `0_${namespace}`,
              range: replaceRange,
            }))
          if (nsSuggestions.length) {
            return { suggestions: nsSuggestions, incomplete: false }
          }
        }

        const suggestions = allEntries
          .filter((entry) => String(entry.callPrefix || "").startsWith(`alg.${typed}`))
          .map((entry) => ({
            label: entry.funcName || String(entry.callPrefix || "").split(".").pop(),
            kind: monaco.languages.CompletionItemKind.Function,
            detail: `${entry.zhName || ""}  |  ${entry.namespace || ""}`,
            documentation: {
              value: [
                `**${entry.zhName || entry.funcName || ""}**`,
                "",
                entry.zhDescription || "",
                "",
                `**调用方式：** \`${entry.callPrefix}()\``,
                "",
                (entry.params || []).map((param) => `- \`${param.name}\` (${param.type || "Any"}): ${param.description || ""}`).join("\n"),
              ].join("\n"),
              isTrusted: true,
            },
            insertText: entry.type === "snippet"
              ? entry.snippetBody
              : String(entry.callSnippet || entry.callPrefix || "").replace(/^alg\./, ""),
            insertTextRules: entry.type === "snippet"
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `0_${entry.funcName || entry.callPrefix}`,
            range: replaceRange,
          }))
        return { suggestions, incomplete: false }
      },
    })
  }

  function getOrCreateModel(filename, content, language) {
    if (_monacoModels[filename]) {
      return _monacoModels[filename]
    }
    const monaco = window._monaco || window.monaco
    const uri = monaco.Uri.parse(`file:///algopack/${filename}`)
    const model = monaco.editor.createModel(content, language, uri)
    _monacoModels[filename] = model
    return model
  }

  function switchEditorToFile(filename, content) {
    if (!_monacoEditor || !window._monaco) return
    const lang = filename.endsWith(".py") ? "python" : filename.endsWith(".json") ? "json" : filename.endsWith(".md") ? "markdown" : "plaintext"
    const model = getOrCreateModel(filename, content, lang)
    _monacoEditor.setModel(model)
    _currentEditingFile = filename
    state.currentPackageFile = filename
    clearEditorErrors()
    setTimeout(() => _monacoEditor?.layout(), 0)
  }

  async function openFileInEditor(file) {
    const pkgFile = typeof file === "string"
      ? (state.currentPackage?.files || []).find((item) => getPackageFileKey(item) === file || item.filename === file)
      : file
    if (!pkgFile) return
    const filename = getPackageFileKey(pkgFile)
    const language = inferLanguageFromFileName(filename)
    if (!_monacoEditor) {
      await initMonacoEditor("monacoContainer", pkgFile.content || "", language)
    }
    if (!_monacoEditor) {
      switchFallbackEditorToFile(filename, pkgFile.content || "")
      state.packageTabs.add(filename)
      renderPkgTabs()
      initPkgFileTree(state.currentPackage)
      return
    }
    state.packageTabs.add(filename)
    switchEditorToFile(filename, pkgFile.content || "")
    renderPkgTabs()
    initPkgFileTree(state.currentPackage)
  }

  function switchFallbackEditorToFile(filename, content) {
    const fallback = document.getElementById("pkgFallbackEditor")
    const monacoHost = document.getElementById("monacoContainer")
    if (!fallback) return
    fallback.classList.remove("hidden")
    if (monacoHost) monacoHost.classList.add("hidden")
    fallback.value = content || ""
    fallback.oninput = () => markCurrentFileModified()
    _currentEditingFile = filename
    state.currentPackageFile = filename
  }

  function switchPkgFile(filename) {
    const file = (state.currentPackage?.files || []).find((item) => getPackageFileKey(item) === filename || item.filename === filename)
    if (!file) return
    if (!_monacoEditor && document.getElementById("pkgFallbackEditor") && !document.getElementById("pkgFallbackEditor").classList.contains("hidden")) {
      state.packageTabs.add(getPackageFileKey(file))
      switchFallbackEditorToFile(getPackageFileKey(file), file.content || "")
      renderPkgTabs()
      initPkgFileTree(state.currentPackage)
      return
    }
    openFileInEditor(file)
  }

  function renderPkgTabs() {
    const tabBar = document.getElementById("pkgTabBar")
    if (!tabBar) return
    tabBar.innerHTML = [...state.packageTabs].map((filename) => {
      const active = filename === state.currentPackageFile ? " active" : ""
      const modified = state.packageModified.has(filename) ? '<span class="modified-dot"></span>' : ""
      return `
        <div class="pkg-tab${active}" data-pkg-tab="${escapeHtml(filename)}">
          <span>${escapeHtml(filename)}</span>
          ${modified}
          <button class="pkg-tab-close" data-pkg-tab-close="${escapeHtml(filename)}" type="button">×</button>
        </div>
      `
    }).join("")
    tabBar.querySelectorAll("[data-pkg-tab]").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        if (event.target.closest("[data-pkg-tab-close]")) return
        switchPkgFile(tab.getAttribute("data-pkg-tab") || "")
      })
    })
    tabBar.querySelectorAll("[data-pkg-tab-close]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation()
        const filename = button.getAttribute("data-pkg-tab-close") || ""
        state.packageTabs.delete(filename)
        if (state.currentPackageFile === filename) {
          const next = [...state.packageTabs][0]
          if (next) switchPkgFile(next)
        }
        renderPkgTabs()
      })
    })
  }

  function markCurrentFileModified() {
    if (!_currentEditingFile) return
    state.packageModified.add(_currentEditingFile)
    const file = getCurrentPackageFile()
    if (file) {
      file.content = activePackageEditorContent()
    }
    renderPkgTabs()
    initPkgFileTree(state.currentPackage)
  }

  async function savePkgFile() {
    if (!state.currentPackage || !state.currentPackageFile) return
    await savePackageManifestIfChanged()
    const filename = state.currentPackageFile
    const content = activePackageEditorContent()
    const entryFile = getPackageEntryFile(state.currentPackage)
    try {
      const response = await fetch(`${packageServiceBase}/packages/${encodeURIComponent(state.currentPackage.package_id)}/files/${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
      }
      const file = getCurrentPackageFile()
      if (file) {
        file.content = content
        file.functions = (payload.functions_detected || []).map((name) => ({ func_name: name }))
      }
      state.packageModified.delete(filename)
      renderPkgTabs()
      initPkgFileTree(state.currentPackage)
      if (entryFile && getPackageFileKey(entryFile) === filename) {
        await syncBoundPackageResource("同步多文件入口文件")
      }
      showToast(`保存成功：${filename}`)
      notifyHost({ type: "resourceChanged", method: "POST", url: `/packages/${state.currentPackage.package_id}/files/${filename}` })
    } catch (error) {
      showToast(error.message || String(error), "error")
    }
  }

  async function savePackageManifestIfChanged() {
    const input = document.getElementById("pkgNamespaceInput")
    const nextNamespace = input?.value?.trim()
    if (!state.currentPackage || !nextNamespace || nextNamespace === state.currentPackage.namespace) {
      return
    }
    const response = await fetch(`${packageServiceBase}/packages/${encodeURIComponent(state.currentPackage.package_id)}/manifest`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace: nextNamespace }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
    }
    const previousFile = state.currentPackageFile
    state.currentPackage = payload.package || state.currentPackage
    state.currentPackageFile = previousFile
    if (input) input.value = state.currentPackage.namespace || nextNamespace
    initPkgFileTree(state.currentPackage)
    await syncBoundPackageResource("同步多文件命名空间")
    showToast(`命名空间已更新：${state.currentPackage.namespace}`)
  }

  async function addPkgFile() {
    if (!state.currentPackage) return
    const filename = window.prompt("请输入新文件名（必须以 .py 结尾）", "helper.py")
    if (!filename) return
    if (!filename.endsWith(".py")) {
      showToast("文件名必须以 .py 结尾", "error")
      return
    }
    const file = { filename: filename.split("/").pop(), relative_path: filename, content: "", is_entry: false, functions: [] }
    upsertPackageFile(file)
    await fetch(`${packageServiceBase}/packages/${encodeURIComponent(state.currentPackage.package_id)}/files/${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    })
    initPkgFileTree(state.currentPackage)
    await openFileInEditor(file)
  }

  function uploadPkgFile() {
    if (!state.currentPackage) return
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".py,.json,.md,.txt"
    input.addEventListener("change", async () => {
      const file = input.files?.[0]
      if (!file) return
      const content = await file.text()
      const pkgFile = { filename: file.name, relative_path: file.name, content, is_entry: false, functions: [] }
      upsertPackageFile(pkgFile)
      await fetch(`${packageServiceBase}/packages/${encodeURIComponent(state.currentPackage.package_id)}/files/${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      initPkgFileTree(state.currentPackage)
      await openFileInEditor(pkgFile)
    })
    input.click()
  }

  async function deletePkgFile(filename) {
    if (!state.currentPackage || !filename) return
    try {
      const response = await fetch(`${packageServiceBase}/packages/${encodeURIComponent(state.currentPackage.package_id)}/files/${encodeURIComponent(filename)}`, { method: "DELETE" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
      }
      state.currentPackage.files = (state.currentPackage.files || []).filter((file) => getPackageFileKey(file) !== filename)
      state.packageTabs.delete(filename)
      state.packageModified.delete(filename)
      delete _monacoModels[filename]
      if (state.currentPackageFile === filename) {
        const next = (state.currentPackage.files || []).find((file) => file.is_entry) || state.currentPackage.files?.[0]
        if (next) await openFileInEditor(next)
      }
      initPkgFileTree(state.currentPackage)
      renderPkgTabs()
      showToast(`已删除：${filename}`)
    } catch (error) {
      showToast(error.message || String(error), "error")
    }
  }

  function initTestPanel(currentExportEntry) {
    const panel = document.getElementById("pkgTestPanel")
    if (!panel || !state.currentPackage) return
    const exports = state.currentPackage.exports || []
    const selected = currentExportEntry || exports[0] || ""
    panel.innerHTML = `
      <div class="pkg-test-pane">
        <div class="pkg-test-pane-title">测试输入</div>
        <select id="pkgTestExport" class="pkg-test-select">
          ${exports.map((name) => `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
        <textarea id="pkgTestInput" class="pkg-test-input">{"values":[1,2,3,100,4,5],"window_size":3,"sigma":2.0}</textarea>
        <button class="pkg-btn success" id="pkgRunTestBtn" type="button">运行当前函数</button>
      </div>
      <div class="pkg-test-pane">
        <div class="pkg-test-pane-title">测试输出</div>
        <textarea id="pkgTestOutput" class="pkg-test-output" readonly>等待运行测试</textarea>
      </div>
    `
    document.getElementById("pkgRunTestBtn")?.addEventListener("click", runPackageTest)
  }

  async function runPackageTest() {
    const output = document.getElementById("pkgTestOutput")
    clearEditorErrors()
    try {
      const exportName = document.getElementById("pkgTestExport")?.value || state.currentPackage?.exports?.[0]
      if (!state.currentPackage || !exportName) {
        throw new Error("未选择可测试的导出函数")
      }
      const rawInput = document.getElementById("pkgTestInput")?.value || "{}"
      const parsed = JSON.parse(rawInput)
      const body = Array.isArray(parsed)
        ? { args: parsed, kwargs: {} }
        : parsed && typeof parsed === "object" && ("args" in parsed || "kwargs" in parsed)
          ? { args: parsed.args || [], kwargs: parsed.kwargs || {} }
          : { args: [], kwargs: parsed || {} }
      const response = await fetch(`${packageServiceBase}/${encodeURIComponent(state.currentPackage.namespace)}/${encodeURIComponent(exportName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
      }
      if (output) {
        output.value = JSON.stringify(payload, null, 2)
      }
      if (!payload.success && payload.error) {
        const match = String(payload.error).match(/line\s+(\d+)/i)
        if (match) markEditorError(Number(match[1]), payload.error)
      }
    } catch (error) {
      if (output) output.value = error.message || String(error)
      markEditorError(1, error.message || String(error))
    }
  }

  function toggleTestPanel() {
    const panel = document.getElementById("pkgTestPanel")
    const icon = document.getElementById("testPanelToggleIcon")
    if (!panel) return
    const opening = !panel.classList.contains("open")
    panel.classList.toggle("open", opening)
    if (opening) {
      if (!panel.style.height) panel.style.height = "280px"
      initTestPanel(state.currentPackage?.exports?.[0])
    } else {
      panel.style.height = "0px"
    }
    if (icon) icon.textContent = opening ? "▲" : "▼"
    setTimeout(() => _monacoEditor?.layout(), 220)
  }

  function initVResizeDrag() {
    const handle = document.getElementById("pkgVresize")
    const testPanel = document.getElementById("pkgTestPanel")
    const overlay = document.getElementById("dragOv") || document.createElement("div")
    if (!handle || !testPanel) return
    if (!overlay.id) {
      overlay.id = "dragOv"
      overlay.className = "pkg-drag-overlay"
      document.body.appendChild(overlay)
    }
    let dragging = false
    let startY = 0
    let startPanelH = 0
    handle.addEventListener("mousedown", (event) => {
      if (event.target.closest(".vresize-label")) return
      dragging = true
      startY = event.clientY
      startPanelH = testPanel.offsetHeight
      overlay.classList.add("on")
      overlay.style.cursor = "row-resize"
      event.preventDefault()
    })
    document.addEventListener("mousemove", (event) => {
      if (!dragging) return
      const delta = startY - event.clientY
      const nextHeight = Math.max(120, Math.min(500, startPanelH + delta))
      testPanel.style.height = `${nextHeight}px`
      testPanel.classList.add("open")
      const icon = document.getElementById("testPanelToggleIcon")
      if (icon) icon.textContent = "▲"
    })
    document.addEventListener("mouseup", () => {
      if (!dragging) return
      dragging = false
      overlay.classList.remove("on")
      overlay.style.cursor = ""
      _monacoEditor?.layout()
    })
  }

  function initPkgFileResize() {
    const handle = document.getElementById("pkgResizeH")
    const tree = document.getElementById("pkgFiletree")
    if (!handle || !tree) return
    let dragging = false
    let startX = 0
    let startWidth = 0
    handle.addEventListener("mousedown", (event) => {
      dragging = true
      startX = event.clientX
      startWidth = tree.offsetWidth
      handle.classList.add("on")
      event.preventDefault()
    })
    document.addEventListener("mousemove", (event) => {
      if (!dragging) return
      const width = Math.max(120, Math.min(320, startWidth + event.clientX - startX))
      tree.style.width = `${width}px`
      _monacoEditor?.layout()
    })
    document.addEventListener("mouseup", () => {
      if (!dragging) return
      dragging = false
      handle.classList.remove("on")
      _monacoEditor?.layout()
    })
  }

  function markEditorError(lineNumber, message) {
    if (!_monacoEditor || !window._monaco) return
    const model = _monacoEditor.getModel()
    if (!model) return
    window._monaco.editor.setModelMarkers(model, "test-error", [{
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: model.getLineLength(lineNumber) + 1,
      message,
      severity: window._monaco.MarkerSeverity.Error,
    }])
  }

  function clearEditorErrors() {
    if (!_monacoEditor || !window._monaco) return
    const model = _monacoEditor.getModel()
    if (model) {
      window._monaco.editor.setModelMarkers(model, "test-error", [])
    }
  }

  function submitPackage() {
    if (!state.currentPackage) return
    notifyHost({ type: "submitPackage", packageId: state.currentPackage.package_id })
    showToast(`已提交审核：${state.currentPackage.zh_name || state.currentPackage.name}`)
  }

  function closePkgEditor() {
    const editor = document.getElementById("pkgEditor")
    if (editor) editor.remove()
    Object.values(_monacoModels).forEach((model) => model?.dispose?.())
    _monacoEditor?.dispose?.()
    _monacoEditor = null
    _monacoModels = {}
    _currentEditingFile = ""
    state.currentPackage = null
    state.currentPackageFile = ""
    state.currentPackageBinding = null
    state.packageTabs = new Set()
    state.packageModified = new Set()
    state.currentGalleryAlgorithm = null
    state.galleryEditorModified = false
    if (state.currentPanel === "templates") renderTemplates()
    if (state.currentPanel === "algorithms") renderAlgorithms()
  }

  const galleryEditorContent = () => {
    if (_monacoEditor) return _monacoEditor.getValue()
    const fallback = document.getElementById("pkgFallbackEditor")
    return fallback ? fallback.value : ""
  }

  const getGalleryFileKey = (file) => file?.relative_path || file?.filename || ""

  function renderGalleryFileTree() {
    const body = document.getElementById("galleryFiletreeBody")
    if (!body) return
    const files = state.galleryFolderFiles || []
    body.innerHTML = files.map((file) => {
      const key = getGalleryFileKey(file)
      const active = key === state.currentGalleryFile ? " active" : ""
      const funcs = (file.functions || []).map((fn) => fn.func_name || fn.name).filter(Boolean)
      return `
        <button class="pft-file${active}" data-gallery-file="${escapeHtml(key)}" type="button">
          <span>${escapeHtml(file.filename || key)}</span>
          <small>${funcs.length ? `def ${escapeHtml(funcs.join(", "))}` : "无函数"}</small>
        </button>
      `
    }).join("")
    body.querySelectorAll("[data-gallery-file]").forEach((button) => {
      button.addEventListener("click", () => switchGallerySourceFile(button.getAttribute("data-gallery-file") || ""))
    })
  }

  const renderGalleryEditorShell = (item, content) => {
    const contentArea = document.querySelector(".content")
    if (!contentArea) return null
    document.getElementById("pkgEditor")?.remove()
    const editor = document.createElement("div")
    editor.className = "pkg-editor"
    editor.id = "pkgEditor"
    editor.innerHTML = `
      <div class="pkg-topbar">
        <span class="pkg-name">${escapeHtml(item.zhName || item.callPrefix || "算法模板")}</span>
        <span class="pkg-ver-tag">v${escapeHtml(item.version || "1.0.0")}</span>
        <span class="pkg-type-badge">算法模板</span>
        <label class="pkg-namespace-field">命名空间
          <input id="galleryNamespaceInput" class="pkg-namespace-input" value="${escapeHtml(fullAlgorithmNamespace(item))}" />
        </label>
        <div class="pkg-topbar-actions">
          <button class="pkg-btn" data-pkg-action="close" type="button">← 返回列表</button>
          <button class="pkg-btn" data-pkg-action="save-file" type="button">保存</button>
          <button class="pkg-btn success" data-pkg-action="toggle-test" type="button">运行测试</button>
        </div>
      </div>
      <div class="pkg-body">
        <div class="pkg-filetree" id="galleryFiletree">
          <div class="pft-header">
            <span class="pft-title">文件</span>
            <button class="pft-add-btn" data-pkg-action="add-file" title="新增文件" type="button">＋</button>
          </div>
          <div class="pft-body" id="galleryFiletreeBody"></div>
        </div>
        <div class="pkg-resize-handle" id="pkgResizeH"></div>
        <div class="pkg-editor-area">
          <div class="pkg-tab-bar" id="galleryTabBar"></div>
          <div class="monaco-container" id="monacoContainer"></div>
          <textarea class="pkg-fallback-editor hidden" id="pkgFallbackEditor" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="pkg-vresize" id="pkgVresize">
        <div class="vresize-label" data-pkg-action="toggle-test-label" role="button" tabindex="0">测试面板 <span id="testPanelToggleIcon">▼</span></div>
      </div>
      <div class="pkg-test-panel" id="pkgTestPanel"></div>
    `
    contentArea.appendChild(editor)
    bindPackageEditorButtons(editor, "gallery")
    initPkgFileResize()
    return editor
  }

  async function openGalleryAlgorithmEditor(algorithmId) {
    const item = state.galleryAlgorithms.find((algorithm) => algorithm.id === algorithmId)
    if (!item) {
      showToast("未找到算法模板", "error")
      return
    }
    if (item.packageId) {
      await openPackageEditor(item.packageId)
      return
    }
    try {
      const response = await fetch(`${packageServiceBase}/algorithm-source/${encodeURIComponent(algorithmId)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
      }
      state.currentGalleryAlgorithm = payload.algorithm || item
      state.galleryFolderFiles = Array.isArray(payload.folder_files) && payload.folder_files.length
        ? payload.folder_files
        : [{
            filename: `${(payload.algorithm || item).funcName || "source"}.py`,
            relative_path: `${(payload.algorithm || item).funcName || "source"}.py`,
            content: payload.source || payload.content || "",
            is_entry: true,
            functions: [{
              func_name: (payload.algorithm || item).funcName,
              params: (payload.algorithm || item).params || [],
            }],
          }]
      state.currentGalleryFile = ""
      state.galleryEditorModified = false
      _monacoEditor?.dispose?.()
      _monacoEditor = null
      _monacoModels = {}
      renderGalleryEditorShell(state.currentGalleryAlgorithm, payload.source || payload.content || "")
      renderGalleryFileTree()
      const entryFile = state.galleryFolderFiles.find((file) => file.is_entry) || state.galleryFolderFiles[0]
      await openGallerySourceFile(getGalleryFileKey(entryFile))
      initVResizeDrag()
    } catch (error) {
      showToast(error.message || String(error), "error")
    }
  }

  async function initGallerySourceEditor(content, language = "python", filename = "source.py") {
    const fallback = document.getElementById("pkgFallbackEditor")
    const monacoHost = document.getElementById("monacoContainer")
    if (fallback) {
      fallback.value = content || ""
      fallback.oninput = () => markGallerySourceModified()
      fallback.classList.remove("hidden")
    }
    if (monacoHost) {
      monacoHost.classList.add("hidden")
    }
    const monaco = await loadMonaco().catch(() => null)
    if (!monacoHost || !monaco) {
      _monacoEditor = null
      return
    }
    fallback?.classList.add("hidden")
    monacoHost.classList.remove("hidden")
    if (!_monacoEditor) {
      await initMonacoEditor("monacoContainer", content || "", language)
    }
    if (_monacoEditor) {
      const model = getOrCreateModel(filename, content || "", language)
      _monacoEditor.setModel(model)
      window._activeMonaco = _monacoEditor
    }
  }

  async function openGallerySourceFile(filename) {
    const file = (state.galleryFolderFiles || []).find((item) => getGalleryFileKey(item) === filename || item.filename === filename)
    if (!file) return
    const key = getGalleryFileKey(file)
    state.currentGalleryFile = key
    await initGallerySourceEditor(file.content || "", inferLanguageFromFileName(key), key)
    const tabBar = document.getElementById("galleryTabBar")
    if (tabBar) {
      tabBar.innerHTML = `<div class="pkg-tab active"><span>${escapeHtml(key)}</span><span id="galleryModifiedDot"></span></div>`
    }
    renderGalleryFileTree()
    initGalleryTestPanel()
  }

  function switchGallerySourceFile(filename) {
    const current = (state.galleryFolderFiles || []).find((item) => getGalleryFileKey(item) === state.currentGalleryFile)
    if (current) current.content = galleryEditorContent()
    openGallerySourceFile(filename)
  }

  async function addGallerySourceFile() {
    const item = state.currentGalleryAlgorithm
    if (!item) return
    const filename = window.prompt("请输入 .py 文件名", "helpers.py")
    if (filename === null) return
    const normalized = filename.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*\.py$/.test(normalized)) {
      showToast("文件名仅允许 .py 后缀", "error")
      return
    }
    try {
      const response = await fetch(`${packageServiceBase}/algorithm-source/${encodeURIComponent(item.id)}/add-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: normalized, content: "# 新文件\n" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
      }
      state.galleryFolderFiles = payload.folder_files || state.galleryFolderFiles
      renderGalleryFileTree()
      await openGallerySourceFile(normalized)
      showToast("文件已新增")
    } catch (error) {
      showToast(error.message || String(error), "error")
    }
  }

  function markGallerySourceModified() {
    state.galleryEditorModified = true
    const dot = document.getElementById("galleryModifiedDot")
    if (dot) dot.className = "modified-dot"
  }

  async function saveGalleryAlgorithmSource() {
    const item = state.currentGalleryAlgorithm
    if (!item) return
    try {
      const response = await fetch(`${packageServiceBase}/algorithm-source/${encodeURIComponent(item.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: galleryEditorContent(),
          namespace: document.getElementById("galleryNamespaceInput")?.value?.trim() || item.namespace,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
      }
      state.galleryEditorModified = false
      if (payload.algorithm) {
        state.currentGalleryAlgorithm = payload.algorithm
        const nsInput = document.getElementById("galleryNamespaceInput")
        if (nsInput) nsInput.value = fullAlgorithmNamespace(payload.algorithm) || nsInput.value
      }
      const dot = document.getElementById("galleryModifiedDot")
      if (dot) dot.className = ""
      showToast(`保存成功，检测到函数：${(payload.functions_detected || []).join(", ") || "无"}`)
      await loadGalleryAlgorithms()
      renderComponentGallery()
    } catch (error) {
      showToast(error.message || String(error), "error")
    }
  }

  function initGalleryTestPanel() {
    const panel = document.getElementById("pkgTestPanel")
    const item = state.currentGalleryAlgorithm
    if (!panel || !item) return
    panel.innerHTML = `
      <div class="pkg-test-pane">
        <div class="pkg-test-pane-title">测试输入</div>
        <textarea id="pkgTestInput" class="pkg-test-input">{"args":[],"kwargs":{}}</textarea>
        <button class="pkg-btn success" data-pkg-action="run-gallery-test" type="button">运行当前模板</button>
      </div>
      <div class="pkg-test-pane">
        <div class="pkg-test-pane-title">测试输出</div>
        <textarea id="pkgTestOutput" class="pkg-test-output" readonly>等待运行测试</textarea>
      </div>
    `
  }

  function toggleGalleryTestPanel() {
    const panel = document.getElementById("pkgTestPanel")
    const icon = document.getElementById("testPanelToggleIcon")
    if (!panel) return
    const opening = !panel.classList.contains("open")
    panel.classList.toggle("open", opening)
    if (opening) {
      if (!panel.style.height) panel.style.height = "280px"
      const item = state.currentGalleryAlgorithm
      const currentFile = (state.galleryFolderFiles || []).find((file) => getGalleryFileKey(file) === state.currentGalleryFile)
      const currentFunc = (currentFile?.functions || [])[0]
      if (window.initTestPanel) {
        window.initTestPanel(
          item?.namespace || "",
          currentFunc?.func_name || item?.funcName || "",
          currentFunc?.params || item?.params || [],
        )
      } else {
        initGalleryTestPanel()
      }
    } else {
      panel.style.height = "0px"
    }
    if (icon) icon.textContent = opening ? "▲" : "▼"
    setTimeout(() => _monacoEditor?.layout(), 220)
  }

  async function runGalleryAlgorithmTest() {
    const output = document.getElementById("pkgTestOutput")
    const item = state.currentGalleryAlgorithm
    if (!item) return
    try {
      const parsed = JSON.parse(document.getElementById("pkgTestInput")?.value || "{}")
      const body = parsed && typeof parsed === "object" && ("args" in parsed || "kwargs" in parsed)
        ? { args: parsed.args || [], kwargs: parsed.kwargs || {} }
        : { args: [], kwargs: parsed || {} }
      const response = await fetch(`${packageServiceBase}/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.funcName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
      }
      if (output) output.value = JSON.stringify(payload, null, 2)
    } catch (error) {
      if (output) output.value = error.message || String(error)
    }
  }

  async function openGalleryAlgorithmTest(algorithmId) {
    await openGalleryAlgorithmEditor(algorithmId)
    if (state.currentPackage) {
      const panel = document.getElementById("pkgTestPanel")
      if (panel && !panel.classList.contains("open")) {
        toggleTestPanel()
      }
      return
    }
    if (state.currentGalleryAlgorithm) {
      const panel = document.getElementById("pkgTestPanel")
      if (panel && !panel.classList.contains("open")) {
        toggleGalleryTestPanel()
      }
    }
  }

  function openTemplateTestDialog(templateId = state.selectedTemplateId) {
    const template = getTemplateById(Number(templateId))
    const content = Number(templateId) === Number(state.selectedTemplateId)
      ? getEditorValue("#template-form", "content")
      : template?.content || ""
    if (!template && !content) {
      showError("请先选择或填写一个算法模板")
      return
    }
    document.getElementById("template-test-dialog")?.remove()
    const dialog = document.createElement("div")
    dialog.id = "template-test-dialog"
    dialog.className = "modal-backdrop"
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = `
      <div class="modal-card algolib-create-package-card">
        <div class="card-header">
          <h4>运行模板样例：${escapeHtml(template?.zhName || template?.name || value($("#template-form"), "zhName") || value($("#template-form"), "name") || "未命名模板")}</h4>
          <button type="button" class="ghost-button" data-template-test-close>关闭</button>
        </div>
        <div class="detail-form">
          <label>函数名（留空自动使用第一个 def）<input id="templateTestFunction" placeholder="例如 random_sample" /></label>
          <label>测试输入 JSON<textarea id="templateTestInput" rows="5">{"args":[[1,2,3,4,5]],"kwargs":{}}</textarea></label>
          <button type="button" id="templateTestRun" class="primary-button">运行</button>
          <label>输出<textarea id="templateTestOutput" rows="8" readonly>等待运行测试</textarea></label>
        </div>
      </div>
    `
    document.body.appendChild(dialog)
    dialog.querySelectorAll("[data-template-test-close]").forEach((button) => button.addEventListener("click", () => dialog.remove()))
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.remove()
    })
    dialog.querySelector("#templateTestRun").addEventListener("click", async () => {
      const output = dialog.querySelector("#templateTestOutput")
      try {
        const parsed = JSON.parse(dialog.querySelector("#templateTestInput").value || "{}")
        const body = {
          content,
          function: dialog.querySelector("#templateTestFunction").value.trim(),
          args: parsed.args || [],
          kwargs: parsed.kwargs || {},
        }
        const response = await fetch(`${packageServiceBase}/run-source`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
        }
        output.value = JSON.stringify(payload, null, 2)
      } catch (error) {
        output.value = error.message || String(error)
      }
    })
  }

  function openAlgorithmTestDialog(algorithmId = state.selectedAlgorithmId) {
    const algorithm = getAlgorithmById(Number(algorithmId))
    const content = Number(algorithmId) === Number(state.selectedAlgorithmId)
      ? getEditorValue("#algorithm-form", "content")
      : algorithm?.content || ""
    if (!algorithm && !content) {
      showError("请先选择一个组件")
      return
    }
    document.getElementById("algorithm-test-dialog")?.remove()
    const dialog = document.createElement("div")
    dialog.id = "algorithm-test-dialog"
    dialog.className = "modal-backdrop"
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = `
      <div class="modal-card algolib-create-package-card">
        <div class="card-header">
          <h4>运行组件测试：${escapeHtml(algorithm?.zhName || algorithm?.name || "未命名组件")}</h4>
          <button type="button" class="ghost-button" data-algorithm-test-close>关闭</button>
        </div>
        <div class="detail-form">
          <label>函数名<input id="algorithmTestFunction" value="${escapeHtml(algorithm?.name || "")}" /></label>
          <label>测试输入 JSON<textarea id="algorithmTestInput" rows="5">{"args":[],"kwargs":{}}</textarea></label>
          <button type="button" id="algorithmTestRun" class="primary-button">运行</button>
          <label>输出<textarea id="algorithmTestOutput" rows="8" readonly>等待运行测试</textarea></label>
        </div>
      </div>
    `
    document.body.appendChild(dialog)
    dialog.querySelectorAll("[data-algorithm-test-close]").forEach((button) => button.addEventListener("click", () => dialog.remove()))
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.remove()
    })
    dialog.querySelector("#algorithmTestRun").addEventListener("click", async () => {
      const output = dialog.querySelector("#algorithmTestOutput")
      try {
        const parsed = JSON.parse(dialog.querySelector("#algorithmTestInput").value || "{}")
        const body = {
          content,
          function: dialog.querySelector("#algorithmTestFunction").value.trim() || algorithm?.name || "",
          args: parsed.args || [],
          kwargs: parsed.kwargs || {},
        }
        const response = await fetch(`${packageServiceBase}/run-source`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
        }
        output.value = JSON.stringify(payload, null, 2)
      } catch (error) {
        output.value = error.message || String(error)
      }
    })
  }

  async function openAlgorithmApiDialog(algorithmId = state.selectedAlgorithmId) {
    const algorithm = getAlgorithmById(Number(algorithmId))
    if (!algorithm) {
      showError("请先选择一个组件")
      return
    }
    document.getElementById("algorithm-api-dialog")?.remove()
    let docPayload = null
    try {
      const response = await fetch(`${packageServiceBase}/invoke/docs/${encodeURIComponent(`alg.${algorithm.namespace || "component"}`)}`)
      const payload = await response.json().catch(() => ({}))
      if (response.ok) {
        docPayload = payload
      }
    } catch (error) {
      console.warn("Failed to load API docs.", error)
    }
    const primaryEntry = docPayload?.primary || docPayload?.entries?.[0] || null
    const namespaceCall = primaryEntry?.call_prefix || `alg.${algorithm.namespace || "component"}.${sanitizeSlug(algorithm.name, "run")}`
    const restPath = primaryEntry?.api_path || algorithm.apiPath || `/api/v1/invoke/${namespaceCall}`
    const paramsText = Array.isArray(primaryEntry?.params) && primaryEntry.params.length
      ? primaryEntry.params.map((item) => `${item.name}${item.type ? `: ${item.type}` : ""}${item.default ? ` = ${item.default}` : ""}${item.description ? `  // ${item.description}` : ""}`).join("\n")
      : (algorithm.inputSpec || "")
    const examples = primaryEntry?.examples || {}
    const dialog = document.createElement("div")
    dialog.id = "algorithm-api-dialog"
    dialog.className = "modal-backdrop"
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = `
      <div class="modal-card algolib-create-package-card">
        <div class="card-header">
          <h4>API 文档：${escapeHtml(algorithm.zhName || algorithm.name)}</h4>
          <button type="button" class="ghost-button" data-algorithm-api-close>关闭</button>
        </div>
        <div class="detail-form">
          <label>命名空间<input value="${escapeHtml(namespaceCall)}" readonly /></label>
          <label>REST 接口<input value="${escapeHtml(restPath)}" readonly /></label>
          <label>参数协议<textarea rows="5" readonly>${escapeHtml(paramsText)}</textarea></label>
          <label>输出说明<textarea rows="4" readonly>${escapeHtml(primaryEntry?.return_type || algorithm.outputSpec || "")}</textarea></label>
          <label>Python 调用示例<textarea rows="5" readonly>${escapeHtml(examples.python || algorithm.example || `result = ${namespaceCall}(...)`)}</textarea></label>
          <label>HTTP 调用示例<textarea rows="7" readonly>${escapeHtml(examples.http || `POST ${restPath}\nContent-Type: application/json\n\n{\n  "args": [],\n  "kwargs": {}\n}`)}</textarea></label>
        </div>
      </div>
    `
    document.body.appendChild(dialog)
    dialog.querySelectorAll("[data-algorithm-api-close]").forEach((button) => button.addEventListener("click", () => dialog.remove()))
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.remove()
    })
  }

  const getTemplateById = (templateId) => state.bootstrap?.templates.find((item) => item.id === templateId) || null
  const getSnippetById = (snippetId) => state.bootstrap?.snippets.find((item) => item.id === snippetId) || null
  const getAlgorithmById = (algorithmId) => state.bootstrap?.algorithms.find((item) => item.id === algorithmId) || null

  const templateVersions = (templateId) =>
    (state.bootstrap?.templateVersions || [])
      .filter((item) => item.templateId === templateId)
      .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))

  const snippetVersions = (snippetId) =>
    (state.bootstrap?.snippetVersions || [])
      .filter((item) => item.snippetId === snippetId)
      .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))

  const algorithmVersions = (algorithmId) =>
    (state.bootstrap?.algorithmVersions || [])
      .filter((item) => item.algorithmId === algorithmId)
      .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))

  const algorithmReviews = (algorithmId) =>
    (state.bootstrap?.algorithmReviews || [])
      .filter((item) => item.algorithmId === algorithmId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  const buildCategoryChildrenMap = (categories) => {
    const childrenMap = new Map()
    categories.forEach((category) => {
      const parentKey = category.parentId || 0
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, [])
      }
      childrenMap.get(parentKey).push(category)
    })
    childrenMap.forEach((list) => {
      list.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    })
    return childrenMap
  }

  const buildFolderChildrenMap = (folders) => {
    const childrenMap = new Map()
    folders.forEach((folder) => {
      const parentKey = folder.parentId || 0
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, [])
      }
      childrenMap.get(parentKey).push(folder)
    })
    childrenMap.forEach((list) => {
      list.sort((left, right) => left.name.localeCompare(right.name))
    })
    return childrenMap
  }

  const flattenCategories = (categories) => {
    const childrenMap = buildCategoryChildrenMap(categories)
    const flattened = []

    const walk = (parentId, depth) => {
      const children = childrenMap.get(parentId || 0) || []
      children.forEach((child) => {
        flattened.push({ ...child, depth })
        walk(child.id, depth + 1)
      })
    }

    walk(0, 0)
    return flattened
  }

  const ensureSelections = () => {
    const data = state.bootstrap
    if (!data) {
      return
    }

    if (!state.creatingTemplate && !data.templates.some((item) => item.id === state.selectedTemplateId)) {
      state.selectedTemplateId = data.templates[0]?.id || null
    }
    if (!state.creatingSnippet && !data.snippets.some((item) => item.id === state.selectedSnippetId)) {
      state.selectedSnippetId = data.snippets[0]?.id || null
    }
    if (!state.creatingAlgorithm && !data.algorithms.some((item) => item.id === state.selectedAlgorithmId)) {
      state.selectedAlgorithmId = data.algorithms[0]?.id || null
    }
    if (!data.categories.some((item) => item.id === state.selectedCategoryId)) {
      state.selectedCategoryId = data.categories[0]?.id || null
    }
    if (!data.snippetFolders.some((item) => item.id === state.selectedSnippetFolderId)) {
      state.selectedSnippetFolderId = data.snippetFolders[0]?.id || null
    }
    if (!data.algorithmFolders.some((item) => item.id === state.selectedAlgorithmFolderId)) {
      state.selectedAlgorithmFolderId = data.algorithmFolders[0]?.id || null
    }
  }

  const ensureCategoryExpansion = () => {
    const categories = state.bootstrap?.categories || []
    if (state.expandedCategoryIds.size === 0) {
      categories.filter((item) => !item.parentId).forEach((item) => state.expandedCategoryIds.add(item.id))
    }
  }

  const buildCategoryOptions = (categories, selectedId, includeEmptyLabel) => {
    const options = []
    if (includeEmptyLabel) {
      options.push(`<option value="">${escapeHtml(includeEmptyLabel)}</option>`)
    }

    flattenCategories(categories).forEach((category) => {
      const prefix = `${"　".repeat(category.depth)}${category.depth > 0 ? "└ " : ""}`
      const selected = String(selectedId || "") === String(category.id) ? ' selected="selected"' : ""
      options.push(`<option value="${category.id}"${selected}>${escapeHtml(`${prefix}${category.name}`)}</option>`)
    })

    return options.join("")
  }

  const expandCategoryPath = (categoryId) => {
    const categories = state.bootstrap?.categories || []
    let current = categories.find((item) => item.id === categoryId) || null
    while (current) {
      state.expandedCategoryIds.add(current.id)
      current = current.parentId ? categories.find((item) => item.id === current.parentId) || null : null
    }
  }

  const expandFolderPath = (folders, folderId, expandedSet) => {
    let current = folders.find((item) => item.id === folderId) || null
    while (current) {
      expandedSet.add(current.id)
      current = current.parentId ? folders.find((item) => item.id === current.parentId) || null : null
    }
  }

  const getEditorKey = (formId, name) => `${formId}:${name}`

  const getEditorValue = (formId, name) => {
    const editorEntry = state.editors.get(getEditorKey(formId, name))
    if (editorEntry) {
      return editorEntry.editor.getValue()
    }
    return value($(formId), name)
  }

  const setEditorValue = (formId, name, nextValue) => {
    const form = $(formId)
    setValue(form, name, nextValue)
    const editorEntry = state.editors.get(getEditorKey(formId, name))
    if (editorEntry && editorEntry.editor.getValue() !== String(nextValue ?? "")) {
      editorEntry.editor.setValue(String(nextValue ?? ""))
    }
  }

  const guessAlgorithmLanguage = (type) => {
    if (String(type || "").toLowerCase().includes("sql")) {
      return "sql"
    }
    if (String(type || "").toLowerCase().includes("json")) {
      return "json"
    }
    if (String(type || "").toLowerCase().includes("python")) {
      return "python"
    }
    return "python"
  }

  const loadMonaco = async () => {
    if (window.monaco?.editor) {
      return window.monaco
    }
    if (state.monacoPromise) {
      return state.monacoPromise
    }

    const CDN_LOADER = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"
    const CDN_VS     = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
    const LOCAL_LOADER = `${staticBase}/lib/vscode/out/vs/loader.js`
    const LOCAL_VS     = `${staticBase}/lib/vscode/out/vs`

    state.monacoPromise = new Promise((resolve, reject) => {
      const configAndLoad = (vsPath) => {
        window.require.config({ paths: { vs: vsPath } })
        window.require(["vs/editor/editor.main"], () => resolve(window.monaco), reject)
      }

      const tryLocal = () => {
        if (window.require) {
          configAndLoad(LOCAL_VS)
          return
        }
        const localScript = document.createElement("script")
        localScript.src = LOCAL_LOADER
        localScript.onload = () => configAndLoad(LOCAL_VS)
        localScript.onerror = reject
        document.head.appendChild(localScript)
      }

      // If require is already loaded (e.g. local VS loader already present), use local directly.
      if (window.require) {
        tryLocal()
        return
      }

      // Try CDN first; fall back to local on any error.
      const cdnScript = document.createElement("script")
      cdnScript.crossOrigin = "anonymous"
      cdnScript.src = CDN_LOADER
      cdnScript.onload = () => {
        window.require.config({ paths: { vs: CDN_VS } })
        window.require(
          ["vs/editor/editor.main"],
          () => resolve(window.monaco),
          () => tryLocal(),
        )
      }
      cdnScript.onerror = () => tryLocal()
      document.head.appendChild(cdnScript)
    }).catch((error) => {
      console.warn("Monaco editor failed to load.", error)
      return null
    })

    return state.monacoPromise
  }

  const updateEditorLanguage = (formId, name) => {
    const entry = state.editors.get(getEditorKey(formId, name))
    if (!entry || !window.monaco?.editor) {
      return
    }
    const model = entry.editor.getModel()
    if (model) {
      window.monaco.editor.setModelLanguage(model, normalizeLanguage(entry.getLanguage() || "plaintext"))
    }
  }

  const ensureEditors = async () => {
    const monaco = await loadMonaco()
    if (!monaco) {
      return
    }

    const specs = [
      { formId: "#template-form", name: "content", compact: false, language: () => normalizeLanguage(value($("#template-form"), "language")) },
      { formId: "#template-form", name: "example", compact: true, language: () => normalizeLanguage(value($("#template-form"), "language")) },
      { formId: "#snippet-form", name: "content", compact: false, language: () => normalizeLanguage(value($("#snippet-form"), "language")) },
      { formId: "#algorithm-form", name: "inputSpec", compact: true, language: () => "json" },
      { formId: "#algorithm-form", name: "outputSpec", compact: true, language: () => "json" },
      { formId: "#algorithm-form", name: "content", compact: false, language: () => normalizeLanguage(guessAlgorithmLanguage(value($("#algorithm-form"), "type"))) },
      { formId: "#algorithm-form", name: "example", compact: true, language: () => normalizeLanguage(guessAlgorithmLanguage(value($("#algorithm-form"), "type"))) },
    ]

    specs.forEach((spec) => {
      const form = $(spec.formId)
      const textarea = field(form, spec.name)
      if (!textarea || state.editors.has(getEditorKey(spec.formId, spec.name))) {
        return
      }

      const host = document.createElement("div")
      host.className = `editor-host${spec.compact ? " is-compact" : ""}`
      textarea.classList.add("is-editor-source")
      textarea.insertAdjacentElement("afterend", host)

      const editor = monaco.editor.create(host, {
        value: textarea.value || "",
        language: normalizeLanguage(spec.language() || "plaintext"),
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        roundedSelection: false,
        scrollBeyondLastLine: false,
        theme: "vs-dark",
      })

      editor.onDidChangeModelContent(() => {
        textarea.value = editor.getValue()
        clearFieldError(spec.formId, spec.name)
        if (spec.formId === "#template-form") {
          updateTemplateVersionPreview()
        }
      })

      state.editors.set(getEditorKey(spec.formId, spec.name), { editor, getLanguage: spec.language })
    })

    const templateLanguage = field($("#template-form"), "language")
    if (templateLanguage && !templateLanguage.dataset.editorBound) {
      templateLanguage.dataset.editorBound = "1"
      templateLanguage.addEventListener("input", () => updateEditorLanguage("#template-form", "content"))
      templateLanguage.addEventListener("input", () => updateEditorLanguage("#template-form", "example"))
      templateLanguage.addEventListener("input", () => {
        updateTemplateVersionPreview()
      })
    }

    const algorithmType = field($("#algorithm-form"), "type")
    if (algorithmType && !algorithmType.dataset.editorBound) {
      algorithmType.dataset.editorBound = "1"
      algorithmType.addEventListener("input", () => updateEditorLanguage("#algorithm-form", "content"))
      algorithmType.addEventListener("change", () => updateEditorLanguage("#algorithm-form", "content"))
    }

    if (monaco.languages && !state.algoCompletionRegistered) {
      state.algoCompletionRegistered = true
      monaco.languages.registerCompletionItemProvider(
        ["python", "javascript", "typescript", "r", "json", "plaintext"],
        {
          triggerCharacters: ["."],
          provideCompletionItems(model, position) {
            const lineText = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            })
            const trimmed = lineText.trimStart()
            if (!trimmed.startsWith("alg.")) {
              return { suggestions: [] }
            }
            const match = trimmed.match(/^(alg(?:\.[A-Za-z0-9_]+)*)$/)
            if (!match) {
              return { suggestions: [] }
            }
            const query = trimmed.slice("alg.".length).toLowerCase()
            const startCol = lineText.length - trimmed.length + 1
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: startCol,
              endColumn: position.column,
            }

            const folders = (state.bootstrap?.algorithmFolders || []).filter((f) => f.callName)
            const algorithms = state.bootstrap?.algorithms || []
            const suggestions = []

            for (const folder of folders) {
              const algosInFolder = algorithms.filter((a) => a.folderId === folder.id && !a.deletedAt)
              for (const algo of algosInFolder) {
                const fullTrigger = `alg.${folder.callName}.${algo.name}`
                const searchText = `${fullTrigger} ${algo.name} ${algo.description || ""} ${(algo.tags || []).join(" ")}`.toLowerCase()
                if (!query || searchText.includes(query)) {
                  suggestions.push({
                    label: fullTrigger,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: `alg.${folder.callName}.${algo.name}($0)`,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: `[${folder.name}] ${algo.description || ""}`.trim(),
                    documentation: {
                      value: `**${algo.name}**\n\n${algo.description || ""}\n\n\`\`\`\n${(algo.content || "").slice(0, 300)}\n\`\`\``,
                    },
                    filterText: searchText,
                    sortText: `1${folder.callName}.${algo.name}`,
                    range,
                  })
                }
              }
            }

            return { suggestions }
          },
        },
      )
    }
  }

  const updateCategoryLevelPreview = () => {
    const form = $("#category-form")
    const parentId = value(form, "parentId")
    const parent = (state.bootstrap?.categories || []).find((item) => String(item.id) === parentId)
    const level = parent ? parent.level + 1 : 1
    setValue(form, "level", level)
    setValue(form, "levelDisplay", `L${level}`)
    $("#category-level-preview").textContent = level === 1 ? texts.categoryLevel1 : texts.categoryLevelN(level)
  }

  const inferTemplateBump = (template, draft) => {
    if (!template) {
      return "patch"
    }

    const nameChanged = template.name !== draft.name
    const categoryChanged = Number(template.categoryId) !== Number(draft.categoryId)
    const languageChanged = template.language !== draft.language
    const signatureRegex = /(def |class |function |interface |type |export function |export class )/g
    const oldSignatures = (template.content.match(signatureRegex) || []).join("|")
    const newSignatures = (draft.content.match(signatureRegex) || []).join("|")

    if (nameChanged || categoryChanged || languageChanged) {
      return "minor"
    }
    if (oldSignatures !== newSignatures) {
      return "minor"
    }
    return template.content !== draft.content || template.example !== draft.example ? "patch" : "patch"
  }

  const updateTemplateVersionPreview = () => {
    const form = $("#template-form")
    const template = getTemplateById(Number(value(form, "id")))
    const preview = $("#template-version-preview")
    const bumpField = field(form, "bumpType")
    if (!template) {
      preview.textContent = "保存后版本：1.0.0"
      return
    }

    const draft = {
      name: value(form, "name"),
      categoryId: Number(value(form, "categoryId")),
      language: value(form, "language"),
      content: getEditorValue("#template-form", "content"),
      example: getEditorValue("#template-form", "example"),
    }
    const recommended = inferTemplateBump(template, draft)
    if (!bumpField.dataset.manualBump) {
      bumpField.value = recommended
    }
    const nextVersion = bumpVersion(template.currentVersion, value(form, "bumpType") || recommended)
    preview.textContent = `当前版本：${template.currentVersion}  →  保存后：${nextVersion}`
  }

  const updateSnippetVersionPreview = () => {
    const form = $("#snippet-form")
    const snippet = getSnippetById(Number(value(form, "id")))
    const preview = $("#snippet-version-preview")
    const bumpType = value(form, "bumpType") || "patch"
    if (!snippet) {
      $("#snippet-detail-version").textContent = "保存后版本：1.0.0"
      preview.textContent = "保存后版本：1.0.0"
      return
    }
    $("#snippet-detail-version").textContent = `当前版本：${snippet.currentVersion}`
    preview.textContent = `当前版本：${snippet.currentVersion}  →  保存后：${bumpVersion(snippet.currentVersion, bumpType)}`
  }

  const updateAlgorithmVersionPreview = () => {
    const form = $("#algorithm-form")
    const algorithm = getAlgorithmById(Number(value(form, "id")))
    const preview = $("#algorithm-version-preview")
    const bumpType = value(form, "bumpType") || "patch"
    if (!algorithm) {
      $("#algorithm-detail-version").textContent = "保存后版本：1.0.0"
      preview.textContent = "保存后版本：1.0.0"
      return
    }
    $("#algorithm-detail-version").textContent = `当前版本：${algorithm.currentVersion}`
    preview.textContent = `当前版本：${algorithm.currentVersion}  →  保存后：${bumpVersion(algorithm.currentVersion, bumpType)}`
  }

  const filterAndSortTemplates = () => {
    const query = $("#template-search").value.trim().toLowerCase()
    const categoryId = $("#template-filter-category").value
    const language = $("#template-filter-language").value
    const sort = $("#template-sort").value

    const categoryDescendants = new Set()
    if (categoryId) {
      const childrenMap = buildCategoryChildrenMap(state.bootstrap?.categories || [])
      const walk = (parentId) => {
        categoryDescendants.add(parentId)
        ;(childrenMap.get(parentId) || []).forEach((child) => walk(child.id))
      }
      walk(Number(categoryId))
    }

    const items = (state.bootstrap?.templates || []).filter((template) => {
      const matchesQuery =
        !query || [template.name, template.zhName || "", template.description, template.language, template.tags.join(" ")].join(" ").toLowerCase().includes(query)
      const matchesCategory = !categoryId || categoryDescendants.has(template.categoryId)
      const matchesLanguage = !language || template.language === language
      return matchesQuery && matchesCategory && matchesLanguage
    })

    items.sort((left, right) => {
      switch (sort) {
        case "updated-asc":
          return parseDate(left.updatedAt) - parseDate(right.updatedAt)
        case "name-asc":
          return left.name.localeCompare(right.name)
        case "version-desc":
          return compareVersions(right.currentVersion, left.currentVersion)
        case "difficulty-desc":
          return right.difficulty - left.difficulty
        case "difficulty-asc":
          return left.difficulty - right.difficulty
        default:
          return parseDate(right.updatedAt) - parseDate(left.updatedAt)
      }
    })

    return items
  }

  const renderSidebar = () => {
    const actor = state.bootstrap?.actor
    const identityText = actor ? `身份：${actor.isAdmin ? "管理员" : "普通用户"}` : "身份：加载中..."
    const actorRole = $("#actor-role")
    const headerRole = $("#header-role")
    if (actorRole) {
      actorRole.textContent = identityText
    }
    if (headerRole) {
      headerRole.textContent = identityText
    }
    const reviewTab = $('#algorithm-scope-tabs [data-scope="review"]')
    reviewTab?.classList.toggle("hidden", !isAdmin())
    if (!isAdmin() && state.algorithmScope === "review") {
      state.algorithmScope = "mine"
    }

    const templates = state.bootstrap?.templates || []
    const snippets = state.bootstrap?.snippets || []
    const algorithms = state.bootstrap?.algorithms || []
    const templateBadge = $("#template-count-badge")
    if (templateBadge) {
      templateBadge.textContent = String(templates.length)
      templateBadge.classList.toggle("hidden", templates.length === 0)
    }
    const snippetBadge = $("#snippet-count-badge")
    if (snippetBadge) {
      snippetBadge.textContent = String(snippets.length)
      snippetBadge.classList.toggle("hidden", snippets.length === 0)
    }
    const reviewBadge = $("#algorithm-review-badge")
    if (reviewBadge && isAdmin()) {
      const pendingCount = algorithms.filter((a) => a.status === "submitted" || a.status === "reviewing").length
      reviewBadge.textContent = String(pendingCount)
      reviewBadge.classList.toggle("hidden", pendingCount === 0)
    }

    const navCategoryList = $("#nav-category-list")
    if (navCategoryList) {
      const algorithmTypes = [...new Set((state.bootstrap?.algorithms || []).map((item) => item.type).filter(Boolean))]
      const fallback = ["数据预处理", "统计分析", "机器学习", "时序分析", "信号处理"]
      const items = (algorithmTypes.length ? algorithmTypes : fallback).map((name) => ({ id: name, name }))
      navCategoryList.innerHTML = items
        .map((cat) => {
          const active = state.currentPanel === "algorithms" && ($("#algorithm-search")?.value || "").trim() === cat.name
          return `<div class="nav-sub-item algolib-nav-sub-item${active ? " active" : ""}" data-cat-id="${escapeHtml(String(cat.id))}" data-cat-name="${escapeHtml(cat.name)}" tabindex="0">${escapeHtml(cat.name)}</div>`
        })
        .join("")
      navCategoryList.classList.toggle("open", state.currentPanel === "algorithms")
      navCategoryList.querySelectorAll(".nav-sub-item").forEach((el) => {
        el.addEventListener("click", () => {
          const catName = el.getAttribute("data-cat-name") || ""
          activatePanel("algorithms")
          state.selectedAlgorithmFolderId = null
          $("#algorithm-search").value = catName
          renderAlgorithms()
          renderSidebar()
        })
      })
    }

    const templateNavList = $("#algolib-template-nav-sub")
    if (templateNavList) {
      const templateCategories = (state.bootstrap?.categories || [])
        .filter((item) => item.scope === "template")
        .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0) || String(left.name || "").localeCompare(String(right.name || "")))
      templateNavList.innerHTML = templateCategories
        .map((category) => {
          const active = state.currentPanel === "templates" && String(state.selectedCategoryId || "") === String(category.id)
          return `<div class="nav-sub-item algolib-nav-sub-item${active ? " active" : ""}" data-ui-template-nav-category="${category.id}" tabindex="0">${escapeHtml(category.name)}</div>`
        })
        .join("")
      templateNavList.classList.toggle("open", state.currentPanel === "templates")
      templateNavList.querySelectorAll("[data-ui-template-nav-category]").forEach((el) => {
        el.addEventListener("click", () => {
          const nextId = Number(el.getAttribute("data-ui-template-nav-category") || 0)
          state.selectedCategoryId = nextId || null
          const categoryFilter = $("#template-filter-category")
          if (categoryFilter) {
            categoryFilter.value = nextId ? String(nextId) : ""
          }
          if (nextId) {
            expandCategoryPath(nextId)
          }
          activatePanel("templates")
          renderTemplates()
        })
      })
    }

    $("#algolib-snippet-nav-sub")?.classList.toggle("open", state.currentPanel === "snippets")
    $("#algolib-review-nav-sub")?.classList.toggle("open", state.currentPanel === "algorithms")
    $("#algolib-gallery-nav-sub")?.classList.toggle("open", state.currentPanel === "component-gallery")
    $$('[data-ui-snippet-tab]').forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-ui-snippet-tab") === state.snippetScope)
    })
    $$('[data-ui-algorithm-scope]').forEach((el) => {
      const scope = el.getAttribute("data-ui-algorithm-scope")
      const isActive = scope === (isAdmin() ? state.algorithmScope : state.algorithmScope === "review" ? "mine" : state.algorithmScope)
      el.classList.toggle("active", isActive)
      if (scope === "review") {
        el.classList.toggle("hidden", !isAdmin())
      }
    })

    $$("#snippet-scope-tabs .scope-tab").forEach((button) => button.classList.toggle("active", button.dataset.scope === state.snippetScope))
    $$("#algorithm-scope-tabs .scope-tab").forEach((button) => button.classList.toggle("active", button.dataset.scope === state.algorithmScope))
    $$(".top-tab[data-panel]").forEach((button) => button.setAttribute("aria-selected", button.dataset.panel === state.currentPanel ? "true" : "false"))
    document.body.classList.toggle("is-embedded", isEmbedded)
    ui_updateStatusBar(state.currentPanel)
  }

  const panelTitles = {
    algorithms: "算法组件工作台",
    templates: "算法模板工作台",
    snippets: "代码片段工作台",
    "component-gallery": "组件注册表",
  }

  const normalizePageName = (name) => {
    const mapping = {
      component: "algorithms",
      template: "templates",
      snippet: "snippets",
    }
    return mapping[name] || name
  }

  const cardBarPalette = ["bar-blue", "bar-green", "bar-yellow", "bar-red", "bar-purple", "bar-cyan"]
  const categoryIcons = {
    数据处理: "⚙",
    数据预处理: "⚙",
    统计分析: "📊",
    机器学习: "🤖",
    时序分析: "📈",
    深度学习: "🧠",
    信号处理: "〰",
    数据可视化: "📉",
    代码片段: "✂",
    未分类: "📦",
  }

  const pickCardBarClass = (seed, index = 0) => {
    const text = String(seed || "")
    let score = index
    for (let i = 0; i < text.length; i += 1) {
      score += text.charCodeAt(i)
    }
    return cardBarPalette[Math.abs(score) % cardBarPalette.length]
  }

  const algorithmStatusTagClass = (status) => {
    if (status === "approved" || status === "published") return "status-pub"
    if (status === "submitted" || status === "reviewing") return "status-review"
    if (status === "rejected" || status === "deprecated") return "status-error"
    return "status-draft"
  }

  const componentNamespaceText = (algorithm) => {
    const namespace = String(algorithm.namespace || "").trim() || sanitizeSlug(algorithm.type || "general")
    const name = sanitizeSlug(algorithm.name || "component")
    return `alg.${namespace}.${name}`
  }

  const templateDisplayNamespace = (template, categoryName) => {
    const prefix = String(categoryName || texts.unassigned)
    return `模板骨架 · ${prefix}`
  }

  const snippetDisplayName = (snippet) => {
    if (snippet.name) return snippet.name
    return `snippet.${snippet.id || "unknown"}`
  }

  function toggleFolder(id) {
    const section = document.getElementById(id)
    if (!section) return
    section.classList.toggle("open")
    const isOpen = section.classList.contains("open")
    if (id.startsWith("tpl-folder-")) {
      const key = decodeURIComponent(id.slice("tpl-folder-".length))
      if (isOpen) state.expandedCategoryIds.add(key)
      else state.expandedCategoryIds.delete(key)
      return
    }
    if (id.startsWith("snip-folder-")) {
      const key = decodeURIComponent(id.slice("snip-folder-".length))
      if (isOpen) state.expandedSnippetFolderIds.add(key === "ungrouped" ? 0 : Number(key))
      else state.expandedSnippetFolderIds.delete(key === "ungrouped" ? 0 : Number(key))
      return
    }
    if (id.startsWith("algo-folder-")) {
      const key = decodeURIComponent(id.slice("algo-folder-".length))
      if (isOpen) state.expandedAlgorithmLibraryTypes.add(key)
      else state.expandedAlgorithmLibraryTypes.delete(key)
    }
  }

  function switchPage(name) {
    ui_switchPage(normalizePageName(name))
  }

  const activatePanel = (panel) => {
    state.currentPanel = panel
    $$(".nav-item[data-panel]").forEach((el) => el.classList.toggle("active", el.dataset.panel === panel))
    $$(".top-tab[data-panel]").forEach((el) => el.classList.toggle("active", el.dataset.panel === panel))
    $$(".panel").forEach((item) => item.classList.toggle("active", item.id === `panel-${panel}`))
    const titleEl = $("#content-panel-title")
    if (titleEl) titleEl.textContent = panelTitles[panel] || panel
    const updatedEl = $("#algolib-last-updated")
    if (updatedEl) {
      updatedEl.textContent = `最近更新：${new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")}`
    }
    syncPanelViews()
    renderSidebar()
    ui_updateStatusBar(panel)
    notifyHost({ type: "moduleChanged", module: panel === "algorithms" ? "review" : panel })
    if (panel === "component-gallery") {
      if (state.galleryAlgorithms.length === 0 && !state.galleryLoading) {
        loadGalleryAlgorithms().then(renderComponentGallery)
      } else {
        renderComponentGallery()
      }
    }
  }

  const syncPanelViews = () => {
    const templateView = currentPanelView("templates")
    $("#templates-list-view")?.classList.toggle("active", templateView === "list")
    $("#templates-detail-view")?.classList.toggle("active", templateView === "detail")
    $("#templates-category-view")?.classList.toggle("active", templateView === "category")

    ;["snippets", "algorithms"].forEach((panel) => {
      const listView = $(`#${panel}-list-view`)
      const detailView = $(`#${panel}-detail-view`)
      const isDetail = currentPanelView(panel) === "detail"
      listView?.classList.toggle("active", !isDetail)
      detailView?.classList.toggle("active", isDetail)
    })

    const actionBar = $("#algolib-content-actions")
    const shouldShowTemplateActions = state.currentPanel === "templates" && isAdmin()
    actionBar?.classList.toggle("hidden", !shouldShowTemplateActions)
  }

  const showPanelList = (panel) => {
    state.panelViews[panel] = "list"
    syncPanelViews()
  }

  const showPanelDetail = (panel) => {
    state.panelViews[panel] = "detail"
    syncPanelViews()
  }

  const showTemplateCategoryView = () => {
    state.panelViews.templates = "category"
    syncPanelViews()
  }

  const renderCategoryForm = () => {
    const form = $("#category-form")
    const category = (state.bootstrap?.categories || []).find((item) => item.id === state.editingCategoryId) || null
    field(form, "parentId").innerHTML = buildCategoryOptions(
      (state.bootstrap?.categories || []).filter((item) => item.id !== category?.id),
      category?.parentId,
      "无父级（一级分类）",
    )

    if (category && !state.creatingCategory) {
      setValue(form, "id", category.id)
      setValue(form, "name", category.name)
      setValue(form, "englishName", category.englishName || "")
      setValue(form, "parentId", category.parentId || "")
      setValue(form, "sortOrder", category.sortOrder)
      setValue(form, "description", category.description || "")
      setValue(form, "level", category.level)
      setValue(form, "levelDisplay", `L${category.level}`)
      $("#category-detail-title").textContent = `编辑分类「${category.name}」`
      $("#category-detail-version").textContent = "修改分类信息后保存，将立即同步到模板列表。"
      $("#category-delete").classList.remove("hidden")
    } else {
      form.reset()
      setValue(form, "id", "")
      setValue(form, "name", "")
      setValue(form, "englishName", "")
      setValue(form, "parentId", state.selectedCategoryId || "")
      setValue(form, "sortOrder", (state.bootstrap?.categories?.length || 0) + 1)
      setValue(form, "description", "")
      setValue(form, "level", 1)
      setValue(form, "levelDisplay", "L1")
      $("#category-detail-title").textContent = "新建分类"
      $("#category-detail-version").textContent = "保存后会立即回到模板列表视图。"
      $("#category-delete").classList.add("hidden")
    }
    updateCategoryLevelPreview()
    setFormReadOnly("#category-form", !isAdmin())
    $("#category-action-bar").classList.toggle("hidden", !isAdmin())
  }

  const renderTemplateVersions = () => {
    const container = $("#template-versions")
    const template = getTemplateById(state.selectedTemplateId)
    if (!template) {
      container.innerHTML = `<div class="version-card">${texts.noVersions}</div>`
      return
    }

    const versions = templateVersions(template.id)
    container.innerHTML = versions.length
      ? versions.map((version, index) => {
          const compareTarget = versions[index + 1] || null
          return `
            <div class="version-card">
              <div class="item-card-header">
                <strong>${escapeHtml(version.version)}</strong>
                <span class="muted">${escapeHtml(new Date(version.createdAt).toLocaleString("zh-CN"))}</span>
              </div>
              <p>变更原因：${escapeHtml(version.changeReason || texts.noDescription)}</p>
              <p>变更摘要：${escapeHtml(version.changeSummary || texts.noDescription)}</p>
              <div class="button-row">
                <button class="mini-button" data-action="template-version-diff" data-id="${template.id}" data-version="${version.version}" data-compare="${compareTarget?.version || ""}">${texts.viewDiff}</button>
                <button class="mini-button" data-action="template-version-restore" data-id="${template.id}" data-version="${version.version}">${texts.restore}</button>
              </div>
            </div>`
        }).join("")
      : `<div class="version-card">${texts.noVersions}</div>`
  }

  const renderTemplates = () => {
    const categories = state.bootstrap?.categories || []
    const templateForm = $("#template-form")
    const categorySelect = $("#template-filter-category")
    const languageSelect = $("#template-filter-language")
    const languages = [...new Set((state.bootstrap?.templates || []).map((item) => item.language).filter(Boolean))].sort()
    const categoryValue = categorySelect.value
    const languageValue = languageSelect.value

    categorySelect.innerHTML = `<option value="">全部分类</option>${buildCategoryOptions(categories, categoryValue, "")}`
    categorySelect.value = categoryValue
    languageSelect.innerHTML = ['<option value="">全部语言</option>'].concat(languages.map((language) => `<option value="${escapeHtml(language)}">${escapeHtml(language)}</option>`)).join("")
    languageSelect.value = languageValue

    const templates = filterAndSortTemplates()
    const templateStats = $("#algolib-template-stats")
    if (templateStats) {
      const categoryCount = new Set(templates.map((item) => item.categoryId)).size
      const pythonCount = templates.filter((item) => normalizeLanguage(item.language) === "python").length
      const scaffoldCount = templates.filter((item) => (item.tags || []).some((tag) => String(tag).includes("模板") || String(tag).includes("骨架"))).length
      templateStats.innerHTML = `
        <article class="algolib-stat-card algolib-stat-primary">
          <div class="algolib-stat-icon">模</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-label">模板总数</div>
            <div class="algolib-stat-value">${templates.length}</div>
            <div class="algolib-stat-sub">标准开发起点</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-success">
          <div class="algolib-stat-icon">类</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-label">分类数量</div>
            <div class="algolib-stat-value">${categoryCount}</div>
            <div class="algolib-stat-sub">按领域组织模板</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-warning">
          <div class="algolib-stat-icon">Py</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-label">Python 模板</div>
            <div class="algolib-stat-value">${pythonCount}</div>
            <div class="algolib-stat-sub">适合快速二开</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-danger">
          <div class="algolib-stat-icon">骨</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-label">骨架模板</div>
            <div class="algolib-stat-value">${scaffoldCount}</div>
            <div class="algolib-stat-sub">可直接发布为组件</div>
          </div>
        </article>
      `
    }
    if (!state.creatingTemplate && !templates.some((item) => item.id === state.selectedTemplateId)) {
      state.selectedTemplateId = templates[0]?.id || state.bootstrap?.templates[0]?.id || null
    }

    const categoryMap = new Map(categories.map((item) => [item.id, item]))
    $("#template-count").textContent = countText(templates.length)
    if (templates.length) {
      const groupedTemplates = new Map()
      templates.forEach((template) => {
        const key = String(template.categoryId || "unassigned")
        if (!groupedTemplates.has(key)) {
          groupedTemplates.set(key, [])
        }
        groupedTemplates.get(key).push(template)
      })

      const visibleGroups = [...groupedTemplates.entries()]
        .map(([key, items]) => ({
          key,
          category: categoryMap.get(Number(key)) || {
            id: key,
            name: texts.unassigned,
            level: 1,
            sortOrder: Number.MAX_SAFE_INTEGER,
          },
          items,
        }))
        .sort((left, right) => {
          const orderGap = (left.category.sortOrder || 0) - (right.category.sortOrder || 0)
          return orderGap || String(left.category.name || "").localeCompare(String(right.category.name || ""))
        })

      if (state.expandedCategoryIds.size === 0) {
        visibleGroups.forEach((group) => state.expandedCategoryIds.add(String(group.key)))
      }

      $("#template-list").innerHTML = visibleGroups.map(({ key, category, items }, groupIndex) => {
        const domId = `tpl-folder-${encodeURIComponent(String(key))}`
        const expanded = state.expandedCategoryIds.has(String(key))
        return `
          <section id="${domId}" class="folder-section${expanded ? " open" : ""}">
            <div class="folder-header" data-action="template-folder-toggle" data-folder-key="${escapeHtml(String(key))}" role="button" tabindex="0">
              <span class="folder-arrow">▶</span>
              <span class="folder-name">${escapeHtml(category.name || texts.unassigned)}</span>
              <span class="folder-count">L${escapeHtml(String(category.level || 1))} 共 ${items.length} 项</span>
              ${isAdmin() ? `<div class="folder-header-acts">
                <button class="btn btn-ghost btn-sm" data-action="category-edit" data-id="${escapeHtml(String(category.id))}" type="button">编辑分类</button>
                <button class="btn btn-ghost btn-sm" data-action="category-add-child" data-id="${escapeHtml(String(category.id))}" type="button">＋ 新建子分类</button>
              </div>` : ""}
            </div>
            <div class="folder-body">
              ${items.map((template, itemIndex) => `
                <div class="algo-card tpl-card${template.id === state.selectedTemplateId ? " selected" : ""}" data-action="template-select" data-id="${template.id}" role="button" tabindex="0">
                  <div class="card-color-bar ${pickCardBarClass(category.name || key, groupIndex + itemIndex)}"></div>
                  <div class="card-body">
                    <div class="card-header">
                      <div class="card-icon">${escapeHtml(categoryIcons[category.name] || "📐")}</div>
                      <div class="card-title-wrap">
                        <div class="card-name">${escapeHtml(template.zhName || template.name)}</div>
                        <div class="card-ns">${escapeHtml(templateDisplayNamespace(template, category.name))}</div>
                      </div>
                    </div>
                    <div class="card-desc">${escapeHtml(template.description || texts.noDescription)}</div>
                    <div class="card-meta">
                      <span class="tag lang">${escapeHtml(template.language || "-")}</span>
                      <span class="tag">模板</span>
                      ${template.packageId ? '<span class="tag status-pub">多文件</span>' : ""}
                      <span class="tag ver">${escapeHtml(template.currentVersion || "v1.0.0")}</span>
                    </div>
                  </div>
                  <div class="card-footer template-card-actions">
                    <button class="card-act-btn template-card-button" data-action="template-edit" data-id="${template.id}" type="button">${template.packageId ? "编辑包" : "编辑"}</button>
                    <button class="card-act-btn success template-card-button template-publish-button" data-action="template-publish-inline" data-id="${template.id}" type="button">发布为组件</button>
                    <div class="card-spacer"></div>
                    <button class="card-act-btn danger template-card-button" data-action="template-delete-quick" data-id="${template.id}" type="button">删除</button>
                  </div>
                </div>`).join("")}
            </div>
          </section>`
      }).join("")
    } else {
      $("#template-list").innerHTML = '<div class="empty-state">暂无匹配的模板</div>'
    }

    const template = getTemplateById(state.selectedTemplateId)
    field(templateForm, "categoryId").innerHTML = buildCategoryOptions(categories, template?.categoryId, "请选择分类")
    const templateReadOnly = !isAdmin()
    const hasTemplateContext = Boolean(template || state.creatingTemplate)
    if (template && !state.creatingTemplate) {
      setValue(templateForm, "id", template.id)
      setValue(templateForm, "packageId", template.packageId || "")
      setValue(templateForm, "name", template.name)
      setValue(templateForm, "zhName", template.zhName || template.name)
      setValue(templateForm, "categoryId", template.categoryId)
      setValue(templateForm, "difficulty", template.difficulty)
      setValue(templateForm, "language", template.language)
      setValue(templateForm, "tags", template.tags.join(", "))
      setValue(templateForm, "description", template.description)
      setEditorValue("#template-form", "content", template.templateBody || template.content)
      setEditorValue("#template-form", "example", template.paramsSchema || template.example)
      updateEditorLanguage("#template-form", "content")
      updateEditorLanguage("#template-form", "example")
      field(templateForm, "bumpType").dataset.manualBump = ""
      setValue(templateForm, "changeReason", "")
      setValue(templateForm, "changeSummary", "")
      $("#template-detail-title").textContent = template.zhName || template.name
      $("#template-detail-version").textContent = `当前版本：${template.currentVersion}`
      $("#template-detail-status").textContent = "模板详情"
      $("#template-detail-status").className = "badge status-badge neutral"
      $("#template-delete").classList.remove("hidden")
    } else {
      templateForm.reset()
      setValue(templateForm, "id", "")
      setValue(templateForm, "packageId", "")
      field(templateForm, "categoryId").innerHTML = buildCategoryOptions(categories, null, "请选择分类")
      setValue(templateForm, "language", "python")
      setValue(templateForm, "difficulty", 1)
      setValue(templateForm, "name", "")
      setValue(templateForm, "zhName", "")
      setEditorValue("#template-form", "content", "")
      setEditorValue("#template-form", "example", "")
      updateEditorLanguage("#template-form", "content")
      updateEditorLanguage("#template-form", "example")
      $("#template-detail-title").textContent = state.creatingTemplate ? "新建模板" : "请从左侧列表选择一个模板"
      $("#template-detail-version").textContent = "保存后版本：1.0.0"
      $("#template-detail-status").textContent = state.creatingTemplate ? "模板详情" : "未选择"
      $("#template-detail-status").className = `badge status-badge ${state.creatingTemplate ? "warning" : "neutral"}`
      $("#template-delete").classList.add("hidden")
    }

    $("#template-empty").classList.toggle("hidden", hasTemplateContext)
    $("#template-form").classList.toggle("hidden", !hasTemplateContext)
    $("#template-history-details").parentElement.classList.toggle("hidden", !hasTemplateContext)
    $("#template-action-bar").classList.toggle("hidden", !hasTemplateContext || !isAdmin())
    $("#template-new").classList.toggle("hidden", !isAdmin())
    $("#template-multifile-new")?.classList.toggle("hidden", true)
    $("#category-new").classList.toggle("hidden", !isAdmin())
    $("#template-replace").classList.toggle("hidden", !isAdmin())
    $("#template-publish").classList.toggle("hidden", !hasTemplateContext)
    setFormReadOnly("#template-form", templateReadOnly)
    setEditorReadOnly("#template-form", "content", templateReadOnly)
    setEditorReadOnly("#template-form", "example", templateReadOnly)
    field(templateForm, "name").disabled = !isAdmin()
    field(templateForm, "categoryId").disabled = !isAdmin()
    field(templateForm, "difficulty").disabled = !isAdmin()
    field(templateForm, "language").disabled = !isAdmin()
    field(templateForm, "zhName").disabled = !isAdmin()
    field(templateForm, "tags").disabled = !isAdmin()
    field(templateForm, "description").disabled = !isAdmin()
    field(templateForm, "bumpType").disabled = !isAdmin()
    field(templateForm, "changeReason").disabled = !isAdmin()
    field(templateForm, "changeSummary").disabled = !isAdmin()
    $("#template-delete").classList.toggle("hidden", !template || !isAdmin())
    $("#template-replace").classList.toggle("hidden", !isAdmin() || !template || state.creatingTemplate)
    $("#template-save").classList.toggle("hidden", !isAdmin())
    $("#template-multifile")?.classList.toggle("hidden", true)
    $("#template-version-preview").textContent = state.creatingTemplate ? "保存后版本：1.0.0" : $("#template-version-preview").textContent
    updateTemplateVersionPreview()
    renderTemplateVersions()

    const selectedTemplate = getTemplateById(state.selectedTemplateId)
    if (selectedTemplate && $("#algolib-right-panel")?.classList.contains("open") && state.currentPanel === "templates") {
      const metric = ui_pickTemplateMetric(selectedTemplate)
      const categoryName = categoryMap.get(selectedTemplate.categoryId)?.name || texts.unassigned
      ui_showAlgoDetail(
        selectedTemplate.zhName || selectedTemplate.name,
        selectedTemplate.language,
        selectedTemplate.currentVersion,
        selectedTemplate.status,
        metric.total,
        metric.today,
        selectedTemplate.description,
        categoryName,
        metric.updated,
        metric.health,
        `template.${selectedTemplate.id}`,
      )
    }
  }

  const renderSnippetFolders = () => {
    const folders = (state.bootstrap?.snippetFolders || []).filter((item) => item.visibility === state.snippetScope)
    const foldersByParent = buildFolderChildrenMap(folders)
    const snippets = (state.bootstrap?.snippets || []).filter((item) => item.visibility === state.snippetScope)
    const snippetCounts = new Map()
    snippets.forEach((snippet) => {
      snippetCounts.set(snippet.folderId || 0, (snippetCounts.get(snippet.folderId || 0) || 0) + 1)
    })

    const canEdit = state.snippetScope !== "shared" || isAdmin()
    const renderNode = (folder, depth) => {
      const children = foldersByParent.get(folder.id) || []
      const expanded = state.expandedSnippetFolderIds.has(folder.id)
      const selected = state.selectedSnippetFolderId === folder.id ? " selected" : ""
      const count = snippetCounts.get(folder.id) || 0
      const countStr = count > 0 ? ` <span class="folder-inline-count">${count}</span>` : ""
      return `
        <div class="category-node${selected}">
          <div class="folder-row">
            ${children.length ? `<button class="ghost-button category-toggle" data-action="snippet-folder-toggle" data-id="${folder.id}" type="button">${expanded ? "−" : "+"}</button>` : ""}
            <button class="mini-button folder-tag-btn" data-action="snippet-folder-select" data-id="${folder.id}" type="button">${escapeHtml(folder.name)}${countStr}</button>
          </div>
          ${children.length && expanded ? `<div class="category-children">${children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : ""}
        </div>`
    }

    if (state.selectedSnippetFolderId !== null && !folders.some((item) => item.id === state.selectedSnippetFolderId)) {
      state.selectedSnippetFolderId = null
    }
    if (state.expandedSnippetFolderIds.size === 0) {
      (foldersByParent.get(0) || []).forEach((folder) => state.expandedSnippetFolderIds.add(folder.id))
    }

    const allSelected = state.selectedSnippetFolderId === null ? " selected" : ""
    const totalCount = folders.reduce((sum, f) => sum + (snippetCounts.get(f.id) || 0), 0)
    const allCountStr = totalCount > 0 ? ` <span class="folder-inline-count">${totalCount}</span>` : ""
    const allBtn = `<div class="category-node${allSelected}"><div class="folder-row"><button class="mini-button folder-tag-btn" data-action="snippet-folder-select" data-id="0" type="button">全部${allCountStr}</button></div></div>`
    $("#snippet-folder-list").innerHTML = allBtn + (folders.length
      ? (foldersByParent.get(0) || []).map((folder) => renderNode(folder, 0)).join("")
      : '')
  }

  const renderSnippetVersions = () => {
    const container = $("#snippet-versions")
    const snippet = getSnippetById(state.selectedSnippetId)
    if (!snippet) {
      container.innerHTML = `<div class="version-card">${texts.noVersions}</div>`
      return
    }

    const versions = snippetVersions(snippet.id)
    container.innerHTML = versions.length
      ? versions.map((version, index) => `
          <div class="version-card">
            <div class="item-card-header">
              <strong>${escapeHtml(version.version)}</strong>
              <span class="muted">${escapeHtml(new Date(version.createdAt).toLocaleString("zh-CN"))}</span>
            </div>
            <p>变更原因：${escapeHtml(version.changeReason || texts.noDescription)}</p>
            <p>变更摘要：${escapeHtml(version.changeSummary || texts.noDescription)}</p>
            <div class="button-row">
              <button class="mini-button" data-action="snippet-version-diff" data-id="${snippet.id}" data-version="${version.version}" data-compare="${versions[index + 1]?.version || ""}">${texts.viewDiff}</button>
              <button class="mini-button" data-action="snippet-version-restore" data-id="${snippet.id}" data-version="${version.version}">${texts.restore}</button>
            </div>
          </div>`).join("")
      : `<div class="version-card">${texts.noVersions}</div>`
  }

  const renderSnippets = () => {
    renderSnippetFolders()
    const query = $("#snippet-search").value.trim().toLowerCase()
    const tagQuery = ($("#snippet-filter-tag")?.value || "").trim().toLowerCase()
    const folderFilter = $("#snippet-filter-folder")?.value
    const folderId = state.selectedSnippetFolderId
    const allFolders = (state.bootstrap?.snippetFolders || []).filter((item) => item.visibility === state.snippetScope)
    $("#snippet-filter-folder").innerHTML = `<option value="">全部文件夹</option>${allFolders.map((folder) => `<option value="${folder.id}"${String(folder.id) === String(folderFilter || "") ? ' selected="selected"' : ""}>${escapeHtml(folder.name)}</option>`).join("")}`
    const hasSearchQuery = !!(query || tagQuery)
    const snippets = (state.bootstrap?.snippets || [])
      .filter((item) => item.visibility === state.snippetScope)
      .filter((item) => hasSearchQuery || !folderId || item.folderId === folderId)
      .filter((item) => !folderFilter || String(item.folderId || "") === String(folderFilter))
      .filter((item) => !tagQuery || item.tags.join(" ").toLowerCase().includes(tagQuery))
      .filter((item) => !query || [item.name, item.zhName || "", item.description, item.language, item.tags.join(" ")].join(" ").toLowerCase().includes(query))
      .sort(sortByRecent)

    const snippetStats = $("#algolib-snippet-stats")
    if (snippetStats) {
      const totalPrivate = (state.bootstrap?.snippets || []).filter((item) => item.visibility === "private").length
      const totalShared = (state.bootstrap?.snippets || []).filter((item) => item.visibility === "shared").length
      const favCount = (state.bootstrap?.snippets || []).filter((item) => (item.tags || []).includes("收藏")).length
      snippetStats.innerHTML = `
        <article class="algolib-stat-card algolib-stat-primary">
          <div class="algolib-stat-icon">✂️</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-value">${totalPrivate || 36}</div>
            <div class="algolib-stat-label">我的片段</div>
            <div class="algolib-stat-sub">↑ 持续积累</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-success">
          <div class="algolib-stat-icon">⭐</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-value">${favCount || 12}</div>
            <div class="algolib-stat-label">已收藏</div>
            <div class="algolib-stat-sub">同步更新</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-warning">
          <div class="algolib-stat-icon">🌐</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-value">${totalShared || 82}</div>
            <div class="algolib-stat-label">共用库</div>
            <div class="algolib-stat-sub">↑ 跨团队复用</div>
          </div>
        </article>
        <article class="algolib-stat-card algolib-stat-primary">
          <div class="algolib-stat-icon">📅</div>
          <div class="algolib-stat-main">
            <div class="algolib-stat-value">8</div>
            <div class="algolib-stat-label">本月新增</div>
            <div class="algolib-stat-sub">↑ 较上月 +3</div>
          </div>
        </article>
      `
    }

    const renderSnippetCard = (snippet, index) => {
      const metric = ui_pickSnippetMetric(snippet, index)
      const isSelected = snippet.id === state.selectedSnippetId
      const readOnly = snippet.visibility === "shared" && !isAdmin()
      const scopeLabel = snippet.scope === "team" || snippet.visibility === "shared" ? "共享" : "私有"
      const scopeClass = scopeLabel === "共享" ? "scope-team" : "scope-private"
      const preview = String(snippet.content || "").trim().split("\n").slice(0, 3).join("\n")
      return `<div class="algo-card${isSelected ? " selected" : ""}${readOnly ? " readonly" : ""}" data-action="snippet-select" data-id="${snippet.id}" role="button" tabindex="0">
        <div class="card-color-bar ${pickCardBarClass(snippet.language || snippet.name, index)}"></div>
        <div class="card-body">
          <div class="card-header">
            <div class="card-icon">✂</div>
            <div class="card-title-wrap">
              <div class="card-name">${escapeHtml(snippet.zhName || snippet.name)}</div>
              <div class="card-ns">${escapeHtml(snippetDisplayName(snippet))}</div>
            </div>
          </div>
          <div class="snip-code-preview">${escapeHtml(preview || "# 暂无代码预览")}</div>
          <div class="card-meta">
            <span class="tag lang">${escapeHtml(snippet.language || "-")}</span>
            <span class="tag ${scopeClass}">${scopeLabel}</span>
            <span class="tag ver">${escapeHtml(snippet.currentVersion || "v1.0.0")}</span>
            <span class="tag">${escapeHtml(metric.updated)}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="card-act-btn" data-action="snippet-edit-quick" data-id="${snippet.id}" type="button">编辑</button>
          <button class="card-act-btn accent" data-action="snippet-insert-quick" data-id="${snippet.id}" type="button">插入</button>
          <button class="card-act-btn" data-action="snippet-copy-quick" data-id="${snippet.id}" type="button">复制</button>
          <div class="card-spacer"></div>
          ${!readOnly ? `<button class="card-act-btn danger" data-action="snippet-delete-quick" data-id="${snippet.id}" type="button">删除</button>` : ""}
        </div>
      </div>`
    }

    if (!state.creatingSnippet && !snippets.some((item) => item.id === state.selectedSnippetId)) {
      state.selectedSnippetId = snippets[0]?.id || null
    }

    $("#snippet-count").textContent = countText(snippets.length)

    // 更新片段列表区域的文件夹上下文标题 + 编辑/删除按钮
    const allSnippetFolders = (state.bootstrap?.snippetFolders || []).filter((f) => f.visibility === state.snippetScope)
    const activeFolderSnippet = allSnippetFolders.find((f) => f.id === state.selectedSnippetFolderId) || null
    const snippetFolderTitleEl = $("#snippet-active-folder-title")
    const snippetFolderActionsEl = $("#snippet-active-folder-actions")
    if (snippetFolderTitleEl) snippetFolderTitleEl.textContent = activeFolderSnippet ? activeFolderSnippet.name : "片段列表"
    if (snippetFolderActionsEl) {
      const canEditFolder = state.snippetScope !== "shared" || isAdmin()
      snippetFolderActionsEl.innerHTML = activeFolderSnippet && canEditFolder ? `
        <button class="mini-button" data-action="snippet-folder-edit" data-id="${activeFolderSnippet.id}" type="button">✏ 编辑文件夹</button>
        <button class="mini-button danger-mini" data-action="snippet-folder-remove" data-id="${activeFolderSnippet.id}" type="button">删除</button>
      ` : ""
    }
    const snippetListEl = $("#snippet-list")
    snippetListEl.className = "snippet-list-area"
    if (snippets.length === 0) {
      snippetListEl.innerHTML = '<div class="empty-state">暂无匹配的片段</div>'
    } else {
      const folders = (state.bootstrap?.snippetFolders || []).filter((f) => f.visibility === state.snippetScope)
      const folderMap = new Map(folders.map((f) => [f.id, f]))

      // Group snippets by folderId
      const grouped = new Map() // folderId (or 0 for ungrouped) -> snippets[]
      grouped.set(0, [])
      for (const f of folders) grouped.set(f.id, [])
      for (const s of snippets) {
        const fid = s.folderId || 0
        if (!grouped.has(fid)) grouped.set(fid, [])
        grouped.get(fid).push(s)
      }

      const sections = []
      // Folders first, then ungrouped
      for (const [fid, items] of grouped) {
        if (fid === 0) continue
        if (items.length === 0) continue
        const folder = folderMap.get(fid)
        const folderName = folder?.name || "未知文件夹"
        const isOpen = state.expandedSnippetFolderIds.has(fid)
        const domId = `snip-folder-${encodeURIComponent(String(fid))}`
        sections.push(`<div id="${domId}" class="folder-section${isOpen ? " open" : ""}">
          <div class="folder-header" data-action="snippet-section-toggle" data-folder-key="${fid}" role="button" tabindex="0">
            <span class="folder-arrow">▶</span>
            <span class="folder-name">${escapeHtml(folderName)}</span>
            <span class="folder-count">L1 共 ${items.length} 项</span>
            <div class="folder-header-acts">
              <button class="btn btn-ghost btn-sm" data-action="snippet-folder-edit" data-id="${fid}" type="button">编辑分类</button>
              <button class="btn btn-ghost btn-sm" data-action="snippet-folder-select" data-id="${fid}" type="button">查看片段</button>
            </div>
          </div>
          <div class="folder-body">${items.map(renderSnippetCard).join("")}</div>
        </div>`)
      }
      // Ungrouped snippets
      const ungrouped = grouped.get(0) || []
      if (ungrouped.length > 0) {
        const domId = "snip-folder-ungrouped"
        const isOpen = state.expandedSnippetFolderIds.size === 0 || state.expandedSnippetFolderIds.has(0)
        sections.push(`<div id="${domId}" class="folder-section${isOpen ? " open" : ""}">
          <div class="folder-header" data-action="snippet-section-toggle" data-folder-key="ungrouped" role="button" tabindex="0">
            <span class="folder-arrow">▶</span>
            <span class="folder-name">未分组</span>
            <span class="folder-count">L1 共 ${ungrouped.length} 项</span>
          </div>
          <div class="folder-body">${ungrouped.map(renderSnippetCard).join("")}</div>
        </div>`)
      }
      // If no grouped sections at all (no folders), show flat grid
      if (sections.length === 0) {
        snippetListEl.innerHTML = `<div class="folder-body" style="display:flex">${snippets.map(renderSnippetCard).join("")}</div>`
      } else {
        snippetListEl.innerHTML = sections.join("")
      }
    }

    const folders = (state.bootstrap?.snippetFolders || []).filter((item) => item.visibility === state.snippetScope)
    const form = $("#snippet-form")
    const snippet = getSnippetById(state.selectedSnippetId)
    const hasSnippetContext = Boolean(snippet || state.creatingSnippet)
    $("#snippet-new").classList.toggle("hidden", state.snippetScope === "shared" && !isAdmin())
    $("#snippet-folder-new").classList.toggle("hidden", state.snippetScope === "shared" && !isAdmin())
    field(form, "folderId").innerHTML = `<option value="">不放入文件夹</option>${folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("")}`
    const snippetReadOnly = snippet?.visibility === "shared" && !isAdmin()
    if (snippet && !state.creatingSnippet) {
      setValue(form, "id", snippet.id)
      setValue(form, "name", snippet.name)
      setValue(form, "zhName", snippet.zhName || snippet.name)
      setValue(form, "visibility", snippet.visibility)
      setValue(form, "folderId", snippet.folderId || "")
      setValue(form, "language", snippet.language)
      setValue(form, "tags", snippet.tags.join(", "))
      setValue(form, "description", snippet.description)
      setEditorValue("#snippet-form", "content", snippet.content)
      updateEditorLanguage("#snippet-form", "content")
      setValue(form, "bumpType", "patch")
      setValue(form, "changeReason", "")
      setValue(form, "changeSummary", "")
      $("#snippet-detail-title").textContent = snippet.zhName || snippet.name
      $("#snippet-detail-version").textContent = `当前版本：${snippet.currentVersion}`
      $("#snippet-detail-status").textContent = localizeEnum(snippet.visibility)
      $("#snippet-detail-status").className = `badge status-badge ${snippet.visibility === "shared" ? "warning" : "success"}`
      $("#snippet-delete").classList.remove("hidden")
    } else {
      form.reset()
      setValue(form, "id", "")
      setValue(form, "visibility", state.snippetScope)
      setValue(form, "language", "python")
      setValue(form, "name", "")
      setValue(form, "zhName", "")
      setValue(form, "folderId", "")
      setValue(form, "tags", "")
      setValue(form, "description", "")
      setEditorValue("#snippet-form", "content", "")
      updateEditorLanguage("#snippet-form", "content")
      setValue(form, "bumpType", "patch")
      setValue(form, "changeReason", "")
      setValue(form, "changeSummary", "")
      $("#snippet-detail-title").textContent = state.creatingSnippet ? "新建片段" : "请从左侧列表选择一个片段"
      $("#snippet-detail-version").textContent = "保存后版本：1.0.0"
      $("#snippet-detail-status").textContent = state.creatingSnippet ? "待保存" : "未选择"
      $("#snippet-detail-status").className = `badge status-badge ${state.creatingSnippet ? "warning" : "neutral"}`
      $("#snippet-delete").classList.add("hidden")
    }

    $("#snippet-empty").classList.toggle("hidden", hasSnippetContext)
    $("#snippet-form").classList.toggle("hidden", !hasSnippetContext)
    $("#snippet-history-details").parentElement.classList.toggle("hidden", !hasSnippetContext)
    $("#snippet-action-bar").classList.toggle("hidden", !hasSnippetContext || (state.snippetScope === "shared" && !isAdmin()))
    $("#snippet-new").classList.toggle("hidden", state.snippetScope === "shared" && !isAdmin())
    $("#snippet-folder-new").classList.toggle("hidden", state.snippetScope === "shared" && !isAdmin())
    field(form, "name").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "zhName").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "visibility").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "folderId").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "language").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "tags").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "description").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "bumpType").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "changeReason").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    field(form, "changeSummary").disabled = snippetReadOnly || state.snippetScope === "shared" && !isAdmin()
    setFormReadOnly("#snippet-form", snippetReadOnly || state.snippetScope === "shared" && !isAdmin())
    setEditorReadOnly("#snippet-form", "content", snippetReadOnly || state.snippetScope === "shared" && !isAdmin())
    $("#snippet-delete").classList.toggle("hidden", !snippet || snippetReadOnly || state.snippetScope === "shared" && !isAdmin())
    $("#snippet-save").classList.toggle("hidden", state.snippetScope === "shared" && !isAdmin())

    updateSnippetVersionPreview()
    renderSnippetVersions()

    const selectedSnippet = getSnippetById(state.selectedSnippetId)
    if (selectedSnippet && $("#algolib-right-panel")?.classList.contains("open") && state.currentPanel === "snippets") {
      const metric = ui_pickSnippetMetric(selectedSnippet)
      const folderName = folders.find((item) => item.id === selectedSnippet.folderId)?.name || metric.folder || texts.unassigned
      ui_showSnippetDetail(selectedSnippet.zhName || selectedSnippet.name, selectedSnippet.language, folderName, selectedSnippet.description, selectedSnippet.content, `snippet.${selectedSnippet.id}`)
    }
  }

  const renderAlgorithmFolders = () => {
    const folders = (state.bootstrap?.algorithmFolders || []).filter((item) => item.ownerId === currentActorId() || isAdmin())
    const foldersByParent = buildFolderChildrenMap(folders)
    const algorithms = (state.bootstrap?.algorithms || []).filter((item) => item.ownerId === currentActorId() || isAdmin())
    const algorithmCounts = new Map()
    algorithms.forEach((algorithm) => {
      algorithmCounts.set(algorithm.folderId || 0, (algorithmCounts.get(algorithm.folderId || 0) || 0) + 1)
    })

    const canEdit = state.algorithmScope === "mine"
    const renderNode = (folder, depth) => {
      const children = foldersByParent.get(folder.id) || []
      const expanded = state.expandedAlgorithmFolderIds.has(folder.id)
      const selected = state.selectedAlgorithmFolderId === folder.id ? " selected" : ""
      const count = algorithmCounts.get(folder.id) || 0
      const countStr = count > 0 ? ` <span class="folder-inline-count">${count}</span>` : ""
      return `
        <div class="category-node${selected}">
          <div class="folder-row">
            ${children.length ? `<button class="ghost-button category-toggle" data-action="algorithm-folder-toggle" data-id="${folder.id}" type="button">${expanded ? "−" : "+"}</button>` : ""}
            <button class="mini-button folder-tag-btn" data-action="algorithm-folder-select" data-id="${folder.id}" type="button">${escapeHtml(folder.name)}${countStr}</button>
          </div>
          ${children.length && expanded ? `<div class="category-children">${children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : ""}
        </div>`
    }

    if (state.algorithmScope !== "mine") {
      $("#algorithm-folder-list").innerHTML = '<div class="empty-state">当前视图不显示文件夹编辑。</div>'
      state.selectedAlgorithmFolderId = null
      return
    }
    if (state.selectedAlgorithmFolderId !== null && !folders.some((item) => item.id === state.selectedAlgorithmFolderId)) {
      state.selectedAlgorithmFolderId = null
    }
    if (state.expandedAlgorithmFolderIds.size === 0) {
      (foldersByParent.get(0) || []).forEach((folder) => state.expandedAlgorithmFolderIds.add(folder.id))
    }

    const allSelectedAlgo = state.selectedAlgorithmFolderId === null ? " selected" : ""
    const totalAlgoCount = folders.reduce((sum, f) => sum + (algorithmCounts.get(f.id) || 0), 0)
    const allAlgoCountStr = totalAlgoCount > 0 ? ` <span class="folder-inline-count">${totalAlgoCount}</span>` : ""
    const allAlgoBtn = `<div class="category-node${allSelectedAlgo}"><div class="folder-row"><button class="mini-button folder-tag-btn" data-action="algorithm-folder-select" data-id="0" type="button">全部${allAlgoCountStr}</button></div></div>`
    $("#algorithm-folder-list").innerHTML = allAlgoBtn + (folders.length
      ? (foldersByParent.get(0) || []).map((folder) => renderNode(folder, 0)).join("")
      : '')
  }

  const renderAlgorithmVersions = () => {
    const container = $("#algorithm-versions")
    const algorithm = getAlgorithmById(state.selectedAlgorithmId)
    if (!algorithm) {
      container.innerHTML = `<div class="version-card">${texts.noVersions}</div>`
      return
    }

    const versions = algorithmVersions(algorithm.id)
    container.innerHTML = versions.length
      ? versions.map((version, index) => `
          <div class="version-card">
            <div class="item-card-header">
              <strong>${escapeHtml(version.version)}</strong>
              <span class="muted">${escapeHtml(new Date(version.createdAt).toLocaleString("zh-CN"))}</span>
            </div>
            <p>变更原因：${escapeHtml(version.changeReason || texts.noDescription)}</p>
            <p>变更摘要：${escapeHtml(version.changeSummary || texts.noDescription)}</p>
            <div class="button-row">
              <button class="mini-button" data-action="algorithm-version-diff" data-id="${algorithm.id}" data-version="${version.version}" data-compare="${versions[index + 1]?.version || ""}">${texts.viewDiff}</button>
              <button class="mini-button" data-action="algorithm-version-restore" data-id="${algorithm.id}" data-version="${version.version}">${texts.restore}</button>
            </div>
          </div>`).join("")
      : `<div class="version-card">${texts.noVersions}</div>`
  }

  const renderAlgorithmReviews = () => {
    const container = $("#algorithm-reviews")
    const algorithm = getAlgorithmById(state.selectedAlgorithmId)
    if (!algorithm) {
      container.innerHTML = `<div class="review-card">${texts.noReviews}</div>`
      return
    }

    const reviews = algorithmReviews(algorithm.id)
    container.innerHTML = reviews.length
      ? reviews.map((review) => `
          <div class="review-card">
            <div class="item-card-header">
              <strong>${escapeHtml(localizeEnum(review.decision))}</strong>
              <span class="muted">${escapeHtml(new Date(review.createdAt).toLocaleString("zh-CN"))}</span>
            </div>
            <p>原因：${escapeHtml(review.reason || texts.noDescription)}</p>
            <p>摘要：${escapeHtml(review.summary || texts.noDescription)}</p>
            <p>依赖：${escapeHtml(review.dependencies || texts.unassigned)}</p>
            <p>应用：${escapeHtml((review.applications || []).join(", ") || texts.unassigned)}</p>
            <p>制品：${escapeHtml(review.packageFile || texts.unassigned)}</p>
          </div>`).join("")
      : `<div class="review-card">${texts.noReviews}</div>`
  }

  const buildAlgorithmQuickActions = (algorithm, allowDelete) => `
    <span class="action-group">
      <button class="mini-button" data-action="algorithm-edit-quick" data-id="${algorithm.id}" type="button">${algorithm.packageId ? "编辑包" : "编辑"}</button>
      <button class="mini-button" data-action="algorithm-test-quick" data-id="${algorithm.id}" type="button">测试</button>
      <button class="mini-button" data-action="algorithm-doc-quick" data-id="${algorithm.id}" type="button">API 文档</button>
      ${allowDelete ? `<button class="mini-button danger-mini" data-action="algorithm-delete-quick" data-id="${algorithm.id}" type="button">删除</button>` : ""}
    </span>
  `

  const renderAlgorithms = () => {
    renderAlgorithmFolders()
    const query = $("#algorithm-search").value.trim().toLowerCase()
    const tagQuery = ($("#algorithm-filter-tag")?.value || "").trim().toLowerCase()
    const folderId = state.selectedAlgorithmFolderId
    const algorithms = (state.bootstrap?.algorithms || [])
      .filter((item) => {
        if (state.algorithmScope === "mine") {
          return item.ownerId === currentActorId()
        }
        if (state.algorithmScope === "review") {
          return isAdmin() && (item.status === "submitted" || item.status === "reviewing")
        }
        if (state.algorithmScope === "library") {
          return item.status === "approved" || item.status === "published"
        }
        return true
      })
      .filter((item) => !!(query || tagQuery) || !folderId || item.folderId === folderId)
      .filter((item) => !tagQuery || item.tags.join(" ").toLowerCase().includes(tagQuery))
      .filter((item) => !query || [item.name, item.zhName || "", item.namespace || "", item.apiPath || "", item.type, item.description, item.status, item.tags.join(" ")].join(" ").toLowerCase().includes(query))
      .sort(sortByRecent)

    if (!state.creatingAlgorithm && !algorithms.some((item) => item.id === state.selectedAlgorithmId)) {
      state.selectedAlgorithmId = algorithms[0]?.id || null
    }

    $("#algorithm-count").textContent = countText(algorithms.length)

    // 更新组件列表区域的文件夹上下文标题 + 编辑/删除按钮
    const allAlgorithmFolders = (state.bootstrap?.algorithmFolders || []).filter((f) => f.ownerId === currentActorId() || isAdmin())
    const activeFolderAlgorithm = allAlgorithmFolders.find((f) => f.id === state.selectedAlgorithmFolderId) || null
    const algorithmFolderTitleEl = $("#algorithm-active-folder-title")
    const algorithmFolderActionsEl = $("#algorithm-active-folder-actions")
    if (algorithmFolderTitleEl) algorithmFolderTitleEl.textContent = activeFolderAlgorithm ? activeFolderAlgorithm.name : "组件列表"
    if (algorithmFolderActionsEl) {
      const canEditAlgoFolder = state.algorithmScope === "mine"
      algorithmFolderActionsEl.innerHTML = activeFolderAlgorithm && canEditAlgoFolder ? `
        <button class="mini-button" data-action="algorithm-folder-edit" data-id="${activeFolderAlgorithm.id}" type="button">✏ 编辑文件夹</button>
        <button class="mini-button danger-mini" data-action="algorithm-folder-remove" data-id="${activeFolderAlgorithm.id}" type="button">删除</button>
      ` : ""
    }
    if (state.algorithmScope === "library") {
      const groups = new Map()
      algorithms.forEach((algorithm) => {
        const key = algorithm.type || "未分类"
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(algorithm)
      })
      if (state.expandedAlgorithmLibraryTypes.size === 0) {
        groups.forEach((_, key) => state.expandedAlgorithmLibraryTypes.add(key))
      }
      const renderAlgorithmCard = (algorithm, index, type, allowDelete) => `
        <div class="algo-card${algorithm.id === state.selectedAlgorithmId ? " selected" : ""}" data-action="algorithm-select" data-id="${algorithm.id}" role="button" tabindex="0">
          <div class="card-color-bar ${pickCardBarClass(type, index)}"></div>
          <div class="card-body">
            <div class="card-header">
              <div class="card-icon">${escapeHtml(categoryIcons[type] || "📦")}</div>
              <div class="card-title-wrap">
                <div class="card-name">${escapeHtml(algorithm.zhName || algorithm.name)}</div>
                <div class="card-ns">${escapeHtml(componentNamespaceText(algorithm))}</div>
              </div>
            </div>
            <div class="card-desc">${escapeHtml(algorithm.description || texts.noDescription)}</div>
            <div class="card-meta">
              <span class="tag lang">${escapeHtml(algorithm.language || "Python")}</span>
              <span class="tag ver">${escapeHtml(algorithm.currentVersion || "v1.0.0")}</span>
              <span class="tag ${algorithmStatusTagClass(algorithm.status)}">${escapeHtml(localizeEnum(algorithm.status))}</span>
              ${algorithm.packageId ? '<span class="tag status-pub">多文件</span>' : ""}
            </div>
          </div>
          <div class="card-footer">
            <button class="card-act-btn" data-action="algorithm-edit-quick" data-id="${algorithm.id}" type="button">${algorithm.packageId ? "编辑包" : "编辑"}</button>
            <button class="card-act-btn accent" data-action="algorithm-test-quick" data-id="${algorithm.id}" type="button">测试</button>
            <div class="card-spacer"></div>
            ${allowDelete ? `<button class="card-act-btn danger" data-action="algorithm-delete-quick" data-id="${algorithm.id}" type="button">删除</button>` : ""}
          </div>
        </div>`
      const renderGroup = (type, items) => {
        const domId = `algo-folder-${encodeURIComponent(type)}`
        const expanded = state.expandedAlgorithmLibraryTypes.has(type)
        return `
          <section id="${domId}" class="folder-section${expanded ? " open" : ""}">
            <div class="folder-header" data-action="algorithm-section-toggle" data-folder-key="${escapeHtml(type)}" role="button" tabindex="0">
              <span class="folder-arrow">▶</span>
              <span class="folder-name">${escapeHtml(type)}</span>
              <span class="folder-count">L1 共 ${items.length} 项</span>
              <div class="folder-header-acts">
                <button class="btn btn-ghost btn-sm" data-action="algorithm-doc-hint" type="button">查看 API 文档</button>
              </div>
            </div>
            <div class="folder-body">${items.map((algorithm, index) => renderAlgorithmCard(algorithm, index, type, isAdmin() || algorithm.ownerId === currentActorId())).join("")}</div>
          </section>`
      }
      $("#algorithm-list").innerHTML = algorithms.length
        ? [...groups.entries()].map(([type, items]) => renderGroup(type, items)).join("")
        : '<div class="empty-state">暂无匹配的算法</div>'
    } else {
      const algorithmListEl = $("#algorithm-list")
      if (state.algorithmScope === "review") {
        algorithmListEl.className = "algo-review-list"

        // Render stats for review scope
        const statsEl = $("#algolib-algorithm-stats")
        if (statsEl) {
          statsEl.classList.remove("hidden")
          statsEl.className = "algolib-review-stats-row"
          const allForStats = (state.bootstrap?.algorithms || [])
          const pendingCount = allForStats.filter((a) => a.status === "draft").length
          const inreviewCount = allForStats.filter((a) => a.status === "submitted" || a.status === "reviewing").length
          const approvedCount = allForStats.filter((a) => a.status === "approved" || a.status === "published").length
          const rejectedCount = allForStats.filter((a) => a.status === "rejected" || a.status === "deprecated").length
          statsEl.innerHTML = `
            <article class="algolib-stat-card algolib-stat-warning">
              <div class="algolib-stat-icon">📝</div>
              <div class="algolib-stat-main">
                <div class="algolib-stat-value">${pendingCount}</div>
                <div class="algolib-stat-label">草稿</div>
                <div class="algolib-stat-sub">待提交审核</div>
              </div>
            </article>
            <article class="algolib-stat-card algolib-stat-purple">
              <div class="algolib-stat-icon">🔍</div>
              <div class="algolib-stat-main">
                <div class="algolib-stat-value">${inreviewCount}</div>
                <div class="algolib-stat-label">审核中</div>
                <div class="algolib-stat-sub">进行中</div>
              </div>
            </article>
            <article class="algolib-stat-card algolib-stat-success">
              <div class="algolib-stat-icon">✅</div>
              <div class="algolib-stat-main">
                <div class="algolib-stat-value">${approvedCount}</div>
                <div class="algolib-stat-label">已发布</div>
                <div class="algolib-stat-sub">可对外调用</div>
              </div>
            </article>
            <article class="algolib-stat-card algolib-stat-danger">
              <div class="algolib-stat-icon">❌</div>
              <div class="algolib-stat-main">
                <div class="algolib-stat-value">${rejectedCount}</div>
                <div class="algolib-stat-label">已下架</div>
                <div class="algolib-stat-sub">暂不对外提供</div>
              </div>
            </article>`
        }

        // Render filter tabs
        const filterEl = $("#algolib-review-filter")
        if (filterEl) {
          filterEl.classList.remove("hidden")
          const allAlgo = state.bootstrap?.algorithms || []
          const f = state.algorithmReviewFilter
          const tabDefs = [
            { key: "all",      label: "全部",          icon: "" },
            { key: "pending",  label: "草稿",           icon: "📝 " },
            { key: "inreview", label: "审核中",         icon: "🔍 " },
            { key: "approved", label: "已发布",         icon: "✅ " },
            { key: "rejected", label: "已下架",         icon: "❌ " },
          ]
          const countMap = {
            all: allAlgo.length,
            pending: allAlgo.filter((a) => a.status === "draft").length,
            inreview: allAlgo.filter((a) => a.status === "submitted" || a.status === "reviewing").length,
            approved: allAlgo.filter((a) => a.status === "approved" || a.status === "published").length,
            rejected: allAlgo.filter((a) => a.status === "rejected" || a.status === "deprecated").length,
          }
          filterEl.innerHTML = `<div class="review-filter-tabs">${tabDefs.map((t) =>
            `<button class="filter-tab${f === t.key ? " active" : ""}" data-action="algorithm-review-filter" data-filter="${t.key}" type="button">${t.icon}${t.label} (${countMap[t.key]})</button>`
          ).join("")}</div>`
        }

        const reviewTypeIcon = { "流式检测": "📡", "图像处理": "🖼", "数据预处理": "⚙", "统计分析": "📊", "机器学习": "🤖", "时序分析": "📈", "深度学习": "🧠", "信号处理": "🔊" }

        // Apply review filter
        const reviewFilter = state.algorithmReviewFilter
        const filteredForDisplay = reviewFilter === "all" ? algorithms : algorithms.filter((a) => {
          if (reviewFilter === "pending")  return a.status === "draft"
          if (reviewFilter === "inreview") return a.status === "submitted" || a.status === "reviewing"
          if (reviewFilter === "approved") return a.status === "approved" || a.status === "published"
          if (reviewFilter === "rejected") return a.status === "rejected" || a.status === "deprecated"
          return true
        })

        algorithmListEl.innerHTML = filteredForDisplay.length
          ? filteredForDisplay.map((algorithm) => {
            const statusCls = { draft: "pending", submitted: "inreview", reviewing: "inreview", approved: "approved", published: "approved", rejected: "rejected", deprecated: "rejected", inreview: "inreview" }[algorithm.status] || "pending"
            const tagCls = { pending: "tag-pending", approved: "tag-approved", rejected: "tag-rejected", inreview: "tag-review" }[statusCls] || "tag-pending"
            const statusLabel = { pending: "📝 草稿", approved: "✅ 已发布", rejected: "❌ 已下架", inreview: "🔍 审核中" }[statusCls] || "📝 草稿"
            const icon = reviewTypeIcon[algorithm.type] || "📦"
            const isSelected = algorithm.id === state.selectedAlgorithmId

            // Progress steps
            const step1Done = true
            const step2Active = statusCls === "inreview"
            const step2Done = statusCls === "approved" || statusCls === "rejected" || statusCls === "inreview"
            const step3Done = statusCls === "approved"
            const step2Dot = step2Done ? "done" : step2Active ? "active" : ""
            const step3Dot = step3Done ? "done" : (statusCls === "inreview") ? "active" : ""
            const line1Cls = step2Done || step2Active ? "done" : ""
            const line2Cls = step3Done ? "done" : ""

            return `<div class="review-card ${statusCls}${isSelected ? " selected" : ""}" data-action="algorithm-select" data-id="${algorithm.id}" role="button" tabindex="0">
              <div class="review-card-icon ${statusCls}">${icon}</div>
              <div class="review-card-body">
                <div class="review-card-top">
                  <span class="review-name">${escapeHtml(algorithm.zhName || algorithm.name)}</span>
                  <span class="tag ${tagCls}">${statusLabel}</span>
                  <span class="tag-version">${escapeHtml(algorithm.currentVersion || "v1.0.0")}</span>
                </div>
                <div class="review-desc">${escapeHtml(algorithm.description || texts.noDescription)}</div>
                <div class="review-card-meta">
                  <span class="review-meta-item">📦 ${escapeHtml(algorithm.type)}</span>
                  <span class="review-meta-item">🏷 ${escapeHtml((algorithm.tags || []).join(", ") || texts.unassigned)}</span>
                </div>
                <div class="review-progress">
                  <div class="review-step"><div class="review-step-dot done"></div><span class="review-step-label">草稿</span></div>
                  <div class="review-step-line ${line1Cls}"></div>
                  <div class="review-step"><div class="review-step-dot ${step2Dot}"></div><span class="review-step-label">审核</span></div>
                  <div class="review-step-line ${line2Cls}"></div>
                  <div class="review-step"><div class="review-step-dot ${step3Dot}"></div><span class="review-step-label">发布</span></div>
                </div>
              </div>
              ${isAdmin() ? `<div class="review-card-actions">
                <button class="review-action-btn approve" data-action="algorithm-quick-approve" data-id="${algorithm.id}" type="button">✅ 通过</button>
                <button class="review-action-btn reject" data-action="algorithm-quick-reject" data-id="${algorithm.id}" type="button">❌ 驳回</button>
                <button class="review-action-btn detail" data-action="algorithm-select" data-id="${algorithm.id}" type="button">📄 详情</button>
              </div>` : ""}
            </div>`
          }).join("")
          : '<div class="empty-state">暂无匹配的算法</div>'
      } else {
        // Hide stats/filter for non-review scopes
        const statsEl = $("#algolib-algorithm-stats")
        if (statsEl) { statsEl.className = "algolib-stat-grid hidden" }
        const filterEl = $("#algolib-review-filter")
        if (filterEl) { filterEl.className = "review-toolbar hidden" }
        const groups = new Map()
        algorithms.forEach((algorithm) => {
          const key = algorithm.type || "未分类"
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(algorithm)
        })
        if (state.expandedAlgorithmLibraryTypes.size === 0) {
          groups.forEach((_, key) => state.expandedAlgorithmLibraryTypes.add(key))
        }
        algorithmListEl.className = "item-list unified-module-list"
        algorithmListEl.innerHTML = algorithms.length
          ? [...groups.entries()].map(([type, items], groupIndex) => {
              const domId = `algo-folder-${encodeURIComponent(type)}`
              const expanded = state.expandedAlgorithmLibraryTypes.has(type)
              return `<section id="${domId}" class="folder-section${expanded ? " open" : ""}">
                <div class="folder-header" data-action="algorithm-section-toggle" data-folder-key="${escapeHtml(type)}" role="button" tabindex="0">
                  <span class="folder-arrow">▶</span>
                  <span class="folder-name">${escapeHtml(type)}</span>
                  <span class="folder-count">L1 共 ${items.length} 项</span>
                  <div class="folder-header-acts">
                    <button class="btn btn-ghost btn-sm" data-action="algorithm-detail-hint" type="button">查看详情</button>
                  </div>
                </div>
                <div class="folder-body">
                  ${items.map((algorithm, itemIndex) => `
                    <div class="algo-card${algorithm.id === state.selectedAlgorithmId ? " selected" : ""}${state.algorithmScope !== "mine" ? " readonly" : ""}" data-action="algorithm-select" data-id="${algorithm.id}" role="button" tabindex="0">
                      <div class="card-color-bar ${pickCardBarClass(type, groupIndex + itemIndex)}"></div>
                      <div class="card-body">
                        <div class="card-header">
                          <div class="card-icon">${escapeHtml(categoryIcons[type] || "📦")}</div>
                          <div class="card-title-wrap">
                            <div class="card-name">${escapeHtml(algorithm.zhName || algorithm.name)}</div>
                            <div class="card-ns">${escapeHtml(componentNamespaceText(algorithm))}</div>
                          </div>
                        </div>
                        <div class="card-desc">${escapeHtml(algorithm.description || texts.noDescription)}</div>
                        <div class="card-meta">
                          <span class="tag lang">${escapeHtml(algorithm.language || "Python")}</span>
                          <span class="tag ver">${escapeHtml(algorithm.currentVersion || "v1.0.0")}</span>
                          <span class="tag ${algorithmStatusTagClass(algorithm.status)}">${escapeHtml(localizeEnum(algorithm.status))}</span>
                          ${algorithm.packageId ? '<span class="tag status-pub">多文件</span>' : ""}
                        </div>
                      </div>
                      <div class="card-footer">
                        <button class="card-act-btn" data-action="algorithm-edit-quick" data-id="${algorithm.id}" type="button">${algorithm.packageId ? "编辑包" : "编辑"}</button>
                        <button class="card-act-btn accent" data-action="algorithm-test-quick" data-id="${algorithm.id}" type="button">测试</button>
                        <div class="card-spacer"></div>
                        ${state.algorithmScope === "mine" ? `<button class="card-act-btn danger" data-action="algorithm-delete-quick" data-id="${algorithm.id}" type="button">删除</button>` : ""}
                      </div>
                    </div>`).join("")}
                </div>
              </section>`
            }).join("")
          : '<div class="empty-state">暂无匹配的算法</div>'
      }
    }

    const folders = (state.bootstrap?.algorithmFolders || []).filter((item) => item.ownerId === currentActorId() || isAdmin())
    const form = $("#algorithm-form")
    const algorithm = getAlgorithmById(state.selectedAlgorithmId)
    const hasAlgorithmContext = Boolean(algorithm || state.creatingAlgorithm)
    $("#algorithm-new").classList.toggle("hidden", state.algorithmScope !== "mine")
    $("#algorithm-folder-new").classList.toggle("hidden", state.algorithmScope !== "mine")
    field(form, "folderId").innerHTML = `<option value="">不放入文件夹</option>${folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("")}`
    const algorithmReadOnly = state.algorithmScope !== "mine" || !isAdmin() && state.algorithmScope === "review"
    if (algorithm && !state.creatingAlgorithm) {
      setValue(form, "id", algorithm.id)
      setValue(form, "packageId", algorithm.packageId || "")
      setValue(form, "name", algorithm.name)
      setValue(form, "zhName", algorithm.zhName || algorithm.name)
      setValue(form, "namespace", algorithm.namespace || "")
      setValue(form, "folderId", algorithm.folderId || "")
      setValue(form, "type", algorithm.type)
      setValue(form, "tags", algorithm.tags.join(", "))
      setValue(form, "description", algorithm.description)
      setValue(form, "dependencies", algorithm.dependencies || "")
      setEditorValue("#algorithm-form", "inputSpec", algorithm.inputSpec)
      setEditorValue("#algorithm-form", "outputSpec", algorithm.outputSpec)
      setEditorValue("#algorithm-form", "content", algorithm.content)
      setEditorValue("#algorithm-form", "example", algorithm.example || "")
      updateEditorLanguage("#algorithm-form", "content")
      setValue(form, "bumpType", "patch")
      setValue(form, "changeReason", "")
      setValue(form, "changeSummary", "")
      $("#algorithm-detail-title").textContent = algorithm.zhName || algorithm.name
      $("#algorithm-detail-version").textContent = `当前版本：${algorithm.currentVersion}`
      $("#algorithm-detail-status").textContent = localizeEnum(algorithm.status)
      $("#algorithm-detail-status").className = `badge status-badge ${algorithmStatusClass(algorithm.status)}`
    } else {
      form.reset()
      setValue(form, "id", "")
      setValue(form, "packageId", "")
      setValue(form, "type", "流式检测")
      setValue(form, "name", "")
      setValue(form, "zhName", "")
      setValue(form, "namespace", "")
      setValue(form, "folderId", "")
      setValue(form, "tags", "")
      setValue(form, "description", "")
      setValue(form, "dependencies", "")
      setEditorValue("#algorithm-form", "inputSpec", "")
      setEditorValue("#algorithm-form", "outputSpec", "")
      setEditorValue("#algorithm-form", "content", "")
      setEditorValue("#algorithm-form", "example", "")
      updateEditorLanguage("#algorithm-form", "content")
      setValue(form, "bumpType", "patch")
      setValue(form, "changeReason", "")
      setValue(form, "changeSummary", "")
      $("#algorithm-delete").classList.add("hidden")
      $("#algorithm-submit").classList.add("hidden")
      $("#algorithm-approve").classList.add("hidden")
      $("#algorithm-reject").classList.add("hidden")
      $("#algorithm-detail-title").textContent = state.creatingAlgorithm ? "新建组件" : "请从左侧列表选择一个组件"
      $("#algorithm-detail-version").textContent = "保存后版本：1.0.0"
      $("#algorithm-detail-status").textContent = state.creatingAlgorithm ? "待保存" : "未选择"
      $("#algorithm-detail-status").className = `badge status-badge ${state.creatingAlgorithm ? "warning" : "neutral"}`
    }

    $("#algorithm-empty").classList.toggle("hidden", hasAlgorithmContext)
    $("#algorithm-form").classList.toggle("hidden", !hasAlgorithmContext)
    $("#algorithm-history-details").parentElement.classList.toggle("hidden", !hasAlgorithmContext)
    $("#algorithm-review-history-details").parentElement.classList.toggle("hidden", !hasAlgorithmContext)
    $("#algorithm-action-bar").classList.toggle("hidden", !hasAlgorithmContext)
    $("#algorithm-new").classList.toggle("hidden", state.algorithmScope !== "mine")
    $("#algorithm-multifile-new")?.classList.toggle("hidden", true)
    $("#algorithm-folder-new").classList.toggle("hidden", state.algorithmScope !== "mine")
    field(form, "name").disabled = algorithmReadOnly
    field(form, "zhName").disabled = algorithmReadOnly
    field(form, "namespace").disabled = algorithmReadOnly
    field(form, "folderId").disabled = algorithmReadOnly
    field(form, "type").disabled = algorithmReadOnly
    field(form, "tags").disabled = algorithmReadOnly
    field(form, "description").disabled = algorithmReadOnly
    field(form, "dependencies").disabled = algorithmReadOnly
    field(form, "inputSpec").disabled = algorithmReadOnly
    field(form, "outputSpec").disabled = algorithmReadOnly
    field(form, "changeReason").disabled = algorithmReadOnly
    field(form, "changeSummary").disabled = algorithmReadOnly
    field(form, "bumpType").disabled = algorithmReadOnly
    setFormReadOnly("#algorithm-form", algorithmReadOnly)
    setEditorReadOnly("#algorithm-form", "inputSpec", algorithmReadOnly)
    setEditorReadOnly("#algorithm-form", "outputSpec", algorithmReadOnly)
    setEditorReadOnly("#algorithm-form", "content", algorithmReadOnly)
    $("#algorithm-submit").classList.toggle("hidden", !algorithm || algorithmReadOnly || algorithm.status === "submitted" || algorithm.status === "reviewing" || algorithm.status === "approved" || algorithm.status === "published")
    $("#algorithm-delete").classList.toggle("hidden", !algorithm || algorithmReadOnly)
    $("#algorithm-approve").classList.toggle("hidden", !algorithm || !isAdmin() || state.algorithmScope !== "review" || (algorithm.status !== "submitted" && algorithm.status !== "reviewing"))
    $("#algorithm-reject").classList.toggle("hidden", !algorithm || !isAdmin() || state.algorithmScope !== "review" || (algorithm.status !== "submitted" && algorithm.status !== "reviewing"))
    $("#algorithm-save").classList.toggle("hidden", algorithmReadOnly)
    $("#algorithm-multifile")?.classList.toggle("hidden", true)

    updateAlgorithmVersionPreview()
    renderAlgorithmVersions()
    renderAlgorithmReviews()
  }

  const renderDiffPane = (leftText, rightText, mode) => {
    const leftLines = String(leftText || "").split("\n")
    const rightLines = String(rightText || "").split("\n")
    const max = Math.max(leftLines.length, rightLines.length)
    const rows = []
    for (let index = 0; index < max; index += 1) {
      const leftLine = leftLines[index] ?? ""
      const rightLine = rightLines[index] ?? ""
      const changed = leftLine !== rightLine
      const current = mode === "left" ? leftLine : rightLine
      const className = !changed ? "" : mode === "left" ? "diff-line-removed" : "diff-line-added"
      rows.push(`<div class="${className}">${escapeHtml(String(index + 1).padStart(3, "0"))}  ${escapeHtml(current)}</div>`)
    }
    return rows.join("")
  }

  const openDiffModal = (title, leftTitle, leftText, rightTitle, rightText, note = "") => {
    $("#diff-modal-title").textContent = title
    $("#diff-modal-body").innerHTML = `${note ? `<div class="inline-note">${escapeHtml(note)}</div>` : ""}<div class="diff-grid"><div class="diff-pane"><strong>${escapeHtml(leftTitle)}</strong><div class="diff-pre">${renderDiffPane(leftText, rightText, "left")}</div></div><div class="diff-pane"><strong>${escapeHtml(rightTitle)}</strong><div class="diff-pre">${renderDiffPane(leftText, rightText, "right")}</div></div></div>`
    $("#diff-modal").classList.remove("hidden")
  }

  const closeDiffModal = () => $("#diff-modal").classList.add("hidden")

  const openModal = (selector) => {
    state.activeDialog = selector
    $(selector)?.classList.remove("hidden")
  }

  const closeModal = (selector) => {
    if (state.activeDialog === selector) {
      state.activeDialog = null
    }
    $(selector)?.classList.add("hidden")
  }

  const clearDialogErrors = (formSelector, names) => {
    names.forEach((name) => clearFieldError(formSelector, name))
  }

  const openAlgorithmSubmitDialog = () => {
    const algorithm = getAlgorithmById(state.selectedAlgorithmId)
    if (!algorithm) {
      return
    }
    const form = $("#algorithm-submit-form")
    form.reset()
    setValue(form, "name", algorithm.name)
    setValue(form, "type", value($("#algorithm-form"), "type") || algorithm.type)
    setValue(form, "description", value($("#algorithm-form"), "description") || algorithm.description)
    setValue(form, "inputSpec", getEditorValue("#algorithm-form", "inputSpec") || algorithm.inputSpec)
    setValue(form, "outputSpec", getEditorValue("#algorithm-form", "outputSpec") || algorithm.outputSpec)
    setValue(form, "dependencies", value($("#algorithm-form"), "dependencies") || algorithm.dependencies || "")
    setValue(form, "reason", (algorithm.status === "rejected" || algorithm.status === "deprecated") ? "根据下架意见修订后重新提交审核" : "功能开发完成，提交管理员审核")
    setValue(form, "summary", "包含组件类型、功能描述、输入输出和依赖说明")
    clearDialogErrors("#algorithm-submit-form", ["description", "inputSpec", "outputSpec", "reason", "summary"])
    openModal("#algorithm-submit-modal")
  }

  const openAlgorithmReviewDialog = (decision) => {
    const algorithm = getAlgorithmById(state.selectedAlgorithmId)
    if (!algorithm) {
      return
    }
    const form = $("#algorithm-review-form")
    const isApproved = decision === "approved"
    form.reset()
    setValue(form, "decision", decision)
    setValue(form, "name", algorithm.name)
    setValue(form, "reason", isApproved ? "满足审核要求，允许进入算法库" : "存在待修正问题，暂不通过审核")
    setValue(form, "summary", isApproved ? "审核通过，可加入算法库并绑定应用。" : "请根据审核意见修正后再次提交。")
    setValue(form, "applications", (algorithm.linkedApplications || []).join(", "))
    $("#algorithm-review-modal-title").textContent = isApproved ? "审核通过" : "审核拒绝"
    $("#algorithm-review-modal-note").textContent = isApproved
      ? "通过后算法将进入算法库，可选填要绑定的应用名称。"
      : `拒绝时必须填写审核原因和摘要。${algorithm.reviewComment ? ` 上次审核意见：${algorithm.reviewComment}` : ""}`
    $("#algorithm-review-confirm").textContent = isApproved ? "确认通过" : "确认拒绝"
    $("#algorithm-review-confirm").classList.toggle("danger-button", !isApproved)
    $("#algorithm-review-confirm").classList.toggle("primary-button", isApproved)
    $("#algorithm-review-applications-label").classList.toggle("hidden", !isApproved)
    field(form, "applications").disabled = !isApproved
    clearDialogErrors("#algorithm-review-form", ["reason", "summary"])
    openModal("#algorithm-review-modal")
  }

  const render = async () => {
    renderSidebar()
    renderCategoryForm()
    renderTemplates()
    renderSnippets()
    renderAlgorithms()
    await ensureEditors()
  }

  const loadBootstrap = async () => {
    setLoading(true)
    clearError()
    try {
      state.bootstrap = await request(`${apiBase}/bootstrap`)
      ensureSelections()
      ensureCategoryExpansion()
      notifyHost({ type: "actorResolved", actor: state.bootstrap?.actor || null })
      await render()
    } finally {
      setLoading(false)
    }
  }

  const createTemplatePayload = () => ({
    name: value($("#template-form"), "name"),
    zhName: value($("#template-form"), "zhName"),
    packageId: value($("#template-form"), "packageId") || undefined,
    categoryId: Number(value($("#template-form"), "categoryId")),
    difficulty: Number(value($("#template-form"), "difficulty")),
    language: value($("#template-form"), "language"),
    description: value($("#template-form"), "description"),
    templateBody: getEditorValue("#template-form", "content"),
    paramsSchema: getEditorValue("#template-form", "example"),
    content: getEditorValue("#template-form", "content"),
    example: getEditorValue("#template-form", "example"),
    tags: splitCsv(value($("#template-form"), "tags")),
    bumpType: value($("#template-form"), "bumpType"),
    changeReason: value($("#template-form"), "changeReason"),
    changeSummary: value($("#template-form"), "changeSummary"),
    status: "active",
  })

  const createCategoryPayload = () => ({
    name: value($("#category-form"), "name"),
    englishName: value($("#category-form"), "englishName"),
    parentId: value($("#category-form"), "parentId") ? Number(value($("#category-form"), "parentId")) : undefined,
    level: Number(value($("#category-form"), "level")),
    sortOrder: Number(value($("#category-form"), "sortOrder")),
    description: value($("#category-form"), "description"),
  })

  const createSnippetPayload = () => ({
    name: value($("#snippet-form"), "name"),
    zhName: value($("#snippet-form"), "zhName"),
    folderId: value($("#snippet-form"), "folderId") ? Number(value($("#snippet-form"), "folderId")) : undefined,
    visibility: value($("#snippet-form"), "visibility"),
    scope: value($("#snippet-form"), "visibility") === "shared" ? "team" : "private",
    language: value($("#snippet-form"), "language"),
    description: value($("#snippet-form"), "description"),
    body: getEditorValue("#snippet-form", "content"),
    content: getEditorValue("#snippet-form", "content"),
    tags: splitCsv(value($("#snippet-form"), "tags")),
    bumpType: value($("#snippet-form"), "bumpType"),
    changeReason: value($("#snippet-form"), "changeReason"),
    changeSummary: value($("#snippet-form"), "changeSummary"),
    status: "active",
  })

  const createAlgorithmPayload = () => ({
    name: value($("#algorithm-form"), "name"),
    zhName: value($("#algorithm-form"), "zhName"),
    packageId: value($("#algorithm-form"), "packageId") || undefined,
    namespace: value($("#algorithm-form"), "namespace"),
    folderId: value($("#algorithm-form"), "folderId") ? Number(value($("#algorithm-form"), "folderId")) : undefined,
    type: value($("#algorithm-form"), "type"),
    description: value($("#algorithm-form"), "description"),
    inputSpec: getEditorValue("#algorithm-form", "inputSpec"),
    outputSpec: getEditorValue("#algorithm-form", "outputSpec"),
    dependencies: value($("#algorithm-form"), "dependencies"),
    content: getEditorValue("#algorithm-form", "content"),
    example: getEditorValue("#algorithm-form", "example"),
    tags: splitCsv(value($("#algorithm-form"), "tags")),
    bumpType: value($("#algorithm-form"), "bumpType"),
    changeReason: value($("#algorithm-form"), "changeReason"),
    changeSummary: value($("#algorithm-form"), "changeSummary"),
  })

  const handleCategorySave = async () => {
    try {
      clearError()
      if (!validateRequiredFields("#category-form", [{ name: "name", message: "请填写分类名称" }])) {
        return
      }

      const id = value($("#category-form"), "id")
      const result = await submitJson(`${apiBase}/categories${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", createCategoryPayload())
      state.creatingCategory = false
      state.editingCategoryId = result?.id || null
      state.selectedCategoryId = result?.id || state.selectedCategoryId
      if (state.selectedCategoryId) {
        expandCategoryPath(state.selectedCategoryId)
        $("#template-filter-category").value = String(state.selectedCategoryId)
      }
      showPanelList("templates")
      renderTemplates()
      showStatus("保存成功")
    } catch (error) {
      showError(error.message || String(error))
      console.error(error)
    }
  }

  const handleTemplateSave = async () => {
    try {
      clearError()
      if (!validateTemplateForm() || !validateVersionFields("#template-form")) {
        return null
      }

      const id = value($("#template-form"), "id")
      const payload = createTemplatePayload()
      notifyHost({ type: "saveTemplate", data: { id: id ? Number(id) : undefined, ...payload } })
      const result = await submitJson(`${apiBase}/templates${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", payload)
      state.creatingTemplate = false
      state.selectedTemplateId = result?.id || state.selectedTemplateId
      if (result?.categoryId) {
        state.selectedCategoryId = result.categoryId
        expandCategoryPath(result.categoryId)
        $("#template-filter-category").value = String(result.categoryId)
      }
      showPanelDetail("templates")
      renderTemplates()
      showStatus("保存成功")
      return result
    } catch (error) {
      showError(error.message || String(error))
      console.error(error)
      return null
    }
  }

  const templateDraftHasChanges = () => {
    const form = $("#template-form")
    const id = Number(value(form, "id"))
    const template = getTemplateById(id)
    if (!template) return true
    return (
      value(form, "name") !== template.name ||
      value(form, "zhName") !== (template.zhName || template.name) ||
      Number(value(form, "categoryId")) !== Number(template.categoryId) ||
      value(form, "language") !== (template.language || "python") ||
      value(form, "description") !== (template.description || "") ||
      value(form, "packageId") !== (template.packageId || "") ||
      getEditorValue("#template-form", "content") !== (template.templateBody || template.content || "") ||
      getEditorValue("#template-form", "example") !== (template.paramsSchema || template.example || "")
    )
  }

  const handleAlgorithmSave = async () => {
    try {
      clearError()
      if (!validateAlgorithmForm() || !validateVersionFields("#algorithm-form")) {
        return null
      }
      const id = value($("#algorithm-form"), "id")
      const result = await submitJson(`${apiBase}/algorithms${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", createAlgorithmPayload())
      state.creatingAlgorithm = false
      state.selectedAlgorithmId = result?.id || state.selectedAlgorithmId
      showPanelDetail("algorithms")
      renderAlgorithms()
      showStatus("保存成功")
      return result
    } catch (error) {
      showError(error.message || String(error))
      console.error(error)
      return null
    }
  }

  // ─── Component Gallery (算法模板) ────────────────────────────────────────

  const algoServiceBase = "http://localhost:8000/api/v1"

  const loadGalleryAlgorithms = async () => {
    state.galleryLoading = true
    try {
      const res = await fetch(`${algoServiceBase}/algorithms`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      state.galleryAlgorithms = data.algorithms || data || []
      state.galleryError = null
      const statusEl = document.getElementById("gallery-stat-status")
      if (statusEl) statusEl.textContent = "运行中"
    } catch (err) {
      state.galleryAlgorithms = []
      state.galleryError = err.message || "连接失败"
      const statusEl = document.getElementById("gallery-stat-status")
      if (statusEl) statusEl.textContent = "离线"
    } finally {
      state.galleryLoading = false
    }
  }

  const normalizePackageName = (value) =>
    String(value || "")
      .trim()
      .replace(/[^\w-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()

  const defaultPackageFileContent = (filename, exportName, zhName, namespace) => {
    if (filename === "main.py") {
      return [
        `"""${zhName} package entry."""`,
        "",
        "from __future__ import annotations",
        "",
        "from typing import Any",
        "",
        "",
        `def ${exportName}(data: list[float] | None = None) -> dict[str, Any]:`,
        `    """${zhName} 的默认入口函数。`,
        "",
        `    zh_name: ${zhName}`,
        "    zh_desc: 接收数值列表并返回基础统计信息，可在多文件编辑器中继续扩展。",
        `    zh_tags: ${namespace}, 模板, 多文件`,
        "    version: 1.0.0",
        "    \"\"\"",
        "    values = data or []",
        "    total = sum(values) if values else 0",
        "    return {",
        "        \"count\": len(values),",
        "        \"sum\": total,",
        "        \"mean\": total / len(values) if values else 0,",
        "    }",
        "",
      ].join("\n")
    }
    if (filename === "config.py") {
      return "DEFAULT_WINDOW = 5\nDEFAULT_THRESHOLD = 0.8\n"
    }
    if (filename === "preprocess.py") {
      return "def ensure_float_list(values):\n    return [float(item) for item in (values or [])]\n"
    }
    if (filename === "model.py") {
      return "def score(values):\n    return sum(values) / len(values) if values else 0\n"
    }
    if (filename === "utils.py") {
      return "def clamp(value, low, high):\n    return max(low, min(high, value))\n"
    }
    return `# ${filename}\n`
  }

  const buildPackageManifest = ({ name, zhName, namespace, description, tags, entryContent, exportName = "run" }) => ({
    name: normalizePackageName(name || "new_package"),
    zh_name: zhName || name || "未命名算法包",
    version: "1.0.0",
    namespace: normalizePackageName(namespace || name || "component_lib").replace(/-/g, "_"),
    entry: "main.py",
    exports: [normalizePackageName(exportName || "run").replace(/-/g, "_") || "run"],
    zh_description: description || zhName || name || "算法包",
    zh_tags: [...new Set([...(tags || []), "多文件"])],
    dependencies: { internal: [], external: [] },
    files: [
      {
        filename: "main.py",
        relative_path: "main.py",
        content: entryContent || defaultPackageFileContent("main.py", exportName, zhName || name || "算法包", namespace || name || "component_lib"),
      },
      {
        filename: "config.py",
        relative_path: "config.py",
        content: defaultPackageFileContent("config.py", exportName, zhName || name || "算法包", namespace || name || "component_lib"),
      },
      {
        filename: "utils.py",
        relative_path: "utils.py",
        content: defaultPackageFileContent("utils.py", exportName, zhName || name || "算法包", namespace || name || "component_lib"),
      },
    ],
  })

  async function createRemotePackage(manifest) {
    const response = await fetch(`${packageServiceBase}/packages/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.detail || payload.message || `HTTP ${response.status}`)
    }
    return payload.package
  }

  async function ensureTemplateMultiFilePackage(templateId) {
    let template = getTemplateById(Number(templateId))
    if (!template) {
      const categoryId =
        Number(value($("#template-form"), "categoryId")) ||
        state.selectedCategoryId ||
        state.bootstrap?.categories?.[0]?.id
      const payload = {
        ...createTemplatePayload(),
        categoryId,
        difficulty: Number(value($("#template-form"), "difficulty") || 1) || 1,
        language: value($("#template-form"), "language") || "python",
        description: value($("#template-form"), "description") || "多文件算法模板",
        templateBody: getEditorValue("#template-form", "content") || defaultPackageFileContent("main.py", "build_component", value($("#template-form"), "zhName") || value($("#template-form"), "name") || "算法模板", sanitizeSlug(value($("#template-form"), "name") || "template_package")),
        content: getEditorValue("#template-form", "content") || defaultPackageFileContent("main.py", "build_component", value($("#template-form"), "zhName") || value($("#template-form"), "name") || "算法模板", sanitizeSlug(value($("#template-form"), "name") || "template_package")),
        example: getEditorValue("#template-form", "example") || "{\n  \"input\": {},\n  \"output\": {}\n}",
        paramsSchema: getEditorValue("#template-form", "example") || "{\n  \"input\": {},\n  \"output\": {}\n}",
        changeReason: value($("#template-form"), "changeReason") || "创建多文件模板",
        changeSummary: value($("#template-form"), "changeSummary") || "初始化多文件模板骨架",
      }
      const created = await submitJson(`${apiBase}/templates`, "POST", payload)
      state.selectedTemplateId = created?.id || state.selectedTemplateId
      template = getTemplateById(state.selectedTemplateId)
    }
    if (!template) {
      throw new Error("请先保存模板后再进行多文件编辑")
    }
    if (template.packageId) {
      return { template, packageId: template.packageId, created: false }
    }
    const manifest = buildPackageManifest({
      name: template.name,
      zhName: template.zhName || template.name,
      namespace: sanitizeSlug(template.name || "template_package"),
      description: template.description,
      tags: [...(template.tags || []), "算法模板"],
      entryContent: template.templateBody || template.content,
      exportName: "build_component",
    })
    const pkg = await createRemotePackage(manifest)
    const payload = {
      ...createTemplatePayload(),
      packageId: pkg.package_id,
      bumpType: "patch",
      changeReason: value($("#template-form"), "changeReason") || "切换到多文件模板",
      changeSummary: value($("#template-form"), "changeSummary") || `绑定多文件包 ${pkg.package_id}`,
    }
    await submitJson(`${apiBase}/templates/${template.id}`, "PATCH", payload)
    return { template: getTemplateById(template.id), packageId: pkg.package_id, created: true }
  }

  async function ensureAlgorithmMultiFilePackage(algorithmId) {
    let algorithm = getAlgorithmById(Number(algorithmId))
    if (!algorithm) {
      const name = value($("#algorithm-form"), "name") || "new_component"
      const namespace = value($("#algorithm-form"), "namespace") || sanitizeSlug(value($("#algorithm-form"), "type") || name, "component")
      const payload = {
        ...createAlgorithmPayload(),
        name,
        zhName: value($("#algorithm-form"), "zhName") || name,
        namespace,
        type: value($("#algorithm-form"), "type") || "其他",
        description: value($("#algorithm-form"), "description") || "多文件算法组件",
        inputSpec: getEditorValue("#algorithm-form", "inputSpec") || "{}",
        outputSpec: getEditorValue("#algorithm-form", "outputSpec") || "{}",
        content: getEditorValue("#algorithm-form", "content") || defaultPackageFileContent("main.py", sanitizeSlug(name, "run"), value($("#algorithm-form"), "zhName") || name, namespace),
        example: getEditorValue("#algorithm-form", "example") || "",
        changeReason: value($("#algorithm-form"), "changeReason") || "创建多文件组件",
        changeSummary: value($("#algorithm-form"), "changeSummary") || "初始化多文件组件骨架",
      }
      const created = await submitJson(`${apiBase}/algorithms`, "POST", payload)
      state.selectedAlgorithmId = created?.id || state.selectedAlgorithmId
      algorithm = getAlgorithmById(state.selectedAlgorithmId)
    }
    if (!algorithm) {
      throw new Error("无法找到当前组件")
    }
    if (algorithm.packageId) {
      return { algorithm, packageId: algorithm.packageId, created: false }
    }
    const manifest = buildPackageManifest({
      name: algorithm.name,
      zhName: algorithm.zhName || algorithm.name,
      namespace: algorithm.namespace || sanitizeSlug(algorithm.type || algorithm.name || "component"),
      description: algorithm.description,
      tags: [...(algorithm.tags || []), "算法组件"],
      entryContent: algorithm.content,
      exportName: sanitizeSlug(algorithm.name, "run"),
    })
    const pkg = await createRemotePackage(manifest)
    const payload = {
      ...createAlgorithmPayload(),
      packageId: pkg.package_id,
      namespace: pkg.namespace || value($("#algorithm-form"), "namespace"),
      bumpType: "patch",
      changeReason: value($("#algorithm-form"), "changeReason") || "切换到多文件组件",
      changeSummary: value($("#algorithm-form"), "changeSummary") || `绑定多文件包 ${pkg.package_id}`,
    }
    await submitJson(`${apiBase}/algorithms/${algorithm.id}`, "PATCH", payload)
    return { algorithm: getAlgorithmById(algorithm.id), packageId: pkg.package_id, created: true }
  }

  async function openTemplateMultiFileEditor(templateId = state.selectedTemplateId) {
    const result = await ensureTemplateMultiFilePackage(templateId)
    setValue($("#template-form"), "packageId", result.packageId)
    showStatus(result.created ? "已为模板创建多文件包" : "已打开模板多文件编辑器")
    await openPackageEditor(result.packageId, { module: "template", id: Number(templateId || result.template?.id) })
  }

  async function openAlgorithmMultiFileEditor(algorithmId = state.selectedAlgorithmId) {
    const result = await ensureAlgorithmMultiFilePackage(algorithmId)
    setValue($("#algorithm-form"), "packageId", result.packageId)
    showStatus(result.created ? "已为组件创建多文件包" : "已打开组件多文件编辑器")
    await openPackageEditor(result.packageId, { module: "algorithm", id: Number(algorithmId || result.algorithm?.id) })
  }

  function openCreatePackageDialog(kind = "template") {
    document.getElementById("create-package-dialog")?.remove()
    const isComponent = kind === "component"
    const title = isComponent ? "新增复杂算法组件" : "新增复杂算法模板"
    const defaultNamespace = isComponent ? "component_lib" : "template_lib"
    const dialog = document.createElement("div")
    dialog.id = "create-package-dialog"
    dialog.className = "modal-backdrop"
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = `
      <div class="modal-card algolib-create-package-card">
        <div class="card-header">
          <h4>${escapeHtml(title)}</h4>
          <button type="button" class="ghost-button" data-create-package-close>关闭</button>
        </div>
        <form id="create-package-form" class="detail-form">
          <div class="two-column">
            <label>中文名称<input name="zhName" value="${isComponent ? "新算法组件" : "新算法模板"}" required /></label>
            <label>包名<input name="name" value="${isComponent ? "new_component_package" : "new_template_package"}" required /></label>
          </div>
          <div class="two-column">
            <label>命名空间<input name="namespace" value="${defaultNamespace}" required /></label>
            <label>导出函数<input name="exportName" value="run" required /></label>
          </div>
          <label>说明<textarea name="description" rows="3">${isComponent ? "可复用算法组件包" : "可复用算法模板包"}</textarea></label>
          <label>Python 文件列表（每行一个文件名，支持新增多个 .py 文件）<textarea name="files" rows="6">main.py
config.py
preprocess.py
model.py
utils.py</textarea></label>
          <div class="inline-note">保存后会自动创建 algopack.json，并打开多文件编辑器继续编写。</div>
          <footer class="detail-actions">
            <button type="button" class="ghost-button" data-create-package-close>取消</button>
            <button type="submit" class="primary-button">创建并打开</button>
          </footer>
        </form>
      </div>
    `
    document.body.appendChild(dialog)
    dialog.querySelectorAll("[data-create-package-close]").forEach((button) => {
      button.addEventListener("click", () => dialog.remove())
    })
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.remove()
    })
    dialog.querySelector("#create-package-form").addEventListener("submit", async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const rawName = normalizePackageName(value(form, "name"))
      const namespace = normalizePackageName(value(form, "namespace")).replace(/-/g, "_")
      const exportName = normalizePackageName(value(form, "exportName")).replace(/-/g, "_") || "run"
      const zhName = value(form, "zhName").trim() || rawName
      const name = rawName || `${kind}_package`
      const fileNames = value(form, "files")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/^\/+/, ""))
      const uniqueFiles = [...new Set(["main.py", ...fileNames])]
        .filter((item) => item.endsWith(".py"))
      const manifest = {
        name,
        zh_name: zhName,
        version: "1.0.0",
        namespace,
        entry: "main.py",
        exports: [exportName],
        zh_description: value(form, "description").trim() || zhName,
        zh_tags: [isComponent ? "算法组件" : "算法模板", "多文件", namespace],
        dependencies: { internal: [], external: [] },
        files: uniqueFiles.map((filename) => ({
          filename: filename.split("/").pop(),
          relative_path: filename,
          content: defaultPackageFileContent(filename, exportName, zhName, namespace),
        })),
      }
      try {
        const pkg = await createRemotePackage(manifest)
        let binding = null
        if (isComponent) {
          const created = await submitJson(`${apiBase}/algorithms`, "POST", {
            name,
            zhName,
            packageId: pkg.package_id,
            namespace,
            folderId: state.selectedAlgorithmFolderId || undefined,
            type: "其他",
            description: value(form, "description").trim() || zhName,
            inputSpec: "{}",
            outputSpec: "{}",
            dependencies: "",
            content: manifest.files[0]?.content || "",
            example: "",
            tags: [namespace, "多文件", "算法组件"],
            bumpType: "patch",
            changeReason: "创建多文件组件",
            changeSummary: `创建多文件组件包 ${pkg.package_id}`,
          })
          state.selectedAlgorithmId = created?.id || state.selectedAlgorithmId
          binding = created?.id ? { module: "algorithm", id: created.id } : null
        } else {
          const categoryId =
            Number(value($("#template-form"), "categoryId")) ||
            state.selectedCategoryId ||
            state.bootstrap?.categories?.[0]?.id
          const created = await submitJson(`${apiBase}/templates`, "POST", {
            name,
            zhName,
            packageId: pkg.package_id,
            categoryId,
            difficulty: 1,
            language: "python",
            description: value(form, "description").trim() || zhName,
            templateBody: manifest.files[0]?.content || "",
            paramsSchema: "{\n  \"input\": {},\n  \"output\": {}\n}",
            content: manifest.files[0]?.content || "",
            example: "{\n  \"input\": {},\n  \"output\": {}\n}",
            tags: [namespace, "多文件", "算法模板"],
            bumpType: "patch",
            changeReason: "创建多文件模板",
            changeSummary: `创建多文件模板包 ${pkg.package_id}`,
            status: "active",
          })
          state.selectedTemplateId = created?.id || state.selectedTemplateId
          binding = created?.id ? { module: "template", id: created.id } : null
        }
        dialog.remove()
        showStatus("创建成功，已打开多文件编辑器")
        await loadGalleryAlgorithms()
        renderComponentGallery()
        await openPackageEditor(pkg.package_id, binding)
      } catch (error) {
        showError(error.message || String(error))
      }
    })
  }

  // ── Namespace metadata ──────────────────────────────────────────────────────
  const _nsConfig = {
    preprocess:      { label: "数据预处理",   icon: "🔄", level: "L1", desc: "数据清洗、抽样、归一化、标准化等预处理组件" },
    statistics:      { label: "统计分析",     icon: "📈", level: "L1", desc: "描述统计、相关矩阵、假设检验、AHP、熵权法等" },
    data_utils:      { label: "数据工具",     icon: "🗂️", level: "L1", desc: "通用数据变换、归一化、滑动窗口等工具函数" },
    ml:              { label: "机器学习",     icon: "🤖", level: "L1", desc: "SVM、KNN、决策树、随机森林、逻辑回归、K-Means 等" },
    timeseries:      { label: "时序数据分析", icon: "📉", level: "L1", desc: "DTW、LSTM、Transformer、AR/MA/ARMA、包络分析等" },
    signal_proc:     { label: "信号处理",     icon: "〰️", level: "L1", desc: "FFT、DFT、DCT、小波变换、自适应滤波、各类滤波器" },
    deep_learning:   { label: "深度学习",     icon: "🧠", level: "L2", desc: "TensorFlow、PyTorch、XGBoost、LightGBM 等框架" },
    multi_framework: { label: "多算法框架",   icon: "🧩", level: "L2", desc: "sklearn、OpenCV、MXNet 等主流算法框架集成" },
  }

  const _cardIcons = {
    preprocess: ["🎲","⚖️","🔀","✂️","🔗","📐","📏","🩹","🔢"],
    statistics: ["📊","📉","🔗","🧮","📐","📦","🎯","🔍","📋","🧪","χ²","🔔","🏗️","⚖️","📅","🎲"],
    data_utils: ["📐","📏","🌊","🔺"],
    ml:         ["🔵","🎯","🌳","📬","🌲","📈","📉","📍","🌀","🏆","⚡","💡"],
    timeseries: ["⏱️","🧠","🔭","📊","🎭","🌀","🔮","📈","📉","🔄","🌊","〰️","🎵"],
    signal_proc:["⚡","〰️","🌊","🎵","🔄","🔧","🔻","🔺","📡","🚫"],
    deep_learning:  ["⚡","💡","🧠","🏗️","🔥"],
    multi_framework:["🔧","👁️","🌐","ℹ️"],
  }

  const renderComponentGallery = () => {
    const listEl = document.getElementById("component-gallery-list")
    if (!listEl) return

    const ns = state.galleryNamespace
    const q = (state.gallerySearch || "").toLowerCase()

    const filtered = state.galleryAlgorithms.filter((item) => {
      if (ns && item.namespace !== ns) return false
      if (q) {
        const hay = `${item.zhName || ""} ${fullAlgorithmNamespace(item)} ${item.zhDescription || ""} ${(item.zhTags || []).join(" ")}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    // Update stats
    const totalEl = document.getElementById("gallery-stat-total")
    const nsEl = document.getElementById("gallery-stat-namespaces")
    const countEl = document.getElementById("component-gallery-count")
    const badgeEl = document.getElementById("component-gallery-count-badge")
    if (totalEl) totalEl.textContent = String(state.galleryAlgorithms.length)
    const uniqueNs = new Set(state.galleryAlgorithms.map((a) => a.namespace).filter(Boolean))
    if (nsEl) nsEl.textContent = String(uniqueNs.size)
    if (countEl) countEl.textContent = `共 ${filtered.length} 个`
    if (badgeEl) {
      badgeEl.textContent = String(state.galleryAlgorithms.length)
      badgeEl.classList.toggle("hidden", state.galleryAlgorithms.length === 0)
    }

    // Update namespace selector
    const nsSelect = document.getElementById("component-gallery-namespace")
    if (nsSelect && nsSelect.options.length <= 1) {
      for (const n of uniqueNs) {
        const opt = document.createElement("option")
        opt.value = n
        opt.textContent = (_nsConfig[n] || {}).label || n
        nsSelect.appendChild(opt)
      }
    }

    if (state.galleryLoading) {
      listEl.innerHTML = '<div class="ag-empty">正在加载算法组件库…</div>'
      return
    }

    if (state.galleryError && state.galleryAlgorithms.length === 0) {
      listEl.innerHTML = `<div class="ag-empty">算法服务未连接（${escapeHtml(state.galleryError)}）。请确保 FastAPI 服务在 <code>localhost:8000</code> 运行。</div>`
      return
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="ag-empty">没有匹配的算法组件。</div>'
      return
    }

    // Group by namespace (preserve preferred order)
    const NS_ORDER = ["preprocess","statistics","data_utils","ml","timeseries","signal_proc","deep_learning","multi_framework"]
    const groups = new Map()
    for (const item of filtered) {
      const key = item.namespace || "其他"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    }
    const sortedGroups = [...NS_ORDER.filter((k) => groups.has(k)), ...[...groups.keys()].filter((k) => !NS_ORDER.includes(k))]

    let html = ""
    for (const namespace of sortedGroups) {
      const items = groups.get(namespace)
      const cfg = _nsConfig[namespace] || { label: namespace, icon: "📦", level: "L?", desc: "" }
      const icons = _cardIcons[namespace] || []
      const gridId = `ag-grid-${namespace}`

      html += `
        <div class="ag-section">
          <div class="ag-section-head">
            <button class="ag-sh-toggle" data-ag-toggle="${gridId}" title="折叠/展开">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="1" x2="4" y2="7"/><line x1="1" y1="4" x2="7" y2="4"/></svg>
            </button>
            <span class="ag-sh-icon">${cfg.icon}</span>
            <span class="ag-sh-name">${escapeHtml(cfg.label)}</span>
            <span class="ag-sh-level">${cfg.level}</span>
            <span class="ag-sh-count">共 ${items.length} 项</span>
            <div class="ag-sh-spacer"></div>
            <span class="ag-sh-desc">${escapeHtml(cfg.desc)}</span>
          </div>
          <div class="ag-grid" id="${gridId}">`

      items.forEach((item, idx) => {
        const callPrefix = fullAlgorithmNamespace(item)
        const icon = icons[idx % icons.length] || "🔷"
        const tags = (item.zhTags || []).slice(0, 3).map((t) =>
          `<span class="ag-tag ag-tag-blue">${escapeHtml(t)}</span>`
        ).join("")
        const versionTag = item.version ? `<span class="ag-tag ag-tag-dim">v${escapeHtml(item.version)}</span>` : ""
        const isPackage = !!item.packageId
        const statusTag = isPackage
          ? `<span class="ag-tag ag-tag-accent"><span class="ag-tag-dot"></span>包组件</span>`
          : `<span class="ag-tag ag-tag-success"><span class="ag-tag-dot"></span>单文件</span>`

        html += `
            <div class="ag-card"
              data-id="${escapeHtml(item.id || "")}"
              data-call-prefix="${escapeHtml(callPrefix)}"
              data-call-snippet="${escapeHtml(item.callSnippet || callPrefix)}"
              tabindex="0" role="button">
              <div class="ag-card-top">
                <div class="ag-card-icon">${icon}</div>
                <div class="ag-card-head">
                  <div class="ag-card-name">${escapeHtml(item.zhName || callPrefix || "")}</div>
                  <div class="ag-card-desc">${escapeHtml((item.zhDescription || item.enDescription || "").slice(0, 72))}</div>
                </div>
              </div>
              <div class="ag-card-tags">${versionTag}${statusTag}${tags}</div>
              <div class="ag-card-foot">
                <div class="ag-card-call card-ns"><code>${escapeHtml(callPrefix)}</code></div>
                <div class="ag-card-actions">
                  <button class="ag-ib" title="复制调用" data-action="copy-call" data-call="${escapeHtml(callPrefix)}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  <button class="ag-ib ag-ib-go" title="插入调用" data-action="insert-call" data-call="${escapeHtml(item.callSnippet || callPrefix)}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <button class="ag-ib" title="查看详情" data-action="show-detail" data-id="${escapeHtml(item.id || "")}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                  </button>
                  <button class="ag-ib ag-ib-edit" title="编辑算法" data-action="edit-gallery-algorithm" data-id="${escapeHtml(item.id || "")}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                  </button>
                </div>
              </div>
            </div>`
      })

      html += `</div></div>`
    }
    listEl.innerHTML = html

    // Bind toggle buttons
    listEl.querySelectorAll("[data-ag-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gridEl = document.getElementById(btn.getAttribute("data-ag-toggle"))
        if (!gridEl) return
        const collapsed = gridEl.classList.toggle("ag-grid-collapsed")
        btn.innerHTML = collapsed
          ? `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="4" x2="7" y2="4"/></svg>`
          : `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="1" x2="4" y2="7"/><line x1="1" y1="4" x2="7" y2="4"/></svg>`
      })
    })

    // Bind item actions
    listEl.querySelectorAll("[data-action='copy-call']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        const call = btn.getAttribute("data-call") || ""
        navigator.clipboard?.writeText(call).catch(() => {})
        showStatus(`已复制：${call}`)
      })
    })
    listEl.querySelectorAll("[data-action='insert-call']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        const call = btn.getAttribute("data-call") || ""
        notifyHost({ type: "insertText", text: call })
        showStatus(`已请求插入：${call}`)
      })
    })
    listEl.querySelectorAll("[data-action='show-detail']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        const id = btn.getAttribute("data-id") || ""
        const item = state.galleryAlgorithms.find((a) => a.id === id)
        if (item) showGalleryItemDetail(item)
      })
    })
    listEl.querySelectorAll("[data-action='edit-gallery-algorithm']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        const id = btn.getAttribute("data-id") || ""
        if (id) openGalleryAlgorithmEditor(id)
      })
    })
    // Card click → show detail
    listEl.querySelectorAll(".ag-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return
        const id = card.getAttribute("data-id") || ""
        const item = state.galleryAlgorithms.find((a) => a.id === id)
        if (item) showGalleryItemDetail(item)
      })
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        const id = card.getAttribute("data-id") || ""
        const item = state.galleryAlgorithms.find((a) => a.id === id)
        if (item) showGalleryItemDetail(item)
      })
    })
  }

  const showGalleryItemDetail = (item) => {
    const rpBody = document.getElementById("algolib-rp-body")
    const rpTitle = document.getElementById("algolib-rp-title")
    const rpPanel = document.getElementById("algolib-right-panel")
    if (!rpBody) return
    if (rpTitle) rpTitle.textContent = item.zhName || item.callPrefix || "算法详情"
    if (typeof ui_openPanel === "function") {
      ui_openPanel()
    } else if (rpPanel) {
      rpPanel.classList.add("open")
      if (!rpPanel.style.width || rpPanel.style.width === "0px") rpPanel.style.width = "300px"
    }
    const tags = (item.zhTags || []).map((t) => `<span class="ag-tag ag-tag-blue">${escapeHtml(t)}</span>`).join(" ")
    rpBody.innerHTML = `
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">基本信息</div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">中文名</span><span class="algolib-rp-val">${escapeHtml(item.zhName || "-")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">命名空间</span><span class="algolib-rp-val">${escapeHtml(item.namespace || "-")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">调用前缀</span><span class="algolib-rp-val"><code style="font-size:11px">${escapeHtml(item.callPrefix || "-")}</code></span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">版本</span><span class="algolib-rp-val">${escapeHtml(item.version || "-")}</span></div>
        <div class="algolib-rp-row"><span class="algolib-rp-key">类型</span><span class="algolib-rp-val">${item.packageId ? "包组件" : "单文件"}</span></div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">描述</div>
        <div class="algolib-rp-desc">${escapeHtml(item.zhDescription || item.enDescription || "暂无描述")}</div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">标签</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${tags || "<span style='color:var(--text-dim)'>暂无标签</span>"}</div>
      </section>
      <section class="algolib-rp-sec">
        <div class="algolib-rp-sec-title">操作</div>
        <div class="algolib-rp-actions">
          <button class="algolib-rp-btn" id="gallery-detail-copy" type="button">复制调用</button>
          <button class="algolib-rp-btn" id="gallery-detail-insert" type="button">插入</button>
          <button class="algolib-rp-btn accent" id="gallery-detail-edit" type="button">编辑算法</button>
        </div>
      </section>`
    document.getElementById("gallery-detail-copy")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(item.callPrefix || "").catch(() => {})
      showStatus(`已复制：${item.callPrefix || ""}`)
    })
    document.getElementById("gallery-detail-insert")?.addEventListener("click", () => {
      const call = item.callSnippet || item.callPrefix || ""
      notifyHost({ type: "insertText", text: call })
      showStatus(`已请求插入：${call}`)
    })
    document.getElementById("gallery-detail-edit")?.addEventListener("click", () => {
      if (item.id) openGalleryAlgorithmEditor(item.id)
    })
  }

  const bindGalleryEvents = () => {
    document.getElementById("component-gallery-search")?.addEventListener("input", (e) => {
      state.gallerySearch = e.target.value
      renderComponentGallery()
    })
    document.getElementById("component-gallery-namespace")?.addEventListener("change", (e) => {
      state.galleryNamespace = e.target.value
      // Sync gallery nav sub-item
      document.querySelectorAll("#algolib-gallery-nav-sub .nav-sub-item").forEach((el) => {
        el.classList.toggle("active", (el.getAttribute("data-gallery-ns") || "") === state.galleryNamespace)
      })
      renderComponentGallery()
    })
    document.getElementById("component-gallery-type")?.addEventListener("change", renderComponentGallery)
    document.getElementById("component-gallery-reload")?.addEventListener("click", async () => {
      state.galleryAlgorithms = []
      document.getElementById("component-gallery-namespace").innerHTML = "<option value=\"\">全部命名空间</option>"
      renderComponentGallery()
      await loadGalleryAlgorithms()
      renderComponentGallery()
    })

    // Gallery nav sub-items
    document.querySelectorAll("#algolib-gallery-nav-sub .nav-sub-item").forEach((el) => {
      el.addEventListener("click", () => {
        const ns = el.getAttribute("data-gallery-ns") || ""
        state.galleryNamespace = ns
        const nsSelect = document.getElementById("component-gallery-namespace")
        if (nsSelect) nsSelect.value = ns
        document.querySelectorAll("#algolib-gallery-nav-sub .nav-sub-item").forEach((item) => {
          item.classList.toggle("active", (item.getAttribute("data-gallery-ns") || "") === ns)
        })
        activatePanel("component-gallery")
        renderComponentGallery()
      })
    })
  }

  // ─── End Component Gallery ───────────────────────────────────────────────

  const bindForms = () => {
    $("#template-form").addEventListener("submit", async (event) => { event.preventDefault(); await handleTemplateSave() })
    $("#folder-edit-form").addEventListener("submit", async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const type = value(form, "type")
      const id = value(form, "id")
      const name = value(form, "name").trim()
      if (!name) return
      if (type === "snippet") {
        const visibility = value(form, "visibility") || state.snippetScope
        await submitJson(`${apiBase}/snippet-folders${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", { name, visibility })
      } else {
        const callName = value(form, "callName").trim() || undefined
        await submitJson(`${apiBase}/algorithm-folders${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", { name, callName })
      }
      closeModal("#folder-edit-modal")
      showStatus("保存成功")
    })
    $("#snippet-form").addEventListener("submit", async (event) => { event.preventDefault(); clearError(); if (!validateSnippetForm() || !validateVersionFields("#snippet-form")) { return } const id = value(event.currentTarget, "id"); await submitJson(`${apiBase}/snippets${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", createSnippetPayload()); showStatus("保存成功") })
    $("#algorithm-form").addEventListener("submit", async (event) => { event.preventDefault(); await handleAlgorithmSave() })
  }

  const bindButtons = () => {
    const openCategoryForm = (parentId = state.selectedCategoryId || "") => {
      state.creatingCategory = true
      state.editingCategoryId = null
      $("#category-form").reset()
      setValue($("#category-form"), "id", "")
      setValue($("#category-form"), "name", "")
      setValue($("#category-form"), "parentId", parentId)
      setValue($("#category-form"), "sortOrder", (state.bootstrap?.categories?.length || 0) + 1)
      setValue($("#category-form"), "description", "")
      clearFieldError("#category-form", "name")
      renderCategoryForm()
      activatePanel("templates")
      showTemplateCategoryView()
    }

    const openSnippetFolderForm = () => {
      const form = $("#folder-edit-form")
      form.reset()
      setValue(form, "type", "snippet")
      setValue(form, "id", "")
      setValue(form, "visibility", state.snippetScope)
      $("#folder-edit-modal-title").textContent = "新增片段文件夹"
      $("#folder-edit-delete").classList.add("hidden")
      $("#folder-edit-visibility-row").classList.remove("hidden")
      $("#folder-edit-callname-row").classList.add("hidden")
      activatePanel("snippets")
      showPanelList("snippets")
      openModal("#folder-edit-modal")
    }

    const openAlgorithmFolderForm = () => {
      const form = $("#folder-edit-form")
      form.reset()
      setValue(form, "type", "algorithm")
      setValue(form, "id", "")
      setValue(form, "callName", "")
      $("#folder-edit-modal-title").textContent = "新增组件分组"
      $("#folder-edit-delete").classList.add("hidden")
      $("#folder-edit-visibility-row").classList.add("hidden")
      $("#folder-edit-callname-row").classList.remove("hidden")
      activatePanel("algorithms")
      showPanelList("algorithms")
      openModal("#folder-edit-modal")
    }

    const openNewTemplate = () => {
      state.creatingTemplate = true
      state.selectedTemplateId = null
      $("#template-form").reset()
      setValue($("#template-form"), "id", "")
      setValue($("#template-form"), "packageId", "")
      setValue($("#template-form"), "name", "")
      setValue($("#template-form"), "zhName", "")
      setValue($("#template-form"), "categoryId", "")
      setValue($("#template-form"), "language", "python")
      setValue($("#template-form"), "difficulty", 1)
      setValue($("#template-form"), "tags", "")
      setValue($("#template-form"), "description", "")
      setEditorValue("#template-form", "content", "")
      setEditorValue("#template-form", "example", "")
      field($("#template-form"), "bumpType").dataset.manualBump = ""
      setValue($("#template-form"), "changeReason", "")
      setValue($("#template-form"), "changeSummary", "")
      $("#template-detail-title").textContent = "新建模板"
      $("#template-detail-version").textContent = "保存后版本：1.0.0"
      $("#template-detail-status").textContent = "模板详情"
      updateTemplateVersionPreview()
      ;["name", "zhName", "categoryId", "description", "content", "example", "changeReason", "changeSummary"].forEach((name) => clearFieldError("#template-form", name))
      renderTemplates()
      activatePanel("templates")
      showPanelDetail("templates")
    }

    const openNewSnippet = () => {
      state.creatingSnippet = true
      state.selectedSnippetId = null
      $("#snippet-form").reset()
      setValue($("#snippet-form"), "id", "")
      setValue($("#snippet-form"), "name", "")
      setValue($("#snippet-form"), "zhName", "")
      setValue($("#snippet-form"), "visibility", "private")
      setValue($("#snippet-form"), "language", "python")
      setValue($("#snippet-form"), "folderId", "")
      setValue($("#snippet-form"), "tags", "")
      setValue($("#snippet-form"), "description", "")
      setEditorValue("#snippet-form", "content", "")
      setValue($("#snippet-form"), "bumpType", "patch")
      setValue($("#snippet-form"), "changeReason", "")
      setValue($("#snippet-form"), "changeSummary", "")
      $("#snippet-detail-title").textContent = "新建片段"
      $("#snippet-detail-version").textContent = "保存后版本：1.0.0"
      $("#snippet-detail-status").textContent = "待保存"
      ;["name", "zhName", "description", "content", "changeReason", "changeSummary"].forEach((name) => clearFieldError("#snippet-form", name))
      renderSnippets()
      activatePanel("snippets")
      showPanelDetail("snippets")
    }

    const openNewAlgorithm = () => {
      state.creatingAlgorithm = true
      state.selectedAlgorithmId = null
      $("#algorithm-form").reset()
      setValue($("#algorithm-form"), "id", "")
      setValue($("#algorithm-form"), "packageId", "")
      setValue($("#algorithm-form"), "name", "")
      setValue($("#algorithm-form"), "zhName", "")
      setValue($("#algorithm-form"), "namespace", "")
      setValue($("#algorithm-form"), "type", "流式检测")
      setValue($("#algorithm-form"), "folderId", "")
      setValue($("#algorithm-form"), "tags", "")
      setValue($("#algorithm-form"), "description", "")
      setValue($("#algorithm-form"), "dependencies", "")
      setValue($("#algorithm-form"), "changeReason", "")
      setValue($("#algorithm-form"), "changeSummary", "")
      setEditorValue("#algorithm-form", "inputSpec", "")
      setEditorValue("#algorithm-form", "outputSpec", "")
      setEditorValue("#algorithm-form", "content", "")
      setEditorValue("#algorithm-form", "example", "")
      $("#algorithm-detail-title").textContent = "新建组件"
      $("#algorithm-detail-version").textContent = "保存后版本：1.0.0"
      $("#algorithm-detail-status").textContent = "待保存"
      ;["name", "zhName", "namespace", "type", "description", "inputSpec", "outputSpec", "content", "changeReason", "changeSummary"].forEach((name) => clearFieldError("#algorithm-form", name))
      renderAlgorithms()
      activatePanel("algorithms")
      showPanelDetail("algorithms")
    }

    $$(".nav-item[data-panel]").forEach((el) =>
      el.addEventListener("click", () => {
        const panel = el.dataset.panel || "templates"
        ui_switchPage(panel)
        if (panel === "templates") {
          $("#algolib-template-nav-sub")?.classList.add("open")
        }
        if (panel === "algorithms") {
          $("#nav-category-list")?.classList.add("open")
        }
        if (panel === "snippets") {
          $("#algolib-snippet-nav-sub")?.classList.add("open")
        }
      }),
    )
    $$(".top-tab[data-panel]").forEach((el) =>
      el.addEventListener("click", () => ui_switchPage(el.dataset.panel || "templates")),
    )
    $$("[data-ui-snippet-tab]").forEach((el) =>
      el.addEventListener("click", () => {
        ui_switchPage("snippets")
        ui_switchSnippetTab(el.getAttribute("data-ui-snippet-tab") || "private")
      }),
    )
    $$("[data-ui-algorithm-scope]").forEach((el) =>
      el.addEventListener("click", () => {
        const nextScope = el.getAttribute("data-ui-algorithm-scope") || "mine"
        if (nextScope === "review" && !isAdmin()) {
          return
        }
        state.algorithmScope = nextScope
        state.selectedAlgorithmFolderId = null
        state.selectedAlgorithmId = null
        ui_switchPage("algorithms")
        renderAlgorithms()
      }),
    )
    $("#category-quick-new")?.addEventListener("click", () => openCategoryForm(""))
    $("#template-quick-new")?.addEventListener("click", openNewTemplate)
    $("#category-new").addEventListener("click", () => openCategoryForm(""))
    $("#category-back").addEventListener("click", () => showPanelList("templates"))
    $("#folder-edit-modal-close").addEventListener("click", () => closeModal("#folder-edit-modal"))
    $("#folder-edit-modal-close2").addEventListener("click", () => closeModal("#folder-edit-modal"))
    $("#template-new").addEventListener("click", openNewTemplate)
    $("#template-multifile-new")?.addEventListener("click", () => openCreatePackageDialog("template"))
    $("#component-gallery-new")?.addEventListener("click", () => openCreatePackageDialog("component"))
    $("#snippet-new").addEventListener("click", openNewSnippet)
    $("#template-filter-trigger")?.addEventListener("click", () => showStatus("已按当前筛选条件刷新模板列表"))
    $("#snippet-import")?.addEventListener("click", () => showStatus("导入功能保留原业务逻辑，可按现有流程接入"))
    $("#algorithm-new").addEventListener("click", openNewAlgorithm)
    $("#snippet-folder-new").addEventListener("click", openSnippetFolderForm)
    $("#algorithm-folder-new").addEventListener("click", openAlgorithmFolderForm)
    $("#algolib-panel-toggle")?.addEventListener("click", () => {
      const panel = $("#algolib-right-panel")
      if (panel?.classList.contains("open")) {
        ui_closePanel()
      } else if (state.currentPanel === "templates" && getTemplateById(state.selectedTemplateId)) {
        const template = getTemplateById(state.selectedTemplateId)
        const category = (state.bootstrap?.categories || []).find((item) => item.id === template.categoryId)
        const metric = ui_pickTemplateMetric(template)
        ui_showAlgoDetail(template.zhName || template.name, template.language, template.currentVersion, template.status, metric.total, metric.today, template.description, category?.name || texts.unassigned, metric.updated, metric.health, `template.${template.id}`)
      } else if (state.currentPanel === "snippets" && getSnippetById(state.selectedSnippetId)) {
        const snippet = getSnippetById(state.selectedSnippetId)
        const folder = (state.bootstrap?.snippetFolders || []).find((item) => item.id === snippet.folderId)
        ui_showSnippetDetail(snippet.zhName || snippet.name, snippet.language, folder?.name || texts.unassigned, snippet.description, snippet.content, `snippet.${snippet.id}`)
      }
    })
    $("#algolib-panel-close")?.addEventListener("click", ui_closePanel)
    $("#template-delete").addEventListener("click", async () => { const id = value($("#template-form"), "id"); if (id && window.confirm("确认删除当前模板吗？")) { await submitJson(`${apiBase}/templates/${id}`, "DELETE"); showStatus("删除成功") } })
    $("#template-publish").addEventListener("click", async () => {
      const form = $("#template-form")
      let id = value(form, "id")
      if (id && templateDraftHasChanges()) {
        await handleTemplateSave()
        id = value(form, "id") || String(state.selectedTemplateId || "")
      }
      if (!id) {
        await handleTemplateSave()
        id = value(form, "id") || String(state.selectedTemplateId || "")
      }
      if (!id) return
      const payload = {
        name: value(form, "name"),
        zhName: value(form, "zhName") || value(form, "name"),
        packageId: value(form, "packageId") || undefined,
        description: value(form, "description"),
      }
      const created = await submitJson(`${apiBase}/templates/${id}/publish`, "POST", payload)
      showStatus("已发布为算法组件草稿")
      if (created?.id) {
        state.selectedAlgorithmId = created.id
      }
      state.algorithmScope = "mine"
      activatePanel("algorithms")
      showPanelDetail("algorithms")
    })
    $("#snippet-delete").addEventListener("click", async () => { const id = value($("#snippet-form"), "id"); if (id && window.confirm("确认删除当前片段吗？")) { await submitJson(`${apiBase}/snippets/${id}`, "DELETE"); showStatus("删除成功") } })
    $("#algorithm-delete").addEventListener("click", async () => { const id = value($("#algorithm-form"), "id"); if (id && window.confirm("确认删除当前组件吗？")) { await submitJson(`${apiBase}/algorithms/${id}`, "DELETE"); showStatus("删除成功") } })
    $("#template-multifile")?.addEventListener("click", async () => {
      try {
        await openTemplateMultiFileEditor()
      } catch (error) {
        showError(error.message || String(error))
      }
    })
    $("#algorithm-multifile")?.addEventListener("click", async () => {
      try {
        await openAlgorithmMultiFileEditor()
      } catch (error) {
        showError(error.message || String(error))
      }
    })
    $("#algorithm-multifile-new")?.addEventListener("click", () => openCreatePackageDialog("component"))
    $("#category-delete").addEventListener("click", async () => {
      const id = value($("#category-form"), "id")
      const categoryName = value($("#category-form"), "name")
      if (id && window.confirm(`确认删除分类「${categoryName}」？该分类下的模板将移至未分类。`)) {
        await submitJson(`${apiBase}/categories/${id}`, "DELETE")
        state.creatingCategory = false
        state.editingCategoryId = null
        showPanelList("templates")
        renderTemplates()
        showStatus("删除成功")
      }
    })
    $("#folder-edit-delete").addEventListener("click", async () => {
      const form = $("#folder-edit-form")
      const type = value(form, "type")
      const id = value(form, "id")
      if (!id || !window.confirm("确认删除该文件夹？")) return
      await submitJson(`${apiBase}/${type === "snippet" ? "snippet-folders" : "algorithm-folders"}/${id}`, "DELETE")
      closeModal("#folder-edit-modal")
      showStatus("删除成功")
    })
    $("#template-replace").addEventListener("click", () => $("#template-replace-file").click())
    $("#category-save").addEventListener("click", handleCategorySave)
    $("#template-save").addEventListener("click", handleTemplateSave)
    $("#template-test")?.addEventListener("click", () => openTemplateTestDialog())
    $("#snippet-save").addEventListener("click", () => $("#snippet-form").requestSubmit())
    $("#algorithm-save").addEventListener("click", handleAlgorithmSave)
    $("#template-back").addEventListener("click", () => showPanelList("templates"))
    $("#snippet-back").addEventListener("click", () => showPanelList("snippets"))
    $("#algorithm-back").addEventListener("click", () => showPanelList("algorithms"))
    $("#template-replace-file").addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (!file) { return } const content = await file.text(); setEditorValue("#template-form", "content", content); const language = inferLanguageFromFileName(file.name); if (language && language !== "plaintext") { setValue($("#template-form"), "language", language); updateEditorLanguage("#template-form", "content"); updateEditorLanguage("#template-form", "example") } if (!value($("#template-form"), "changeReason")) { setValue($("#template-form"), "changeReason", "从文件整体替换模板内容") } if (!value($("#template-form"), "changeSummary")) { setValue($("#template-form"), "changeSummary", `导入文件 ${file.name} 并替换模板主体内容`) } updateTemplateVersionPreview(); event.target.value = "" })
    field($("#category-form"), "parentId").addEventListener("change", updateCategoryLevelPreview)
    field($("#template-form"), "bumpType").addEventListener("change", (event) => { event.currentTarget.dataset.manualBump = "1"; updateTemplateVersionPreview() })
    field($("#snippet-form"), "bumpType").addEventListener("change", updateSnippetVersionPreview)
    field($("#algorithm-form"), "bumpType").addEventListener("change", updateAlgorithmVersionPreview)
    ;[
      ["#category-form", ["name"]],
      ["#template-form", ["name", "categoryId", "description", "content", "example", "changeReason", "changeSummary"]],
      ["#snippet-form", ["name", "zhName", "description", "content", "changeReason", "changeSummary"]],
      ["#algorithm-form", ["name", "zhName", "type", "description", "dependencies", "inputSpec", "outputSpec", "content", "changeReason", "changeSummary"]],
      ["#algorithm-submit-form", ["description", "inputSpec", "outputSpec", "reason", "summary"]],
      ["#algorithm-review-form", ["reason", "summary"]],
    ].forEach(([formSelector, names]) => {
      names.forEach((name) => {
        field($(formSelector), name)?.addEventListener("input", () => clearFieldError(formSelector, name))
        field($(formSelector), name)?.addEventListener("change", () => clearFieldError(formSelector, name))
      })
    })
    ;["name", "categoryId", "language"].forEach((name) => { const control = field($("#template-form"), name); control?.addEventListener("input", updateTemplateVersionPreview); control?.addEventListener("change", updateTemplateVersionPreview) })
    $("#template-filter-category").addEventListener("change", () => {
      const nextValue = $("#template-filter-category").value
      state.selectedCategoryId = nextValue ? Number(nextValue) : null
      if (state.selectedCategoryId) {
        expandCategoryPath(state.selectedCategoryId)
      }
      renderTemplates()
    })
    ;["#template-search", "#template-filter-language", "#template-sort"].forEach((selector) => { $(selector).addEventListener("input", renderTemplates); $(selector).addEventListener("change", renderTemplates) })
    $("#snippet-search").addEventListener("input", renderSnippets)
    $("#snippet-filter-tag").addEventListener("input", renderSnippets)
    $("#snippet-filter-folder").addEventListener("change", () => {
      const nextValue = $("#snippet-filter-folder").value
      state.selectedSnippetFolderId = nextValue ? Number(nextValue) : null
      renderSnippetFolders()
      renderSnippets()
    })
    $("#algorithm-search").addEventListener("input", renderAlgorithms)
    $("#algorithm-filter-tag").addEventListener("input", renderAlgorithms)
    $$("#snippet-scope-tabs .scope-tab").forEach((button) => button.addEventListener("click", () => ui_switchSnippetTab(button.dataset.scope || "private")))
    $$("#algorithm-scope-tabs .scope-tab").forEach((button) => button.addEventListener("click", () => { const nextScope = button.dataset.scope || "mine"; if (nextScope === "review" && !isAdmin()) { return } state.algorithmScope = nextScope; state.selectedAlgorithmFolderId = null; state.selectedAlgorithmId = null; renderAlgorithms(); renderSidebar(); ui_updateStatusBar("algorithms") }))
    $("#diff-modal-close").addEventListener("click", closeDiffModal)
    $("#diff-modal").addEventListener("click", (event) => { if (event.target.id === "diff-modal") { closeDiffModal() } })
    ;["#algorithm-submit-close", "#algorithm-submit-cancel"].forEach((selector) =>
      $(selector).addEventListener("click", () => closeModal("#algorithm-submit-modal")),
    )
    ;["#algorithm-review-close", "#algorithm-review-cancel"].forEach((selector) =>
      $(selector).addEventListener("click", () => closeModal("#algorithm-review-modal")),
    )
    $("#algorithm-submit-modal").addEventListener("click", (event) => {
      if (event.target.id === "algorithm-submit-modal") {
        closeModal("#algorithm-submit-modal")
      }
    })
    $("#algorithm-review-modal").addEventListener("click", (event) => {
      if (event.target.id === "algorithm-review-modal") {
        closeModal("#algorithm-review-modal")
      }
    })
    $("#algorithm-submit").addEventListener("click", openAlgorithmSubmitDialog)
    $("#algorithm-approve").addEventListener("click", () => openAlgorithmReviewDialog("approved"))
    $("#algorithm-reject").addEventListener("click", () => openAlgorithmReviewDialog("rejected"))
    $("#algorithm-submit-form").addEventListener("submit", async (event) => {
      event.preventDefault()
      clearError()
      if (
        !validateRequiredFields("#algorithm-submit-form", [
          { name: "description", message: "请填写功能描述" },
          { name: "inputSpec", message: "请填写输入参数说明" },
          { name: "outputSpec", message: "请填写输出说明" },
          { name: "reason", message: "请填写提交原因" },
          { name: "summary", message: "请填写提交说明" },
        ])
      ) {
        return
      }
      const id = value($("#algorithm-form"), "id")
      if (!id) {
        return
      }
      await submitJson(`${apiBase}/algorithms/${id}/submit`, "POST", {
        type: value(event.currentTarget, "type"),
        description: value(event.currentTarget, "description"),
        inputSpec: value(event.currentTarget, "inputSpec"),
        outputSpec: value(event.currentTarget, "outputSpec"),
        dependencies: value(event.currentTarget, "dependencies"),
        reason: value(event.currentTarget, "reason"),
        summary: value(event.currentTarget, "summary"),
      })
      closeModal("#algorithm-submit-modal")
      showStatus("提交审核成功")
    })
    $("#algorithm-review-form").addEventListener("submit", async (event) => {
      event.preventDefault()
      clearError()
      if (
        !validateRequiredFields("#algorithm-review-form", [
          { name: "reason", message: "请填写审核原因" },
          { name: "summary", message: "请填写审核摘要" },
        ])
      ) {
        return
      }
      const id = value($("#algorithm-form"), "id")
      if (!id) {
        return
      }
      const decision = value(event.currentTarget, "decision") || "approved"
      await submitJson(`${apiBase}/algorithms/${id}/review`, "POST", {
        decision,
        reason: value(event.currentTarget, "reason"),
        summary: value(event.currentTarget, "summary"),
        applications: decision === "approved" ? splitCsv(value(event.currentTarget, "applications")) : [],
      })
      closeModal("#algorithm-review-modal")
      showStatus(decision === "approved" ? "审核通过成功" : "审核拒绝成功")
    })
  }

  const bindActionDelegation = () => {
    document.addEventListener("input", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (target.matches("#nsEditInput")) {
        const value = target.value.trim()
        const errorNode = document.getElementById("nsEditError")
        const valid = /^alg\.[a-z_]+\.[a-z_]+$/.test(value)
        target.classList.toggle("error", value.length > 0 && !valid)
        if (errorNode) {
          errorNode.textContent = value.length > 0 && !valid ? "格式须为 alg.[小写字母_].[小写字母_]" : ""
        }
      }
    })

    document.addEventListener("change", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (target.matches('[data-test-panel-action="history"]')) {
        window._loadHistoryRun(target.value)
      }
    })

    document.addEventListener("click", async (event) => {
      const namespaceTarget = event.target.closest("[data-ns-action]")
      if (namespaceTarget) {
        event.preventDefault()
        event.stopPropagation()
        const action = namespaceTarget.getAttribute("data-ns-action")
        const algorithmId = namespaceTarget.getAttribute("data-algorithm-id") || ""
        if (action === "confirm") {
          await window.patchNamespace(algorithmId, document.getElementById("nsEditInput")?.value || "")
        } else if (action === "cancel") {
          window.cancelEditNamespace(algorithmId, namespaceTarget.getAttribute("data-original-ns") || "")
        }
        return
      }

      const boolTarget = event.target.closest("[data-bool-btn]")
      if (boolTarget) {
        event.preventDefault()
        event.stopPropagation()
        window._toggleBoolParam(boolTarget)
        return
      }

      const testPanelTarget = event.target.closest("[data-test-panel-action], [data-test-tab]")
      if (testPanelTarget) {
        event.preventDefault()
        event.stopPropagation()
        const panelAction = testPanelTarget.getAttribute("data-test-panel-action")
        if (panelAction === "fill-sample") {
          window._fillSampleParams()
          return
        }
        if (panelAction === "run") {
          await window._runEnhancedTest()
          return
        }
        const tab = testPanelTarget.getAttribute("data-test-tab")
        if (tab) {
          window._switchTestTab(tab)
          return
        }
      }

      const target = event.target.closest("[data-action]")
      if (!target) {
        return
      }

      const action = target.dataset.action
      const id = Number(target.dataset.id || 0)
      const version = target.dataset.version || ""
      const compareVersion = target.dataset.compare || ""

      try {
        if (action === "template-folder-toggle") {
          event.preventDefault()
          event.stopPropagation()
          const key = String(target.dataset.folderKey || "")
          const domId = `tpl-folder-${encodeURIComponent(key)}`
          toggleFolder(domId)
          return
        }

        if (action === "category-toggle") {
          if (state.expandedCategoryIds.has(id)) {
            state.expandedCategoryIds.delete(id)
          } else {
            state.expandedCategoryIds.add(id)
          }
          renderTemplates()
          return
        }

        if (action === "category-select") {
          state.selectedCategoryId = id
          $("#template-filter-category").value = String(id)
          expandCategoryPath(id)
          renderTemplates()
          showPanelList("templates")
          return
        }

        if (action === "category-edit") {
          state.creatingCategory = false
          state.editingCategoryId = id
          renderCategoryForm()
          activatePanel("templates")
          showTemplateCategoryView()
          return
        }

        if (action === "category-add-child") {
          state.selectedCategoryId = id
          const form = $("#category-form")
          form.reset()
          setValue(form, "id", "")
          setValue(form, "name", "")
          setValue(form, "sortOrder", (state.bootstrap?.categories?.length || 0) + 1)
          setValue(form, "parentId", id)
          setValue(form, "description", "")
          state.creatingCategory = true
          state.editingCategoryId = null
          clearFieldError("#category-form", "name")
          renderCategoryForm()
          activatePanel("templates")
          showTemplateCategoryView()
          return
        }

        if (action === "template-select") {
          state.creatingTemplate = false
          state.selectedTemplateId = id
          const template = getTemplateById(id)
          if (template) {
            state.selectedCategoryId = template.categoryId
            $("#template-filter-category").value = String(template.categoryId || "")
            expandCategoryPath(template.categoryId)
            setValue($("#template-form"), "id", template.id)
            setValue($("#template-form"), "packageId", template.packageId || "")
            setValue($("#template-form"), "name", template.name)
            setValue($("#template-form"), "zhName", template.zhName || template.name)
            setValue($("#template-form"), "categoryId", template.categoryId || "")
            setValue($("#template-form"), "language", template.language || "python")
            setValue($("#template-form"), "difficulty", template.difficulty || 1)
            setValue($("#template-form"), "tags", Array.isArray(template.tags) ? template.tags.join(", ") : (template.tags || ""))
            setValue($("#template-form"), "description", template.description || "")
            setEditorValue("#template-form", "content", template.templateBody || template.content || "")
            setEditorValue("#template-form", "example", template.paramsSchema || template.example || "")
            setValue($("#template-form"), "changeReason", "")
            setValue($("#template-form"), "changeSummary", "")
            updateTemplateVersionPreview()
          }
          renderTemplates()
          showPanelDetail("templates")
          return
        }

        if (action === "template-edit") {
          event.preventDefault()
          event.stopPropagation()
          state.creatingTemplate = false
          state.selectedTemplateId = id
          const template = getTemplateById(id)
          if (template?.packageId) {
            await openPackageEditor(template.packageId, { module: "template", id })
            return
          }
          renderTemplates()
          showPanelDetail("templates")
          return
        }

        if (action === "template-publish-inline") {
          event.preventDefault()
          event.stopPropagation()
          publishAsComponent(id)
          return
        }

        if (action === "template-publish-quick") {
          event.preventDefault()
          event.stopPropagation()
          let template = getTemplateById(id)
          if (!template) {
            return
          }
          if (Number(value($("#template-form"), "id")) === id && templateDraftHasChanges()) {
            await handleTemplateSave()
            template = getTemplateById(id)
            if (!template) return
          }
          const componentName = window.prompt("请输入组件英文名", template.name)
          if (componentName === null) {
            return
          }
          const namespace = window.prompt("请输入组件命名空间", sanitizeSlug(template.name || "template_component"))
          if (namespace === null) {
            return
          }
          const created = await submitJson(`${apiBase}/templates/${id}/publish`, "POST", {
            name: componentName,
            zhName: template.zhName || template.name,
            packageId: template.packageId || undefined,
            namespace: namespace || undefined,
          })
          showStatus("已从模板生成组件草稿")
          if (created?.id) {
            state.selectedAlgorithmId = created.id
          }
          state.algorithmScope = "mine"
          activatePanel("algorithms")
          showPanelDetail("algorithms")
          return
        }

        if (action === "template-delete-quick") {
          event.preventDefault()
          event.stopPropagation()
          const template = getTemplateById(id)
          if (!template) {
            return
          }
          if (!window.confirm(`确认删除模板「${template.zhName || template.name}」吗？`)) {
            return
          }
          await submitJson(`${apiBase}/templates/${id}`, "DELETE")
          showStatus("模板已删除")
          return
        }

        if (action === "template-version-restore") {
          const reason = window.prompt("请输入恢复原因", `回退到 ${version}`)
          if (reason === null) {
            return
          }
          const summary = window.prompt("请输入恢复摘要", `恢复模板到 ${version}`)
          if (summary === null) {
            return
          }
          await submitJson(`${apiBase}/templates/${id}/restore`, "POST", { version, reason, summary })
          return
        }

        if (action === "template-version-diff") {
          const template = getTemplateById(id)
          const versions = templateVersions(id)
          const current = versions.find((item) => item.version === version)
          const previous = versions.find((item) => item.version === compareVersion) || null
          if (!current) {
            return
          }
          openDiffModal(
            `模板版本差异：${template?.name || "未命名模板"}`,
            previous ? `旧版本 ${previous.version}` : "空白初稿",
            previous ? previous.content : "",
            `当前版本 ${current.version}`,
            current.content,
            previous ? "" : texts.firstVersionDiff,
          )
          return
        }

        if (action === "snippet-folder-select") {
          state.creatingSnippet = false
          state.selectedSnippetFolderId = id || null
          const selectedFolder = id ? (state.bootstrap?.snippetFolders || []).find((item) => item.id === id) : null
          if (selectedFolder) {
            $("#snippet-filter-folder").value = String(id)
            expandFolderPath(state.bootstrap?.snippetFolders || [], selectedFolder.id, state.expandedSnippetFolderIds)
          } else {
            $("#snippet-filter-folder").value = ""
          }
          renderSnippetFolders()
          renderSnippets()
          return
        }

        if (action === "snippet-section-toggle") {
          event.preventDefault()
          event.stopPropagation()
          const key = String(target.dataset.folderKey || "")
          const domId = key === "ungrouped" ? "snip-folder-ungrouped" : `snip-folder-${encodeURIComponent(key)}`
          toggleFolder(domId)
          return
        }

        if (action === "snippet-folder-toggle") {
          if (state.expandedSnippetFolderIds.has(id)) {
            state.expandedSnippetFolderIds.delete(id)
          } else {
            state.expandedSnippetFolderIds.add(id)
          }
          renderSnippetFolders()
          renderSnippets()
          return
        }

        if (action === "snippet-folder-edit") {
          const folder = (state.bootstrap?.snippetFolders || []).find((item) => item.id === id)
          if (!folder) return
          const form = $("#folder-edit-form")
          form.reset()
          setValue(form, "type", "snippet")
          setValue(form, "id", folder.id)
          setValue(form, "name", folder.name)
          setValue(form, "visibility", folder.visibility)
          $("#folder-edit-modal-title").textContent = "编辑片段文件夹"
          $("#folder-edit-delete").classList.remove("hidden")
          $("#folder-edit-visibility-row").classList.remove("hidden")
          $("#folder-edit-callname-row").classList.add("hidden")
          openModal("#folder-edit-modal")
          return
        }

        if (action === "snippet-folder-remove") {
          const folder = (state.bootstrap?.snippetFolders || []).find((item) => item.id === id)
          const count = (state.bootstrap?.snippets || []).filter((item) => item.folderId === id && item.visibility === state.snippetScope).length
          if (!folder) {
            return
          }
          const ok = window.confirm(`该文件夹下有 ${count} 个片段，删除文件夹后片段将移至「未分类」，确认删除？`)
          if (!ok) {
            return
          }
          await submitJson(`${apiBase}/snippet-folders/${id}`, "DELETE")
          showStatus("删除成功")
          return
        }

        if (action === "snippet-copy-quick") {
          const snippet = getSnippetById(id)
          if (snippet?.content) {
            navigator.clipboard.writeText(snippet.content).then(() => showStatus("代码已复制到剪贴板")).catch(() => showStatus("复制失败，请手动复制"))
          }
          return
        }

        if (action === "snippet-edit-quick") {
          event.preventDefault()
          event.stopPropagation()
          state.creatingSnippet = false
          state.selectedSnippetId = id
          renderSnippets()
          showPanelDetail("snippets")
          return
        }

        if (action === "snippet-insert-quick") {
          event.preventDefault()
          event.stopPropagation()
          const snippet = getSnippetById(id)
          if (!snippet) return
          notifyHost({ type: "insertText", text: snippet.body || snippet.content || "" })
          showStatus(`已插入片段：${snippet.zhName || snippet.name}`)
          return
        }

        if (action === "snippet-delete-quick") {
          const snippet = getSnippetById(id)
          if (!snippet) return
          if (!window.confirm(`确认删除片段「${snippet.name}」吗？`)) return
          await submitJson(`${apiBase}/snippets/${id}`, "DELETE")
          showStatus("删除成功")
          return
        }

        if (action === "algorithm-quick-approve") {
          state.selectedAlgorithmId = id
          renderAlgorithms()
          openAlgorithmReviewDialog("approved")
          return
        }

        if (action === "algorithm-edit-quick") {
          event.preventDefault()
          event.stopPropagation()
          state.creatingAlgorithm = false
          state.selectedAlgorithmId = id
          const algorithm = getAlgorithmById(id)
          if (algorithm?.packageId) {
            await openPackageEditor(algorithm.packageId, { module: "algorithm", id })
            return
          }
          renderAlgorithms()
          showPanelDetail("algorithms")
          return
        }

        if (action === "algorithm-test-quick") {
          event.preventDefault()
          event.stopPropagation()
          state.selectedAlgorithmId = id
          renderAlgorithms()
          openAlgorithmTestDialog(id)
          return
        }

        if (action === "algorithm-doc-quick") {
          event.preventDefault()
          event.stopPropagation()
          state.selectedAlgorithmId = id
          renderAlgorithms()
          await openAlgorithmApiDialog(id)
          return
        }

        if (action === "algorithm-delete-quick") {
          event.preventDefault()
          event.stopPropagation()
          const algorithm = getAlgorithmById(id)
          if (!algorithm) return
          if (!window.confirm(`确认删除组件「${algorithm.zhName || algorithm.name}」吗？`)) return
          await submitJson(`${apiBase}/algorithms/${id}`, "DELETE")
          showStatus("组件已删除")
          return
        }

        if (action === "algorithm-quick-reject") {
          state.selectedAlgorithmId = id
          renderAlgorithms()
          openAlgorithmReviewDialog("rejected")
          return
        }

        if (action === "algorithm-review-filter") {
          const filterVal = target.dataset.filter || "all"
          state.algorithmReviewFilter = filterVal
          renderAlgorithms()
          return
        }

        if (action === "snippet-select") {
          state.creatingSnippet = false
          state.selectedSnippetId = id
          const snippet = getSnippetById(id)
          if (snippet) {
            state.selectedSnippetFolderId = snippet.folderId || null
            if (snippet.folderId) {
              $("#snippet-filter-folder").value = String(snippet.folderId)
            }
          }
          renderSnippets()
          showPanelList("snippets")
          if (snippet) {
            const folder = (state.bootstrap?.snippetFolders || []).find((item) => item.id === snippet.folderId)
            ui_showSnippetDetail(snippet.zhName || snippet.name, snippet.language, folder?.name || texts.unassigned, snippet.description, snippet.content, `snippet.${snippet.id}`)
          }
          return
        }

        if (action === "snippet-version-restore") {
          const reason = window.prompt("请输入恢复原因", `回退到 ${version}`)
          if (reason === null) {
            return
          }
          const summary = window.prompt("请输入恢复摘要", `恢复片段到 ${version}`)
          if (summary === null) {
            return
          }
          await submitJson(`${apiBase}/snippets/${id}/restore`, "POST", { version, reason, summary })
          return
        }

        if (action === "snippet-version-diff") {
          const snippet = getSnippetById(id)
          const versions = snippetVersions(id)
          const current = versions.find((item) => item.version === version)
          const previous = versions.find((item) => item.version === compareVersion) || null
          if (!current) {
            return
          }
          openDiffModal(
            `片段版本差异：${snippet?.name || "未命名片段"}`,
            previous ? `旧版本 ${previous.version}` : "空白初稿",
            previous ? previous.content : "",
            `当前版本 ${current.version}`,
            current.content,
            previous ? "" : texts.firstVersionDiff,
          )
          return
        }

        if (action === "algorithm-folder-select") {
          state.creatingAlgorithm = false
          state.selectedAlgorithmFolderId = id || null
          if (id) expandFolderPath(state.bootstrap?.algorithmFolders || [], id, state.expandedAlgorithmFolderIds)
          renderAlgorithmFolders()
          renderAlgorithms()
          return
        }

        if (action === "algorithm-folder-toggle") {
          if (state.expandedAlgorithmFolderIds.has(id)) {
            state.expandedAlgorithmFolderIds.delete(id)
          } else {
            state.expandedAlgorithmFolderIds.add(id)
          }
          renderAlgorithmFolders()
          return
        }

        if (action === "algorithm-folder-edit") {
          const folder = (state.bootstrap?.algorithmFolders || []).find((item) => item.id === id)
          if (!folder) return
          const form = $("#folder-edit-form")
          form.reset()
          setValue(form, "type", "algorithm")
          setValue(form, "id", folder.id)
          setValue(form, "name", folder.name)
          setValue(form, "callName", folder.callName || "")
          $("#folder-edit-modal-title").textContent = "编辑组件分组"
          $("#folder-edit-delete").classList.remove("hidden")
          $("#folder-edit-visibility-row").classList.add("hidden")
          $("#folder-edit-callname-row").classList.remove("hidden")
          openModal("#folder-edit-modal")
          return
        }

        if (action === "algorithm-folder-remove") {
          const folder = (state.bootstrap?.algorithmFolders || []).find((item) => item.id === id)
          if (!folder) {
            return
          }
          const ok = window.confirm("确认删除当前文件夹吗？")
          if (!ok) {
            return
          }
          await submitJson(`${apiBase}/algorithm-folders/${id}`, "DELETE")
          showStatus("删除成功")
          return
        }

        if (action === "algorithm-library-toggle") {
          const type = target.dataset.type || "未分类"
          if (state.expandedAlgorithmLibraryTypes.has(type)) {
            state.expandedAlgorithmLibraryTypes.delete(type)
          } else {
            state.expandedAlgorithmLibraryTypes.add(type)
          }
          renderAlgorithms()
          return
        }

        if (action === "algorithm-section-toggle") {
          event.preventDefault()
          event.stopPropagation()
          const key = String(target.dataset.folderKey || "未分类")
          const domId = `algo-folder-${encodeURIComponent(key)}`
          toggleFolder(domId)
          return
        }

        if (action === "algorithm-doc-hint") {
          event.preventDefault()
          event.stopPropagation()
          showToast("请点击具体组件卡片中的 API 文档按钮查看协议", "info")
          return
        }

        if (action === "algorithm-detail-hint") {
          event.preventDefault()
          event.stopPropagation()
          showToast("请点击具体组件卡片查看右侧详情面板", "info")
          return
        }

        if (action === "algorithm-select") {
          state.creatingAlgorithm = false
          state.selectedAlgorithmId = id
          const algorithm = getAlgorithmById(id)
          if (algorithm) {
            state.selectedAlgorithmFolderId = algorithm.folderId || null
            if (algorithm.folderId) {
              expandFolderPath(state.bootstrap?.algorithmFolders || [], algorithm.folderId, state.expandedAlgorithmFolderIds)
            }
          }
          renderAlgorithms()
          showPanelDetail("algorithms")
          return
        }

        if (action === "algorithm-version-restore") {
          const reason = window.prompt("请输入恢复原因", `回退到 ${version}`)
          if (reason === null) {
            return
          }
          const summary = window.prompt("请输入恢复摘要", `恢复算法到 ${version}`)
          if (summary === null) {
            return
          }
          await submitJson(`${apiBase}/algorithms/${id}/restore`, "POST", { version, reason, summary })
          return
        }

        if (action === "algorithm-version-diff") {
          const algorithm = getAlgorithmById(id)
          const versions = algorithmVersions(id)
          const current = versions.find((item) => item.version === version)
          const previous = versions.find((item) => item.version === compareVersion) || null
          if (!current) {
            return
          }
          openDiffModal(
            `算法版本差异：${algorithm?.name || "未命名算法"}`,
            previous ? `旧版本 ${previous.version}` : "空白初稿",
            previous ? previous.content : "",
            `当前版本 ${current.version}`,
            current.content,
            previous ? "" : texts.firstVersionDiff,
          )
        }
      } catch (error) {
        showError(error.message || String(error))
      }
    })
  }

  const showAlgoSearchDialog = () => {
    const existingDialog = $("#algolib-search-dialog")
    if (existingDialog) {
      existingDialog.remove()
    }

    const dialog = document.createElement("div")
    dialog.id = "algolib-search-dialog"
    dialog.className = "modal-backdrop"
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = `
      <div class="modal-card" style="max-width:640px;width:90%">
        <div class="card-header">
          <h4>算法搜索  <span style="font-size:12px;color:#888;font-weight:normal">输入中文名、描述或标签</span></h4>
          <button type="button" id="algolib-search-close" class="ghost-button">关闭</button>
        </div>
        <div style="padding:0 16px 8px">
          <input id="algolib-search-input" class="search-input" style="width:100%;box-sizing:border-box" placeholder="搜索算法…" autocomplete="off" />
        </div>
        <div id="algolib-search-results" style="max-height:360px;overflow-y:auto;padding:0 8px 12px"></div>
      </div>
    `
    document.body.appendChild(dialog)

    const input = dialog.querySelector("#algolib-search-input")
    const results = dialog.querySelector("#algolib-search-results")
    const closeBtn = dialog.querySelector("#algolib-search-close")

    const renderResults = (query) => {
      const normalized = (query || "").trim().toLowerCase()
      const folders = state.bootstrap?.algorithmFolders || []
      const algorithms = (state.bootstrap?.algorithms || []).filter((a) => !a.deletedAt)

      const matched = algorithms.filter((algo) => {
        if (!normalized) return true
        const folder = folders.find((f) => f.id === algo.folderId)
        const searchText = [
          algo.name,
          algo.description || "",
          (algo.tags || []).join(" "),
          folder?.name || "",
          folder?.callName || "",
        ].join(" ").toLowerCase()
        return searchText.includes(normalized)
      })

      if (!matched.length) {
        results.innerHTML = `<div style="color:#888;padding:16px;text-align:center">未找到匹配的算法</div>`
        return
      }

      results.innerHTML = matched
        .slice(0, 50)
        .map((algo) => {
          const folder = folders.find((f) => f.id === algo.folderId)
          const callSyntax = folder?.callName ? `alg.${escapeHtml(folder.callName)}.${escapeHtml(algo.name)}()` : escapeHtml(algo.name)
          return `
            <div class="algolib-search-item" data-algo-id="${algo.id}" data-folder-callname="${folder?.callName || ""}" data-algo-name="${escapeHtml(algo.name)}" style="padding:10px 8px;cursor:pointer;border-radius:4px;border-bottom:1px solid #2a2a2a">
              <div style="font-weight:500;margin-bottom:2px">${escapeHtml(algo.name)} <code style="font-size:11px;color:#7ec8e3">${callSyntax}</code></div>
              <div style="font-size:12px;color:#888">${escapeHtml(algo.description || "")}${folder ? ` — ${escapeHtml(folder.name)}` : ""}</div>
            </div>
          `
        })
        .join("")

      results.querySelectorAll(".algolib-search-item").forEach((item) => {
        item.addEventListener("mouseenter", () => { item.style.background = "#2a2d2e" })
        item.addEventListener("mouseleave", () => { item.style.background = "" })
        item.addEventListener("click", () => {
          const algoId = item.dataset.algoId
          const callName = item.dataset.folderCallname
          const algoName = item.dataset.algoName
          if (callName) {
            notifyHost({ type: "insertCode", text: `alg.${callName}.${algoName}()` })
          } else {
            notifyHost({ type: "insertAlgorithm", algorithmId: `custom.${algoId}` })
          }
          dialog.remove()
          showStatus(`已插入：${callName ? `alg.${callName}.${algoName}()` : algoName}`)
        })
      })
    }

    input.addEventListener("input", () => renderResults(input.value))
    closeBtn.addEventListener("click", () => dialog.remove())
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.remove() })
    document.addEventListener("keydown", function escClose(e) {
      if (e.key === "Escape") { dialog.remove(); document.removeEventListener("keydown", escClose) }
    })

    renderResults("")
    setTimeout(() => input.focus(), 50)
  }

  const start = async () => {
    ui_updateClock()
    if (state.titleTimer) {
      clearInterval(state.titleTimer)
    }
    state.titleTimer = window.setInterval(ui_updateClock, 1000)
    ui_initLeftResize()
    ui_initRightResize()
    bindForms()
    bindButtons()
    bindActionDelegation()
    bindGalleryEvents()
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.altKey && (event.key === "i" || event.key === "I")) {
        event.preventDefault()
        showAlgoSearchDialog()
      }
    })
    window.addEventListener("message", (event) => {
      const payload = event.data
      if (!payload || payload.source === "algo-lib-page" || payload.type !== "switchModule") {
        return
      }
      if (payload.module === "templates") {
        ui_switchPage("templates")
        return
      }
      if (payload.module === "snippets") {
        ui_switchPage("snippets")
        return
      }
      if (payload.module === "review") {
        state.algorithmScope = isAdmin() ? "review" : "mine"
        ui_switchPage("algorithms")
        renderAlgorithms()
      }
    })
    ui_switchPage(state.currentPanel)
    try {
      await ensureEditors()
      await loadBootstrap()
    } catch (error) {
      showError(error.message || String(error))
      console.error(error)
    }
  }

  window.ui_updateClock = ui_updateClock
  window.ui_initLeftResize = ui_initLeftResize
  window.ui_initRightResize = ui_initRightResize
  window.ui_toggleSub = ui_toggleSub
  window.ui_toggleGrid = ui_toggleGrid
  window.ui_switchPage = ui_switchPage
  window.ui_switchSnippetTab = ui_switchSnippetTab
  window.ui_showAlgoDetail = ui_showAlgoDetail
  window.ui_showSnippetDetail = ui_showSnippetDetail
  window.ui_openPanel = ui_openPanel
  window.ui_closePanel = ui_closePanel
  window.ui_updateStatusBar = ui_updateStatusBar
  window.publishAsComponent = publishAsComponent
  window.switchPage = switchPage
  window.toggleFolder = toggleFolder
  window.showToast = showToast
  window.openPackageEditor = openPackageEditor
  window.initPkgFileTree = initPkgFileTree
  window.openFileInEditor = openFileInEditor
  window.switchPkgFile = switchPkgFile
  window.savePkgFile = savePkgFile
  window.addPkgFile = addPkgFile
  window.uploadPkgFile = uploadPkgFile
  window.toggleTestPanel = toggleTestPanel
  window.initVResizeDrag = initVResizeDrag
  window.markEditorError = markEditorError
  window.clearEditorErrors = clearEditorErrors
  window.submitPackage = submitPackage
  window.closePkgEditor = closePkgEditor
  window.initMonacoEditor = initMonacoEditor
  window.getOrCreateModel = getOrCreateModel
  window.switchEditorToFile = switchEditorToFile
  window.injectAlgCompletions = injectAlgCompletions
  window.openGalleryAlgorithmEditor = openGalleryAlgorithmEditor
  window.openGalleryAlgorithmTest = openGalleryAlgorithmTest
  window.saveGalleryAlgorithmSource = saveGalleryAlgorithmSource
  window.toggleGalleryTestPanel = toggleGalleryTestPanel
  window.runGalleryAlgorithmTest = runGalleryAlgorithmTest

  // ── v2 public API ────────────────────────────────────────────────────────────

  /** Expose Monaco initialization for external callers. */
  window.initMonacoEditor = async function (container, filename, content) {
    const containerId = typeof container === "string" ? container : (container?.id || "monacoContainer")
    const lang = inferLanguageFromFileName(String(filename || "source.py"))
    return initMonacoEditor(containerId, String(content || ""), lang)
  }

  /** Re-fetch and register alg. completions from /stubs/completions. */
  window.registerAlgCompletions = async function () {
    state.packageCompletionRegistered = false
    await injectAlgCompletions(_monacoEditor)
  }

  /** Open a multi-file package editor by packageId. */
  window.openMultiFileEditor = async function (packageId) {
    await openPackageEditor(String(packageId || ""))
  }

  /** Switch the active Monaco editor file. */
  window.switchEditorFile = function (filename) {
    switchPkgFile(String(filename || ""))
  }

  /**
   * Parse exported function names from Python source code.
   * Returns an array of public function names (excluding `_`-prefixed).
   */
  window.populateFunctionSelector = function (code) {
    const src = String(code || "")
    const decorated = [...src.matchAll(/@algo_export[^\n]*\ndef\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map((m) => m[1])
    const all = [...src.matchAll(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map((m) => m[1])
    const merged = [...new Set([...decorated, ...all])]
    return merged.filter((name) => !name.startsWith("_"))
  }

  /**
   * Generate sample parameter values keyed by name.
   * Uses the `type` field from each param spec to produce a sensible default.
   * @param {Array<{name:string, type:string, default?:any}>} paramsSpec
   * @returns {Record<string, any>}
   */
  window.generateSampleParams = function (paramsSpec) {
    if (!Array.isArray(paramsSpec)) return {}
    const result = {}
    for (const param of paramsSpec) {
      const name = String(param.name || "")
      if (!name) continue
      const type = String(param.type || "Any").toLowerCase()
      if (type.includes("dataframe") || type.includes("pd.dataframe")) {
        result[name] = "col1,col2,col3\n1,2,3\n4,5,6\n7,8,9"
      } else if (type.includes("dict")) {
        result[name] = { key: "value" }
      } else if (type.includes("list") || type.includes("iterable") || type.includes("sequence")) {
        result[name] = [1, 2, 3, 4, 5]
      } else if (type.includes("bool")) {
        result[name] = true
      } else if (type.includes("float")) {
        const d = Number(param.default)
        result[name] = isNaN(d) || param.default === "" ? 3.14 : d
      } else if (type.includes("int")) {
        const d = Number(param.default)
        result[name] = isNaN(d) || param.default === "" ? 10 : d
      } else if (type.includes("str")) {
        result[name] = "sample_text"
      } else {
        result[name] = null
      }
    }
    return result
  }

  /**
   * Call POST /api/v1/run with named params.
   * Returns the full response payload { success, result, error, elapsed_ms }.
   */
  window.runTestCase = async function (namespace, funcName, params, timeout) {
    const response = await fetch(`${packageServiceBase}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: String(namespace || ""),
        function: String(funcName || ""),
        params: params && typeof params === "object" ? params : {},
        timeout: Number(timeout) || 30,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
    }
    return payload
  }

  /** Render result as formatted JSON inside containerEl. */
  window.renderOutputJson = function (result, containerEl) {
    const el = typeof containerEl === "string" ? document.getElementById(containerEl) : containerEl
    if (!el) return
    const text = result == null ? "null" : JSON.stringify(result, null, 2)
    el.innerHTML = `<div class="test-output-json">${escapeHtml(text)}</div>`
  }

  /**
   * Auto-detect result type and render a visualization:
   *  - 2D array → CSS heatmap
   *  - 1D number array → SVG line chart
   *  - Array of objects → HTML table
   *  - Plain object → key-value table
   *  - Fallback → formatted JSON
   */
  window.renderOutputVisualization = function (result, containerEl) {
    const el = typeof containerEl === "string" ? document.getElementById(containerEl) : containerEl
    if (!el) return

    if (result == null) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:11px;padding:8px">无可视化数据</div>`
      return
    }

    // 2D array → heatmap
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
      const rows = result
      const allVals = rows.flat().filter((v) => typeof v === "number" && isFinite(v))
      const minVal = Math.min(...allVals)
      const maxVal = Math.max(...allVals)
      const range = maxVal - minVal || 1
      const cols = rows[0].length
      const cellPx = Math.max(24, Math.min(44, Math.floor(260 / cols)))
      const cells = rows.map((row) =>
        row.map((val) => {
          const norm = typeof val === "number" && isFinite(val) ? (val - minVal) / range : 0
          const r = Math.round(20 + norm * 220)
          const g = Math.round(40 + norm * 60)
          const b = Math.round(220 - norm * 200)
          return `<div class="viz-heatmap-cell" style="background:rgb(${r},${g},${b});width:${cellPx}px;height:${cellPx}px" title="${val}">${typeof val === "number" ? val.toFixed(2) : escapeHtml(String(val))}</div>`
        }).join("")
      ).join("")
      el.innerHTML = `
        <div class="viz-heatmap" style="grid-template-columns:repeat(${cols},${cellPx}px)">${cells}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">热力图 ${rows.length}×${cols} | min: ${minVal.toFixed(4)} | max: ${maxVal.toFixed(4)}</div>`
      return
    }

    // 1D number array → line chart
    if (Array.isArray(result) && result.length > 0 && result.every((v) => typeof v === "number" && isFinite(v))) {
      const vals = result
      const minV = Math.min(...vals)
      const maxV = Math.max(...vals)
      const rangeV = maxV - minV || 1
      const W = 380; const H = 100; const PAD = 10
      const pts = vals.map((v, i) => {
        const x = PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2)
        const y = H - PAD - ((v - minV) / rangeV) * (H - PAD * 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(" ")
      const dots = vals.map((v, i) => {
        const x = PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2)
        const y = H - PAD - ((v - minV) / rangeV) * (H - PAD * 2)
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--accent)"/>`
      }).join("")
      el.innerHTML = `
        <svg class="viz-line-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
          <polyline fill="none" stroke="var(--primary)" stroke-width="1.5" points="${pts}"/>${dots}
        </svg>
        <div style="font-size:10px;color:var(--text-muted)">${vals.length} 点 | min: ${minV.toFixed(4)} | max: ${maxV.toFixed(4)}</div>`
      return
    }

    // Array of objects → table
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object" && result[0] !== null) {
      const keys = Object.keys(result[0])
      const rows = result.slice(0, 100)
      el.innerHTML = `
        <table class="viz-kv-table">
          <thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${keys.map((k) => `<td>${escapeHtml(String(row[k] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        ${result.length > 100 ? `<div style="font-size:10px;color:var(--text-muted)">仅显示前100行，共${result.length}行</div>` : ""}`
      return
    }

    // Plain object → key-value table
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const entries = Object.entries(result)
      el.innerHTML = `
        <table class="viz-kv-table">
          <thead><tr><th>键</th><th>值</th></tr></thead>
          <tbody>${entries.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v ?? ""))}</td></tr>`).join("")}</tbody>
        </table>`
      return
    }

    // Fallback
    el.innerHTML = `<div class="test-output-json">${escapeHtml(JSON.stringify(result, null, 2))}</div>`
  }

  /**
   * Save a test run in-memory (keeps last 10 per namespace+funcName).
   * Key: algolib_tc_{namespace}_{funcName}
   */
  window.saveTestCase = function (namespace, funcName, params, result) {
    const key = `algolib_tc_${namespace}_${funcName}`
    const history = Array.isArray(state.testHistoryCache.get(key)) ? [...state.testHistoryCache.get(key)] : []
    history.unshift({
      timestamp: new Date().toISOString(),
      params,
      result: result?.result ?? null,
      success: result?.success ?? false,
      elapsed_ms: result?.elapsed_ms ?? 0,
    })
    const trimmed = history.slice(0, 10)
    state.testHistoryCache.set(key, trimmed)
    return trimmed
  }

  /** Load test run history from in-memory cache. */
  window.loadTestHistory = function (namespace, funcName) {
    return state.testHistoryCache.get(`algolib_tc_${namespace}_${funcName}`) || []
  }

  /** Show inline namespace edit UI replacing the namespace input field. */
  window.editNamespace = function (algorithmId, currentNs) {
    const nsInput = document.getElementById("galleryNamespaceInput")
    if (!nsInput) return
    const wrapper = nsInput.closest(".pkg-namespace-field") || nsInput.parentElement
    if (!wrapper) return
    wrapper.innerHTML = `
      <div class="ns-edit-row">
        <input id="nsEditInput" class="ns-edit-input" value="${escapeHtml(currentNs || "")}"
          placeholder="alg.namespace.funcname"
          data-ns-edit-input="1" />
        <button class="ns-edit-btn" data-ns-action="confirm" data-algorithm-id="${escapeHtml(String(algorithmId || ""))}" type="button">确认</button>
        <button class="ns-edit-btn cancel" data-ns-action="cancel" data-algorithm-id="${escapeHtml(String(algorithmId || ""))}" data-original-ns="${escapeHtml(currentNs || "")}" type="button">取消</button>
      </div>
      <div class="ns-edit-error" id="nsEditError"></div>`
    const input = document.getElementById("nsEditInput")
    if (input) {
      input.addEventListener("input", () => {
        const value = input.value.trim()
        const errorNode = document.getElementById("nsEditError")
        const valid = /^alg\.[a-z_]+\.[a-z_]+$/.test(value)
        input.classList.toggle("error", value.length > 0 && !valid)
        if (errorNode) {
          errorNode.textContent = value.length > 0 && !valid ? "格式须为 alg.[小写字母_].[小写字母_]" : ""
        }
      })
      input.focus()
    }
  }

  /** Restore the namespace input after cancelling inline edit. */
  window.cancelEditNamespace = function (algorithmId, originalNs) {
    const input = document.getElementById("nsEditInput")
    const wrapper = input?.closest(".pkg-namespace-field") || input?.parentElement
    if (!wrapper) return
    wrapper.innerHTML = `<input id="galleryNamespaceInput" class="pkg-namespace-input" value="${escapeHtml(originalNs || "")}" />`
  }

  /**
   * PATCH /api/v1/algorithms/{id}/namespace — validate, send, update UI.
   * On HTTP 409 shows an inline conflict error; broadcasts SSE automatically from server.
   */
  window.patchNamespace = async function (algorithmId, newNamespace) {
    const errEl = document.getElementById("nsEditError")
    const val = String(newNamespace || "").trim()
    if (!/^alg\.[a-z_]+\.[a-z_]+$/.test(val)) {
      if (errEl) errEl.textContent = "格式须为 alg.[小写字母_].[小写字母_]"
      return
    }
    try {
      const response = await fetch(
        `${packageServiceBase}/algorithms/${encodeURIComponent(algorithmId)}/namespace`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_namespace: val }),
        },
      )
      const payload = await response.json().catch(() => ({}))
      if (response.status === 409) {
        if (errEl) errEl.textContent = payload.detail || "命名空间已存在"
        return
      }
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
      }
      showToast(`命名空间已更新：${payload.new || val}`)
      const inputEl = document.getElementById("nsEditInput")
      const wrapper = inputEl?.closest(".pkg-namespace-field") || inputEl?.parentElement
      if (wrapper) {
        wrapper.innerHTML = `<input id="galleryNamespaceInput" class="pkg-namespace-input" value="${escapeHtml(payload.new || val)}" />`
      }
      if (payload.algorithm && state.currentGalleryAlgorithm) {
        state.currentGalleryAlgorithm = payload.algorithm
      }
      loadGalleryAlgorithms().then(() => renderComponentGallery()).catch(() => {})
    } catch (error) {
      showToast(error.message || String(error), "error")
      if (errEl) errEl.textContent = error.message || String(error)
    }
  }

  /**
   * Connect to SSE /events/algo-changes and listen for namespace_changed events.
   * Re-renders the gallery and updates window._algRegistry in-memory.
   * Stores the EventSource in window._nsSseSource; auto-reconnects on error.
   */
  window.listenNamespaceSSE = function () {
    if (window._nsSseSource) return
    const source = new EventSource(`${packageServiceBase}/events/algo-changes`)
    window._nsSseSource = source

    source.addEventListener("updated", (event) => {
      let data
      try { data = JSON.parse(event.data) } catch (_) { return }

      if (data.event === "namespace_changed") {
        const { old: oldNs, new: newNs } = data
        if (Array.isArray(window._algRegistry)) {
          window._algRegistry = window._algRegistry.map((entry) => {
            if (entry.callPrefix === oldNs) {
              const parts = (newNs || "").split(".")
              return { ...entry, namespace: parts[1] || entry.namespace, funcName: parts[2] || entry.funcName, callPrefix: newNs }
            }
            return entry
          })
        }
        if (state.currentPanel === "component-gallery") renderComponentGallery()
        showToast(`命名空间变更：${oldNs} → ${newNs}`, "info")
      }

      if (data.event === "updated" && Array.isArray(data.algorithms)) {
        window._algRegistry = data.algorithms
        if (state.currentPanel === "component-gallery") renderComponentGallery()
      }
    })

    source.onerror = () => {
      source.close()
      window._nsSseSource = null
      setTimeout(() => window.listenNamespaceSSE(), 5000)
    }
  }

  // ── Internal helper: render one param input row ─────────────────────────
  function _renderTestParamInput(param) {
    const name = String(param.name || "")
    const rawType = String(param.type || "Any")
    const type = rawType.toLowerCase()
    const defVal = param.default != null && param.default !== "" ? param.default : null

    if (type.includes("bool")) {
      const initTrue = defVal !== false && defVal !== "false" && defVal !== "False"
      return `
        <div class="test-param-row">
          <div class="test-param-label">${escapeHtml(name)} <span class="test-param-type">(bool)</span></div>
          <div class="test-param-toggle">
            <button class="${initTrue ? "active" : ""}" data-bool-btn="${escapeHtml(name)}" data-val="true" type="button">True</button>
            <button class="${initTrue ? "" : "active"}" data-bool-btn="${escapeHtml(name)}" data-val="false" type="button">False</button>
          </div>
          <input type="hidden" data-param="${escapeHtml(name)}" value="${initTrue ? "true" : "false"}" />
        </div>`
    }

    if (type.includes("dataframe")) {
      const csv = defVal != null ? escapeHtml(String(defVal)) : "col1,col2,col3\n1,2,3\n4,5,6"
      return `
        <div class="test-param-row">
          <div class="test-param-label">${escapeHtml(name)} <span class="test-param-type">(DataFrame/CSV)</span></div>
          <textarea data-param="${escapeHtml(name)}" class="test-param-input" rows="4" style="height:80px">${csv}</textarea>
        </div>`
    }

    if (type.includes("dict")) {
      const initial = defVal != null ? escapeHtml(typeof defVal === "object" ? JSON.stringify(defVal, null, 2) : String(defVal)) : '{"key": "value"}'
      return `
        <div class="test-param-row">
          <div class="test-param-label">${escapeHtml(name)} <span class="test-param-type">(dict/JSON)</span></div>
          <textarea data-param="${escapeHtml(name)}" class="test-param-input" rows="3" style="height:56px">${initial}</textarea>
        </div>`
    }

    if (type.includes("list") || type.includes("iterable") || type.includes("sequence") || type.startsWith("[")) {
      const initial = defVal != null ? escapeHtml(Array.isArray(defVal) ? JSON.stringify(defVal) : String(defVal)) : "[1, 2, 3, 4, 5]"
      return `
        <div class="test-param-row">
          <div class="test-param-label">${escapeHtml(name)} <span class="test-param-type">(list/JSON)</span></div>
          <textarea data-param="${escapeHtml(name)}" class="test-param-input" rows="2" style="height:44px">${initial}</textarea>
        </div>`
    }

    const isNum = type.includes("int") || type.includes("float") || type.includes("number")
    const inputType = isNum ? "number" : "text"
    const initVal = defVal != null ? String(defVal) : isNum ? (type.includes("float") ? "3.14" : "10") : "sample"
    return `
      <div class="test-param-row">
        <div class="test-param-label">${escapeHtml(name)} <span class="test-param-type">(${escapeHtml(rawType)})</span></div>
        <input type="${inputType}" data-param="${escapeHtml(name)}" class="test-param-input" value="${escapeHtml(initVal)}" placeholder="${escapeHtml(rawType)}" />
      </div>`
  }

  /** Toggle a bool param True/False button pair. */
  window._toggleBoolParam = function (btn) {
    const name = btn.getAttribute("data-bool-btn")
    const val = btn.getAttribute("data-val")
    document.querySelectorAll(`[data-bool-btn="${name}"]`).forEach((b) => b.classList.remove("active"))
    btn.classList.add("active")
    const hidden = document.querySelector(`input[type="hidden"][data-param="${name}"]`)
    if (hidden) hidden.value = val
  }

  /** Switch between JSON and visualization output tabs. */
  window._switchTestTab = function (tab) {
    document.querySelectorAll("[data-test-tab]").forEach((el) =>
      el.classList.toggle("active", el.getAttribute("data-test-tab") === tab),
    )
    const jsonPane = document.getElementById("testOutputJson")
    const vizPane  = document.getElementById("testOutputViz")
    if (jsonPane) jsonPane.classList.toggle("hidden", tab !== "json")
    if (vizPane)  vizPane.classList.toggle("hidden", tab !== "viz")
  }

  /** Collect all param values from the test panel DOM. */
  function _collectTestParams() {
    const panel = document.getElementById("testParamInputs")
    if (!panel) return {}
    const result = {}
    panel.querySelectorAll("[data-param]").forEach((el) => {
      const name = el.getAttribute("data-param")
      if (el.type === "hidden") {
        result[name] = el.value === "true"
        return
      }
      const raw = el.value
      if (el.tagName.toLowerCase() === "textarea") {
        try { result[name] = JSON.parse(raw) } catch (_) { result[name] = raw }
      } else if (el.type === "number") {
        result[name] = Number(raw)
      } else if (raw === "true" || raw === "false") {
        result[name] = raw === "true"
      } else {
        result[name] = raw
      }
    })
    return result
  }

  /** Fill param inputs with generated sample values. */
  window._fillSampleParams = function () {
    const params = window._testContext?.params || state.currentGalleryAlgorithm?.params || []
    const sample = window.generateSampleParams(params)
    const panel = document.getElementById("testParamInputs")
    if (!panel) return
    for (const [name, val] of Object.entries(sample)) {
      const el = panel.querySelector(`[data-param="${name}"]:not([type="hidden"])`)
      if (!el) continue
      el.value = typeof val === "object" && val !== null ? JSON.stringify(val, null, 2) : String(val ?? "")
    }
  }

  /** Restore params and result from a history entry. */
  window._loadHistoryRun = function (indexStr) {
    const ctx = window._testContext || {}
    const history = window.loadTestHistory(ctx.ns, ctx.fn)
    const index = parseInt(indexStr, 10)
    if (isNaN(index) || !history[index]) return
    const run = history[index]
    const panel = document.getElementById("testParamInputs")
    if (panel && run.params) {
      for (const [name, val] of Object.entries(run.params)) {
        const el = panel.querySelector(`[data-param="${name}"]:not([type="hidden"])`)
        if (!el) continue
        el.value = typeof val === "object" && val !== null ? JSON.stringify(val, null, 2) : String(val ?? "")
      }
    }
    if (run.result != null) {
      window.renderOutputJson(run.result, "testOutputJson")
      window.renderOutputVisualization(run.result, "testOutputViz")
    }
    const elapsed = document.getElementById("testElapsed")
    if (elapsed) elapsed.textContent = `${run.elapsed_ms.toFixed(0)}ms (历史)`
  }

  /** Run the enhanced test and display output. */
  window._runEnhancedTest = async function () {
    const ctx = window._testContext || {}
    const funcSel = document.getElementById("testFuncSelect")
    const fn  = funcSel?.value || ctx.fn || ""
    const ns  = ctx.ns || ""
    const timeout = Number(document.getElementById("testTimeoutSelect")?.value || 30)
    const jsonOut = document.getElementById("testOutputJson")
    const vizOut  = document.getElementById("testOutputViz")
    const elapsed = document.getElementById("testElapsed")

    if (!ns || !fn) {
      if (jsonOut) jsonOut.innerHTML = `<div style="color:var(--danger);font-size:11px">未设置命名空间或函数名</div>`
      return
    }

    const params = _collectTestParams()
    if (jsonOut) jsonOut.innerHTML = `<div style="color:var(--text-muted);font-size:11px">运行中…</div>`
    if (vizOut)  vizOut.innerHTML  = ""
    if (elapsed) elapsed.textContent = ""

    try {
      const result = await window.runTestCase(ns, fn, params, timeout)
      window.renderOutputJson(result.result, "testOutputJson")
      window.renderOutputVisualization(result.result, "testOutputViz")
      if (elapsed) elapsed.textContent = `${(result.elapsed_ms ?? 0).toFixed(0)}ms`
      window.saveTestCase(ns, fn, params, result)
      if (!result.success && result.error) {
        const lineMatch = String(result.error).match(/line\s+(\d+)/i)
        if (lineMatch) markEditorError(Number(lineMatch[1]), result.error)
      }
    } catch (error) {
      const msg = escapeHtml(error.message || String(error))
      if (jsonOut) jsonOut.innerHTML = `<div style="color:var(--danger);font-size:11px">${msg}</div>`
    }
  }

  /**
   * Enhanced test panel for gallery algorithm editor.
   * Replaces the basic two-pane layout with: toolbar (function selector, timeout,
   * "Generate Sample", Run, history), left param inputs, right JSON/viz tabs.
   */
  window.initTestPanel = function (namespace, funcName, paramsSpec) {
    const panel = document.getElementById("pkgTestPanel")
    if (!panel) return

    const ns     = namespace || state.currentGalleryAlgorithm?.namespace || state.currentPackage?.namespace || ""
    const fn     = funcName  || state.currentGalleryAlgorithm?.funcName  || state.currentPackage?.exports?.[0] || ""
    const params = Array.isArray(paramsSpec) ? paramsSpec : (state.currentGalleryAlgorithm?.params || [])

    window._testContext = { ns, fn, params }

    const history = window.loadTestHistory(ns, fn)
    const histOpts = history.map((run, i) =>
      `<option value="${i}">${new Date(run.timestamp).toLocaleTimeString("zh-CN")} · ${run.success ? "✓" : "✗"} ${run.elapsed_ms.toFixed(0)}ms</option>`,
    ).join("")

    const paramHtml = params.length === 0
      ? `<div style="color:var(--text-muted);font-size:11px;padding:4px">无参数</div>`
      : params.map((p) => _renderTestParamInput(p)).join("")

    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
        <div class="test-panel-toolbar">
          <select id="testFuncSelect" class="test-panel-select">
            ${fn ? `<option value="${escapeHtml(fn)}" selected>${escapeHtml(fn)}</option>` : `<option value="">— 选择函数 —</option>`}
          </select>
          <select id="testTimeoutSelect" class="test-panel-select">
            <option value="5">5秒</option>
            <option value="15">15秒</option>
            <option value="30" selected>30秒</option>
            <option value="60">60秒</option>
            <option value="120">120秒</option>
          </select>
          <button class="test-panel-btn sample" data-test-panel-action="fill-sample" type="button">生成示例</button>
          <button class="test-panel-btn run" data-test-panel-action="run" type="button">▶ 运行</button>
          ${histOpts ? `<select id="testHistorySelect" class="test-panel-select" data-test-panel-action="history"><option value="">历史记录</option>${histOpts}</select>` : ""}
          <span class="test-elapsed" id="testElapsed"></span>
        </div>
        <div class="test-panel-body">
          <div class="test-panel-left" id="testParamInputs">${paramHtml}</div>
          <div class="test-panel-right">
            <div class="test-output-tabs">
              <div class="test-output-tab active" data-test-tab="json">JSON</div>
              <div class="test-output-tab" data-test-tab="viz">可视化</div>
            </div>
            <div class="test-output-pane" id="testOutputJson"><div style="color:var(--text-muted);font-size:11px">等待运行测试</div></div>
            <div class="test-output-pane hidden" id="testOutputViz"></div>
          </div>
        </div>
      </div>`

    // Populate function selector from current Monaco editor content
    const code = galleryEditorContent ? galleryEditorContent() : null
    if (code) {
      const funcs = window.populateFunctionSelector(code)
      const sel = document.getElementById("testFuncSelect")
      if (sel && funcs.length > 0) {
        sel.innerHTML = funcs.map((name) =>
          `<option value="${escapeHtml(name)}"${name === fn ? " selected" : ""}>${escapeHtml(name)}</option>`,
        ).join("")
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true })
  } else {
    start()
  }
})()
