/*
 * AlgoLib module: 01-state.js
 * ????????state ??????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */


    const BASE = window._ALGO_BASE || "http://127.0.0.1:8000";
    // 项目根目录，用于断点终端运行时设置 PYTHONPATH
    const _PROJECT_ROOT_HINT = window._ALGO_PROJECT_ROOT || "/home/guan/code-server-me";
    window._activeMonaco = null;

    const state = {
      page: "components",
      data: { components: [], templates: [], snippets: [] },
      categories: { components: [], templates: [] },
      filters: {},
      pageScroll: {},
      pendingScrollRestore: "",
      editing: null,
      monacoReady: null,
      monaco: null,
      models: new Map(),
      fileMeta: new Map(),
      viewStates: new Map(),
      currentFile: "",
      testHeight: 0,
      outputMode: "json",
      lastRunResult: null,
      completionDisposable: null,
      completionItems: [],
      highlightId: "",
      apiTab: "keys",
      monitorPeriod: "24h",
      logsPage: 1,
      snippetResults: [],
      snippetCursor: 0,
      algoCallResults: [],
      algoCallCursor: 0,
      navCollapsed: { "components-group": true, "templates-group": true, "snippets-group": true },
      selectedNavNs: "",
      sse: null,
      currentUser: null,
      tplImportTarget: "",
      tplTestMode: "params",
      tplFileUploads: {},
      compTestMode: "params",
      compTestFileUploads: {},
      _compTestAlgo: null,
      _compTestSource: null,
      testPanelOpen: false,
      testPanelWidth: 420,
      _pendingDebugParams: null,
      _tpLastResult: undefined,
      _tpResultTab: "output",
      _tpTableData: {},
      _testAlgo: null,
      _testParamValues: {},
      _testResult: null,
      _testOutputTab: "output",
      _testInputExample: {},
      tplEditor: null,
      tplModel: null,
      blockEditor: null,
      // ── IDE 底部面板 ──
      bottomTab: "output",
      bottomPanelOpen: false,
      terminalWs: null,
      executeWs: null,
      xterm: null,
      xtermFitAddon: null,
      terminalInited: false,
      // ── 调试 ──
      debugBreakpoints: new Map(),   // filename → Set<lineNumber>
      debugSession: null             // { ws, status, currentFile, currentLine, variables, stack, consoleLog, startMsg }
    };

    const WIDGET_ZH = {
      int: "整数", float: "小数", str: "文本", text: "长文本",
      bool: "布尔", list: "列表", dict: "字典", json: "JSON",
      dataframe: "表格数据", image: "图片", images: "多张图片",
      file: "文件", audio: "音频", video: "视频", url: "网址",
      literal: "下拉选择", datetime: "日期时间", color: "颜色",
      password: "密码"
    };
