/*
 * AlgoLib module: 21-review-admin-actions.js
 * 审核、发布、版本历史和 API 文档等管理员操作。
 * 从 .run/algo-lib-check.js 拆分，保持全局函数调用方式。
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
      let submitCheck = null;
      try {
        const data = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        draft = data?.draft || null;
      } catch (error) {
        draft = null;
      }
      try {
        submitCheck = await api(`/api/v1/algorithms/${safeId(id)}/submit-check`);
      } catch (error) {
        submitCheck = null;
      }

      const draftKind = draft?.review_kind || "new_publish";
      const isIteration = draftKind === "version_iteration" || !!submitCheck?.isVersionIteration;
      const publicAlgorithm = submitCheck?.publicAlgorithm || null;
      const hasNewPublishConflict = !!(submitCheck?.hasConflict && !submitCheck?.isVersionIteration);
      const baseVer = submitCheck?.baseVersion || draft?.base_public_version || publicAlgorithm?.version || "1.0.0";

      const bumpV = (ver, type) => {
        const [ma, mi, pa] = parseVersion(ver || "1.0.0");
        if (type === "major") return `${ma + 1}.0.0`;
        if (type === "minor") return `${ma}.${mi + 1}.0`;
        return `${ma}.${mi}.${pa + 1}`;
      };
      const versionOptions = (submitCheck?.versionOptions && submitCheck.versionOptions.length)
        ? submitCheck.versionOptions
        : [
          { type: "patch", value: bumpV(baseVer, "patch"), label: `\u8865\u4e01\u7248\u672c\uff1a${baseVer} \u2192 ${bumpV(baseVer, "patch")}` },
          { type: "minor", value: bumpV(baseVer, "minor"), label: `\u6b21\u7248\u672c\uff1a${baseVer} \u2192 ${bumpV(baseVer, "minor")}` },
          { type: "major", value: bumpV(baseVer, "major"), label: `\u4e3b\u7248\u672c\uff1a${baseVer} \u2192 ${bumpV(baseVer, "major")}` },
        ];

      if (isIteration && (draft?.target_public_id || publicAlgorithm?.id)) {
        try {
          const targetId = draft?.target_public_id || publicAlgorithm?.id;
          const src = await api(`/api/v1/algorithm-source/${safeId(targetId)}`);
          publicFiles = src.folder_files || [];
        } catch (_) { /* ignore */ }
      }

      let diffHtml = "";
      if (isIteration) {
        const draftFiles = draft?.files || [];
        const entryPublic = publicFiles.find(f => f.is_entry) || publicFiles[0];
        const entryDraft = draftFiles.find(f => f.filename === entryPublic?.filename) || draftFiles[0];
        if (entryPublic || entryDraft) {
          diffHtml = `
            <div class="form-row" style="grid-column:1/-1">
              <label>\u4ee3\u7801\u5bf9\u6bd4 <span style="color:var(--text-dim);font-size:12px">\u5de6\uff1a\u5f53\u524d\u516c\u6709\u7248\u672c v${esc(baseVer)} &nbsp;|&nbsp; \u53f3\uff1a\u65b0\u63d0\u4ea4\u7248\u672c</span></label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:340px">
                <div>
                  <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${esc((entryPublic?.relative_path || entryPublic?.filename) || "\uff08\u65e0\uff09")}</div>
                  <pre style="margin:0;padding:10px;background:var(--bg-deep);border-radius:6px;font-size:11px;overflow:auto;max-height:310px;border:1px solid var(--line)">${esc(entryPublic?.content || "\uff08\u65e0\u6587\u4ef6\uff09")}</pre>
                </div>
                <div>
                  <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${esc((entryDraft?.relative_path || entryDraft?.filename) || "\uff08\u65e0\uff09")}</div>
                  <pre style="margin:0;padding:10px;background:var(--bg-deep);border-radius:6px;font-size:11px;overflow:auto;max-height:310px;border:1px solid rgba(88,166,255,.5)">${esc(entryDraft?.content || "\uff08\u65e0\u6587\u4ef6\uff09")}</pre>
                </div>
              </div>
            </div>`;
        }
      }

      const kindHtml = `
        <div class="form-row" style="grid-column:1/-1">
          <label>\u5ba1\u6838\u7c7b\u578b</label>
          <div class="notice ${isIteration ? "warning" : ""}" style="margin:0">
            ${isIteration
              ? `\u7248\u672c\u8fed\u4ee3\uff1a\u8be5\u63d0\u4ea4\u5c06\u66f4\u65b0\u73b0\u6709\u516c\u6709\u7b97\u6cd5 ${esc(draft?.target_public_call_prefix || publicAlgorithm?.callPrefix || publicAlgorithm?.displayNamespace || "")}`
              : "\u65b0\u5efa\u53d1\u5e03\uff1a\u8be5\u63d0\u4ea4\u901a\u8fc7\u540e\u5c06\u53d1\u5e03\u4e3a\u65b0\u7684\u516c\u6709\u7b97\u6cd5"}
          </div>
        </div>`;

      const conflictHtml = hasNewPublishConflict ? `
        <div class="form-row" style="grid-column:1/-1">
          <div class="notice danger" style="margin:0">
            \u5df2\u5b58\u5728\u540c\u540d\u516c\u6709\u7b97\u6cd5 ${esc(publicAlgorithm?.callPrefix || publicAlgorithm?.displayNamespace || publicAlgorithm?.id || "")}\uff0c\u5f53\u524d\u63d0\u4ea4\u4e0d\u80fd\u4f5c\u4e3a\u65b0\u7b97\u6cd5\u53d1\u5e03\u3002\u8bf7\u9a73\u56de\u5e76\u8981\u6c42\u63d0\u4ea4\u8005\u4fee\u6539\u547d\u540d\u7a7a\u95f4\uff0c\u6216\u91cd\u65b0\u63d0\u4ea4\u4e3a\u7248\u672c\u8fed\u4ee3\u3002
          </div>
        </div>` : "";

      const versionHtml = isIteration ? `
        <div class="form-row" style="grid-column:1/-1">
          <label>\u76ee\u6807\u7248\u672c</label>
          <select id="approveVersionBump" style="width:100%;min-width:260px">
            ${versionOptions.map((o, i) => `<option value="${esc(o.value)}" data-type="${esc(o.type)}"${i === 0 ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
      ` : `
        <div class="form-row" style="grid-column:1/-1">
          <label>\u53d1\u5e03\u7248\u672c</label>
          <input id="approveVersionBump" data-type="patch" value="${esc(draft?.metadata?.version || "1.0.0")}" placeholder="1.0.0" style="width:100%" />
        </div>
      `;

      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:${isIteration ? "900px" : "560px"}">
          <h3>\u5ba1\u6838\u901a\u8fc7\u786e\u8ba4</h3>
          <p style="color:var(--text-dim);margin:0 0 12px">\u786e\u8ba4\u901a\u8fc7\u5ba1\u6838\uff1f\u901a\u8fc7\u540e\u5c06\u81ea\u52a8\u53d1\u5e03\uff0c\u65e0\u9700\u518d\u624b\u52a8\u6b63\u5f0f\u53d1\u5e03\u3002</p>
          <div class="form-grid">
            ${kindHtml}
            ${conflictHtml}
            ${diffHtml}
            ${versionHtml}
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">\u53d6\u6d88</button>
            <button class="success" ${hasNewPublishConflict ? "disabled" : ""} onclick="window.confirmApproveReview('${esc(id)}')">\u786e\u8ba4\u901a\u8fc7</button>
          </div>
        </div>
      `;
    }

    async function confirmApproveReview(id) {
      const versionSelect = qs("#approveVersionBump");
      const selected = versionSelect?.selectedOptions?.[0];
      const body = {
        version_bump: versionSelect?.value || "",
        version_bump_type: selected?.dataset?.type || versionSelect?.dataset?.type || "patch",
        reason: "\u5ba1\u6838\u901a\u8fc7"
      };
      closeModal();
      try {
        const result = await api(`/api/v1/algorithms/${safeId(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
        showToast(result?.autoPublished ? "\u5ba1\u6838\u5df2\u901a\u8fc7\u5e76\u81ea\u52a8\u53d1\u5e03" : "\u5ba1\u6838\u5df2\u901a\u8fc7");
        await loadModuleData("components");
        if (state.page === "review") await renderReviewPage();
        else if (state.page === "components" || state.page === "templates") renderCards(state.page);
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
                <thead><tr><th>版本</th><th>动作</th><th>贡献人</th><th>时间</th><th>备注</th><th>文件</th></tr></thead>
                <tbody>${(data.versions || []).slice().reverse().map(item => `
                  <tr>
                    <td>${esc(item.version_id)}</td>
                    <td>${esc(item.action)}</td>
                    <td>${esc(item.operator_name || item.operator || "")}</td>
                    <td>${esc(item.timestamp)}</td>
                    <td>${esc(item.note || "")}</td>
                    <td>${esc((item.files || []).map(file => file.relative_path).join(", "))}</td>
                  </tr>
                `).join("") || '<tr><td colspan="6">暂无版本</td></tr>'}</tbody>
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
