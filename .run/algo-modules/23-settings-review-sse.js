/*
 * AlgoLib module: 23-settings-review-sse.js
 * ?????????????SSE?????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function renderSettingsPage() {
      qs("#main").innerHTML = `
        <h1>系统设置</h1>
        <div class="stat-bar">
          <article class="stat-card"><div class="stat-label">服务地址</div><div class="stat-value" style="font-size:14px">${esc(BASE)}</div></article>
          <article class="stat-card"><div class="stat-label">Monaco</div><div class="stat-value" style="font-size:14px">0.45.0</div></article>
          <article class="stat-card"><div class="stat-label">SSE</div><div class="stat-value" style="font-size:14px">${state.sse ? "已启用" : "未连接"}</div></article>
          <article class="stat-card"><div class="stat-label">当前页面</div><div class="stat-value" style="font-size:14px">${esc(pageTitle(state.page))}</div></article>
        </div>
      `;
    }

    async function renderReviewPage(filterStatus) {
      const activeFilter = filterStatus || state.reviewFilter || "all";
      state.reviewFilter = activeFilter;
        qs("#main").innerHTML = `<h1>算法审核</h1><div class="empty">加载审核队列...</div>`;
      try {
        await loadModuleData("components");
        await loadModuleData("templates");
        await loadModuleData("snippets");
        // Fetch historical log
        let logEntries = [];
        try { const r = await api("/api/v1/review-log"); logEntries = r.log || []; } catch (_) {}
        // Active entries from registry
        const liveItems = [...(state.data.components || []), ...(state.data.templates || [])].filter(item => {
          const s = getStatus(item);
          return ["reviewing", "rejected", "approved"].includes(s) || (s === "published" && item.hasReviewDraft);
        });
        // Build merged list: log entries as the source of truth for history
        // For active items, prefer live data
        const liveById = Object.fromEntries(liveItems.map(i => [i.id, i]));
        // Convert log entries to display rows
        const logRows = logEntries.map(e => ({
          ...e,
          _isLog: true,
          _live: liveById[e.algorithm_id] || null,
        }));
        // De-duplicate: if a live item has a matching log entry, use log (which has history context)
        const liveOnlyIds = new Set(liveItems.map(i => i.id).filter(id => !logEntries.some(e => e.algorithm_id === id)));
        const liveOnlyRows = liveItems.filter(i => liveOnlyIds.has(i.id)).map(i => ({
          algorithm_id: i.id, name: i.zhName || i.funcName, call_prefix: i.callPrefix,
          owner_id: i.ownerId, review_kind: i.reviewKind || "", status: getStatus(i),
          submitted_at: "", _live: i, _isLog: false,
        }));
        const snippetRows = (state.data.snippets || []).flatMap(snippet => {
          const status = getStatus(snippet);
          const draft = snippet.review_draft || snippet.reviewDraft || null;
          const rows = [];
          if (["reviewing", "rejected", "approved", "published"].includes(status)) {
            rows.push({
              algorithm_id: snippet.id,
              name: snippet.zh_name || snippet.zhName || snippet.name,
              call_prefix: snippet.name || snippet.id,
              owner_id: snippet.owner_id || snippet.ownerId || "",
              review_kind: "snippet_publish",
              status,
              submitted_at: snippet.updated_at || snippet.updatedAt || "",
              _snippet: snippet,
              _isSnippet: true,
            });
          }
          if (draft && ["pending", "reviewing", "rejected"].includes(draft.status || "")) {
            rows.push({
              algorithm_id: snippet.id,
              name: snippet.zh_name || snippet.zhName || snippet.name,
              call_prefix: snippet.name || snippet.id,
              owner_id: draft.submitter_id || snippet.owner_id || snippet.ownerId || "",
              review_kind: "snippet_edit",
              status: draft.status === "pending" ? "reviewing" : draft.status,
              submitted_at: draft.submitted_at || "",
              reject_reason: draft.reject_reason || "",
              _snippet: snippet,
              _isSnippet: true,
              _draft: draft,
            });
          }
          return rows;
        });
        const allRows = [...logRows, ...liveOnlyRows, ...snippetRows];
        const cntAll = allRows.length;
        const cntReviewing = allRows.filter(r => r.status === "reviewing").length;
        const cntPublished = allRows.filter(r => r.status === "published").length;
        const cntRejected = allRows.filter(r => r.status === "rejected").length;
        const filtered = activeFilter === "all" ? allRows
          : allRows.filter(r => r.status === activeFilter);
        const filterBtn = (key, label, cnt) => `<button class="ghost${activeFilter === key ? " active" : ""}" style="border-radius:20px;padding:4px 14px" onclick="window.renderReviewPage('${key}')">${label}<span class="count" style="margin-left:6px">${cnt}</span></button>`;
        qs("#main").innerHTML = `
          <h1>算法审核</h1>
          <section class="stat-bar">
            <article class="stat-card" style="cursor:pointer" onclick="window.renderReviewPage('reviewing')"><div class="stat-label">审核中</div><div class="stat-value">${cntReviewing}</div></article>
            <article class="stat-card" style="cursor:pointer" onclick="window.renderReviewPage('published')"><div class="stat-label">已通过</div><div class="stat-value">${cntPublished}</div></article>
            <article class="stat-card" style="cursor:pointer" onclick="window.renderReviewPage('rejected')"><div class="stat-label">已驳回</div><div class="stat-value">${cntRejected}</div></article>
          </section>
          <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
            ${filterBtn("all", "全部", cntAll)}
            ${filterBtn("reviewing", "审核中", cntReviewing)}
            ${filterBtn("published", "已通过", cntPublished)}
            ${filterBtn("rejected", "已驳回", cntRejected)}
          </div>
          <table class="api-table">
            <thead><tr><th>算法</th><th>命名空间</th><th style="width:110px;white-space:nowrap">审核状态</th><th style="width:80px">类型</th><th style="width:240px;white-space:nowrap;text-align:center">操作</th></tr></thead>
            <tbody>${filtered.map(row => {
              if (row._isSnippet) {
                const rowStatus = row.status;
                const snippetId = row.algorithm_id || "";
                const kindLabel = row.review_kind === "snippet_edit" ? "片段修改" : "片段发布";
                return `<tr>
                  <td>${esc(row.name || "")}</td>
                  <td><code>${esc(row.call_prefix || "")}</code></td>
                  <td style="white-space:nowrap"><span class="tag ${statusClass(rowStatus)}">${esc(reviewStatusLabel(rowStatus))}</span></td>
                  <td><span class="tag ${row.review_kind === "snippet_edit" ? "warning" : ""}">${esc(kindLabel)}</span></td>
                  <td style="white-space:nowrap;text-align:center">
                    <button onclick="window.showSnippetHistory('${esc(snippetId)}')">修改记录</button>
                    ${row.review_kind === "snippet_edit" && rowStatus === "reviewing" ? `<button class="success" onclick="window.approveSnippetEdit('${esc(snippetId)}')">通过修改</button><button class="danger" onclick="window.rejectSnippetEdit('${esc(snippetId)}')">驳回修改</button>` : ""}
                    ${row.review_kind === "snippet_publish" && rowStatus === "reviewing" ? `<button class="success" onclick="window.publishSnippet('${esc(snippetId)}')">正式发布</button><button class="danger" onclick="window.rejectSnippetReview('${esc(snippetId)}')">驳回</button>` : ""}
                    ${row.reject_reason ? `<span title="${esc(row.reject_reason)}" style="color:var(--danger);font-size:11px;cursor:pointer" onclick="showToast('${esc(row.reject_reason.slice(0,80))}')">⚠ 驳回原因</span>` : ""}
                  </td>
                </tr>`;
              }
              const live = row._live;
              const rowStatus = row.status;
              const kindLabel = row.review_kind === "version_iteration" ? "版本迭代" : (row.review_kind === "new_publish" ? "新建" : "");
              const kindCls = row.review_kind === "version_iteration" ? "warning" : "";
              const ns = live ? getNs(live, live.moduleKind === "template" || live.type === "template" ? "templates" : "components") : (row.call_prefix || row.algorithm_id || "");
              const liveId = live ? live.id : (row.algorithm_id || "");
              const liveKind = live ? (live.moduleKind === "template" || live.type === "template" ? "templates" : "components") : "components";
              return `<tr>
                <td>${esc(row.name || (live ? getName(live) : ""))}</td>
                <td><code>${esc(ns)}</code></td>
                <td style="white-space:nowrap"><span class="tag ${statusClass(rowStatus)}">${esc(reviewStatusLabel(rowStatus))}</span></td>
                <td>${kindLabel ? `<span class="tag ${kindCls}">${esc(kindLabel)}</span>` : ""}</td>
                <td style="white-space:nowrap;text-align:center">
                  ${live ? `<button onclick="window.openEditorById('${esc(liveId)}','${liveKind}',true)">查看/测试</button>` : ""}
                  ${live && rowStatus === "rejected" ? `<button class="ghost" onclick="window.viewRejectReason('${esc(liveId)}')">驳回原因</button><button class="warning" onclick="window.undoRejectReview('${esc(liveId)}')">撤销驳回</button>` : ""}
                  ${live && rowStatus === "reviewing" ? `<button class="success" onclick="window.openAdminPublishModal('${esc(liveId)}')">正式发布</button><button class="danger" onclick="window.rejectReview('${esc(liveId)}')">驳回</button>` : ""}
                  ${row.reject_reason ? `<span title="${esc(row.reject_reason)}" style="color:var(--danger);font-size:11px;cursor:pointer" onclick="showToast('${esc(row.reject_reason.slice(0,80))}')">⚠ 驳回原因</span>` : ""}
                </td>
              </tr>`;
            }).join("")}</tbody>
          </table>
        `;
      } catch (error) {
        qs("#main").innerHTML = `<h1>算法审核</h1><div class="empty">${esc(error.message)}</div>`;
      }
    }

    function closeModal() {
      qs("#modalRoot").classList.add("hidden");
      qs("#modalRoot").innerHTML = "";
    }

    function connectSse() {
      if (state.sse) state.sse.close();
      const conn = qs("#conn");
      conn.textContent = "⚡ 连接中...";
      const source = new EventSource(`${BASE}/api/v1/events/algo-changes`);
      state.sse = source;
      source.onopen = () => { conn.textContent = "● AlgoLib 已连接"; };
      source.onerror = () => {
        conn.textContent = "⚡ 重新连接中...";
        source.close();
        window.setTimeout(connectSse, 3000);
      };
      function handle(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "updated") loadCurrentPage();
          if (data.event === "namespace.changed") updateCardNamespace(data.old || data.old_namespace, data.new || data.new_namespace);
        } catch (error) {
          loadCurrentPage();
        }
      }
      source.addEventListener("updated", handle);
      source.addEventListener("namespace.changed", handle);
      source.addEventListener("algorithm_published", handle);
      source.addEventListener("submission_rejected", handle);
      source.addEventListener("submission_created", () => {
        if (state.currentUser && state.currentUser.role === "admin") loadCurrentPage();
      });
      source.onmessage = handle;
    }

    async function loadCurrentPage() {
      try {
        // 如果我的算法编辑器打开中，跳过 SSE 刷新，避免销毁未保存内容
        if (qs("#myeditor-code")) return;
        const parentP = parentPageOf(state.page);
        if (["components", "templates", "snippets", "my-algos"].includes(parentP)) {
          await loadModuleData(state.page);
          renderNav();
          hydrateFilters(state.page);
          restoreListViewState(state.page);
          renderCards(state.page);
        }
        await registerCompletionProvider();
      } catch (_err) {
        // 后台刷新失败时静默忽略，避免干扰用户操作
      }
    }

    function updateCardNamespace(oldNs, newNs) {
      qsa(".card-ns").forEach(el => {
        if (el.textContent.trim() === oldNs) el.textContent = newNs;
      });
      if (state.editing?.algo?.callPrefix === oldNs && qs("#nsInput")) qs("#nsInput").value = newNs;
      registerCompletionProvider();
    }
