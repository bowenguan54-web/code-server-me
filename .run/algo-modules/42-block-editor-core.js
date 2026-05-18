/*
 * AlgoLib module: 42-block-editor-core.js
 * ???????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function initBlockEditor(container, item) {
      // 仅对 template 类型启用分块编辑
      if (item.type !== "template" && item.moduleKind !== "template") return false;
      state.blockEditor = {
        container,
        algorithmId: item.id,
        blocks: [],
        editors: new Map(),  // blockId -> monaco editor instance
        viewMode: "blocks",  // "blocks" | "source"
        designMode: false,   // false = Use Mode, true = Design Mode
      };
      // 判断当前用户是否可进入 Design Mode（admin 或 owner）
      const isAdmin = state.currentUser?.role === "admin";
      const isOwner = item.ownerId === state.currentUser?.id || item.owner_id === state.currentUser?.id;
      state.blockEditor.canDesign = isAdmin || isOwner;
      // 加载 blocks 数据后渲染
      api(`/api/v1/templates/${item.id}/blocks`).then(resp => {
        state.blockEditor.blocks = resp.blocks || [];
        renderBlockEditorUI(container);
      }).catch(err => {
        container.innerHTML = `<div class="empty" style="padding:24px">加载模板分块失败：${esc(err.message)}</div>`;
      });
      // 确保算法补全数据已加载（供 Ctrl+Alt+I 面板使用）
      if (!state.completionItems || state.completionItems.length === 0) {
        registerCompletionProvider();
      }
      return true;
    }

    function disposeBlockEditors() {
      if (!state.blockEditor) return;
      state.blockEditor.editors.forEach(ed => {
        try { ed.dispose(); } catch (_) {}
      });
      state.blockEditor.editors.clear();
    }

    function renderBlockEditorUI(container) {
      if (!state.blockEditor) return;
      const { blocks, viewMode, designMode, canDesign } = state.blockEditor;
      const sorted = [...blocks].sort((a, b) => a.order - b.order);

      // 将 Block 操作控件注入主工具栏的 #blockEditorControls 占位符
      const ctrl = qs("#blockEditorControls");
      if (ctrl) {
        const addBtnHtml = designMode
          ? `<button class="block-action" onclick="window.addNewBlock()">＋ 添加步骤</button>`
          : "";
        const designToggle = canDesign
          ? `<button class="block-action ${designMode ? "active" : ""}" onclick="window.toggleDesignMode()">${designMode ? "退出设计" : "进入设计模式"}</button>`
          : "";
        ctrl.innerHTML = `
          ${designToggle}
          ${addBtnHtml}
          <button class="block-action ${viewMode === "blocks" ? "active" : ""}" onclick="window.setBlockViewMode('blocks')">分块</button>
          <button class="block-action ${viewMode === "source" ? "active" : ""}" onclick="window.setBlockViewMode('source')">源码</button>
        `;
      }

      if (viewMode === "source") {
        container.innerHTML = `<div id="blockSourceView" style="flex:1;min-height:0;height:100%;"></div>`;
        const syncCodeToSourceView = () => {
          syncEditorsToBlocks();
          const full = [...state.blockEditor.blocks]
            .sort((a, b) => a.order - b.order)
            .map(b => b.code).join("");
          return full;
        };
        loadMonaco().then(m => {
          const host = qs("#blockSourceView");
          if (!host) return;
          const code = syncCodeToSourceView();
          const ed = m.editor.create(host, {
            value: code,
            language: "python",
            theme: "algolib-dark",
            readOnly: !designMode,
            automaticLayout: true,
            fontSize: 13,
            minimap: { enabled: false },
          });
          state.blockEditor.sourceEditor = ed;
          // 装饰锁定行
          _decorateLockedLines(m, ed, state.blockEditor.blocks);
          ed.onDidFocusEditorWidget(() => { window._activeMonaco = ed; });
          ed.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyI, () => openAlgoCallOverlay());
          ed.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
        });
        return;
      }

      // Blocks view
      const blocksHtml = sorted.map((block, idx) => {
        const isLocked = block.locked;
        const blockClass = isLocked ? "is-locked" : "is-editable";
        const lockBadge = isLocked ? "🔒" : "✏️";
        const designActions = designMode ? `
          <span class="block-design-actions">
            <button onclick="window.toggleBlockLock('${esc(block.id)}')" title="${isLocked ? '解锁' : '锁定'}">${isLocked ? "🔓" : "🔒"}</button>
            <button onclick="window.moveBlockUp('${esc(block.id)}')" title="上移">↑</button>
            <button onclick="window.moveBlockDown('${esc(block.id)}')" title="下移">↓</button>
            <button class="danger" onclick="window.removeBlock('${esc(block.id)}')" title="删除">✕</button>
          </span>
        ` : "";
        const titleEditable = designMode ? `contenteditable="true" onblur="window.updateBlockTitle('${esc(block.id)}', this.textContent)"` : "";
        const descEditable = designMode ? `contenteditable="true" onblur="window.updateBlockDesc('${esc(block.id)}', this.textContent)"` : "";
        const hintEditable = designMode ? `contenteditable="true" onblur="window.updateBlockHint('${esc(block.id)}', this.textContent)"` : "";

        // 内联描述预览（最多40字符，折叠时显示在标题行）
        const descPreview = block.description ? block.description.slice(0, 40) + (block.description.length > 40 ? "…" : "") : "";
        const descPreviewHtml = descPreview && !designMode
          ? `<span class="block-desc-preview" title="${esc(block.description)}">${esc(descPreview)}</span>`
          : "";
        // 展开/折叠按钮（desc/hint 存在时或设计模式下显示）
        const hasExpandable = !!(block.description || block.hint || designMode);
        const expandBtn = hasExpandable
          ? `<button class="block-expand-btn" id="block-expand-${esc(block.id)}" onclick="window.toggleBlockMeta('${esc(block.id)}')" title="展开/折叠描述">▾</button>`
          : "";

        // meta 区：desc + hint；use mode 默认折叠
        const metaCollapsed = designMode ? "" : "collapsed";
        const hintHtml = (block.hint || designMode)
          ? `<div class="block-hint" ${hintEditable} data-block-id="${esc(block.id)}" data-field="hint">💡 ${esc(block.hint || (designMode ? "（点击编辑提示信息）" : ""))}</div>`
          : "";
        const descHtml = (block.description || designMode)
          ? `<div class="block-description" ${descEditable} data-block-id="${esc(block.id)}" data-field="desc">${esc(block.description || (designMode ? "（点击编辑步骤描述）" : ""))}</div>`
          : "";
        const metaHtml = (descHtml || hintHtml)
          ? `<div class="block-meta ${metaCollapsed}" id="block-meta-${esc(block.id)}">${descHtml}${hintHtml}</div>`
          : "";

        // 插入区：hover 展开
        const insertZoneHtml = designMode
          ? `<div class="block-insert-zone"><div class="block-insert-btn" onclick="window.insertBlockAt(${block.order + 1})">＋ 在此处插入新步骤</div></div>`
          : "";

        return `
          <div class="template-block ${blockClass}" id="block-wrap-${esc(block.id)}">
            <div class="block-header">
              <span class="block-step-num">${idx + 1}</span>
              <span class="block-title-text" ${titleEditable} data-block-id="${esc(block.id)}">${esc(block.title || `步骤 ${idx + 1}`)}</span>
              <span class="block-lock-badge">${lockBadge}</span>
              ${descPreviewHtml}
              ${expandBtn}
              ${designActions}
            </div>
            ${metaHtml}
            <div class="block-code-area" id="block-editor-${esc(block.id)}" style="height:${Math.max(120, (block.code.split('\n').length + 2) * 19)}px"></div>
          </div>
          ${insertZoneHtml}
        `;
      }).join("");

      container.innerHTML = `<div class="block-editor-body">${blocksHtml}${designMode ? '<div class="block-add-row"><button onclick="window.addNewBlock()">＋ 添加新步骤</button></div>' : ""}</div>`;

      // 创建各 block 的 Monaco 实例
      loadMonaco().then(m => {
        sorted.forEach(block => {
          const host = qs(`#block-editor-${block.id}`);
          if (!host) return;
          const ed = m.editor.create(host, {
            value: block.code,
            language: "python",
            theme: "algolib-dark",
            readOnly: block.locked && !designMode,
            automaticLayout: true,
            fontSize: 13,
            minimap: { enabled: false },
            lineNumbers: "on",
            glyphMargin: true,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            quickSuggestions: { other: true, comments: false, strings: false },
            scrollbar: { alwaysConsumeMouseWheel: false, vertical: "auto", verticalScrollbarSize: 5 },
          });
          if (block.locked && !designMode) {
            host.style.background = "rgba(106,138,176,.04)";
            host.style.pointerEvents = "none";
          }
          ed.onDidFocusEditorWidget(() => { window._activeMonaco = ed; });
          ed.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyI, () => openAlgoCallOverlay());
          ed.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
          initBlockDebugBreakpoints(ed, block.id, m);
          state.blockEditor.editors.set(block.id, ed);
        });
      });
    }

    function _decorateLockedLines(m, editor, blocks) {
      const sorted = [...blocks].sort((a, b) => a.order - b.order);
      let lineOffset = 1;
      const decorations = [];
      sorted.forEach(block => {
        const lineCount = block.code.split("\n").length;
        if (block.locked) {
          decorations.push({
            range: new m.Range(lineOffset, 1, lineOffset + lineCount - 1, 1),
            options: {
              isWholeLine: true,
              className: "locked-line-decoration",
              glyphMarginClassName: "locked-glyph",
            },
          });
        }
        lineOffset += lineCount;
      });
      editor.createDecorationsCollection(decorations);
    }
