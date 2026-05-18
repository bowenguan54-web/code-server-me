/*
 * AlgoLib module: 26-run-problems-keys.js
 * ???????????? WebSocket????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    // ▶ 运行：直接执行当前代码
    function executeCurrentFile() {
      const model = state.editor?.getModel();
      if (!model) { showToast("编辑器未就绪"); return; }
      toggleBottomPanel(true);
      switchBottomTab("output");
      runCodeViaWs(model.getValue());
    }

    function _setRunBtnRunning(running) {
      const btn = qs("#runBtn");
      if (!btn) return;
      if (running) {
        btn.classList.add("running");
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.textContent = "运行中...";
      } else {
        btn.classList.remove("running");
        btn.disabled = false;
        btn.textContent = btn.dataset.origText || "▶ 运行";
      }
    }

    function runCodeViaWs(code) {
      const out = qs("#execOutput");
      if (out) out.innerHTML = '<span class="info">正在运行…</span>';
      _setRunBtnRunning(true);
      const _onResult = () => _setRunBtnRunning(false);
      if (state.executeWs && state.executeWs.readyState === WebSocket.OPEN) {
        state.executeWs.send(JSON.stringify({ action: "run", code }));
        // Patch result handler to also reset button for existing ws
        const origMsg = state.executeWs.onmessage;
        state.executeWs.onmessage = ev => {
          if (origMsg) origMsg.call(state.executeWs, ev);
          try {
            const m = JSON.parse(ev.data);
            if (m.type === "result") _setRunBtnRunning(false);
          } catch {}
        };
        return;
      }
      const token = state.token || localStorage.getItem("algolib_token") || "";
      const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = new URL(BASE).host;
      const ws = new WebSocket(`${wsProto}//${host}/ws/execute?token=${encodeURIComponent(token)}`);
      ws.onopen = () => ws.send(JSON.stringify({ action: "run", code }));
      ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data);
          const outEl = qs("#execOutput");
          if (!outEl) return;
          if (msg.type === "stdout") outEl.innerHTML += `<span class="so">${esc(msg.data)}</span>`;
          else if (msg.type === "stderr") outEl.innerHTML += `<span class="se">${esc(msg.data)}</span>`;
          else if (msg.type === "result") {
            const cls = msg.success ? "ok" : "err";
            outEl.innerHTML += `<span class="${cls}">── 退出码 ${msg.exit_code}，耗时 ${Math.round(msg.elapsed_ms)}ms ──</span>`;
            _setRunBtnRunning(false);
          }
          outEl.scrollTop = outEl.scrollHeight;
        } catch { /* ignore */ }
      };
      ws.onerror = () => {
        const outEl = qs("#execOutput");
        if (outEl) outEl.innerHTML += '<span class="err">WebSocket 连接失败</span>';
        _setRunBtnRunning(false);
      };
      state.executeWs = ws;
    }

    function refreshProblemsPane() {
      const list = qs("#problemsList");
      if (!list) return;
      if (!state.editor || !state.monaco) { list.innerHTML = '<span class="panel-empty">暂无问题</span>'; return; }
      const model = state.editor.getModel();
      if (!model) { list.innerHTML = '<span class="panel-empty">暂无问题</span>'; return; }
      const markers = state.monaco.editor.getModelMarkers({ resource: model.uri });
      if (!markers.length) { list.innerHTML = '<span class="panel-empty">✔ 没有检测到问题</span>'; return; }
      list.innerHTML = markers.map(mk => {
        const sevClass = mk.severity >= 8 ? "psev-error" : "psev-warn";
        const sevLabel = mk.severity >= 8 ? "错误" : "警告";
        const ln = mk.startLineNumber, col = mk.startColumn;
        return `<div class="problem-row" onclick="jumpToLine(${ln},${col})" title="跳转到第 ${ln} 行">
          <span class="${sevClass}">${sevLabel}</span>
          <span class="prob-pos">行 ${ln}</span>
          <span class="prob-msg">${esc(mk.message)}</span>
        </div>`;
      }).join("");
    }

    // 问题条目跳转
    let _flashDecIds = [];
    function jumpToLine(line, col) {
      const editor = window._activeMonaco, monaco = state.monaco;
      if (!editor || !monaco) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: Math.max(1, col || 1) });
      editor.focus();
      if (_flashDecIds.length) _flashDecIds = editor.deltaDecorations(_flashDecIds, []);
      _flashDecIds = editor.deltaDecorations([], [{
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "flash-highlight-line" }
      }]);
      setTimeout(() => { _flashDecIds = editor.deltaDecorations(_flashDecIds, []); }, 1200);
    }
    window.jumpToLine = jumpToLine;

    function bindGlobalKeys() {
      document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.altKey && !event.metaKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          openSnippetOverlay();
        }
        if (event.ctrlKey && event.altKey && !event.metaKey && event.key.toLowerCase() === "i") {
          event.preventDefault();
          openAlgoCallOverlay();
        }
        if (event.key === "Escape" && !qs("#snippetOverlay").classList.contains("hidden")) {
          closeSnippetOverlay();
        }
        if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === "F5") {
          if (state.editor) { event.preventDefault(); executeCurrentFile(); }
        }
        if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === "`") {
          if (qs("#editorView")) { event.preventDefault(); openTerminalPanel(); }
        }
      });
      qs("#modalRoot").addEventListener("click", event => {
        if (event.target.id === "modalRoot") closeModal();
      });
      document.addEventListener("click", event => {
        if (!event.target.closest(".more-menu-wrap")) {
          qsa(".more-menu").forEach(m => m.classList.add("hidden"));
        }
      });
      window.addEventListener("resize", () => _layoutAllEditors());
    }
