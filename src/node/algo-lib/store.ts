import { promises as fs } from "fs"
import * as path from "path"
import {
  AlgoLibAlgorithm,
  AlgoLibAlgorithmFolder,
  AlgoLibAlgorithmReview,
  AlgoLibAlgorithmVersion,
  AlgoLibCategory,
  AlgoLibCounters,
  AlgoLibSnippet,
  AlgoLibSnippetFolder,
  AlgoLibSnippetVersion,
  AlgoLibState,
  AlgoLibTemplate,
  AlgoLibTemplateVersion,
} from "./types"

const now = (): string => new Date().toISOString()

const defaultCounters = (): AlgoLibCounters => ({
  categories: 0,
  templates: 0,
  templateVersions: 0,
  snippetFolders: 0,
  snippets: 0,
  snippetVersions: 0,
  algorithmFolders: 0,
  algorithms: 0,
  algorithmVersions: 0,
  algorithmReviews: 0,
  auditLogs: 0,
})

const lines = (...value: string[]): string => value.join("\n")

export class AlgoLibStore {
  private readonly baseDir: string
  private readonly stateFile: string
  private readonly packageDir: string
  private writeQueue: Promise<void> = Promise.resolve()

  public constructor(userDataDir: string) {
    this.baseDir = path.join(userDataDir, "algo-lib")
    this.stateFile = path.join(this.baseDir, "store.json")
    this.packageDir = path.join(this.baseDir, "packages")
  }

  public async read(): Promise<AlgoLibState> {
    return this.load()
  }

  public async write<T>(updater: (state: AlgoLibState) => Promise<T> | T): Promise<T> {
    let result!: T
    let thrown: unknown

    this.writeQueue = this.writeQueue.then(async () => {
      const state = await this.load()
      try {
        result = await updater(state)
        await this.save(state)
      } catch (error) {
        thrown = error
      }
    })

    await this.writeQueue
    if (typeof thrown !== "undefined") {
      throw thrown
    }
    return result
  }

  public async writePackageArtifact(fileName: string, payload: unknown): Promise<string> {
    await fs.mkdir(this.packageDir, { recursive: true })
    const fullPath = path.join(this.packageDir, fileName)
    await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf8")
    return fullPath
  }

  private async load(): Promise<AlgoLibState> {
    await fs.mkdir(this.baseDir, { recursive: true })
    try {
      const content = await fs.readFile(this.stateFile, "utf8")
      const parsed = JSON.parse(content) as AlgoLibState
      if (!parsed.schemaVersion || parsed.schemaVersion < 3) {
        const seeded = this.seed()
        await this.save(seeded)
        return seeded
      }
      return this.normalize(parsed)
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code !== "ENOENT") {
        throw error
      }
      const seeded = this.seed()
      await this.save(seeded)
      return seeded
    }
  }

  private async save(state: AlgoLibState): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
    await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), "utf8")
  }

  private normalize(state: AlgoLibState): AlgoLibState {
    return {
      schemaVersion: 3,
      categories: state.categories || [],
      templates: (state.templates || []).map((item) => ({
        ...item,
        zhName: item.zhName || item.name,
        packageId: item.packageId,
        templateBody: item.templateBody || item.content,
        paramsSchema: item.paramsSchema || item.example || "",
        example: item.example || item.paramsSchema || "",
      })),
      templateVersions: state.templateVersions || [],
      snippetFolders: state.snippetFolders || [],
      snippets: (state.snippets || []).map((item) => ({
        ...item,
        zhName: item.zhName || item.name,
        body: item.body || item.content,
        scope: item.scope || (item.visibility === "shared" ? "team" : "private"),
      })),
      snippetVersions: state.snippetVersions || [],
      algorithmFolders: state.algorithmFolders || [],
      algorithms: (state.algorithms || []).map((item) => ({
        ...item,
        zhName: item.zhName || item.name,
        packageId: item.packageId,
        namespace: item.namespace || "component",
        apiPath: item.apiPath || `/api/v1/invoke/alg.${item.namespace || "component"}.${item.name}`,
      })),
      algorithmVersions: state.algorithmVersions || [],
      algorithmReviews: state.algorithmReviews || [],
      auditLogs: state.auditLogs || [],
      counters: { ...defaultCounters(), ...(state.counters || {}) },
    }
  }

  private seed(): AlgoLibState {
    const createdAt = now()
    const counters = defaultCounters()

    const nextId = <K extends keyof AlgoLibCounters>(key: K): number => {
      counters[key] += 1
      return counters[key]
    }

    const categories: AlgoLibCategory[] = []
    const categoryMap = new Map<string, AlgoLibCategory>()
    const createCategory = (name: string, englishName: string, sortOrder: number, description: string): AlgoLibCategory => {
      const category: AlgoLibCategory = {
        id: nextId("categories"),
        scope: "template",
        name,
        englishName,
        level: 1,
        sortOrder,
        description,
        createdAt,
        updatedAt: createdAt,
      }
      categories.push(category)
      categoryMap.set(name, category)
      return category
    }

    createCategory("数据预处理", "data_preprocess", 1, "围绕数据清洗、归一化、转换等能力提供开发模板。")
    createCategory("统计分析", "statistics", 2, "为相关系数、分布检验和统计推断提供标准代码骨架。")
    createCategory("机器学习", "machine_learning", 3, "提供经典机器学习组件开发模板。")
    createCategory("时序分析", "timeseries", 4, "为预测、平滑、异常检测类组件提供开发起点。")
    createCategory("信号处理", "signal_processing", 5, "提供滤波、频谱分析与变换类模板。")
    createCategory("通用开发", "general", 6, "放置与特定领域无关的通用模板。")
    createCategory("未分类", "unassigned", 999, "删除分类后的模板会自动迁移到这里。")

    const templates: AlgoLibTemplate[] = []
    const createTemplate = (input: {
      name: string
      zhName: string
      category: string
      difficulty: number
      language: string
      description: string
      templateBody: string
      paramsSchema: string
      tags: string[]
      version?: string
    }): AlgoLibTemplate => {
      const template: AlgoLibTemplate = {
        id: nextId("templates"),
        name: input.name,
        zhName: input.zhName,
        categoryId: categoryMap.get(input.category)?.id || categoryMap.get("未分类")!.id,
        difficulty: input.difficulty,
        language: input.language,
        description: input.description,
        templateBody: input.templateBody,
        paramsSchema: input.paramsSchema,
        content: input.templateBody,
        example: input.paramsSchema,
        tags: input.tags,
        currentVersion: input.version || "1.0.0",
        status: "active",
        createdBy: "system",
        updatedBy: "system",
        createdAt,
        updatedAt: createdAt,
      }
      templates.push(template)
      return template
    }

    createTemplate({
      name: "pandas_cleaning_starter",
      zhName: "Pandas 数据清洗模板",
      category: "数据预处理",
      difficulty: 1,
      language: "python",
      description: "为 DataFrame 数据清洗类组件提供标准函数骨架和参数说明。",
      tags: ["模板", "骨架", "数据清洗", "python"],
      templateBody: lines(
        "import pandas as pd",
        "",
        "def build_component(df: pd.DataFrame, *, drop_duplicates: bool = True) -> pd.DataFrame:",
        '    """',
        "    TODO: 在这里补全组件逻辑。",
        "    1. 校验输入",
        "    2. 执行清洗步骤",
        "    3. 返回新的 DataFrame",
        '    """',
        "    result = df.copy()",
        "    if drop_duplicates:",
        "        result = result.drop_duplicates()",
        "    # TODO: add missing-value strategy",
        "    return result",
      ),
      paramsSchema: lines(
        "{",
        '  "input": {',
        '    "df": "pandas.DataFrame",',
        '    "drop_duplicates": "bool = True"',
        "  },",
        '  "output": "pandas.DataFrame",',
        '  "notes": ["返回新对象，不直接修改传入 df"]',
        "}",
      ),
    })

    createTemplate({
      name: "sklearn_pipeline_starter",
      zhName: "Scikit-learn Pipeline 模板",
      category: "机器学习",
      difficulty: 2,
      language: "python",
      description: "用于快速创建带预处理、训练和评估过程的机器学习组件。",
      tags: ["模板", "机器学习", "pipeline", "python"],
      templateBody: lines(
        "from sklearn.pipeline import Pipeline",
        "",
        "def build_component(estimator, *, steps=None):",
        '    """',
        "    TODO: 组合预处理与 estimator，形成可复用组件。",
        '    """',
        "    steps = steps or []",
        "    steps.append((\"model\", estimator))",
        "    return Pipeline(steps)",
      ),
      paramsSchema: lines(
        "{",
        '  "input": {',
        '    "estimator": "sklearn estimator",',
        '    "steps": "list[tuple[str, object]] | None"',
        "  },",
        '  "output": "sklearn.pipeline.Pipeline"',
        "}",
      ),
    })

    createTemplate({
      name: "timeseries_forecast_starter",
      zhName: "时序预测模板",
      category: "时序分析",
      difficulty: 3,
      language: "python",
      description: "为滑动窗口预测、回测与结果封装提供统一的开发入口。",
      tags: ["模板", "时序", "预测", "python"],
      templateBody: lines(
        "from collections.abc import Sequence",
        "",
        "def build_component(values: Sequence[float], horizon: int = 3) -> dict:",
        '    """',
        "    TODO: 编写你的时序预测逻辑。",
        "    返回值建议包含 forecast、history、meta 三部分。",
        '    """',
        "    forecast = list(values)[-horizon:]",
        '    return {"forecast": forecast, "history": list(values), "meta": {"horizon": horizon}}',
      ),
      paramsSchema: lines(
        "{",
        '  "input": {',
        '    "values": "Sequence[float]",',
        '    "horizon": "int = 3"',
        "  },",
        '  "output": {"forecast": "list[float]", "history": "list[float]", "meta": "dict"}',
        "}",
      ),
    })

    createTemplate({
      name: "signal_fft_starter",
      zhName: "频谱分析模板",
      category: "信号处理",
      difficulty: 2,
      language: "python",
      description: "帮助开发者快速补全 FFT 频谱类组件的输入、变换和结果封装。",
      tags: ["模板", "信号处理", "fft", "python"],
      templateBody: lines(
        "import numpy as np",
        "",
        "def build_component(signal: np.ndarray, sample_rate: int) -> dict:",
        '    """TODO: 计算频谱并返回主频结果。"""',
        "    spectrum = np.fft.rfft(signal)",
        "    freqs = np.fft.rfftfreq(len(signal), d=1 / sample_rate)",
        '    return {"frequencies": freqs.tolist(), "magnitudes": np.abs(spectrum).tolist()}',
      ),
      paramsSchema: lines(
        "{",
        '  "input": {',
        '    "signal": "numpy.ndarray",',
        '    "sample_rate": "int"',
        "  },",
        '  "output": {"frequencies": "list[float]", "magnitudes": "list[float]"}',
        "}",
      ),
    })

    const templateVersions: AlgoLibTemplateVersion[] = templates.map((template) => ({
      id: nextId("templateVersions"),
      templateId: template.id,
      version: template.currentVersion,
      content: template.content,
      example: template.example,
      paramsSchema: template.paramsSchema,
      changeReason: "初始化模板样例",
      changeSummary: "写入标准开发骨架与参数结构约定",
      changedBy: "system",
      createdAt,
    }))

    const snippetFolders: AlgoLibSnippetFolder[] = []
    const snippetFolderMap = new Map<string, AlgoLibSnippetFolder>()
    const createSnippetFolder = (name: string, visibility: "private" | "shared", ownerId?: string): AlgoLibSnippetFolder => {
      const folder: AlgoLibSnippetFolder = {
        id: nextId("snippetFolders"),
        name,
        visibility,
        ownerId,
        createdAt,
        updatedAt: createdAt,
      }
      snippetFolders.push(folder)
      snippetFolderMap.set(name, folder)
      return folder
    }

    createSnippetFolder("我的工具箱", "private", "local-user")
    createSnippetFolder("团队共享片段", "shared")
    createSnippetFolder("数据处理片段", "shared")

    const snippets: AlgoLibSnippet[] = []
    const createSnippet = (input: {
      name: string
      zhName: string
      folder: string
      visibility: "private" | "shared"
      language: string
      description: string
      body: string
      tags: string[]
      ownerId?: string
      version?: string
    }): AlgoLibSnippet => {
      const snippet: AlgoLibSnippet = {
        id: nextId("snippets"),
        name: input.name,
        zhName: input.zhName,
        folderId: snippetFolderMap.get(input.folder)?.id,
        visibility: input.visibility,
        scope: input.visibility === "shared" ? "team" : "private",
        ownerId: input.visibility === "private" ? input.ownerId || "local-user" : undefined,
        language: input.language,
        description: input.description,
        body: input.body,
        content: input.body,
        tags: input.tags,
        currentVersion: input.version || "1.0.0",
        status: "active",
        createdBy: input.visibility === "private" ? "local-user" : "system",
        updatedBy: input.visibility === "private" ? "local-user" : "system",
        createdAt,
        updatedAt: createdAt,
      }
      snippets.push(snippet)
      return snippet
    }

    createSnippet({
      name: "pd-imports",
      zhName: "Pandas 常用导入",
      folder: "团队共享片段",
      visibility: "shared",
      language: "python",
      description: "常见数据分析脚本起手所需的 import 组合，原样插入即可使用。",
      tags: ["import", "pandas", "numpy"],
      body: lines(
        "import numpy as np",
        "import pandas as pd",
        "from pathlib import Path",
      ),
    })

    createSnippet({
      name: "logging-setup",
      zhName: "标准日志初始化",
      folder: "我的工具箱",
      visibility: "private",
      ownerId: "local-user",
      language: "python",
      description: "创建统一格式的 logger，不做任何函数包装，直接插入当前文件。",
      tags: ["logging", "private", "utility"],
      body: lines(
        "import logging",
        "",
        "logging.basicConfig(",
        '    level=logging.INFO,',
        '    format=\"%(asctime)s | %(levelname)s | %(name)s | %(message)s\",',
        ")",
        'logger = logging.getLogger(\"algo-app\")',
      ),
    })

    createSnippet({
      name: "train-test-split-block",
      zhName: "训练测试集拆分代码块",
      folder: "数据处理片段",
      visibility: "shared",
      language: "python",
      description: "将特征矩阵与标签拆分为训练集和测试集，适合直接复用。",
      tags: ["sklearn", "dataset", "split"],
      body: lines(
        "from sklearn.model_selection import train_test_split",
        "",
        "X_train, X_test, y_train, y_test = train_test_split(",
        "    X,",
        "    y,",
        "    test_size=0.2,",
        "    random_state=42,",
        "    stratify=y,",
        ")",
      ),
    })

    createSnippet({
      name: "feature-columns-list",
      zhName: "特征列名定义",
      folder: "我的工具箱",
      visibility: "private",
      ownerId: "local-user",
      language: "python",
      description: "快速维护特征列列表，适合建模脚本顶部直接插入。",
      tags: ["feature", "columns", "private"],
      body: lines(
        "feature_columns = [",
        '    "temperature",',
        '    "pressure",',
        '    "flow_rate",',
        '    "vibration_rms",',
        "]",
      ),
    })

    const snippetVersions: AlgoLibSnippetVersion[] = snippets.map((snippet) => ({
      id: nextId("snippetVersions"),
      snippetId: snippet.id,
      version: snippet.currentVersion,
      content: snippet.content,
      changeReason: "初始化片段样例",
      changeSummary: "写入可直接插入编辑器的代码块",
      changedBy: snippet.createdBy,
      createdAt,
    }))

    const algorithmFolders: AlgoLibAlgorithmFolder[] = []
    const algorithmFolderMap = new Map<string, AlgoLibAlgorithmFolder>()
    const createAlgorithmFolder = (name: string, callName: string): AlgoLibAlgorithmFolder => {
      const folder: AlgoLibAlgorithmFolder = {
        id: nextId("algorithmFolders"),
        name,
        callName,
        ownerId: "local-user",
        createdAt,
        updatedAt: createdAt,
      }
      algorithmFolders.push(folder)
      algorithmFolderMap.set(name, folder)
      return folder
    }

    createAlgorithmFolder("数据工具组件", "data_utils")
    createAlgorithmFolder("统计分析组件", "statistics")
    createAlgorithmFolder("机器学习组件", "ml")
    createAlgorithmFolder("时序分析组件", "timeseries")

    const algorithms: AlgoLibAlgorithm[] = []
    const createAlgorithm = (input: {
      name: string
      zhName: string
      folder: string
      namespace: string
      type: string
      status: "draft" | "reviewing" | "published" | "deprecated"
      description: string
      inputSpec: string
      outputSpec: string
      content: string
      dependencies?: string
      example?: string
      tags: string[]
      linkedApplications?: string[]
      reviewComment?: string
      version?: string
    }): AlgoLibAlgorithm => {
      const algorithm: AlgoLibAlgorithm = {
        id: nextId("algorithms"),
        name: input.name,
        zhName: input.zhName,
        ownerId: "local-user",
        folderId: algorithmFolderMap.get(input.folder)?.id,
        namespace: input.namespace,
        type: input.type,
        description: input.description,
        inputSpec: input.inputSpec,
        outputSpec: input.outputSpec,
        dependencies: input.dependencies,
        content: input.content,
        example: input.example,
        tags: input.tags,
        currentVersion: input.version || "1.0.0",
        status: input.status,
        apiPath: `/api/v1/invoke/alg.${input.namespace}.${input.name}`,
        packageFile: input.status === "published" || input.status === "reviewing" ? `${input.name}.json` : undefined,
        linkedApplications: input.linkedApplications || [],
        createdBy: "local-user",
        updatedBy: "local-user",
        reviewerId: input.status === "published" || input.status === "deprecated" ? "admin-user" : undefined,
        reviewComment: input.reviewComment,
        submittedAt: input.status === "reviewing" || input.status === "published" || input.status === "deprecated" ? createdAt : undefined,
        approvedAt: input.status === "published" ? createdAt : undefined,
        rejectedAt: input.status === "deprecated" ? createdAt : undefined,
        createdAt,
        updatedAt: createdAt,
      }
      algorithms.push(algorithm)
      return algorithm
    }

    createAlgorithm({
      name: "normalize_minmax",
      zhName: "Min-Max 归一化",
      folder: "数据工具组件",
      namespace: "data_utils",
      type: "数据预处理",
      status: "published",
      dependencies: "python-stdlib",
      tags: ["归一化", "预处理", "published"],
      description: "将数值列表线性映射到 [0, 1] 区间，适合作为公开复用的基础组件。",
      inputSpec: lines(
        "values: list[float] - 待归一化的数值序列",
        "clip: bool = False - 是否将结果裁剪在 [0, 1] 范围",
      ),
      outputSpec: "dict - 包含 normalized、min_value、max_value 三个字段",
      example: "result = alg.data_utils.normalize_minmax([12, 18, 30], clip=True)",
      content: lines(
        "from __future__ import annotations",
        "",
        "def normalize_minmax(values: list[float], clip: bool = False) -> dict:",
        '    """Normalize numeric values to the [0, 1] interval."""',
        "    if not values:",
        '        return {\"normalized\": [], \"min_value\": None, \"max_value\": None}',
        "    min_value = min(values)",
        "    max_value = max(values)",
        "    span = max_value - min_value",
        "    if span == 0:",
        "        normalized = [0.0 for _ in values]",
        "    else:",
        "        normalized = [(float(v) - min_value) / span for v in values]",
        "    if clip:",
        "        normalized = [min(1.0, max(0.0, value)) for value in normalized]",
        '    return {\"normalized\": normalized, \"min_value\": min_value, \"max_value\": max_value}',
      ),
      linkedApplications: ["设备画像", "特征工程服务"],
    })

    createAlgorithm({
      name: "correlation_matrix",
      zhName: "皮尔森相关系数矩阵",
      folder: "统计分析组件",
      namespace: "statistics",
      type: "统计分析",
      status: "published",
      dependencies: "pandas,numpy",
      tags: ["相关性", "统计", "published"],
      description: "基于 DataFrame 计算皮尔森相关系数矩阵，并返回可序列化结果。",
      inputSpec: lines(
        "df: pandas.DataFrame - 输入表格",
        "digits: int = 4 - 保留小数位数",
      ),
      outputSpec: "dict - 包含 labels 和 matrix，适合直接渲染热力图",
      example: "result = alg.statistics.correlation_matrix(df, digits=3)",
      content: lines(
        "from __future__ import annotations",
        "",
        "import pandas as pd",
        "",
        "def correlation_matrix(df: pd.DataFrame, digits: int = 4) -> dict:",
        '    """Return Pearson correlation matrix in a JSON-friendly structure."""',
        "    corr = df.corr(method=\"pearson\").round(digits)",
        '    return {\"labels\": list(corr.columns), \"matrix\": corr.values.tolist()}',
      ),
      linkedApplications: ["统计分析看板", "特征筛选任务"],
      version: "1.1.0",
    })

    createAlgorithm({
      name: "rolling_mean",
      zhName: "滑动窗口均值",
      folder: "时序分析组件",
      namespace: "timeseries",
      type: "时序分析",
      status: "published",
      dependencies: "python-stdlib",
      tags: ["时序", "平滑", "published"],
      description: "对时间序列执行滑动均值平滑，适合直接对外提供调用。",
      inputSpec: lines(
        "values: list[float] - 时间序列数值",
        "window: int = 3 - 滑动窗口大小",
      ),
      outputSpec: "dict - 返回平滑结果和平滑窗口参数",
      example: "result = alg.timeseries.rolling_mean([1, 2, 3, 4, 5], window=3)",
      content: lines(
        "from __future__ import annotations",
        "",
        "def rolling_mean(values: list[float], window: int = 3) -> dict:",
        "    if window <= 0:",
        '        raise ValueError(\"window must be positive\")',
        "    if not values:",
        '        return {\"window\": window, \"series\": []}',
        "    smoothed = []",
        "    for index in range(len(values)):",
        "        left = max(0, index - window + 1)",
        "        chunk = values[left : index + 1]",
        "        smoothed.append(sum(chunk) / len(chunk))",
        '    return {\"window\": window, \"series\": smoothed}',
      ),
      linkedApplications: ["趋势分析服务"],
    })

    createAlgorithm({
      name: "random_forest_classifier",
      zhName: "随机森林分类器",
      folder: "机器学习组件",
      namespace: "ml",
      type: "机器学习",
      status: "reviewing",
      dependencies: "scikit-learn,numpy",
      tags: ["分类", "随机森林", "reviewing"],
      description: "对结构化特征执行随机森林分类训练与预测，当前已提交审核。",
      inputSpec: lines(
        "X_train: numpy.ndarray - 训练特征",
        "y_train: numpy.ndarray - 训练标签",
        "X_valid: numpy.ndarray - 验证特征",
      ),
      outputSpec: "dict - 包含 predictions 与 feature_importance",
      example: "result = alg.ml.random_forest_classifier(X_train, y_train, X_valid)",
      content: lines(
        "from __future__ import annotations",
        "",
        "from sklearn.ensemble import RandomForestClassifier",
        "",
        "def random_forest_classifier(X_train, y_train, X_valid, n_estimators: int = 200) -> dict:",
        "    model = RandomForestClassifier(n_estimators=n_estimators, random_state=42)",
        "    model.fit(X_train, y_train)",
        "    predictions = model.predict(X_valid)",
        '    return {\"predictions\": predictions.tolist(), \"feature_importance\": model.feature_importances_.tolist()}',
      ),
      reviewComment: "等待管理员确认输入输出描述与依赖说明。",
    })

    createAlgorithm({
      name: "adaptive_threshold_detector",
      zhName: "自适应阈值异常检测",
      folder: "时序分析组件",
      namespace: "timeseries",
      type: "时序分析",
      status: "draft",
      dependencies: "python-stdlib",
      tags: ["草稿", "异常检测", "时序"],
      description: "使用滑动基线和 sigma 阈值进行异常检测，目前仍处于草稿阶段。",
      inputSpec: lines(
        "values: list[float] - 原始序列",
        "window: int = 12 - 基线窗口",
        "sigma: float = 3.0 - 阈值倍数",
      ),
      outputSpec: "list[dict] - 异常点列表",
      example: "result = alg.timeseries.adaptive_threshold_detector(values, window=12, sigma=3.0)",
      content: lines(
        "from __future__ import annotations",
        "",
        "def adaptive_threshold_detector(values: list[float], window: int = 12, sigma: float = 3.0) -> list[dict]:",
        "    alerts = []",
        "    for index in range(window, len(values)):",
        "        chunk = values[index - window : index]",
        "        mean = sum(chunk) / len(chunk)",
        "        variance = sum((value - mean) ** 2 for value in chunk) / len(chunk)",
        "        std = variance ** 0.5 or 1e-6",
        "        if abs(values[index] - mean) / std >= sigma:",
        '            alerts.append({\"index\": index, \"value\": values[index], \"baseline\": mean})',
        "    return alerts",
      ),
    })

    createAlgorithm({
      name: "lstm_forecast",
      zhName: "LSTM 时序预测",
      folder: "时序分析组件",
      namespace: "timeseries",
      type: "时序分析",
      status: "deprecated",
      dependencies: "tensorflow,numpy",
      tags: ["下架", "lstm", "预测"],
      description: "旧版 LSTM 预测组件，因缺少归一化反变换逻辑已下架。",
      inputSpec: lines(
        "series: list[float] - 历史序列",
        "look_back: int = 24 - 回看窗口",
      ),
      outputSpec: "list[float] - 未来多个时间步的预测结果",
      example: "result = alg.timeseries.lstm_forecast(series, look_back=24)",
      content: lines(
        "from __future__ import annotations",
        "",
        "def lstm_forecast(series: list[float], look_back: int = 24) -> list[float]:",
        "    if len(series) < look_back:",
        '        raise ValueError(\"series is shorter than look_back\")',
        "    return list(series[-3:])",
      ),
      reviewComment: "预测结果未执行反归一化，输出值域不正确，已下架等待修复。",
      version: "0.9.0",
    })

    const algorithmVersions: AlgoLibAlgorithmVersion[] = algorithms.map((algorithm) => ({
      id: nextId("algorithmVersions"),
      algorithmId: algorithm.id,
      version: algorithm.currentVersion,
      content: algorithm.content,
      inputSpec: algorithm.inputSpec,
      outputSpec: algorithm.outputSpec,
      dependencies: algorithm.dependencies,
      changeReason: "初始化组件样例",
      changeSummary: "写入组件源码、描述和生命周期状态",
      changedBy: "local-user",
      createdAt,
    }))

    const algorithmReviews: AlgoLibAlgorithmReview[] = []
    algorithms.forEach((algorithm) => {
      if (algorithm.status === "reviewing") {
        algorithmReviews.push({
          id: nextId("algorithmReviews"),
          algorithmId: algorithm.id,
          decision: "submitted",
          actorId: "local-user",
          reason: "组件开发完成，提交审核",
          summary: "已补全函数源码、输入输出和依赖说明。",
          dependencies: algorithm.dependencies,
          applications: [],
          packageFile: algorithm.packageFile,
          createdAt,
        })
      }
      if (algorithm.status === "published") {
        algorithmReviews.push({
          id: nextId("algorithmReviews"),
          algorithmId: algorithm.id,
          decision: "approved",
          actorId: "admin-user",
          reason: "满足发布要求",
          summary: "审核通过，允许进入组件注册表并对外提供调用。",
          dependencies: algorithm.dependencies,
          applications: algorithm.linkedApplications,
          packageFile: algorithm.packageFile,
          createdAt,
        })
      }
      if (algorithm.status === "deprecated") {
        algorithmReviews.push({
          id: nextId("algorithmReviews"),
          algorithmId: algorithm.id,
          decision: "rejected",
          actorId: "admin-user",
          reason: "当前实现存在关键缺陷",
          summary: algorithm.reviewComment || "请修复问题后重新提交审核。",
          dependencies: algorithm.dependencies,
          applications: [],
          packageFile: algorithm.packageFile,
          createdAt,
        })
      }
    })

    return {
      schemaVersion: 3,
      categories,
      templates,
      templateVersions,
      snippetFolders,
      snippets,
      snippetVersions,
      algorithmFolders,
      algorithms,
      algorithmVersions,
      algorithmReviews,
      auditLogs: [],
      counters,
    }
  }
}
