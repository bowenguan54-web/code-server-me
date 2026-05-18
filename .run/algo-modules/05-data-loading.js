/*
 * AlgoLib module: 05-data-loading.js
 * ???????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function skeletonHtml() {
      return `<div class="folder-body">${Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("")}</div>`;
    }

    async function loadModuleData(page) {
      // Sub-pages share data with their parent page
      const parentP = parentPageOf(page);
      if (parentP !== page) {
        const result = await loadModuleData(parentP);
        state.data[page] = state.data[parentP];
        state.categories[page] = state.categories[parentP];
        return result;
      }
      if (page === "snippets") {
        const data = await api("/api/v1/snippets");
        state.data.snippets = normalizeListPayload(data, "snippets");
        const catSet = new Set(state.data.snippets.map(item => groupKey(item, "snippets")).filter(Boolean));
        state.categories["snippets"] = [...catSet].sort().map(ns => ({ namespace: ns, zh_name: ns }));
        return state.data.snippets;
      }
      if (page === "my-algos") {
        const [data, folderData] = await Promise.all([
          api("/api/v1/user/algorithms"),
          api("/api/v1/user/folders").catch(() => ({ folders: [] }))
        ]);
        state.data["my-algos"] = normalizeListPayload(data, "algorithms");
        const categories = {};
        normalizeListPayload(folderData, "folders").forEach(folder => {
          const key = folder.namespace || String(folder.folder_name || "").replaceAll("/", ".");
          if (key) categories[key] = { namespace: key, zh_name: folder.zh_name || folder.folder_name || key, folderName: folder.folder_name || key };
        });
        state.data["my-algos"].forEach(item => {
          const key = groupKey(item, page);
          if (!categories[key]) categories[key] = { namespace: key, zh_name: key };
        });
        state.categories["my-algos"] = Object.values(categories);
        return state.data["my-algos"];
      }
      const [data, categoryData] = await Promise.all([
        api(`/api/v1/algorithms?module_kind=${currentModuleKind(page)}`),
        api(`/api/v1/categories?module_kind=${currentModuleKind(page)}`)
      ]);
      state.data[page] = normalizeListPayload(data, "algorithms");
      state.categories[page] = normalizeListPayload(categoryData, "categories");
      return state.data[page];
    }

    function renderModulePage(page) {
      qs("#main").innerHTML = `
        <h1>${pageTitle(page)}</h1>
        <div class="toolbar">
          <input id="filterSearch" placeholder="搜索名称、命名空间、描述、标签" oninput="window.applyFilters()" />
          <select id="filterCategory" onchange="window.applyFilters()"><option value="">全部分类</option></select>
          <select id="filterLanguage" onchange="window.applyFilters()"><option value="">全部语言</option></select>
          ${(page === "components" || page === "my-algos" || page.startsWith("components-")) ? '<select id="filterStatus" onchange="window.applyFilters()"><option value="">全部状态</option></select>' : ""}
          ${page === "snippets" ? '<select id="filterScope" onchange="window.applyFilters()"><option value="">全部权限</option><option value="private">私有</option><option value="team">公有</option></select>' : ""}
          <button onclick="window.applyFilters()">筛选</button>
          <span class="spacer"></span>
          <div class="toolbar-actions">
            ${(page === "components" || page === "templates" || page === "my-algos" || page.startsWith("components-") || page.startsWith("templates-")) ? `<button onclick="window.createRootCategory('${parentPageOf(page)}')">新建分类</button>` : ""}
            <button class="primary" onclick="window.createNew('${page === "my-algos" ? "components" : parentPageOf(page)}')">新建</button>
          </div>
        </div>
        ${(page === "components" || page === "my-algos" || page.startsWith("components-")) ? `<div class="quick-filters" id="quickFilters">
          <button class="active" data-qf="" onclick="window.setQuickFilter('','${page}')">全部</button>
          <button class="qf-success" data-qf="published" onclick="window.setQuickFilter('published','${page}')">公有</button>
          <button data-qf="draft" onclick="window.setQuickFilter('draft','${page}')">私有</button>
          <button class="qf-warning" data-qf="reviewing" onclick="window.setQuickFilter('reviewing','${page}')">审核中</button>
          <button data-qf="rejected" onclick="window.setQuickFilter('rejected','${page}')">已驳回</button>
        </div>` : ""}
        <section id="stats" class="stat-bar"></section>
        <section id="list">${skeletonHtml()}</section>
      `;
      loadModuleData(page).then(() => {
        renderNav();
        hydrateFilters(page);
        restoreListViewState(page);
        renderCards(page);
      }).catch(error => {
        qs("#list").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      });
    }

    function hydrateFilters(page) {
      const items = state.data[page] || [];
      const categories = [...new Set(items.map(item => groupKey(item, page)))].filter(Boolean).sort();
      const languages = [...new Set(items.map(item => item.language || "python"))].filter(Boolean).sort();
      qs("#filterCategory").innerHTML = '<option value="">全部分类</option>' + categories.map(value => `<option value="${esc(value)}">${esc(categoryLabel(value, page))}</option>`).join("");
      qs("#filterLanguage").innerHTML = '<option value="">全部语言</option>' + languages.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
      const status = qs("#filterStatus");
      if (status) {
        const statuses = [...new Set(items.map(getStatus))].filter(Boolean).sort();
        status.innerHTML = '<option value="">全部状态</option>' + statuses.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
      }
    }

    function filteredItems(page) {
      const q = (qs("#filterSearch")?.value || "").trim().toLowerCase();
      const category = qs("#filterCategory")?.value || "";
      const language = qs("#filterLanguage")?.value || "";
      const status = qs("#filterStatus")?.value || "";
      const scope = qs("#filterScope")?.value || "";
      return (state.data[page] || []).filter(item => {
        const text = [getName(item), getNs(item, page), getDesc(item), ...(getTags(item) || [])].join(" ").toLowerCase();
        return (!q || text.includes(q))
          && (!category || groupKey(item, page) === category)
          && (!language || (item.language || "python") === language)
          && (!status || getStatus(item) === status)
          && (!scope || item.scope === scope);
      });
    }
