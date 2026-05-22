/*
 * AlgoLib module: 20-review-submit.js
 * 提交审核、驳回记录查看与撤销相关交互。
 * 从 .run/algo-lib-check.js 拆分，保持全局函数调用方式。
 */

    async function submitReview(id) { return openSubmitModal(id); }

    function findAlgorithmInState(id) {
      return [...(state.data.components || []), ...(state.data.templates || []), ...(state.data["my-algos"] || [])].find(a => a.id === id) || {};
    }

    async function openSubmitModal(id) {
      const item = findAlgorithmInState(id);
      if (!item.id && state.editing?.id === id) Object.assign(item, state.editing.algo || {});
      if (!canSubmitAlgorithm(item)) {
        showToast("只能提交您自己的私有草稿或被驳回算法");
        return;
      }
      let submitCheck = { hasConflict: false, versionOptions: null };
      try {
        submitCheck = await api(`/api/v1/algorithms/${safeId(id)}/submit-check`);
      } catch (error) {
        showToast(error.message);
        return;
      }
      const isLinkedIteration = !!(item.targetPublicId || item.targetPublicCallPrefix || submitCheck.isVersionIteration);
      const currentVer = submitCheck.baseVersion || item.version || "1.0.0";
      const vOpts = submitCheck.versionOptions || versionUpgradeOptions(currentVer);
      const conflictHtml = submitCheck.hasConflict || isLinkedIteration ? `
        <div class="form-row" style="grid-column:1/-1">
          <label>${isLinkedIteration ? "版本迭代" : "命名空间冲突"}</label>
          <div class="notice warning" style="margin:0">
            ${isLinkedIteration
              ? `这是对现有公有算法 ${esc(item.targetPublicCallPrefix || submitCheck.publicAlgorithm?.callPrefix || "")} 的版本迭代提交。`
              : "该命名空间已被公有算法占用。若这是对现有公有算法的升级，请选择“作为版本迭代提交”；否则请先返回编辑界面修改命名空间。"}
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input id="srIsVersionIteration" type="checkbox" checked />
            作为版本迭代提交给管理员审核
          </label>
        </div>
      ` : `<input id="srIsVersionIteration" type="hidden" value="" />`;
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>提交审核</h3>
          <div class="form-grid">
            ${conflictHtml}
            <div class="form-row"><label>版本迭代方式</label>
              <select id="srVersionBump">
                ${vOpts.map((o, i) => `<option value="${esc(o.value)}" data-type="${esc(o.type || "")}"${i === 0 ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row"><label>中文名称 <span style="color:var(--text-dim);font-size:12px">（可留空保持不变）</span></label><input id="srZhName" value="${esc(item.zhName || "")}" /></div>
            <div class="form-row"><label>描述 <span style="color:var(--text-dim);font-size:12px">（可留空保持不变）</span></label><textarea id="srDesc" rows="3">${esc(item.zhDescription || "")}</textarea></div>
            <div class="form-row"><label>标签 <span style="color:var(--text-dim);font-size:12px">（逗号分隔，可留空）</span></label><input id="srTags" value="${esc((item.zhTags || []).join(","))}" /></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="warning" onclick="window.confirmSubmitReview('${esc(id)}', ${submitCheck.hasConflict || isLinkedIteration ? "true" : "false"})">确认提交审核</button>
          </div>
        </div>
      `;
    }

    async function confirmSubmitReview(id, hasConflict = false) {
      const versionSelect = qs("#srVersionBump");
      const version = versionSelect?.value || "";
      const versionType = versionSelect?.selectedOptions?.[0]?.dataset?.type || "patch";
      const isVersionIteration = hasConflict ? !!qs("#srIsVersionIteration")?.checked : false;
      if (hasConflict && !isVersionIteration) {
        showToast("该命名空间已被公有算法占用。若不是版本迭代，请先修改命名空间。");
        return;
      }
      const zhName = qs("#srZhName")?.value.trim() || "";
      const desc = qs("#srDesc")?.value.trim() || "";
      const tagsRaw = qs("#srTags")?.value || "";
      const tags = tagsRaw.split(",").map(s => s.trim()).filter(Boolean);
      closeModal();
      try {
        const item = findAlgorithmInState(id);
        const patch = {};
        if (version && version !== (item.version || "1.0.0")) patch.version = version;
        if (zhName && zhName !== (item.zhName || "")) patch.zh_name = zhName;
        if (desc && desc !== (item.zhDescription || "")) patch.zh_description = desc;
        if (tagsRaw && JSON.stringify(tags) !== JSON.stringify(item.zhTags || [])) patch.zh_tags = tags;
        if (Object.keys(patch).length) {
          await api(`/api/v1/algorithms/${safeId(id)}/metadata`, { method: "PATCH", body: JSON.stringify(patch) });
        }
        await api(`/api/v1/algorithms/${safeId(id)}/submit`, {
          method: "POST",
          body: JSON.stringify({ version_bump: version, version_bump_type: versionType, is_version_iteration: isVersionIteration })
        });
        showToast("已提交审核");
        const targetPage = state.editing?.page || (state.page === "templates" ? "templates" : (state.page === "my-algos" ? "my-algos" : "components"));
        await loadModuleData(targetPage);
        if (state.editing && state.editing.id === id) {
          const updated = findAlgorithmInState(id);
          if (updated) state.editing.algo = { ...state.editing.algo, ...updated };
          refreshEditorStatusButtons();
        } else if (state.page === "review") {
          await renderReviewPage();
        } else {
          renderCards(targetPage);
        }
      } catch (error) {
        showToast(error.message);
      }
    }

    async function viewRejectedDraft(id) {
      try {
        const result = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        if (!result.exists || !result.draft) { showToast("暂无驳回记录"); return; }
        const draft = result.draft;
        const files = draft.files || [];
        const reasonText = draft.reject_reason || "（未填写驳回原因）";
        const reasonHtml = `<div style="background:var(--danger-subtle,rgba(220,50,47,.1));border:1px solid var(--danger);border-radius:6px;padding:12px 16px;margin-bottom:14px"><strong style="color:var(--danger)">驳回原因</strong><p style="margin:6px 0 0;white-space:pre-wrap">${esc(reasonText)}</p></div>`;
        const filesHtml = files.map(f => `<div style="margin-top:12px"><strong>${esc(f.relative_path || f.filename)}</strong><pre style="max-height:240px;overflow:auto;background:var(--bg-deep);padding:10px;border-radius:6px;margin:4px 0 0;font-size:12px">${esc(f.content)}</pre></div>`).join("");
        qs("#modalRoot").classList.remove("hidden");
        qs("#modalRoot").innerHTML = `
          <div class="modal" style="max-width:760px">
            <h3>被驳回的提交内容</h3>
            ${reasonHtml}
            ${filesHtml || "<p>无文件记录</p>"}
            <div class="modal-actions">
              <button onclick="window.closeModal()">关闭</button>
              <button class="ghost" onclick="window.discardRejectedDraft('${esc(id)}');window.closeModal()">放弃修改，恢复原状态</button>
            </div>
          </div>
        `;
      } catch (error) {
        showToast(error.message);
      }
    }

    async function viewRejectReason(id) {
      try {
        const result = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        const draft = result.draft || {};
        const reasonText = draft.reject_reason || "（未填写驳回原因）";
        qs("#modalRoot").classList.remove("hidden");
        qs("#modalRoot").innerHTML = `
          <div class="modal">
            <h3>驳回原因</h3>
            <div style="background:var(--danger-subtle,rgba(220,50,47,.1));border:1px solid var(--danger);border-radius:6px;padding:12px 16px">
              <p style="margin:0;white-space:pre-wrap">${esc(reasonText)}</p>
            </div>
            <div class="modal-actions">
              <button onclick="window.closeModal()">关闭</button>
            </div>
          </div>
        `;
      } catch (error) {
        showToast(error.message);
      }
    }

    async function undoRejectReview(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/re-review`, { method: "POST" });
        showToast("已撤销驳回，算法重新进入审核队列");
        await renderReviewPage();
      } catch (error) {
        showToast(error.message);
      }
    }

    async function discardRejectedDraft(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/review-draft`, { method: "DELETE" });
        showToast("已放弃修改，状态已恢复");
        await loadModuleData("components");
        renderCards("components");
      } catch (error) {
        showToast(error.message);
      }
    }
