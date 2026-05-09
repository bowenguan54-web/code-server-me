/**
 * AlgoChangeListener.ts
 *
 * 监听 algo_service 的 SSE 事件流，自动同步自定义算法列表，
 * 并向编辑器注册代码补全提供器，让用户在写代码时可以直接调用算法。
 */

import * as vscode from "vscode";

// ── 类型定义 ─────────────────────────────────────────────────────────────────

interface AlgorithmInfo {
  name: string;
  category: string;
  description: string;
  version: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  source: "builtin" | "custom";
  path?: string;
  ownerId?: string;
  owner_id?: string;
  publishStatus?: string;
  publish_status?: string;
}

interface SSEEvent {
  type: "algo_added" | "algo_updated" | "algo_removed";
  data: {
    path: string;
    algorithms?: string[];
    added?: string[];
    removed?: string[];
    count: number;
  };
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const DEFAULT_URL = "http://localhost:8000";
const SSE_PATH = "/api/v1/events/algo-changes";
const ALGO_LIST_PATH = "/api/v1/algorithms";
const RECONNECT_DELAY_MS = 3000;

// 多语言代码片段生成模板
const SNIPPET_TEMPLATES: Record<
  string,
  (name: string, inputs: Record<string, string>) => string
> = {
  python: (name, inputs) => {
    const params = Object.entries(inputs)
      .map(([k, v]) => {
        const defaultVal = v.includes("=") ? v.split("=")[1].trim() : "None";
        return `${k}=${defaultVal}`;
      })
      .join(", ");
    return (
      `import requests\n` +
      `resp = requests.post("${DEFAULT_URL}/api/v1/custom/${name}", json={${Object.keys(inputs)
        .map((k) => `"${k}": ${k}`)
        .join(", ")}})\n` +
      `result = resp.json()\n`
    );
  },
  javascript: (name, inputs) => {
    const body = `{${Object.keys(inputs)
      .map((k) => `${k}`)
      .join(", ")}}`;
    return (
      `const resp = await fetch('${DEFAULT_URL}/api/v1/custom/${name}', {\n` +
      `  method: 'POST',\n` +
      `  headers: { 'Content-Type': 'application/json' },\n` +
      `  body: JSON.stringify(${body})\n` +
      `});\n` +
      `const result = await resp.json();\n`
    );
  },
  typescript: (name, inputs) => {
    const body = `{${Object.keys(inputs)
      .map((k) => `${k}`)
      .join(", ")}}`;
    return (
      `const resp = await fetch('${DEFAULT_URL}/api/v1/custom/${name}', {\n` +
      `  method: 'POST',\n` +
      `  headers: { 'Content-Type': 'application/json' },\n` +
      `  body: JSON.stringify(${body})\n` +
      `});\n` +
      `const result: { success: boolean; result: unknown; meta: Record<string, unknown> } = await resp.json();\n`
    );
  },
  java: (name, inputs) => {
    return (
      `// 需要 okhttp3 依赖\n` +
      `OkHttpClient client = new OkHttpClient();\n` +
      `String json = "{\\"algo\\":\\"${name}\\"}"; // 填入参数\n` +
      `RequestBody body = RequestBody.create(json, MediaType.get("application/json"));\n` +
      `Request request = new Request.Builder()\n` +
      `    .url("${DEFAULT_URL}/api/v1/custom/${name}")\n` +
      `    .post(body).build();\n` +
      `Response response = client.newCall(request).execute();\n`
    );
  },
  go: (name, inputs) => {
    return (
      `payload, _ := json.Marshal(map[string]interface{}{${Object.keys(inputs)
        .map((k) => `"${k}": ${k}`)
        .join(", ")}})\n` +
      `resp, err := http.Post("${DEFAULT_URL}/api/v1/custom/${name}", "application/json", bytes.NewBuffer(payload))\n` +
      `if err != nil { log.Fatal(err) }\n` +
      `defer resp.Body.Close()\n`
    );
  },
};

// ── AlgoChangeListener 主类 ──────────────────────────────────────────────────

export class AlgoChangeListener {
  private statusBar: vscode.StatusBarItem;
  private customAlgos: Map<string, AlgorithmInfo> = new Map();
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private completionDisposable: vscode.Disposable | null = null;
  private readonly context: vscode.ExtensionContext;
  private serviceUrl: string;

  constructor(context: vscode.ExtensionContext, serviceUrl: string = DEFAULT_URL) {
    this.context = context;
    this.serviceUrl = serviceUrl.replace(/\/$/, "");

    // 创建状态栏
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBar.command = "algolib.showAlgorithms";
    this.statusBar.text = "$(sync~spin) 算法服务连接中...";
    this.statusBar.show();

    context.subscriptions.push(this.statusBar);

    // 注册命令
    context.subscriptions.push(
      vscode.commands.registerCommand("algolib.showAlgorithms", () =>
        this.showAlgorithmQuickPick()
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("algolib.insertSnippet", (algo: AlgorithmInfo) =>
        this.insertAlgoSnippet(algo)
      )
    );
  }

  // ── 启动监听 ───────────────────────────────────────────────────────────────

  public start(): void {
    this.fetchAlgorithmList().then(() => {
      this.connect();
    });
  }

  public dispose(): void {
    this.disconnect();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.completionDisposable?.dispose();
  }

  // ── 获取算法列表（启动时全量同步）──────────────────────────────────────────

  private async fetchAlgorithmList(): Promise<void> {
    try {
      const resp = await fetch(`${this.serviceUrl}${ALGO_LIST_PATH}`);
      if (!resp.ok) {
        return;
      }
      const list: AlgorithmInfo[] = await resp.json();
      this.customAlgos.clear();
      for (const algo of list) {
        this.customAlgos.set(algo.name, algo);
      }
      this.updateStatusBar();
      this.refreshCompletionProvider();
    } catch {
      // 服务尚未启动，忽略
    }
  }

  // ── SSE 连接管理 ──────────────────────────────────────────────────────────

  private connect(): void {
    this.disconnect();
    const url = `${this.serviceUrl}${SSE_PATH}`;
    try {
      // VSCode 扩展运行在 Node.js 环境，使用 node-fetch / 内置 fetch
      // 这里使用 fetch + ReadableStream 模拟 SSE（兼容 Node 18+）
      this.startSSEStream(url);
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        /* ignore */
      }
      this.eventSource = null;
    }
  }

  private async startSSEStream(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
      });
      if (!response.ok || !response.body) {
        this.scheduleReconnect();
        return;
      }
      this.statusBar.text = "$(check) 算法服务已连接";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const read = async (): Promise<void> => {
        let done = false;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch {
          this.scheduleReconnect();
          return;
        }
        if (done) {
          this.scheduleReconnect();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));
              this.handleSSEEvent(event);
            } catch {
              /* ignore malformed */
            }
          }
        }
        read(); // 继续读取
      };
      read();
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.statusBar.text = "$(warning) 算法服务断开，重连中...";
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.fetchAlgorithmList().then(() => this.connect());
    }, RECONNECT_DELAY_MS);
  }

  // ── 事件处理 ──────────────────────────────────────────────────────────────

  private handleSSEEvent(event: SSEEvent): void {
    switch (event.type) {
      case "algo_added": {
        const names = event.data.algorithms ?? [];
        for (const name of names) {
          // 单个添加时只知道名字，需要重新拉取完整列表
          this.fetchAlgorithmList();
          break;
        }
        vscode.window.showInformationMessage(
          `已加载 ${event.data.count} 个自定义算法: ${(event.data.algorithms ?? []).join(", ")}`
        );
        break;
      }
      case "algo_updated": {
        const removed = event.data.removed ?? [];
        for (const name of removed) {
          this.customAlgos.delete(name);
        }
        this.fetchAlgorithmList();
        vscode.window.showInformationMessage(
          `算法已更新: +${(event.data.added ?? []).join(", ")} / -${removed.join(", ")}`
        );
        break;
      }
      case "algo_removed": {
        const names = event.data.algorithms ?? [];
        for (const name of names) {
          this.customAlgos.delete(name);
        }
        this.updateStatusBar();
        this.refreshCompletionProvider();
        vscode.window.showInformationMessage(
          `已移除 ${event.data.count} 个自定义算法`
        );
        break;
      }
    }
  }

  // ── 状态栏更新 ─────────────────────────────────────────────────────────────

  private updateStatusBar(): void {
    const n = this.customAlgos.size;
    this.statusBar.text = n > 0
      ? `$(beaker) 已同步 ${n} 个自定义算法`
      : `$(beaker) AlgoService`;
    this.statusBar.tooltip = n > 0
      ? `点击查看已注册的自定义算法（共 ${n} 个）`
      : "点击查看算法列表";
  }

  // ── 代码补全提供器 ─────────────────────────────────────────────────────────

  private refreshCompletionProvider(): void {
    this.completionDisposable?.dispose();
    this.completionDisposable = vscode.languages.registerCompletionItemProvider(
      ["python", "javascript", "typescript", "java", "go"],
      {
        provideCompletionItems: (document, position) => {
          const lineText = document.lineAt(position).text;
          const prefix = lineText.slice(0, position.character);
          // 只在输入 alg. 或 algo. 时触发
          if (!/\balg(o)?\.?\w*$/.test(prefix)) {
            return [];
          }
          return Array.from(this.customAlgos.values()).map((algo) => {
            const privacy = this.privacyLabel(algo);
            const item = new vscode.CompletionItem(
              `[${privacy}] ${algo.name}`,
              vscode.CompletionItemKind.Function
            );
            item.filterText = algo.name;
            item.sortText = `${privacy === "私有" ? "0" : "1"}_${algo.name}`;
            item.detail = `[${privacy}] [${algo.category}] ${algo.description}`;
            item.documentation = new vscode.MarkdownString(
              this.generateDoc(algo)
            );
            item.insertText = new vscode.SnippetString(
              this.generateSnippet(algo, document.languageId)
            );
            return item;
          });
        },
      },
      "."
    );
    this.context.subscriptions.push(this.completionDisposable);
  }

  // ── 算法代码片段生成 ───────────────────────────────────────────────────────

  private generateSnippet(algo: AlgorithmInfo, language: string): string {
    const lang = language in SNIPPET_TEMPLATES ? language : "python";
    const gen = SNIPPET_TEMPLATES[lang];
    return gen(algo.name, algo.inputs);
  }

  private generateDoc(algo: AlgorithmInfo): string {
    const inputLines = Object.entries(algo.inputs)
      .map(([k, v]) => `- \`${k}\`: ${v}`)
      .join("\n");
    const outputLines = Object.entries(algo.outputs)
      .map(([k, v]) => `- \`${k}\`: ${v}`)
      .join("\n");
    return [
      `**${algo.name}** v${algo.version}`,
      "",
      algo.description,
      "",
      inputLines ? `**参数:**\n${inputLines}` : "",
      "",
      outputLines ? `**返回:**\n${outputLines}` : "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");
  }

  private privacyLabel(algo: AlgorithmInfo): "公有" | "私有" {
    const owner = algo.ownerId || algo.owner_id || "";
    const status = algo.publishStatus || algo.publish_status || "";
    return owner === "system" || status === "published" ? "公有" : "私有";
  }

  // ── 快速选择面板 ──────────────────────────────────────────────────────────

  private async showAlgorithmQuickPick(): Promise<void> {
    const items = Array.from(this.customAlgos.values()).map((algo) => {
      const privacy = this.privacyLabel(algo);
      return {
        label: `$(beaker) [${privacy}] ${algo.name}`,
        description: `[${algo.category}]`,
        detail: algo.description,
        algo,
      };
    });

    if (items.length === 0) {
      vscode.window.showInformationMessage(
        "暂无自定义算法。在 user_algorithms/ 目录下创建 .py 文件，使用 @algo_export 标注函数即可。"
      );
      return;
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "选择算法以插入调用代码片段",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      await this.insertAlgoSnippet(selected.algo);
    }
  }

  private async insertAlgoSnippet(algo: AlgorithmInfo): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const snippet = this.generateSnippet(algo, editor.document.languageId);
    await editor.insertSnippet(new vscode.SnippetString(snippet));
  }
}
