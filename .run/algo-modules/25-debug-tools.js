/*
 * AlgoLib module: 25-debug-tools.js
 * ???????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    // ════════════════════════════════════════════════════════════════════════
    // 断点 & 调试系统
    // ════════════════════════════════════════════════════════════════════════

    // ── 断点管理 ──────────────────────────────────────────────────────────────
    let _dbgBpDecIds = [];
    let _dbgCurDecIds = [];

    function initDebugBreakpoints(editor) {
      // >>> DEBUG INTEGRATION POINT: called after Monaco editor is created
      editor.onMouseDown(e => {
        const { type } = e.target;
        const monaco = state.monaco;
        if (!monaco) return;
        if (
          type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
        ) {
          const line = e.target.position?.lineNumber;
          if (!line || !state.currentFile) return;
          if (!state.debugBreakpoints.has(state.currentFile)) {
            state.debugBreakpoints.set(state.currentFile, new Set());
          }
          const bps = state.debugBreakpoints.get(state.currentFile);
          if (bps.has(line)) bps.delete(line);
          else bps.add(line);
          updateBreakpointDecorations();
        }
      });
    }

    function updateBreakpointDecorations() {
      // >>> DEBUG INTEGRATION POINT: called from switchFile and initDebugBreakpoints
      const editor = state.editor;
      const monaco = state.monaco;
      if (!editor || !monaco) return;
      const bps = state.debugBreakpoints.get(state.currentFile) || new Set();
      _dbgBpDecIds = editor.deltaDecorations(
        _dbgBpDecIds,
        Array.from(bps).map(line => ({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: "debug-breakpoint-line",
            glyphMarginClassName: "debug-breakpoint-glyph",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }))
      );
    }

    function updateCurrentLineDecoration(line) {
      const editor = state.editor;
      const monaco = state.monaco;
      if (!editor || !monaco) return;
      _dbgCurDecIds = editor.deltaDecorations(
        _dbgCurDecIds,
        line
          ? [
              {
                range: new monaco.Range(line, 1, line, 1),
                options: {
                  isWholeLine: true,
                  className: "debug-current-line",
                  glyphMarginClassName: "debug-current-glyph",
                },
              },
            ]
          : []
      );
    }

    function clearAllBreakpoints() {
      state.debugBreakpoints.clear();
      updateBreakpointDecorations();
      updateBlockBreakpointDecorations();
    }

    // ── 分块编辑器断点支持 ────────────────────────────────────────────────────

    /** 分块模式下使用的虚拟文件名（与后端保持一致） */
    function getBlockFileName() {
      const funcName = state.editing?.algo?.funcName;
      return funcName ? `${funcName}.py` : "__template__.py";
    }

    /** 计算 blockId 对应块在合并文件中的行偏移量（0-based） */
    function getBlockLineOffset(blockId) {
      if (!state.blockEditor) return 0;
      const sorted = [...state.blockEditor.blocks].sort((a, b) => a.order - b.order);
      let offset = 0;
      for (const block of sorted) {
        if (block.id === blockId) return offset;
        offset += block.code.split('\n').length;
      }
      return offset;
    }

    /** 为单个分块 Monaco 实例绑定断点点击事件 */
    function initBlockDebugBreakpoints(editor, blockId, monaco) {
      editor.onMouseDown(e => {
        const { type } = e.target;
        if (
          type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
        ) {
          const localLine = e.target.position?.lineNumber;
          if (!localLine) return;
          syncEditorsToBlocks();
          const filename = getBlockFileName();
          const globalLine = getBlockLineOffset(blockId) + localLine;
          if (!state.debugBreakpoints.has(filename)) {
            state.debugBreakpoints.set(filename, new Set());
          }
          const bps = state.debugBreakpoints.get(filename);
          if (bps.has(globalLine)) bps.delete(globalLine);
          else bps.add(globalLine);
          updateBlockBreakpointDecorations();
        }
      });
    }

    /** 刷新所有分块编辑器的断点装饰 */
    function updateBlockBreakpointDecorations() {
      if (!state.blockEditor) return;
      const monaco = state.monaco;
      if (!monaco) return;
      syncEditorsToBlocks();
      const filename = getBlockFileName();
      const bps = state.debugBreakpoints.get(filename) || new Set();
      if (!state.blockEditor._bpDecIds) state.blockEditor._bpDecIds = new Map();
      state.blockEditor.editors.forEach((ed, blockId) => {
        const offset = getBlockLineOffset(blockId);
        const block = state.blockEditor.blocks.find(b => b.id === blockId);
        const lineCount = block ? block.code.split('\n').length : 0;
        const localBps = Array.from(bps).filter(g => g > offset && g <= offset + lineCount);
        const prevIds = state.blockEditor._bpDecIds.get(blockId) || [];
        const newIds = ed.deltaDecorations(
          prevIds,
          localBps.map(g => ({
            range: new monaco.Range(g - offset, 1, g - offset, 1),
            options: {
              isWholeLine: true,
              className: "debug-breakpoint-line",
              glyphMarginClassName: "debug-breakpoint-glyph",
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            },
          }))
        );
        state.blockEditor._bpDecIds.set(blockId, newIds);
      });
    }

    /** 在正确的分块编辑器上显示当前调试行（globalLine 为合并文件中的行号） */
    function updateBlockCurrentLineDecoration(globalLine) {
      if (!state.blockEditor) return;
      const monaco = state.monaco;
      if (!monaco) return;
      syncEditorsToBlocks();
      if (!state.blockEditor._curDecIds) state.blockEditor._curDecIds = new Map();
      state.blockEditor.editors.forEach((ed, blockId) => {
        const offset = getBlockLineOffset(blockId);
        const block = state.blockEditor.blocks.find(b => b.id === blockId);
        const lineCount = block ? block.code.split('\n').length : 0;
        const localLine = (globalLine && globalLine > offset && globalLine <= offset + lineCount)
          ? globalLine - offset : null;
        const prevIds = state.blockEditor._curDecIds.get(blockId) || [];
        const newIds = ed.deltaDecorations(
          prevIds,
          localLine ? [{
            range: new monaco.Range(localLine, 1, localLine, 1),
            options: {
              isWholeLine: true,
              className: "debug-current-line",
              glyphMarginClassName: "debug-current-glyph",
            },
          }] : []
        );
        state.blockEditor._curDecIds.set(blockId, newIds);
        if (localLine) ed.revealLineInCenter(localLine);
      });
    }

    // ── 调试会话 ──────────────────────────────────────────────────────────────

    function updateDebugStatus(html) {
      const el = qs("#debugStatusText");
      if (el) el.innerHTML = html;
    }

    function startDebug() {
      if (state.debugSession) {
        stopDebug();
        return;
      }

      // Collect all file contents
      let files = [];
      if (state.blockEditor) {
        // 分块编辑器模式：将所有 block 合并为一个文件
        syncEditorsToBlocks();
        const sorted = [...state.blockEditor.blocks].sort((a, b) => a.order - b.order);
        const mergedContent = sorted.map(b => b.code).join("");
        const blockFileName = getBlockFileName();
        files = [{ filename: blockFileName, content: mergedContent }];
      } else {
        state.models.forEach((model, filename) => {
          files.push({ filename, content: model.getValue() });
        });
      }
      if (files.length === 0) { showToast("没有可调试的文件"); return; }

      // Find entry file (is_entry flag) and function name
      let entry_file = null;
      if (state.blockEditor) {
        entry_file = getBlockFileName();
      } else {
        state.fileMeta.forEach((meta, filename) => {
          if (meta.is_entry) entry_file = filename;
        });
        if (!entry_file) entry_file = state.currentFile || files[0].filename;
      }
      const entry_func = state.editing?.algo?.funcName || "main";

      // Collect breakpoints
      const breakpoints = {};
      state.debugBreakpoints.forEach((bpSet, filename) => {
        if (bpSet.size > 0) breakpoints[filename] = Array.from(bpSet);
      });

      // Collect test params
      let params = {};
      try {
        const page = state.editing?.page || "";
        if (page === "component" || page === "components") {
          params = state._pendingDebugParams ?? collectCompTestParams();
          state._pendingDebugParams = null;
        } else if (page === "templates" || page === "template") {
          // 读取模板页面「输入示例 JSON」字段（与「运行」按钮行为一致）
          const raw = qs("#tplInputExample")?.value || "{}";
          let parsed = {};
          try { parsed = JSON.parse(raw); } catch (_e) {}
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
          params = parsed;
        }
      } catch (_e) {}

      // Set editor read-only during debug
      if (state.blockEditor) {
        state.blockEditor.editors.forEach(ed => ed.updateOptions({ readOnly: true }));
      } else {
        state.editor?.updateOptions({ readOnly: true });
      }

      const token = state.token || localStorage.getItem("algolib_token") || "";
      const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = new URL(BASE).host;
      const wsUrl = `${wsProto}//${host}/ws/debug?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      const startMsg = { action: "start", files, entry_file, entry_func, params, breakpoints };
      state.debugSession = {
        ws,
        status: "connecting",
        currentFile: null,
        currentLine: null,
        variables: [],
        stack: [],
        consoleLog: [],
        startMsg,
      };

      ws.onopen = () => ws.send(JSON.stringify(startMsg));
      ws.onmessage = ev => {
        try { handleDebugMessage(JSON.parse(ev.data)); } catch (_e) {}
      };
      ws.onclose = () => cleanupDebug();
      ws.onerror = () => { showToast("调试连接失败"); cleanupDebug(); };

      // Update toolbar button to "stop"
      const btn = qs("#debugBtn");
      if (btn) {
        btn.textContent = "⏹ 停止";
        btn.className = "btn-debug-stop";
        btn.onclick = () => window.stopDebug();
      }
    }

    function stopDebug() {
      if (!state.debugSession) return;
      try { state.debugSession.ws.send(JSON.stringify({ action: "quit" })); } catch (_e) {}
      setTimeout(() => { try { state.debugSession?.ws.close(); } catch (_e) {} }, 200);
      cleanupDebug();
    }

    function cleanupDebug() {
      if (state.blockEditor) {
        // 恢复分块编辑器可写状态，清除当前行装饰
        state.blockEditor.editors.forEach((ed, blockId) => {
          const block = state.blockEditor.blocks.find(b => b.id === blockId);
          ed.updateOptions({ readOnly: !!(block?.locked && !state.blockEditor.designMode) });
        });
        updateBlockCurrentLineDecoration(null);
      } else {
        state.editor?.updateOptions({ readOnly: false });
        updateCurrentLineDecoration(null);
      }
      state.debugSession = null;
      const toolbar = qs("#debugToolbar");
      if (toolbar) toolbar.style.display = "none";
      const btn = qs("#debugBtn");
      if (btn) {
        btn.textContent = "🔴 调试";
        btn.className = "btn-debug";
        btn.onclick = () => window.startDebug();
      }
    }

    function handleDebugMessage(msg) {
      if (!state.debugSession) return;

      switch (msg.type) {
        case "started":
          state.debugSession.status = "running";
          const toolbar = qs("#debugToolbar");
          if (toolbar) toolbar.style.display = "flex";
          toggleBottomPanel(true);
          switchBottomTab("debug");
          showToast("调试已启动");
          break;

        case "stopped":
          state.debugSession.status = "paused";
          state.debugSession.currentFile = msg.file;
          state.debugSession.currentLine = msg.line;
          // Clear running state — we're paused at a breakpoint
          const toolbar2 = qs("#debugToolbar");
          if (toolbar2) toolbar2.classList.remove("running");
          if (state.blockEditor) {
            updateBlockCurrentLineDecoration(msg.line);
          } else {
            if (msg.file && msg.file !== state.currentFile && state.models.has(msg.file)) {
              switchFile(msg.file);
            }
            updateCurrentLineDecoration(msg.line);
            state.editor?.revealLineInCenter(msg.line);
          }
          updateDebugStatus(`暂停于 ${msg.func}() 第 ${msg.line} 行`);
          break;

        case "locals":
          state.debugSession.variables = msg.variables || [];
          renderDebugVariables();
          break;

        case "stack":
          state.debugSession.stack = msg.frames || [];
          renderDebugStack();
          break;

        case "eval_result":
          appendDebugConsole("cmd", `>>> ${msg.expression}`);
          if (msg.error) appendDebugConsole("error", msg.error);
          else appendDebugConsole("result", msg.result || "");
          break;

        case "output":
          appendDebugConsole(msg.stream === "stderr" ? "error" : "result", msg.data);
          break;

        case "ended": {
          const reason = msg.reason || "completed";
          const ms = (msg.elapsed_ms || 0).toFixed(0);
          showToast(`调试结束：${reason}（耗时 ${ms}ms）`);
          cleanupDebug();
          break;
        }

        case "error":
          appendDebugConsole("error", msg.message || "未知错误");
          break;
      }
    }

    function sendDebugAction(action, extra) {
      if (!state.debugSession?.ws) { showToast("调试会话未启动"); return; }
      const msg = { action };
      if (action === "eval" && extra) msg.expression = extra;
      if (action === "restart" && state.debugSession.startMsg) {
        state.debugSession.ws.send(JSON.stringify(state.debugSession.startMsg));
        return;
      }
      // Show "running" state while executing between breakpoints
      if (["continue", "next", "step", "return"].includes(action)) {
        const toolbar = qs("#debugToolbar");
        if (toolbar) toolbar.classList.add("running");
        updateDebugStatus('<span class="debug-running-dot"></span>执行中...');
      }
      state.debugSession.ws.send(JSON.stringify(msg));
    }

    function _debugConsoleEval() {
      const input = qs("#debugConsoleInput");
      const expr = input?.value?.trim();
      if (!expr) return;
      sendDebugAction("eval", expr);
      if (input) input.value = "";
    }

    // ── UI 渲染 ────────────────────────────────────────────────────────────────

    function renderDebugVariables() {
      const el = qs("#debugVarsContent");
      if (!el) return;
      const vars = state.debugSession?.variables || [];
      if (!vars.length) {
        el.innerHTML = '<span class="panel-empty">无局部变量</span>';
        return;
      }
      el.innerHTML = vars.map(v =>
        `<div class="debug-var-item"><span class="debug-var-name">${esc(v.name)}</span>` +
        `<span class="debug-var-type"> :${esc(v.type)}</span>` +
        ` = <span class="debug-var-value">${esc(v.repr)}</span></div>`
      ).join("");
    }

    function renderDebugStack() {
      const el = qs("#debugStackContent");
      if (!el) return;
      const frames = state.debugSession?.stack || [];
      if (!frames.length) {
        el.innerHTML = '<span class="panel-empty">无堆栈信息</span>';
        return;
      }
      el.innerHTML = frames.map((f, i) =>
        `<div class="debug-stack-item${i === 0 ? " active" : ""}" onclick="window._debugJumpFrame(${i})">` +
        `<span class="debug-stack-func">${esc(f.func)}</span> ` +
        `<span class="debug-stack-loc">(${esc(f.file)}:${f.line})</span></div>`
      ).join("");
    }

    function appendDebugConsole(type, text) {
      if (!state.debugSession) return;
      state.debugSession.consoleLog.push({ type, text });
      const el = qs("#debugConsoleOutput");
      if (!el) return;
      const entry = document.createElement("div");
      entry.className = `debug-console-entry ${type}`;
      entry.textContent = text;
      el.appendChild(entry);
      el.scrollTop = el.scrollHeight;
    }

    function _debugJumpFrame(idx) {
      const frame = state.debugSession?.stack?.[idx];
      if (!frame) return;
      if (frame.file && state.models.has(frame.file)) {
        if (frame.file !== state.currentFile) switchFile(frame.file);
        state.editor?.revealLineInCenter(frame.line);
      }
    }

    window.clearAllBreakpoints = clearAllBreakpoints;
    window.startDebug = startDebug;
    window.stopDebug = stopDebug;
    window.sendDebugAction = sendDebugAction;
    window._debugConsoleEval = _debugConsoleEval;
    window._debugJumpFrame = _debugJumpFrame;

