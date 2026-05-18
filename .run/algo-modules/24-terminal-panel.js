/*
 * AlgoLib module: 24-terminal-panel.js
 * ?????????????? WebSocket ?????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function tickClock() {
      qs("#clock").textContent = new Date().toLocaleString();
    }

    // ── IDE 底部面板函数 ──────────────────────────────────────────────────────

    function switchBottomTab(tab) {
      state.bottomTab = tab;
      ["output", "terminal", "problems", "debug"].forEach(t => {
        const btn = qs(`#tab-${t}`);
        if (btn) btn.classList.toggle("active", t === tab);
        const pane = qs(`#${t}Pane`);
        if (pane) pane.classList.toggle("hidden", t !== tab);
      });
      if (tab === "terminal" && !state.terminalInited) initTerminal();
      if (tab === "problems") refreshProblemsPane();
    }

    function toggleBottomPanel(open) {
      state.bottomPanelOpen = (open !== undefined) ? open : !state.bottomPanelOpen;
      const panel = qs("#bottomPanel");
      if (panel) panel.classList.toggle("open", state.bottomPanelOpen);
      const resizeBar = qs("#panelResizeBar");
      if (resizeBar) resizeBar.classList.toggle("visible", state.bottomPanelOpen);
    }

    function startPanelResize(event) {
      event.preventDefault();
      const view = qs("#editorView");
      if (!view) return;
      document.body.style.userSelect = "none";
      function move(e) {
        requestAnimationFrame(() => {
          const newH = Math.max(80, Math.min(600, view.getBoundingClientRect().bottom - e.clientY));
          qs("#bottomPanel")?.style.setProperty("--panel-h", `${newH}px`);
        });
      }
      function up() {
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }

    function initTerminal() {
      if (state.terminalInited) return;
      if (!window.Terminal) { showToast("xterm.js 未加载，终端不可用"); return; }
      const host = qs("#xtermHost");
      if (!host) return;
      state.xterm = new window.Terminal({
        theme: { background: "#040e1f", foreground: "#d4e6f1", cursor: "#58a6ff" },
        fontSize: 13,
        fontFamily: "monospace",
        cursorBlink: true,
        scrollback: 3000
      });
      if (window.FitAddon?.FitAddon) {
        state.xtermFitAddon = new window.FitAddon.FitAddon();
        state.xterm.loadAddon(state.xtermFitAddon);
      }
      if (window.WebLinksAddon?.WebLinksAddon) {
        state.xterm.loadAddon(new window.WebLinksAddon.WebLinksAddon());
      }
      state.xterm.open(host);
      if (state.xtermFitAddon) state.xtermFitAddon.fit();
      state.terminalInited = true;
      connectWsTerminal();
      const ro = new ResizeObserver(() => { if (state.xtermFitAddon) state.xtermFitAddon.fit(); });
      ro.observe(host);
      state.xterm.onData(data => {
        if (state.terminalWs && state.terminalWs.readyState === WebSocket.OPEN) {
          state.terminalWs.send(JSON.stringify({ type: "input", data }));
        }
      });
      state.xterm.onResize(({ cols, rows }) => {
        if (state.terminalWs && state.terminalWs.readyState === WebSocket.OPEN) {
          state.terminalWs.send(JSON.stringify({ type: "resize", rows, cols }));
        }
      });
    }

    function connectWsTerminal() {
      if (state.terminalWs && state.terminalWs.readyState === WebSocket.OPEN) return;
      const token = state.token || localStorage.getItem("algolib_token") || "";
      const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = new URL(BASE).host;
      // 传入算法文件所在目录作为终端 cwd
      const sourceFile = state.editing?.algo?.sourceFile || "";
      const cwdParam = sourceFile ? encodeURIComponent(sourceFile.replace(/\/[^\/]+$/, "")) : "";
      const wsUrl = `${wsProto}//${host}/ws/terminal?token=${encodeURIComponent(token)}${cwdParam ? `&cwd=${cwdParam}` : ""}`;
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (state.xterm) state.xterm.writeln("\x1b[32m[终端已连接]\x1b[0m");
        if (sourceFile && state.xterm) {
          state.xterm.writeln(`\x1b[33m📄 ${sourceFile}\x1b[0m`);
          state.xterm.writeln(`\x1b[2m# 运行: python3 ${sourceFile}\x1b[0m`);
        }
        if (state.xterm) {
          const rows = state.xterm.rows || 24, cols = state.xterm.cols || 80;
          ws.send(JSON.stringify({ type: "resize", rows, cols }));
        }
      };
      ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "output" && state.xterm) state.xterm.write(msg.data);
        } catch { if (state.xterm) state.xterm.write(ev.data); }
      };
      ws.onclose = () => { if (state.xterm) state.xterm.writeln("\r\n\x1b[33m[连接已断开]\x1b[0m"); state.terminalWs = null; };
      ws.onerror = () => { if (state.xterm) state.xterm.writeln("\r\n\x1b[31m[连接错误]\x1b[0m"); };
      state.terminalWs = ws;
    }

    function openTerminalPanel() {
      toggleBottomPanel(true);
      switchBottomTab("terminal");
      if (!state.terminalInited) initTerminal();
      else if (!state.terminalWs || state.terminalWs.readyState !== WebSocket.OPEN) connectWsTerminal();
    }
