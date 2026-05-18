/*
 * AlgoLib module: 43-block-editor-actions.js
 * ???????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function syncEditorsToBlocks() {
      if (!state.blockEditor) return;
      state.blockEditor.editors.forEach((ed, blockId) => {
        const block = state.blockEditor.blocks.find(b => b.id === blockId);
        if (block) block.code = ed.getValue();
      });
    }

    async function saveBlockEditor() {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const { algorithmId, blocks, designMode } = state.blockEditor;
      try {
        if (designMode) {
          await api(`/api/v1/templates/${algorithmId}/blocks`, {
            method: "PUT",
            body: JSON.stringify({ blocks }),
          });
        } else {
          const editableUpdates = blocks
            .filter(b => !b.locked)
            .map(b => ({ id: b.id, code: b.code }));
          await api(`/api/v1/templates/${algorithmId}/blocks/editable`, {
            method: "PUT",
            body: JSON.stringify({ blocks: editableUpdates }),
          });
        }
        showToast("模板已保存");
      } catch (err) {
        showToast("保存失败: " + err.message);
      }
    }

    function toggleDesignMode() {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      disposeBlockEditors();
      state.blockEditor.designMode = !state.blockEditor.designMode;
      renderBlockEditorUI(state.blockEditor.container);
    }

    function setBlockViewMode(mode) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      disposeBlockEditors();
      if (state.blockEditor.sourceEditor) {
        try { state.blockEditor.sourceEditor.dispose(); } catch (_) {}
        state.blockEditor.sourceEditor = null;
      }
      state.blockEditor.viewMode = mode;
      renderBlockEditorUI(state.blockEditor.container);
    }

    function addNewBlock() {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const blocks = state.blockEditor.blocks;
      const maxOrder = blocks.reduce((m, b) => Math.max(m, b.order), 0);
      const newId = "blk_" + Math.random().toString(36).slice(2, 8);
      blocks.push({
        id: newId,
        order: maxOrder + 1,
        title: "新步骤",
        description: "",
        code: "    # 在此编写代码\n    pass\n",
        locked: false,
        hint: "",
      });
      disposeBlockEditors();
      renderBlockEditorUI(state.blockEditor.container);
      scrollToBlock(newId);
    }

    function insertBlockAt(beforeOrder) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const blocks = state.blockEditor.blocks;
      blocks.forEach(b => { if (b.order >= beforeOrder) b.order += 1; });
      const newId = "blk_" + Math.random().toString(36).slice(2, 8);
      blocks.push({
        id: newId,
        order: beforeOrder,
        title: "新步骤",
        description: "",
        code: "    # 在此编写代码\n    pass\n",
        locked: false,
        hint: "",
      });
      disposeBlockEditors();
      renderBlockEditorUI(state.blockEditor.container);
      scrollToBlock(newId);
    }

    function removeBlock(blockId) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const block = state.blockEditor.blocks.find(b => b.id === blockId);
      if (!block) { showToast('未找到该代码块'); return; }
      if (block.locked) { showToast('锁定的代码块不能删除，请先解锁'); return; }
      showConfirm('确定删除该步骤？此操作不可撤销。', () => {
        // 先从 DOM 移除，避免全量重渲染导致滚动跳转
        const blockEl = qs(`#block-wrap-${blockId}`);
        if (blockEl) {
          const next = blockEl.nextElementSibling;
          if (next && next.classList.contains('block-insert-zone')) next.remove();
          blockEl.remove();
          // 同时删除 Monaco 实例
          const ed = state.blockEditor.editors.get(blockId);
          if (ed) { try { ed.dispose(); } catch (_) {} state.blockEditor.editors.delete(blockId); }
        }
        state.blockEditor.blocks = state.blockEditor.blocks.filter(b => b.id !== blockId);
        state.blockEditor.blocks
          .sort((a, b) => a.order - b.order)
          .forEach((b, i) => { b.order = i + 1; });
        // 重渲染以更新步骤序号，保持滚动位置
        _renderBlocksPreserveScroll(null);
      });
    }

    function toggleBlockLock(blockId) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const block = state.blockEditor.blocks.find(b => b.id === blockId);
      if (block) block.locked = !block.locked;
      _renderBlocksPreserveScroll(blockId);
    }

    function moveBlockUp(blockId) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const blocks = state.blockEditor.blocks.sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx <= 0) return;
      [blocks[idx].order, blocks[idx - 1].order] = [blocks[idx - 1].order, blocks[idx].order];
      _renderBlocksPreserveScroll(blockId);
    }

    function moveBlockDown(blockId) {
      if (!state.blockEditor) return;
      syncEditorsToBlocks();
      const blocks = state.blockEditor.blocks.sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx < 0 || idx >= blocks.length - 1) return;
      [blocks[idx].order, blocks[idx + 1].order] = [blocks[idx + 1].order, blocks[idx].order];
      _renderBlocksPreserveScroll(blockId);
    }

    function _renderBlocksPreserveScroll(blockId) {
      if (!state.blockEditor) return;
      const body = state.blockEditor.container.querySelector('.block-editor-body');
      const savedTop = body ? body.scrollTop : 0;
      disposeBlockEditors();
      renderBlockEditorUI(state.blockEditor.container);
      const newBody = state.blockEditor.container.querySelector('.block-editor-body');
      if (newBody && savedTop > 0) newBody.scrollTop = savedTop;
      if (blockId) {
        requestAnimationFrame(() => {
          const el = qs(`#block-wrap-${blockId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            el.classList.add('block-flash');
            setTimeout(() => el.classList.remove('block-flash'), 1200);
          }
        });
      }
    }

    function scrollToBlock(blockId) {
      requestAnimationFrame(() => {
        const el = qs(`#block-wrap-${blockId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('block-flash');
          setTimeout(() => el.classList.remove('block-flash'), 1200);
        }
      });
    }

    function updateBlockTitle(blockId, newTitle) {
      if (!state.blockEditor) return;
      const block = state.blockEditor.blocks.find(b => b.id === blockId);
      if (block) block.title = newTitle.trim();
    }

    function toggleBlockMeta(blockId) {
      const meta = qs(`#block-meta-${blockId}`);
      const btn = qs(`#block-expand-${blockId}`);
      if (!meta) return;
      const collapsed = meta.classList.toggle("collapsed");
      if (btn) btn.classList.toggle("expanded", !collapsed);
      // 描述展开/折叠时隐藏/显示内联描述预览
      const wrap = qs(`#block-wrap-${blockId}`);
      const preview = wrap?.querySelector(".block-desc-preview");
      if (preview) preview.style.display = collapsed ? "" : "none";
    }

    function updateBlockDesc(blockId, newDesc) {
      if (!state.blockEditor) return;
      const block = state.blockEditor.blocks.find(b => b.id === blockId);
      if (block) block.description = newDesc.trim();
    }

    function updateBlockHint(blockId, newHint) {
      if (!state.blockEditor) return;
      const block = state.blockEditor.blocks.find(b => b.id === blockId);
      if (block) block.hint = newHint.replace(/^💡\s*/, "").trim();
    }

    function closePreviewModal() {
      const modal = qs("#modalRoot");
      modal.innerHTML = "";
      modal.classList.add("hidden");
    }

    function cleanupBlockEditor() {
      disposeBlockEditors();
      if (state.blockEditor?.sourceEditor) {
        try { state.blockEditor.sourceEditor.dispose(); } catch (_) {}
      }
      state.blockEditor = null;
    }

    // 注册 window exports
    window.initBlockEditor = initBlockEditor;
    window.saveBlockEditor = saveBlockEditor;
    window.toggleDesignMode = toggleDesignMode;
    window.setBlockViewMode = setBlockViewMode;
    window.addNewBlock = addNewBlock;
    window.insertBlockAt = insertBlockAt;
    window.removeBlock = removeBlock;
    window.toggleBlockLock = toggleBlockLock;
    window.moveBlockUp = moveBlockUp;
    window.moveBlockDown = moveBlockDown;
    window.scrollToBlock = scrollToBlock;
    window.updateBlockTitle = updateBlockTitle;
    window.toggleBlockMeta = toggleBlockMeta;
    window._toggleMoreMenu = function(btn) {
      const menu = btn.nextElementSibling;
      const willShow = menu.classList.contains('hidden');
      document.querySelectorAll('.more-menu:not(.hidden)').forEach(m => m.classList.add('hidden'));
      if (willShow) {
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '9999';
        menu.classList.remove('hidden');
        setTimeout(() => {
          const close = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== btn) {
              menu.classList.add('hidden');
              document.removeEventListener('click', close);
            }
          };
          document.addEventListener('click', close);
        }, 0);
      }
    };
    window.updateBlockDesc = updateBlockDesc;
    window.updateBlockHint = updateBlockHint;
    window.closePreviewModal = closePreviewModal;
    window.cleanupBlockEditor = cleanupBlockEditor;
