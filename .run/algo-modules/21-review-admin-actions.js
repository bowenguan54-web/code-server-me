/*
 * AlgoLib module: 21-review-admin-actions.js
 * ?????????????????????????? API ???
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    async function withdrawReview(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/withdraw`, { method: "POST" });
        showToast("已撤回审核");
        await loadModuleData("components");
        renderCards("components");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function approveReview(id) {
      let draft = null;
      let publicFiles = [];
      try {
        const data = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        draft = data?.draft || null;
      } catch (error) {
        draft = null;
      }
      const isIteration = draft?.review_kind === "version_iteration";
      const baseVer = draft?.base_public_version || "1.0.0";

      // Version options for version_iteration: patch/minor/major only (no "keep")
      const bumpV = (ver, type) => {
        const [ma, mi, pa] = parseVersion(ver);
        if (type === "major") return `${ma + 1}.0.0`;
        if (type === "minor") return `${ma}.${mi + 1}.0`;
        return `${ma}.${mi}.${pa + 1}`;
      };
      const options = isIteration ? [
        { type: "patch", value: bumpV(baseVer, "patch"), label: `补丁版本：${baseVer} → ${bumpV(baseVer, "patch")}` },
        { type: "minor", value: bumpV(baseVer, "minor"), label: `次版本：${baseVer} → ${bumpV(baseVer, "minor")}` },
        { type: "major", value: bumpV(baseVer, "major"), label: `主版本：${baseVer} → ${bumpV(baseVer, "major")}` },
      ] : [];

      // Load public algorithm files for side-by-side comparison
      if (isIteration && draft.target_public_id) {
        try {
          const src = await api(`/api/v1/algorithm-source/${safeId(draft.target_public_id)}`);
          publicFiles = src.folder_files || [];
        } catch (_) { /* ignore */ }
      }

      // Build diff HTML
      let diffHtml = "";
      if (isIteration) {
        const draftFiles = draft.files || [];
        const entryPublic = publicFiles.find(f => f.is_entry) || publicFiles[0];
        const entryDraft = draftFiles.find(f => f.filename === entryPublic?.filename) || draftFiles[0];
        if (entryPublic || entryDraft) {
          diffHtml = `
            <div class="form-row" style="grid-column:1/-1">
              <label>代码对比 <span style="color:var(--text-dim);font-size:12px">左：当前公有版本 v${esc(baseVer)} &nbsp;|&nbsp; 右：新提交版本</span></label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:340px">
                <div>
                  <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${esc((entryPublic?.relative_path || entryPublic?.filename) || "(无)")}</div>
                  <pre style="margin:0;padding:10px;background:var(--bg-deep);border-radius:6px;font-size:11px;overflow:auto;max-height:310px;border:1px solid var(--line)">${esc(entryPublic?.content || "（无文件）")}</pre>
                </div>
                <div>
                  <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${esc((entryDraft?.relative_path || entryDraft?.filename) || "(无)")}</div>
                  <pre style="margin:0;padding:10px;background:var(--bg-deep);border-radius:6px;font-size:11px;overflow:auto;max-height:310px;border:1px solid rgba(88,166,255,.5)">${esc(entryDraft?.content || "（无文件）")}</pre>
                </div>
              </div>
            </div>`;
        }
      }

      const versionHtml = isIteration ? `
        <div class="form-row" style="grid-column:1/-1">
          <label>目标公有算法 <span style="color:var(--text-dim);font-size:12px">${esc(draft.target_public_call_prefix || "")}</span></label>
          <div class="notice warning" style="margin:0 0 8px">该提交将覆盖现有公有算法的代码，请核对无误后选择版本号并通过。</div>
          <select id="approveVersionBump" style="width:100%;min-width:260px">
            ${options.map((o, i) => `<option value="${esc(o.value)}" data-type="${esc(o.type)}"${i === 0 ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
      ` : "";

      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:${isIteration ? "900px" : "480px"}">
          <h3>审核通过确认</h3>
          <p style="color:var(--text-dim);margin:0 0 12px">确认通过审核？通过后将自动发布，无需再手动正式发布。</p>
          <div class="form-grid">
            ${diffHtml}
            ${versionHtml}
          </div>
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
        const result = await api(`/api/v1/algorithms/${safeId(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
        showToast(result?.autoPublished ? "审核已通过并自动发布" : "审核已通过");
        if (state.page === "review") await renderReviewPage();
        else { await loadModuleData("components"); renderCards("components"); }
      } catch (error) {
        showToast(error.message);
      }
    }

    async function rejectReview(id) {
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>驳回审核</h3>
          <div class="form-grid">
            <div class="form-row"><label>驳回原因</label><textarea id="rrReason" rows="4" placeholder="请说明驳回原因（将展示给算法作者）"></textarea></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="danger" onclick="window.confirmRejectReview('${esc(id)}')">确认驳回</button>
          </div>
        </div>
      `;
    }

    async function confirmRejectReview(id) {
      const reason = qs("#rrReason")?.value.trim() || "";
      if (!reason) { showToast("请填写驳回原因"); return; }
      closeModal();
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
        showToast("已驳回，原因已记录");
        if (state.page === "review") await renderReviewPage();
        else { await loadModuleData("components"); renderCards("components"); }
      } catch (error) {
        showToast(error.message);
      }
    }

    async function publishComponent(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/publish`, { method: "POST" });
        showToast("已正式发布");
        await loadModuleData("components");
        if (state.page === "components") renderCards("components");
        else if (state.page === "review") renderReviewPage();
      } catch (error) {
        showToast(error.message);
      }
    }

    async function deprecateComponent(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/deprecate`, { method: "POST" });
        showToast("已下架");
        await loadModuleData("components");
        renderCards("components");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function showVersions(id) {
      try {
        const data = await api(`/api/v1/algorithms/${safeId(id)}/versions`);
        qs("#modalRoot").classList.remove("hidden");
        qs("#modalRoot").innerHTML = `
          <div class="modal">
            <h3>版本历史</h3>
            <div class="toolbar">
              <select id="versionReason"><option value="代码保存">代码保存</option><option value="审核提交">审核提交</option><option value="发布备份">发布备份</option><option value="回滚备份">回滚备份</option></select>
              <button class="primary" onclick="window.snapshotVersion('${esc(id)}')">创建快照</button>
            </div>
            <div class="output">
              <table class="api-table">
                <thead><tr><th>版本</th><th>动作</th><th>时间</th><th>备注</th><th>文件</th></tr></thead>
                <tbody>${(data.versions || []).slice().reverse().map(item => `
                  <tr>
                    <td>${esc(item.version_id)}</td>
                    <td>${esc(item.action)}</td>
                    <td>${esc(item.timestamp)}</td>
                    <td>${esc(item.note || "")}</td>
                    <td>${esc((item.files || []).map(file => file.relative_path).join(", "))}</td>
                  </tr>
                `).join("") || '<tr><td colspan="5">暂无版本</td></tr>'}</tbody>
              </table>
            </div>
            <div class="modal-actions"><button onclick="window.closeModal()">关闭</button></div>
          </div>
        `;
      } catch (error) {
        showToast(error.message);
      }
    }

    async function snapshotVersion(id) {
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/versions/snapshot`, {
          method: "POST",
          body: JSON.stringify({ note: qs("#versionReason")?.value || "代码保存" })
        });
        showToast("版本快照已创建");
        showVersions(id);
      } catch (error) {
        showToast(error.message);
      }
    }

    async function deleteAlgorithm(id) {
      const item = (state.data[state.page] || []).find(entry => entry.id === id);
      const label = item ? getName(item) : id;
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>确认删除</h3>
          <p class="desc">即将永久删除算法文件 <strong>${esc(label)}</strong>，此操作不可恢复。</p>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="danger" onclick="window._confirmDeleteAlgorithm('${esc(id)}')">确认删除</button>
          </div>
        </div>
      `;
    }

    window._confirmDeleteAlgorithm = async function(id) {
      closeModal();
      try {
        await api(`/api/v1/algorithms/${safeId(id)}`, { method: "DELETE" });
        showToast("算法已删除");
        await loadModuleData(state.page);
        renderCards(state.page);
      } catch (error) {
        showToast(error.message);
      }
    };

    async function showApiDoc(id) {
      const item = (state.data.components || []).find(entry => entry.id === id);
      if (!item) return;
      const call = item.callPrefix || item.displayNamespace;
      if (!call) return;
      try {
        const data = await api(`/api/v1/invoke/docs/${encodeURIComponent(call)}`);
        const doc = data.primary || {};
        qs("#modalRoot").classList.remove("hidden");
        qs("#modalRoot").innerHTML = `
          <div class="modal">
            <h3>API 文档</h3>
            <div class="output">
              <table class="kv-table">
                <tbody>
                  <tr><th>调用名</th><td>${esc(doc.id || call)}</td></tr>
                  <tr><th>内部接口</th><td><code>${esc(doc.api_path || "")}</code></td></tr>
                  <tr><th>外部接口</th><td><code>/api/external/v1/${esc(doc.namespace || "")}/${esc(doc.func_name || "")}</code></td></tr>
                  <tr><th>描述</th><td>${esc(doc.description || "")}</td></tr>
                  <tr><th>参数</th><td><pre>${esc(JSON.stringify(doc.params || [], null, 2))}</pre></td></tr>
                </tbody>
              </table>
              <h4>Python 示例</h4>
              <pre>${esc(doc.examples?.python || "")}</pre>
              <h4>HTTP 示例</h4>
              <pre>${esc(doc.examples?.http || "")}</pre>
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
