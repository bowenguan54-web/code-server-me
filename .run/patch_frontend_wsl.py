from pathlib import Path

p = Path('/home/guan/code-server-me/src/browser/pages/algo-lib.html')
s = p.read_text(encoding='utf-8')

s = s.replace('const funcName = requestedName.endsWith("_copy") ? requestedName : `${requestedName}_copy`;', 'const funcName = requestedName;')

def replace_block(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f'start marker not found: {start_marker}')
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f'end marker not found: {end_marker}')
    return text[:start] + replacement + text[end:]

version_block = '''    function versionUpgradeOptions(current) {
      const [major, minor, patch] = parseVersion(current);
      return [
        { value: current || "1.0.0", type: "keep", label: `保持当前版本 ${current || "1.0.0"}` },
        { value: `${major}.${minor}.${patch + 1}`, type: "patch", label: `补丁版本：${current || "1.0.0"} → ${major}.${minor}.${patch + 1}` },
        { value: `${major}.${minor + 1}.0`, type: "minor", label: `次版本：${current || "1.0.0"} → ${major}.${minor + 1}.0` },
        { value: `${major + 1}.0.0`, type: "major", label: `主版本：${current || "1.0.0"} → ${major + 1}.0.0` }
      ];
    }
'''
s = replace_block(s, '    function versionUpgradeOptions(current) {', '    function safeId(id) {', version_block)

open_block = '''    async function openSubmitModal(id) {
      const item = findAlgorithmInState(id);
      if (!item.id && state.editing?.id === id) Object.assign(item, state.editing.algo || {});
      if (!canSubmitAlgorithm(item) && !(ownsAlgorithm(item) && getStatus(item) === "published" && item.hasReviewDraft)) {
        showToast("只能提交您自己的私有算法");
        return;
      }
      let submitCheck = { hasConflict: false, versionOptions: null };
      try {
        submitCheck = await api(`/api/v1/algorithms/${safeId(id)}/submit-check`);
      } catch (error) {
        showToast(error.message);
        return;
      }
      const currentVer = submitCheck.baseVersion || item.version || "1.0.0";
      const vOpts = submitCheck.versionOptions || versionUpgradeOptions(currentVer);
      const conflictHtml = submitCheck.hasConflict ? `
        <div class="form-row" style="grid-column:1/-1">
          <label>命名空间冲突</label>
          <div class="notice warning" style="margin:0">
            该命名空间已被公有算法占用。若这是对现有公有算法的升级，请选择“作为版本迭代提交”；否则请先返回编辑界面修改命名空间。
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
            <button class="warning" onclick="window.confirmSubmitReview('${esc(id)}', ${submitCheck.hasConflict ? "true" : "false"})">确认提交审核</button>
          </div>
        </div>
      `;
    }

'''
s = replace_block(s, '    function openSubmitModal(id) {', '    async function confirmSubmitReview(id) {', open_block)

confirm_block = '''    async function confirmSubmitReview(id, hasConflict = false) {
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

'''
s = replace_block(s, '    async function confirmSubmitReview(id) {', '    async function viewRejectedDraft(id) {', confirm_block)

approve_block = '''    async function approveReview(id) {
      let draft = null;
      try {
        const data = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        draft = data?.draft || null;
      } catch (error) {
        draft = null;
      }
      const isIteration = draft?.review_kind === "version_iteration";
      const options = isIteration ? versionUpgradeOptions(draft.base_public_version || "1.0.0").filter(o => o.type !== "keep") : [];
      const versionHtml = isIteration ? `
        <div class="form-row">
          <label>公有算法版本迭代</label>
          <div class="notice warning" style="margin:0 0 8px">该提交会覆盖现有公有算法 ${esc(draft.target_public_call_prefix || "")}。请核对代码差异后选择版本号。</div>
          <select id="approveVersionBump">
            ${options.map((o, i) => `<option value="${esc(o.value)}" data-type="${esc(o.type || "")}"${i === 0 ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
      ` : "";
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>审核通过确认</h3>
          <p style="color:var(--text-dim);margin:0 0 16px">确认通过此算法审核？通过后状态变为待发布，可进行正式发布。</p>
          ${versionHtml}
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="success" onclick="window.confirmApproveReview('${esc(id)}')">确认通过</button>
          </div>
        </div>
      `;
    }

    async function confirmApproveReview(id) {
      const versionSelect = qs("#approveVersionBump");
      const body = versionSelect ? {
        version_bump: versionSelect.value,
        version_bump_type: versionSelect.selectedOptions?.[0]?.dataset?.type || "patch"
      } : {};
      closeModal();
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
        showToast("审核已通过");
        if (state.page === "review") await renderReviewPage();
        else { await loadModuleData("components"); renderCards("components"); }
      } catch (error) {
        showToast(error.message);
      }
    }

'''
s = replace_block(s, '    async function approveReview(id) {', '    async function rejectReview(id) {', approve_block)

p.write_text(s, encoding='utf-8')
