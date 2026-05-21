/*
 * AlgoLib module: 06-cards-list.js
 * ????????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function renderStats(page, items) {
      const categoryCount = new Set(items.map(item => groupKey(item, page))).size;
      const todayCount = items.filter(item => {
        const time = item.updated_at || item.created_at || item.updatedAt || "";
        return String(time).slice(0, 10) === new Date().toISOString().slice(0, 10);
      }).length;
      if (page === "components" || page === "my-algos" || page.startsWith("components-")) {
        const publishedCount = items.filter(item => getStatus(item) === "published").length;
        const reviewingCount = items.filter(item => getStatus(item) === "reviewing").length;
        const draftCount = items.filter(item => getStatus(item) === "draft").length;
        const statLabel = page === "my-algos" ? "我的算法总数" : "算法总数";
        qs("#stats").innerHTML = [
          `<article class="stat-card accent-info"><div class="stat-label">${statLabel}</div><div class="stat-value">${items.length}</div><div class="stat-desc">${categoryCount} 个分类 · 今日更新 ${todayCount}</div></article>`,
          `<article class="stat-card accent-success"><div class="stat-label">公有</div><div class="stat-value">${publishedCount}</div><div class="stat-desc">私有 ${draftCount} 个</div></article>`,
          `<article class="stat-card${reviewingCount > 0 ? " accent-warning" : ""}"><div class="stat-label">待审核</div><div class="stat-value${reviewingCount > 0 ? " accent-warning" : ""}">${reviewingCount}</div><div class="stat-desc">等待审核中</div></article>`,
          ...(page === "components" || page.startsWith("components-") ? [
            `<article class="stat-card"><div class="stat-label">公共组件</div><div class="stat-value">${items.filter(item => (item.ownerId || "system") === "system").length}</div><div class="stat-desc">所有账号可见</div></article>`,
          ] : []),
        ].join("");
        // 渲染审核 banner（仅 components 页）
        if (page === "components" || page.startsWith("components-")) {
        let banner = qs("#reviewBanner");
        if (!banner) {
          banner = document.createElement("div");
          banner.id = "reviewBanner";
          qs("#stats").insertAdjacentElement("afterend", banner);
        }
        banner.innerHTML = reviewingCount > 0
          ? `<div class="review-banner">⚠ 有 ${reviewingCount} 个算法正在等待审核，请及时处理。<span class="spacer"></span><a onclick="window.setQuickFilter('reviewing','${page}')">查看审核中</a></div>`
          : "";
        } // end if (page === "components")
      } else {
        const languageCount = new Set(items.map(item => item.language || "python")).size;
        const fourthLabel = page === "snippets" ? "公有片段" : "可发布";
        const fourthValue = page === "snippets"
          ? items.filter(item => isPublicItem(item)).length
          : items.length;
        qs("#stats").innerHTML = [
          ["总数", items.length],
          ["分类数", categoryCount],
          ["今日更新", todayCount],
          [fourthLabel, fourthValue || languageCount]
        ].map(([label, value]) => `<article class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></article>`).join("");
      }
    }

    function renderCards(page) {
      const items = filteredItems(page);
      renderStats(page, items);
      const groups = items.reduce((acc, item) => {
        const key = groupKey(item, page);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});
      // 仅在查看全部分类时补入空分类（筛选了某个分类时不显示空分类）
      const selectedCategory = qs("#filterCategory")?.value || "";
      if (!selectedCategory) {
        (state.categories[page] || []).forEach(cat => {
          if (!(cat.namespace in groups)) groups[cat.namespace] = [];
        });
      }
      const groupKeys = Object.keys(groups).filter(key => !selectedCategory || groups[key].length > 0).sort();
      qs("#list").innerHTML = groupKeys.map(key => `
        <section class="folder-section">
          <div class="folder-head">
            <button class="ghost folder-toggle" onclick="window.toggleFolder(this)">▾</button>
            <h3>${esc(categoryLabel(key, page))}</h3>
            <span class="count">${groups[key].length}</span>
            <span class="spacer"></span>
            ${(state.currentUser?.role === "admin" || page === "my-algos") ? `<button class="ghost" onclick="window.editCategory('${esc(key)}','${esc(page)}')">编辑分类</button>` : ""}
            ${(state.currentUser?.role === "admin" || page === "my-algos") ? `<button class="ghost" onclick="window.createSubcategory('${esc(key)}','${esc(page)}')">新建子分类</button>` : ""}
            ${(state.currentUser?.role === "admin" || page === "my-algos") ? `<button class="ghost danger" onclick="window.deleteCategory('${esc(key)}','${esc(page)}')">删除分类</button>` : ""}
          </div>
          <div class="folder-body">${groups[key].map(item => renderCard(item, page)).join("")}</div>
        </section>
      `).join("") || '<div class="empty">暂无数据</div>';
      if (state.pendingScrollRestore === page) {
        state.pendingScrollRestore = "";
        restoreMainScroll(page);
      }
    }

    function renderCard(item, page) {
      const kind = (page === "templates" || page.startsWith("templates-")) ? "template" : page === "snippets" ? "snippet" : "";
      const status = getStatus(item);
      const id = item.id;
      const isAdmin = state.currentUser?.role === "admin";
      const isOwner = ownsAlgorithm(item);
      const canManage = canManageAlgorithm(item);
      const privacyText = privacyLabel(item);
      const privacyClass = isPublicItem(item) ? "success" : "warning";
      const isMyAlgosPage = page === "my-algos";
      const effectivePage = isMyAlgosPage ? "components" : page.startsWith("components-") ? "components" : page.startsWith("templates-") ? "templates" : page;
      const reviewStatusVisible = ["reviewing", "rejected", "approved"].includes(status);
      let btns = [];
      if (effectivePage === "components") {
        if (status === "published" && !isAdmin) btns.push(`<button onclick="window.openEditorById('${esc(id)}','${esc(page)}')">编辑</button>`);
        else if (canManage) btns.push(`<button onclick="window.openEditorById('${esc(id)}','${esc(page)}')">编辑</button>`);
        else if (state.currentUser) btns.push(`<button onclick="window.openEditorById('${esc(id)}','components')">编辑</button>`);
        if (state.currentUser) btns.push(`<button onclick="window.openComponentTestModalById('${esc(id)}','${esc(page)}')">测试</button>`);
        if (canManage) btns.push(`<button onclick="window.editAlgorithmInfo('${esc(id)}','${esc(page)}')">基本信息</button>`);
        btns.push(`<button onclick="window.showApiDoc('${esc(id)}')">查看 API 文档</button>`);
        if (canManage && status === "rejected") {
          btns.push(`<button class="ghost" onclick="window.viewRejectedDraft('${esc(id)}')">查看驳回内容</button>`);
          btns.push(`<button onclick="window.discardRejectedDraft('${esc(id)}')">放弃修改</button>`);
        }
        if (isAdmin && !isPublicItem(item)) {
          btns.push(`<button class="success" onclick="window.openAdminPublishModal('${esc(id)}')" >正式发布</button>`);
        } else if (canSubmitAlgorithm(item)) {
          btns.push(`<button class="warning" onclick="window.openSubmitModal('${esc(id)}')" >${status === "rejected" ? "重新提交" : "提交审核"}</button>`);
        }
        if (!isAdmin && isOwner && status === "reviewing") btns.push(`<button onclick="window.withdrawReview('${esc(id)}')">撤回</button>`);
        if (isAdmin || (canManage && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
      } else if (effectivePage === "templates") {
        if (status === "published" && !isAdmin) btns.push(`<button onclick="window.openEditorById('${esc(id)}','templates')">编辑</button>`);
        else if (canManage) btns.push(`<button onclick="window.openEditorById('${esc(id)}','templates')">编辑</button>`);
        else if (state.currentUser) btns.push(`<button onclick="window.openEditorById('${esc(id)}','templates')">编辑</button>`);
        if (canManage) btns.push(`<button onclick="window.editAlgorithmInfo('${esc(id)}','templates')">基本信息</button>`);
        btns.push(`<button onclick="window.showTemplateUsage('${esc(id)}')">使用说明</button>`);
        btns.push(`<button class="primary" onclick="window.publishAsComponent('${esc(id)}',this)">基于模板新建组件</button>`);
        if (isAdmin && !isPublicItem(item)) {
          btns.push(`<button class="success" onclick="window.openAdminPublishModal('${esc(id)}')">正式发布</button>`);
        } else if (canSubmitAlgorithm(item)) {
          btns.push(`<button class="warning" onclick="window.openSubmitModal('${esc(id)}')">${status === "rejected" ? "重新提交" : "提交审核"}</button>`);
        }
        if (!isAdmin && isOwner && status === "reviewing") btns.push(`<button onclick="window.withdrawReview('${esc(id)}')">撤回</button>`);
        if (isAdmin || (canManage && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
      } else {
        const draft = item.review_draft || item.reviewDraft || null;
        const draftStatus = draft && draft.status ? draft.status : "";
        const publicSnippet = status === "published" || isPublicItem(item);
        if (publicSnippet) {
          btns.push(`<button onclick="window.editSnippet('${esc(id)}')">编辑</button>`);
          btns.push(`<button onclick="window.forkSnippet('${esc(id)}')">复制</button>`);
          btns.push(`<button onclick="window.showSnippetHistory('${esc(id)}')">修改记录</button>`);
          if (isAdmin && draftStatus === "reviewing") {
            btns.push(`<button class="success" onclick="window.approveSnippetEdit('${esc(id)}')">通过修改</button>`);
            btns.push(`<button class="danger" onclick="window.rejectSnippetEdit('${esc(id)}')">驳回修改</button>`);
          }
          if (isAdmin) btns.push(`<button class="danger" onclick="window.deleteSnippet('${esc(id)}')">删除</button>`);
        } else {
          if (canManage || ownsSnippet(item)) btns.push(`<button onclick="window.editSnippet('${esc(id)}')">编辑</button>`);
          btns.push(`<button onclick="window.copySnippet('${esc(id)}')">复制</button>`);
          btns.push(`<button onclick="window.showSnippetHistory('${esc(id)}')">修改记录</button>`);
          if (canSubmitSnippet(item)) btns.push(`<button class="warning" onclick="window.submitSnippetReview('${esc(id)}')">提交审核</button>`);
          if (!isAdmin && ownsSnippet(item) && status === "reviewing") btns.push(`<button onclick="window.withdrawSnippetReview('${esc(id)}')">撤回</button>`);
          if (isAdmin && status === "reviewing") {
            btns.push(`<button class="success" onclick="window.publishSnippet('${esc(id)}')">正式发布</button>`);
            btns.push(`<button class="danger" onclick="window.rejectSnippetReview('${esc(id)}')">驳回</button>`);
          }
          if (isAdmin || ((ownsSnippet(item) || canManage) && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteSnippet('${esc(id)}')">删除</button>`);
        }
      }
      const buttons = btns.join(" ");
      return `
        <article class="algo-card ${kind} ${state.highlightId === id ? "highlight" : ""}" data-id="${esc(id)}">
          ${reviewStatusVisible ? `<span class="tag ${statusClass(status)} status-badge"${status === "rejected" && effectivePage !== "snippets" ? ` style="cursor:pointer" onclick="window.viewRejectedDraft('${esc(id)}')" title="点击查看驳回内容"` : ""}>${esc(statusLabel(status))}</span>` : ""}
          ${reviewStatusVisible
            ? `<span class="tag ${item.reviewKind === "version_iteration" ? "warning" : ""}" style="position:absolute;right:14px;top:42px">${item.reviewKind === "version_iteration" ? "版本迭代" : "新建"}</span>`
            : `<span class="tag ${privacyClass}" style="position:absolute;right:14px;top:14px">${privacyText}</span>`
          }
          <div class="card-title">${esc(getName(item))}</div>
          <div class="card-ns">${esc(getNs(item, page))}</div>
          <div class="desc">${esc(getDesc(item))}</div>
          <div class="tags">
            <span class="tag">${esc(item.language || "python")}</span>
            <span class="tag">v${esc(item.version || "1.0")}</span>
            ${(getTags(item) || []).slice(0, 3).map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}
          </div>
          <div class="card-actions">${buttons}</div>
        </article>
      `;
    }

    function applyFilters() {
      state.selectedNavNs = "";
      rememberListViewState(state.page);
      renderCards(state.page);
    }
    function rememberListViewState(page = state.page) {
      if (!page) return;
      const main = qs("#main");
      state.filters[page] = {
        search: qs("#filterSearch")?.value || "",
        category: qs("#filterCategory")?.value || "",
        language: qs("#filterLanguage")?.value || "",
        status: qs("#filterStatus")?.value || "",
        scope: qs("#filterScope")?.value || "",
        scrollTop: main?.scrollTop || state.pageScroll?.[page] || 0,
      };
      if (main) state.pageScroll[page] = main.scrollTop || 0;
    }
    function restoreListViewState(page = state.page) {
      const saved = state.filters?.[page];
      if (!saved) return;
      const setValue = (selector, value) => {
        const el = qs(selector);
        if (!el) return;
        const hasOption = !("options" in el) || Array.from(el.options || []).some(opt => opt.value === value);
        el.value = hasOption ? (value || "") : "";
      };
      const search = qs("#filterSearch");
      if (search) search.value = saved.search || "";
      setValue("#filterCategory", saved.category);
      setValue("#filterLanguage", saved.language);
      setValue("#filterStatus", saved.status);
      setValue("#filterScope", saved.scope);
      const qfContainer = qs("#quickFilters");
      if (qfContainer) {
        qfContainer.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", btn.dataset.qf === (qs("#filterStatus")?.value || "")));
      }
      if (saved.scrollTop !== undefined) state.pageScroll[page] = saved.scrollTop || 0;
    }
    function rememberMainScroll(page = state.page) {
      rememberListViewState(page);
      const main = qs("#main");
      if (!main || !page) return;
      state.pageScroll[page] = main.scrollTop || 0;
    }
    function restoreMainScroll(page = state.page) {
      const top = state.pageScroll?.[page] || 0;
      const restore = () => {
        const main = qs("#main");
        if (main) main.scrollTop = top;
      };
      requestAnimationFrame(() => requestAnimationFrame(restore));
      window.setTimeout(restore, 120);
    }
    function scrollToSection(ns) {
      const sections = qsa(".folder-section");
      for (const sec of sections) {
        const h3 = sec.querySelector("h3");
        if (!h3) continue;
        const key = h3.textContent.trim();
        const cats = state.categories[state.page] || [];
        const cat = cats.find(c => c.namespace === ns);
        const label = cat ? (cat.zh_name || cat.namespace) : ns;
        if (key === label || key === ns) {
          sec.scrollIntoView({ behavior: "smooth", block: "start" });
          sec.classList.add("nav-highlight");
          window.setTimeout(() => sec.classList.remove("nav-highlight"), 1500);
          return;
        }
      }
    }
    function setQuickFilter(status, page) {
      const filterStatus = qs("#filterStatus");
      if (filterStatus) filterStatus.value = status;
      const qfContainer = qs("#quickFilters");
      if (qfContainer) {
        qfContainer.querySelectorAll("button").forEach(btn => btn.classList.remove("active"));
        const active = qfContainer.querySelector(`[data-qf="${status}"]`);
        if (active) active.classList.add("active");
      }
      rememberListViewState(page);
      renderCards(page);
    }
    function toggleFolder(button) { button.closest(".folder-section").classList.toggle("collapsed"); }
