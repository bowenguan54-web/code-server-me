
    const BASE = window._ALGO_BASE || "http://127.0.0.1:8000";
    window._activeMonaco = null;

    const state = {
      page: "components",
      data: { components: [], templates: [], snippets: [] },
      categories: { components: [], templates: [] },
      filters: {},
      editing: null,
      monacoReady: null,
      monaco: null,
      models: new Map(),
      fileMeta: new Map(),
      viewStates: new Map(),
      currentFile: "",
      testHeight: 0,
      outputMode: "json",
      lastRunResult: null,
      completionDisposable: null,
      completionItems: [],
      highlightId: "",
      apiTab: "keys",
      monitorPeriod: "24h",
      logsPage: 1,
      snippetResults: [],
      snippetCursor: 0,
      navCollapsed: {},
      selectedNavNs: "",
      sse: null,
      currentUser: null,
      tplImportTarget: "",
      tplTestMode: "params",
      tplFileUploads: {},
      compTestMode: "params",
      compTestFileUploads: {},
      _compTestAlgo: null,
      _compTestSource: null
    };

    function qs(selector, root = document) { return root.querySelector(selector); }
    function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
    function esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function normalizeListPayload(data, key) {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data[key])) return data[key];
      if (Array.isArray(data.items)) return data.items;
      return [];
    }
    function parseScalarToken(token) {
      const text = String(token ?? "").trim();
      if (!text) return "";
      if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
      if (/^null$/i.test(text)) return null;
      if (!Number.isNaN(Number(text)) && /^[-+]?\d+(\.\d+)?$/.test(text)) return Number(text);
      return text;
    }
    function parseSimpleCsv(text) {
      const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (!lines.length) return [];
      const rows = lines.map(line => line.split(",").map(cell => cell.trim()));
      if (rows.length >= 2 && rows[0].every(cell => cell && Number.isNaN(Number(cell)))) {
        const headers = rows[0];
        return rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((header, index) => { obj[header] = parseScalarToken(row[index] ?? ""); });
          return obj;
        });
      }
      return rows.map(row => row.map(parseScalarToken));
    }
    function parseLooseList(text) {
      const raw = String(text ?? "").trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_error) {
        if (/\r?\n/.test(raw) && raw.includes(",")) {
          const csvRows = parseSimpleCsv(raw);
          if (Array.isArray(csvRows) && csvRows.length && (Array.isArray(csvRows[0]) || typeof csvRows[0] === "object")) return csvRows;
        }
        return raw.split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean).map(parseScalarToken);
      }
    }
    function parseLooseDict(text) {
      const raw = String(text ?? "").trim();
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_error) {
        const obj = {};
        const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        for (const line of lines) {
          const separator = line.includes("=") ? "=" : (line.includes(":") ? ":" : "");
          if (!separator) return raw;
          const index = line.indexOf(separator);
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim();
          if (!key) return raw;
          obj[key] = parseScalarToken(value);
        }
        return obj;
      }
      return raw;
    }
    function parseParamValueByType(type, rawValue) {
      const kind = String(type || "");
      const text = String(rawValue ?? "");
      if (/bool/i.test(kind)) return text === "true";
      if (/DataFrame|dataframe/i.test(kind)) {
        const trimmed = text.trim();
        if (!trimmed) return [];
        try { return JSON.parse(trimmed); } catch (_error) { return parseSimpleCsv(trimmed); }
      }
      if (/list/i.test(kind)) return parseLooseList(text);
      if (/dict/i.test(kind)) return parseLooseDict(text);
      if (/int/i.test(kind)) return text === "" ? null : parseInt(text, 10);
      if (/float|number/i.test(kind)) return text === "" ? null : Number(text);
      return rawValue;
    }
    function showToast(message) {
      const el = qs("#toast");
      el.textContent = message;
      el.classList.remove("hidden");
      window.clearTimeout(showToast._timer);
      showToast._timer = window.setTimeout(() => el.classList.add("hidden"), 2600);
    }
    async function api(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const token = localStorage.getItem("algolib_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let response;
      try {
        response = await fetch(BASE + path, { ...options, headers, signal: AbortSignal.timeout(30000) });
      } catch (error) {
        throw new Error(error.name === "TimeoutError" ? "请求超时，请检查服务是否正常运行" : (error.message || "网络错误"));
      }
      let data = null;
      try { data = await response.json(); } catch (error) { data = { detail: response.statusText }; }
      if (response.status === 401) {
        localStorage.removeItem("algolib_token");
        localStorage.removeItem("algolib_user");
        state.currentUser = null;
        showLoginPage();
        throw new Error("登录已过期，请重新登录");
      }
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      return data;
    }
    function pageTitle(page) {
      return {
        components: "算法组件",
        templates: "算法模板",
        snippets: "代码片段",
        "my-algos": "我的算法",
        review: "算法审核",
        settings: "系统设置"
      }[page] || page;
    }
    function getName(item) { return item.zhName || item.zh_name || item.name || item.funcName || item.id || "未命名"; }
    function getDesc(item) { return item.zhDescription || item.zh_description || item.description || item.body || "暂无描述"; }
    function getTags(item) { return item.zhTags || item.zh_tags || item.tags || []; }
    function getStatus(item) { return item.publishStatus || item.publish_status || item.lifecycleStatus || (item.published ? "published" : "draft"); }
    function getNs(item, page) {
      if (page === "snippets") return item.name || "";
      return item.callPrefix || item.displayNamespace || "";
    }
    function namespacePrefix(item) {
      return `alg.${item.namespace || ""}.`;
    }
    function namespaceFunction(item) {
      return item.funcName || String(item.callPrefix || item.displayNamespace || "").split(".").pop() || "";
    }
    function groupKey(item, page) {
      if (page === "snippets") return (item.tags && item.tags[0]) || item.scope || "default";
      return String(item.namespace || "default").split(".")[0] || "default";
    }
    function categoryLabel(namespace, page) {
      const category = (state.categories[page] || []).find(item => item.namespace === namespace);
      return category ? (category.zh_name || category.namespace) : namespace;
    }
    function statusClass(status) {
      if (status === "published" || status === "approved") return "success";
      if (status === "reviewing") return "warning";
      if (status === "rejected" || status === "deprecated") return "danger";
      return "";
    }
    function statusLabel(status) {
      return {
        published: "应用中",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "审核未通过",
        draft: "草稿",
        deprecated: "已下架"
      }[status] || status;
    }
    function ownsAlgorithm(item) {
      const ownerId = item?.ownerId || item?.owner_id || "system";
      return !!(state.currentUser?.id && ownerId === state.currentUser.id);
    }
    function canManageAlgorithm(item) {
      return state.currentUser?.role === "admin" || ownsAlgorithm(item);
    }
    function canSubmitAlgorithm(item) {
      return ownsAlgorithm(item) && ["draft", "rejected"].includes(getStatus(item));
    }
    function parseVersion(value) {
      const parts = String(value || "1.0.0").split(".").map(part => Number.parseInt(part, 10) || 0);
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
    function versionUpgradeOptions(current) {
      const [major, minor, patch] = parseVersion(current);
      return [
        { value: current || "1.0.0", label: `保持当前版本 ${current || "1.0.0"}` },
        { value: `${major}.${minor}.${patch + 1}`, label: `补丁版本：${current || "1.0.0"} → ${major}.${minor}.${patch + 1}` },
        { value: `${major}.${minor + 1}.0`, label: `小版本：${current || "1.0.0"} → ${major}.${minor + 1}.0` },
        { value: `${major + 1}.0.0`, label: `大版本：${current || "1.0.0"} → ${major + 1}.0.0` }
      ];
    }
    function safeId(id) { return encodeURIComponent(id); }
    function currentModuleKind(page) {
      if (page === "my-algos") return "component";
      if (page === "components") return "component";
      if (page === "templates") return "template";
      return "snippet";
    }

    function renderNav() {
      const pages = [
        ["components", "算法组件"],
        ["templates", "算法模板"],
        ["snippets", "代码片段"],
        ...(state.currentUser ? [["my-algos", "我的算法"]] : []),
        ...(state.currentUser?.role === "admin" ? [["review", "算法审核"]] : []),
        ["settings", "系统设置"],
        ...(state.currentUser && state.currentUser.role === "admin" ? [["users", "用户管理"]] : [])
      ];
      const subPages = ["components", "templates", "my-algos"];
      qs("#sidebar").innerHTML = [
        '<div class="brand">Algo<span>Lib</span></div>',
        ...pages.flatMap(([page, label]) => {
          const isActive = page === state.page;
          if (!subPages.includes(page)) {
            return [`<div class="nav-item ${isActive ? "active" : ""}" data-page="${page}"><span class="nav-dot"></span>${label}</div>`];
          }
          const cats = state.categories[page] || [];
          const collapsed = state.navCollapsed[page];
          const colBtn = cats.length > 0
            ? `<button class="nav-collapse-btn ${collapsed ? "collapsed" : ""}" data-toggle="${page}" title="${collapsed ? "展开" : "收起"}">▾</button>`
            : "";
          const item = `<div class="nav-item ${isActive ? "active" : ""}" data-page="${page}" style="display:flex;align-items:center;gap:10px;"><span class="nav-dot"></span>${label}${colBtn}</div>`;
          if (collapsed) return [item];
          const subs = cats.slice(0, 12).map(cat => {
            const name = cat.zh_name || cat.namespace || "";
            const ns = cat.namespace || "";
            const isActive = state.selectedNavNs === ns && state.page === page;
            return `<div class="nav-sub${isActive ? " active-sub" : ""}" data-page="${page}" data-ns="${esc(ns)}" title="${esc(name)}">${esc(name)}</div>`;
          });
          return [item, ...subs];
        }),
        state.currentUser ? `<div style="margin-top:auto;padding:10px 8px 0;border-top:1px solid var(--line);font-size:12px;color:var(--text-dim)">
          <div style="color:var(--text);font-weight:600">${esc(state.currentUser.display_name || state.currentUser.username)}</div>
          <div style="margin:2px 0 6px">${esc(state.currentUser.role === "admin" ? "管理员" : "普通用户")}</div>
          <button class="ghost" style="font-size:12px;padding:4px 8px" onclick="window.doLogout()">退出登录</button>
        </div>` : ""
      ].join("");
      qsa(".nav-item").forEach(el => {
        el.addEventListener("click", (evt) => {
          if (evt.target.classList.contains("nav-collapse-btn")) return;
          const page = el.dataset.page;
          if (state.page === page) {
            // 已在此页面：仅清空分类过滤器，显示全部内容
            const filterCat = qs("#filterCategory");
            if (filterCat) { filterCat.value = ""; applyFilters(); }
            return;
          }
          switchPage(page);
        });
      });
      qsa(".nav-collapse-btn").forEach(btn => {
        btn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          const page = btn.dataset.toggle;
          state.navCollapsed[page] = !state.navCollapsed[page];
          renderNav();
        });
      });
      qsa(".nav-sub").forEach(el => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const page = el.dataset.page;
          const ns = el.dataset.ns;
          state.selectedNavNs = ns;
          if (state.page !== page) {
            switchPage(page);
            window.setTimeout(() => scrollToSection(ns), 400);
          } else {
            renderNav();
            scrollToSection(ns);
          }
        });
      });
    }

    function switchPage(page) {
      state.page = page;
      qsa(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
      renderPage(page);
    }

    function renderPage(page) {
      if (page === "components" || page === "templates" || page === "snippets" || page === "my-algos") {
        renderModulePage(page);
        return;
      }
      if (page === "users") {
        renderUsersPage();
        return;
      }
      if (page === "review" && state.currentUser?.role === "admin") {
        renderReviewPage();
        return;
      }
      renderSettingsPage();
    }

    function skeletonHtml() {
      return `<div class="folder-body">${Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("")}</div>`;
    }

    async function loadModuleData(page) {
      if (page === "snippets") {
        const data = await api("/api/v1/snippets");
        state.data.snippets = normalizeListPayload(data, "snippets");
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
          ${(page === "components" || page === "my-algos") ? '<select id="filterStatus" onchange="window.applyFilters()"><option value="">全部状态</option></select>' : ""}
          ${page === "snippets" ? '<select id="filterScope" onchange="window.applyFilters()"><option value="">全部权限</option><option value="private">私有</option><option value="team">共享</option></select>' : ""}
          <button onclick="window.applyFilters()">筛选</button>
          <span class="spacer"></span>
          <div class="toolbar-actions">
            ${(page === "components" || page === "templates" || page === "my-algos") ? `<button onclick="window.createRootCategory('${page}')">新建分类</button>` : ""}
            <button class="primary" onclick="window.createNew('${page === "my-algos" ? "components" : page}')">新建</button>
          </div>
        </div>
        ${(page === "components" || page === "my-algos") ? `<div class="quick-filters" id="quickFilters">
          <button class="active" data-qf="" onclick="window.setQuickFilter('','${page}')">全部</button>
          <button class="qf-success" data-qf="published" onclick="window.setQuickFilter('published','${page}')">已发布</button>
          <button data-qf="draft" onclick="window.setQuickFilter('draft','${page}')">草稿</button>
          <button class="qf-warning" data-qf="reviewing" onclick="window.setQuickFilter('reviewing','${page}')">审核中</button>
          <button data-qf="rejected" onclick="window.setQuickFilter('rejected','${page}')">已驳回</button>
        </div>` : ""}
        <section id="stats" class="stat-bar"></section>
        <section id="list">${skeletonHtml()}</section>
      `;
      loadModuleData(page).then(() => {
        renderNav();
        hydrateFilters(page);
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

    function renderStats(page, items) {
      const categoryCount = new Set(items.map(item => groupKey(item, page))).size;
      const todayCount = items.filter(item => {
        const time = item.updated_at || item.created_at || item.updatedAt || "";
        return String(time).slice(0, 10) === new Date().toISOString().slice(0, 10);
      }).length;
      if (page === "components" || page === "my-algos") {
        const publishedCount = items.filter(item => getStatus(item) === "published").length;
        const reviewingCount = items.filter(item => getStatus(item) === "reviewing").length;
        const draftCount = items.filter(item => getStatus(item) === "draft").length;
        const statLabel = page === "my-algos" ? "我的算法总数" : "算法组件总数";
        qs("#stats").innerHTML = [
          `<article class="stat-card accent-info"><div class="stat-label">${statLabel}</div><div class="stat-value">${items.length}</div><div class="stat-desc">${categoryCount} 个分类 · 今日更新 ${todayCount}</div></article>`,
          `<article class="stat-card accent-success"><div class="stat-label">已发布</div><div class="stat-value">${publishedCount}</div><div class="stat-desc">草稿 ${draftCount} 个</div></article>`,
          `<article class="stat-card${reviewingCount > 0 ? " accent-warning" : ""}"><div class="stat-label">待审核</div><div class="stat-value${reviewingCount > 0 ? " accent-warning" : ""}">${reviewingCount}</div><div class="stat-desc">等待审核中</div></article>`,
          ...(page === "components" ? [
            `<article class="stat-card"><div class="stat-label">公共组件</div><div class="stat-value">${items.filter(item => (item.ownerId || "system") === "system").length}</div><div class="stat-desc">所有账号可见</div></article>`,
          ] : []),
        ].join("");
        // 渲染审核 banner（仅 components 页）
        if (page === "components") {
        let banner = qs("#reviewBanner");
        if (!banner) {
          banner = document.createElement("div");
          banner.id = "reviewBanner";
          qs("#stats").insertAdjacentElement("afterend", banner);
        }
        banner.innerHTML = reviewingCount > 0
          ? `<div class="review-banner">⚠ 有 ${reviewingCount} 个算法正在等待审核，请及时处理。<span class="spacer"></span><a onclick="window.setQuickFilter('reviewing','components')">查看审核中</a></div>`
          : "";
        } // end if (page === "components")
      } else {
        const languageCount = new Set(items.map(item => item.language || "python")).size;
        const fourthLabel = page === "snippets" ? "共享片段" : "可发布";
        const fourthValue = page === "snippets"
          ? items.filter(item => item.scope === "team").length
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
      if (!state.filter?.category) {
        (state.categories[page] || []).forEach(cat => {
          if (!(cat.namespace in groups)) groups[cat.namespace] = [];
        });
      }
      qs("#list").innerHTML = Object.keys(groups).sort().map(key => `
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
    }

    function renderCard(item, page) {
      const kind = page === "templates" ? "template" : page === "snippets" ? "snippet" : "";
      const status = getStatus(item);
      const id = item.id;
      const isAdmin = state.currentUser?.role === "admin";
      const isOwner = ownsAlgorithm(item);
      const canManage = canManageAlgorithm(item);
      const isMyAlgosPage = page === "my-algos";
      const effectivePage = isMyAlgosPage ? "components" : page;
      let btns = [];
      if (effectivePage === "components") {
        if (canManage) btns.push(`<button onclick="window.openEditorById('${esc(id)}','${esc(page)}')">编辑</button>`);
        else if (state.currentUser) btns.push(`<button onclick="window.openEditorById('${esc(id)}','components')">编辑</button>`);
        if (state.currentUser) btns.push(`<button onclick="window.openComponentTestModalById('${esc(id)}')">测试</button>`);
        if (canManage) btns.push(`<button onclick="window.editAlgorithmInfo('${esc(id)}','${esc(page)}')">基本信息</button>`);
        btns.push(`<button onclick="window.showApiDoc('${esc(id)}')">查看 API 文档</button>`);
        if (canSubmitAlgorithm(item) || (isOwner && status === "published" && item.hasReviewDraft)) {
          btns.push(`<button class="warning" onclick="window.openSubmitModal('${esc(id)}')">${status === "rejected" ? "重新提交" : "提交审核"}</button>`);
        }
        if (canManage && status === "rejected") {
          btns.push(`<button class="ghost" onclick="window.viewRejectedDraft('${esc(id)}')">查看驳回内容</button>`);
          btns.push(`<button onclick="window.discardRejectedDraft('${esc(id)}')">放弃修改</button>`);
        }
        if (canManage && status === "reviewing") btns.push(`<button onclick="window.withdrawReview('${esc(id)}')">撤回</button>`);
        if (isAdmin && status === "reviewing") btns.push(`<button onclick="window.approveReview('${esc(id)}')">审核通过</button>`);
        if (isAdmin && status === "approved") btns.push(`<button class="success" onclick="window.publishComponent('${esc(id)}')">正式发布</button>`);
        if (canManage) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
      } else if (effectivePage === "templates") {
        if (canManage) btns.push(`<button onclick="window.openEditorById('${esc(id)}','templates')">编辑</button>`);
        else if (state.currentUser) btns.push(`<button onclick="window.openEditorById('${esc(id)}','templates')">编辑</button>`);
        if (canManage) btns.push(`<button onclick="window.editAlgorithmInfo('${esc(id)}','templates')">基本信息</button>`);
        btns.push(`<button class="primary" onclick="window.publishAsComponent('${esc(id)}',this)">基于模板新建组件</button>`);
        if (canManage) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
      } else {
        if (canManage) btns.push(`<button onclick="window.editSnippet('${esc(id)}')">编辑</button>`);
        btns.push(`<button onclick="window.copySnippet('${esc(id)}')">复制</button>`);
        if (canManage) btns.push(`<button class="danger" onclick="window.deleteSnippet('${esc(id)}')">删除</button>`);
      }
      const buttons = btns.join(" ");
      return `
        <article class="algo-card ${kind} ${state.highlightId === id ? "highlight" : ""}" data-id="${esc(id)}">
          ${(effectivePage === "components" || effectivePage === "templates") ? `<span class="tag ${statusClass(status)} status-badge"${status === "rejected" ? ` style="cursor:pointer" onclick="window.viewRejectedDraft('${esc(id)}')" title="点击查看驳回内容"` : ""}>${esc(statusLabel(status))}${item.hasReviewDraft && status === "published" ? " (有草稿)" : ""}</span>` : ""}
          ${effectivePage === "snippets" ? `<span class="tag ${item.scope === "team" ? "success" : "warning"} status-badge">${item.scope === "team" ? "共享" : "私有"}</span>` : ""}
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

    function applyFilters() { state.selectedNavNs = ""; renderCards(state.page); }
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
      renderCards(page);
    }
    function toggleFolder(button) { button.closest(".folder-section").classList.toggle("collapsed"); }

    function editCategory(namespace, page) {
      const category = (state.categories[page] || []).find(item => item.namespace === namespace) || { namespace, zh_name: namespace };
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>编辑分类</h3>
          <div class="form-grid">
            <div class="form-row"><label>中文文件夹名</label><input id="catZhName" value="${esc(category.zh_name || namespace)}" /></div>
            <div class="form-row"><label>命名空间</label><input id="catNamespace" value="${esc(category.namespace || namespace)}" /></div>
          </div>
          <div class="field-error" id="catErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.saveCategory('${esc(namespace)}','${esc(page)}')">保存</button>
          </div>
        </div>
      `;
    }

    async function saveCategory(namespace, page) {
      const newNamespace = qs("#catNamespace").value.trim();
      if (!/^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*$/.test(newNamespace)) {
        qs("#catErr").textContent = "命名空间只能使用小写字母、数字和下划线，可用点号分级";
        return;
      }
      try {
        if (page === "my-algos") {
          await api(`/api/v1/user/folders/${safeId(namespace.replaceAll(".", "/"))}`, {
            method: "PATCH",
            body: JSON.stringify({ zh_name: qs("#catZhName").value.trim(), new_folder_name: newNamespace.replaceAll(".", "/") })
          });
        } else {
          await api(`/api/v1/categories/${safeId(namespace)}?module_kind=${currentModuleKind(page)}`, {
            method: "PATCH",
            body: JSON.stringify({ zh_name: qs("#catZhName").value.trim(), new_namespace: newNamespace })
          });
        }
        closeModal();
        showToast("分类已更新");
        await loadModuleData(page);
        renderCards(page);
      } catch (error) {
        qs("#catErr").textContent = error.message;
      }
    }

    function deleteCategory(namespace, page) {
      const category = (state.categories[page] || []).find(item => item.namespace === namespace) || { namespace, zh_name: namespace };
      if (page === "my-algos") {
        qs("#modalRoot").classList.remove("hidden");
        qs("#modalRoot").innerHTML = `
          <div class="modal">
            <h3>删除分类：${esc(category.zh_name || namespace)}</h3>
            <p>该操作会删除此私有分类文件夹及其中的算法文件，请确认已经不再需要。</p>
            <div class="field-error" id="delCatErr"></div>
            <div class="modal-actions">
              <button onclick="window.closeModal()">取消</button>
              <button class="danger" onclick="window.confirmDeleteCategory('${esc(namespace)}','${esc(page)}')">确认删除</button>
            </div>
          </div>
        `;
        return;
      }
      const cats = (state.categories[page] || []).filter(c => c.namespace !== namespace);
      const catOptions = cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zh_name || c.namespace)}</option>`).join("");
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>删除分类：${esc(category.zh_name || namespace)}</h3>
          <p>请选择对该分类下算法的处理方式：</p>
          <div class="form-grid">
            <div class="form-row">
              <label><input type="radio" name="delAction" value="delete" checked> 同时删除该分类下的所有算法</label>
            </div>
            <div class="form-row">
              <label><input type="radio" name="delAction" value="move"> 将算法转移到其他分类</label>
            </div>
            <div class="form-row" id="moveTargetRow" style="display:none">
              <label>目标分类</label>
              <select id="moveTarget">${catOptions}</select>
            </div>
          </div>
          <div class="field-error" id="delCatErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="danger" onclick="window.confirmDeleteCategory('${esc(namespace)}','${esc(page)}')">确认删除</button>
          </div>
        </div>
      `;
      document.querySelectorAll('input[name="delAction"]').forEach(radio => {
        radio.addEventListener("change", () => {
          const moveRow = qs("#moveTargetRow");
          if (moveRow) moveRow.style.display = radio.value === "move" ? "" : "none";
        });
      });
    }

    async function confirmDeleteCategory(namespace, page) {
      const action = document.querySelector('input[name="delAction"]:checked')?.value || "delete";
      const target = action === "move" ? (qs("#moveTarget")?.value || "") : "";
      const moduleKind = currentModuleKind(page);
      let url = page === "my-algos"
        ? `/api/v1/user/folders/${safeId(namespace.replaceAll(".", "/"))}`
        : `/api/v1/categories/${safeId(namespace)}?module_kind=${moduleKind}&action=${encodeURIComponent(action)}`;
      if (page !== "my-algos" && action === "move" && target) url += `&target=${encodeURIComponent(target)}`;
      try {
        await api(url, { method: "DELETE" });
        closeModal();
        showToast("分类已删除");
        await loadModuleData(page);
        renderCards(page);
      } catch (error) {
        const errEl = qs("#delCatErr");
        if (errEl) errEl.textContent = error.message;
      }
    }

    function createSubcategory(namespace, page) {
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>新建子分类</h3>
          <div class="form-grid">
            <div class="form-row"><label>父级分类</label><input value="${esc(categoryLabel(namespace, page))}" disabled /></div>
            <div class="form-row"><label>子分类命名空间</label><input id="subName" placeholder="例如 feature_engineering" /></div>
            <div class="form-row"><label>中文文件夹名</label><input id="subZhName" placeholder="例如 特征工程" /></div>
          </div>
          <div class="field-error" id="subErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.saveSubcategory('${esc(namespace)}','${esc(page)}')">创建</button>
          </div>
        </div>
      `;
    }

    async function saveSubcategory(namespace, page) {
      const name = qs("#subName").value.trim();
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
        qs("#subErr").textContent = "子分类命名空间只能使用小写字母、数字和下划线";
        return;
      }
      try {
        if (page === "my-algos") {
          await api("/api/v1/user/folders", {
            method: "POST",
            body: JSON.stringify({ folder_name: `${namespace.replaceAll(".", "/")}/${name}`, zh_name: qs("#subZhName").value.trim() })
          });
        } else {
          await api(`/api/v1/categories/${safeId(namespace)}/subcategories`, {
            method: "POST",
            body: JSON.stringify({
              name,
              zh_name: qs("#subZhName").value.trim(),
              module_kind: currentModuleKind(page)
            })
          });
        }
        closeModal();
        showToast("子分类已创建");
        await loadModuleData(page);
        renderCards(page);
      } catch (error) {
        qs("#subErr").textContent = error.message;
      }
    }

    function createRootCategory(page) {
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>新建主分类</h3>
          <div class="form-grid">
            <div class="form-row"><label>命名空间</label><input id="rootCatName" placeholder="例如 optimizer" /></div>
            <div class="form-row"><label>中文文件夹名</label><input id="rootCatZhName" placeholder="例如 优化算法" /></div>
          </div>
          <div class="field-error" id="rootCatErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.saveRootCategory('${esc(page)}')">创建</button>
          </div>
        </div>
      `;
    }

    async function saveRootCategory(page) {
      const name = qs("#rootCatName").value.trim();
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
        qs("#rootCatErr").textContent = "主分类命名空间只能使用小写字母、数字和下划线";
        return;
      }
      try {
        if (page === "my-algos") {
          await api("/api/v1/user/folders", {
            method: "POST",
            body: JSON.stringify({ folder_name: name, zh_name: qs("#rootCatZhName").value.trim() })
          });
        } else {
          await api("/api/v1/categories", {
            method: "POST",
            body: JSON.stringify({
              name,
              zh_name: qs("#rootCatZhName").value.trim(),
              module_kind: currentModuleKind(page)
            })
          });
        }
        closeModal();
        showToast("主分类已创建");
        await loadModuleData(page);
        renderCards(page);
      } catch (error) {
        qs("#rootCatErr").textContent = error.message;
      }
    }

    async function createNew(page) {
      if (page === "snippets") {
        editSnippet("");
        return;
      }
      openAlgorithmWorkspace(page);
    }

    const newAlgoState = { files: [], currentFile: "" };

    function defaultAlgorithmCode(name) {
      const funcName = name || "my_algorithm";
      return `def ${funcName}(data: list, threshold: float = 0.5) -> dict:\n    \"\"\"在这里编写算法逻辑。\n\n    Args:\n        data: 输入数据。\n        threshold: 阈值参数。\n    \"\"\"\n    passed = [item for item in data if float(item) >= threshold]\n    return {\n        \"input_count\": len(data),\n        \"passed_count\": len(passed),\n        \"passed\": passed,\n    }\n`;
    }

    function newTemplateFiles(kind, name, templateKey) {
      const funcName = name || (kind === "complex" ? "complex_algorithm" : "my_algorithm");
      if (kind === "complex" || templateKey === "complex") return defaultComplexFiles(funcName);
      const code = templateKey === "quality"
        ? `def ${funcName}(rows: list[dict], required_columns: list[str]) -> dict:\n    \"\"\"数据质量检查示例。\"\"\"\n    issues = []\n    for row_index, row in enumerate(rows):\n        for column in required_columns:\n            if column not in row or row[column] in (None, \"\"):\n                issues.append({\"row\": row_index, \"column\": column, \"rule\": \"required\"})\n    return {\"row_count\": len(rows), \"issue_count\": len(issues), \"issues\": issues}\n`
        : defaultAlgorithmCode(funcName);
      return [{ relative_path: `${funcName}.py`, content: code }];
    }

    async function openAlgorithmWorkspace(page) {
      const moduleKind = page === "templates" ? "template" : "component";
      let cats = state.categories[page] || [];
      if (!cats.length) {
        try {
          const catData = await api(`/api/v1/categories?module_kind=${currentModuleKind(page)}`);
          cats = normalizeListPayload(catData, "categories");
          state.categories[page] = cats;
        } catch (_e) { cats = []; }
      }
      const defaultNs = page === "templates" ? "templates" : "custom";
      const catOptions = cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
      newAlgoState.files = newTemplateFiles("simple", "my_algorithm", "basic");
      newAlgoState.currentFile = newAlgoState.files[0].relative_path;
      qs("#main").innerHTML = `
        <div class="new-workspace">
          <div class="editor-top">
            <button onclick="window.switchPage('${page}')">返回</button>
            <strong>${page === "templates" ? "新建算法模板" : "新建算法"}</strong>
            <span class="spacer"></span>
            <button onclick="window.testWorkspaceSource()">测试当前文件</button>
            <button class="primary" onclick="window.saveWorkspaceAlgorithm('${moduleKind}')">保存草稿</button>
          </div>
          ${page === "templates" ? `<details class="template-usage-details" open>
            <summary>📖 算法模板说明（点击折叠）</summary>
            <div class="template-usage-body">
              <strong>新建算法模板界面使用说明：</strong><br>
              1. <strong>算法形态</strong>：选择"普通单文件"或"复杂多文件"。单文件模板只有一个 .py 文件；复杂多文件模板为包结构，包含 main.py 和辅助模块。<br>
              2. <strong>代码模板</strong>：提供预置代码框架，切换后代码区会自动更新。<br>
              3. <strong>函数/包名</strong>：生成的函数名或包名，只能使用小写字母、数字和下划线。<br>
              4. <strong>所属分类</strong>：算法模板所属的分类命名空间，可新建分类。<br>
              5. <strong>测试参数 JSON</strong>：点击"测试当前文件"时使用此处的参数作为函数入参，格式为 JSON 对象。<br>
              6. <strong>代码编辑区</strong>：直接编辑算法代码。多文件模板可在左侧文件列表切换文件。<br>
              7. 填写完毕后点击"<strong>保存草稿</strong>"将模板保存到系统，之后可在算法模板列表中进一步编辑和发布。
            </div>
          </details>` : ""}
          <div class="new-form-grid">
            <label>算法形态<select id="wsKind" onchange="window.applyWorkspaceTemplate()"><option value="simple">普通单文件</option><option value="complex">复杂多文件</option></select></label>
            <label>代码模板<select id="wsTemplate" onchange="window.applyWorkspaceTemplate()"><option value="basic">基础算法</option><option value="quality">数据质量</option><option value="complex">复杂算法示例</option></select></label>
            <label>函数/包名<input id="wsName" value="my_algorithm" /></label>
            <label>所属分类
              <select id="wsCategory" onchange="window.onWsCatChange()">
                ${catOptions}
                <option value="__new__">＋ 新建分类...</option>
              </select>
            </label>
            <label>版本<input value="1.0.0 初始版本" disabled /></label>
            <label>中文名称<input id="wsZhName" value="${page === "templates" ? "自定义算法模板" : "自定义算法"}" /></label>
            <label id="wsNewCatRow" class="full" style="display:none">新分类信息
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input id="wsCategoryName" placeholder="中文显示名，如 统计算法" style="flex:1;min-width:140px" />
                <input id="wsCategoryNs" placeholder="英文命名空间，如 statistics" style="flex:1;min-width:140px" />
              </div>
            </label>
            <label class="wide">标签<input id="wsTags" value="${page === "templates" ? "模板,自定义" : "自定义,组件"}" /></label>
            <label class="full">描述<textarea id="wsDesc" rows="2">说明算法用途、输入输出和适用场景。</textarea></label>
            <label class="full">测试参数 JSON<textarea id="wsKwargs" rows="3">{"data":[0.1,0.6,0.9],"threshold":0.5}</textarea></label>
          </div>
          <div class="file-editor-grid">
            <div class="file-list-panel" id="wsFileList"></div>
            <textarea id="wsCode" class="file-edit-area" spellcheck="false" oninput="window.updateWorkspaceFileContent()"></textarea>
          </div>
          <div id="wsOutput" class="output hidden"></div>
        </div>
      `;
      const defOpt = [...(qs("#wsCategory")?.options || [])].find(o => o.value === defaultNs);
      if (defOpt) qs("#wsCategory").value = defaultNs;
      renderWorkspaceFiles();
    }

    function onWsCatChange() {
      const v = qs("#wsCategory")?.value;
      const row = qs("#wsNewCatRow");
      if (row) row.style.display = v === "__new__" ? "" : "none";
    }

    function applyWorkspaceTemplate() {
      const templateKey = qs("#wsTemplate").value;
      if (templateKey === "complex") qs("#wsKind").value = "complex";
      const kind = qs("#wsKind").value;
      const fallback = kind === "complex" ? "complex_algorithm" : "my_algorithm";
      const name = qs("#wsName").value.trim() || fallback;
      newAlgoState.files = newTemplateFiles(kind, name, templateKey);
      newAlgoState.currentFile = newAlgoState.files[0].relative_path;
      renderWorkspaceFiles();
    }

    function renderWorkspaceFiles() {
      qs("#wsFileList").innerHTML = newAlgoState.files.map(file => `
        <div style="display:flex;align-items:center;gap:2px">
          <button class="${file.relative_path === newAlgoState.currentFile ? "active" : ""}" style="flex:1;text-align:left" onclick="window.switchWorkspaceFile('${esc(file.relative_path)}')">${esc(file.relative_path)}</button>
          <button class="ghost" style="font-size:11px;padding:2px 5px;flex-shrink:0" onclick="window.renameWorkspaceFile('${esc(file.relative_path)}')" title="重命名">改</button>
        </div>`).join("");
      const file = newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile);
      qs("#wsCode").value = file?.content || "";
    }

    function switchWorkspaceFile(path) {
      updateWorkspaceFileContent();
      newAlgoState.currentFile = path;
      renderWorkspaceFiles();
    }

    function updateWorkspaceFileContent() {
      const file = newAlgoState.files.find(item => item.relative_path === newAlgoState.currentFile);
      if (file) file.content = qs("#wsCode").value;
    }

    async function testWorkspaceSource() {
      updateWorkspaceFileContent();
      const output = qs("#wsOutput");
      if (!output) { showToast("测试面板未找到，请刷新页面后重试"); return; }
      if (!qs("#wsKind") || !qs("#wsName") || !qs("#wsKwargs")) { showToast("界面未就绪，请稍后再试"); return; }
      if (qs("#wsKind").value === "complex") {
        output.classList.remove("hidden");
        output.innerHTML = "<pre>复杂多文件算法包含相对导入，请先保存为草稿，然后在组件卡片中点击“测试”。</pre>";
        return;
      }
      let kwargs = {};
      try { kwargs = JSON.parse(qs("#wsKwargs").value || "{}"); } catch (error) { showToast("测试参数必须是 JSON"); return; }
      try {
        const result = await api("/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify({ content: newAlgoState.files[0].content, function: qs("#wsName").value.trim(), kwargs })
        });
        output.classList.remove("hidden");
        output.innerHTML = `<pre>${esc(JSON.stringify(result, null, 2))}</pre>`;
      } catch (error) {
        output.classList.remove("hidden");
        output.innerHTML = `<pre>${esc(error.message)}</pre>`;
      }
    }

    async function saveWorkspaceAlgorithm(moduleKind) {
      updateWorkspaceFileContent();
      const kind = qs("#wsKind").value;
      const name = qs("#wsName").value.trim();
      let catValue = qs("#wsCategory")?.value || "";
      const tags = qs("#wsTags").value.split(",").map(item => item.trim()).filter(Boolean);

      // 前端校验
      if (!name) { showToast("函数名不能为空"); return; }
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) { showToast("函数名只能使用小写字母、数字和下划线（如 my_algo）"); return; }

      // 处理新建分类
      if (catValue === "__new__") {
        const catName = qs("#wsCategoryName")?.value.trim();
        const catNs = qs("#wsCategoryNs")?.value.trim();
        if (!catName || !catNs) { showToast("请填写新分类名称和命名空间"); return; }
        if (/[\u4e00-\u9fff]/.test(catNs) || !/^[a-z_][a-z0-9_.]*$/.test(catNs)) { showToast("分类命名空间只能使用小写字母、数字和下划线"); return; }
        try {
          await api("/api/v1/categories", { method: "POST", body: JSON.stringify({ namespace: catNs, zh_name: catName, module_kind: moduleKind }) });
          catValue = catNs;
        } catch (err) { showToast(err.message); return; }
      }

      const namespace = catValue.trim().replace(/^alg\./, "");
      if (!namespace) { showToast("命名空间不能为空"); return; }
      if (/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/.test(namespace)) { showToast("命名空间不能包含中文字符，请使用英文字母、数字和下划线"); return; }
      if (!/^[a-z_][a-z0-9_.]*$/.test(namespace)) { showToast("命名空间只能使用小写字母、数字、下划线和点号"); return; }

      // 重复命名空间检测
      const allItems = [...(state.data.components || []), ...(state.data.templates || [])];
      const fullId = `${namespace}.${name}`;
      const duplicate = allItems.find(item => {
        const itemId = item.id || `${item.namespace || ""}.${item.name || item.funcName || ""}`;
        return itemId === fullId;
      });
      if (duplicate) { showToast(`命名空间 "${fullId}" 已存在，请修改函数名或所属类别`); return; }

      try {
        if (kind === "complex") {
          await api("/api/v1/packages/create", {
            method: "POST",
            body: JSON.stringify({
              name,
              namespace,
              zh_name: qs("#wsZhName").value.trim(),
              version: "1.0.0",
              entry: "main.py",
              exports: [name],
              zh_description: qs("#wsDesc").value.trim(),
              zh_tags: tags,
              module_kind: moduleKind,
              published: false,
              publish_status: "draft",
              files: newAlgoState.files
            })
          });
        } else {
          await api("/api/v1/algorithms/create", {
            method: "POST",
            body: JSON.stringify({
              name,
              category: namespace,
              zh_name: qs("#wsZhName").value.trim(),
              zh_description: qs("#wsDesc").value.trim(),
              zh_tags: tags,
              version: "1.0.0",
              code: newAlgoState.files[0].content,
              module_kind: moduleKind,
              publish_status: moduleKind === "template" ? "published" : "draft"
            })
          });
        }
        showToast("算法已保存为草稿");
        switchPage(moduleKind === "template" ? "templates" : "components");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function openAlgorithmCreateModal(page) {
      const moduleKind = page === "templates" ? "template" : "component";
      const title = page === "templates" ? "新建算法模板" : "新建算法组件";
      let cats = state.categories[page] || [];
      if (!cats.length) {
        try {
          const catData = await api(`/api/v1/categories?module_kind=${currentModuleKind(page)}`);
          cats = normalizeListPayload(catData, "categories");
          state.categories[page] = cats;
        } catch (_e) { cats = []; }
      }
      const defaultNs = page === "templates" ? "templates" : "custom";
      const catOptions = cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>${title}</h3>
          <div class="form-grid">
            <div class="form-row"><label>函数名 <span style="color:var(--text-dim);font-size:12px">(英文标识符)</span></label><input id="algName" value="my_algorithm" oninput="window.refreshCreateCodeName()" /></div>
            <div class="form-row"><label>所属分类</label>
              <select id="algCategory" onchange="window.onAlgCatChange()">
                ${catOptions}
                <option value="__new__">＋ 新建分类...</option>
              </select>
            </div>
            <div class="form-row" id="newCatRow" style="display:none">
              <label>新分类信息</label>
              <div>
                <input id="algCategoryName" placeholder="中文显示名，如 统计算法" style="margin-bottom:6px;width:100%" />
                <input id="algCategoryNs" placeholder="英文命名空间，如 statistics（字母/数字/下划线）" style="width:100%" oninput="window.validateAlgCategoryNs()" />
                <div class="field-error" id="algCategoryErr"></div>
              </div>
            </div>
            <div class="form-row"><label>中文名称</label><input id="algZhName" value="${page === "templates" ? "自定义算法模板" : "自定义算法组件"}" /></div>
            <div class="form-row"><label>描述</label><textarea id="algDesc" rows="3">说明算法用途、输入输出和适用场景。</textarea></div>
            <div class="form-row"><label>标签</label><input id="algTags" value="${page === "templates" ? "模板,自定义" : "自定义,组件"}" placeholder="逗号分隔" /></div>
            <div class="form-row"><label>版本</label><input id="algVersion" value="1.0.0" /></div>
            <div class="form-row"><label>代码</label><textarea id="algCode" rows="14">${esc(defaultAlgorithmCode("my_algorithm"))}</textarea></div>
            <div class="form-row"><label>输入示例 JSON <span style="color:var(--text-dim);font-size:12px">（将在测试窗口自动填充）</span></label><textarea id="algInputExample" rows="3">{"data":[0.1,0.6,0.9],"threshold":0.5}</textarea></div>
            <div class="form-row"><label>测试参数 JSON</label><textarea id="algTestKwargs" rows="4">{"data":[0.1,0.6,0.9],"threshold":0.5}</textarea></div>
          </div>
          <div id="algCreateOutput" class="output hidden"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button onclick="window.testNewAlgorithmSource()">测试源码</button>
            <button class="primary" onclick="window.saveNewAlgorithm('${moduleKind}')">保存为${page === "templates" ? "模板" : "草稿"}</button>
          </div>
        </div>
      `;
      const defOpt = [...qs("#algCategory").options].find(o => o.value === defaultNs);
      if (defOpt) qs("#algCategory").value = defaultNs;
    }

    function onAlgCatChange() {
      const v = qs("#algCategory")?.value;
      const row = qs("#newCatRow");
      if (row) row.style.display = v === "__new__" ? "" : "none";
    }

    function validateAlgCategoryNs() {
      const val = qs("#algCategoryNs")?.value || "";
      const errEl = qs("#algCategoryErr");
      if (!errEl) return;
      if (/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/.test(val)) {
        errEl.textContent = "命名空间不能包含中文字符";
      } else if (val && !/^[a-z_][a-z0-9_.]*$/.test(val)) {
        errEl.textContent = "只能使用小写字母、数字、下划线和点号";
      } else {
        errEl.textContent = "";
      }
    }

    function refreshCreateCodeName() {
      const name = qs("#algName")?.value.trim();
      const code = qs("#algCode");
      if (!name || !code) return;
      if (/^def my_algorithm\(/.test(code.value)) code.value = defaultAlgorithmCode(name);
    }

    async function testNewAlgorithmSource() {
      const out = qs("#algCreateOutput");
      const name = qs("#algName").value.trim();
      let kwargs = {};
      try {
        kwargs = JSON.parse(qs("#algTestKwargs").value || "{}");
      } catch (error) {
        showToast("测试参数必须是 JSON 对象");
        return;
      }
      try {
        const result = await api("/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify({ content: qs("#algCode").value, function: name, kwargs })
        });
        out.classList.remove("hidden");
        out.innerHTML = `<pre>${esc(JSON.stringify(result, null, 2))}</pre>`;
        showToast("源码测试通过");
      } catch (error) {
        out.classList.remove("hidden");
        out.innerHTML = `<pre>${esc(error.message)}</pre>`;
      }
    }

    async function saveNewAlgorithm(moduleKind) {
      const name = qs("#algName").value.trim();
      const catSelect = qs("#algCategory");
      const isNewCat = catSelect?.value === "__new__";
      const category = isNewCat
        ? (qs("#algCategoryNs")?.value.trim().replace(/^alg\./, "") || "")
        : (catSelect?.value || "").trim().replace(/^alg\./, "");
      const categoryName = isNewCat ? (qs("#algCategoryName")?.value.trim() || "") : "";
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        showToast("函数名必须是合法 Python 标识符");
        return;
      }
      if (!category) {
        showToast("请选择或输入命名空间");
        return;
      }
      if (/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/.test(category)) {
        showToast("命名空间不能包含中文字符，请使用英文字母、数字和下划线");
        return;
      }
      if (!/^[a-z_][a-z0-9_.]*$/.test(category)) {
        showToast("命名空间只能使用小写字母、数字、下划线和点号");
        return;
      }
      const payload = {
        name,
        category,
        category_zh_name: categoryName,
        zh_name: qs("#algZhName").value.trim(),
        zh_description: qs("#algDesc").value.trim(),
        zh_tags: qs("#algTags").value.split(",").map(item => item.trim()).filter(Boolean),
        version: qs("#algVersion").value.trim() || "1.0.0",
        code: qs("#algCode").value,
        module_kind: moduleKind,
        publish_status: moduleKind === "template" ? "published" : "draft",
        input_example: qs("#algInputExample")?.value.trim() || ""
      };
      try {
        const result = await api("/api/v1/algorithms/create", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        closeModal();
        showToast(moduleKind === "template" ? "模板已创建" : "组件草稿已创建");
        const page = moduleKind === "template" ? "templates" : "components";
        state.highlightId = result.algorithm?.id || "";
        await loadModuleData(page);
        switchPage(page);
        window.setTimeout(() => {
          state.highlightId = "";
          if (state.page === page) renderCards(page);
        }, 2000);
      } catch (error) {
        showToast(error.message);
      }
    }

    function defaultComplexFiles(name) {
      const funcName = name || "complex_algorithm";
      return [
        {
          relative_path: "main.py",
          content: `from algo_service.sdk.decorators import algo_meta\nfrom .preprocess import clean_values\nfrom .model import score_values\n\n\n@algo_meta(\n    zh_name=\"复杂算法示例\",\n    zh_description=\"多文件复杂算法入口，演示预处理、模型逻辑和结果封装。\",\n    zh_tags=[\"复杂算法\", \"多文件\"],\n    version=\"1.0.0\",\n)\ndef ${funcName}(data: list[float], threshold: float = 0.5) -> dict:\n    values = clean_values(data)\n    scores = score_values(values)\n    passed = [value for value, score in zip(values, scores) if score >= threshold]\n    return {\n        \"input_count\": len(data),\n        \"valid_count\": len(values),\n        \"scores\": scores,\n        \"passed\": passed,\n        \"threshold\": threshold,\n    }\n`
        },
        {
          relative_path: "preprocess.py",
          content: `def clean_values(data: list[float]) -> list[float]:\n    values = []\n    for item in data:\n        if item is None:\n            continue\n        values.append(float(item))\n    return values\n`
        },
        {
          relative_path: "model.py",
          content: `def score_values(values: list[float]) -> list[float]:\n    if not values:\n        return []\n    low = min(values)\n    high = max(values)\n    if low == high:\n        return [1.0 for _ in values]\n    return [round((value - low) / (high - low), 6) for value in values]\n`
        }
      ];
    }

    function openComplexAlgorithmModal() {
      const files = defaultComplexFiles("complex_algorithm");
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>新建多文件复杂算法</h3>
          <div class="form-grid">
            <div class="form-row"><label>包名</label><input id="pkgName" value="complex_algorithm" oninput="window.refreshComplexFiles()" /></div>
            <div class="form-row"><label>所属类别</label><input id="pkgNamespace" value="custom_complex" placeholder="例如 deep_learning" /></div>
            <div class="form-row"><label>中文名称</label><input id="pkgZhName" value="复杂算法组件" /></div>
            <div class="form-row"><label>入口函数</label><input id="pkgExport" value="complex_algorithm" oninput="window.refreshComplexFiles()" /></div>
            <div class="form-row"><label>描述</label><textarea id="pkgDesc" rows="3">多文件复杂算法，包含 main.py、preprocess.py 和 model.py。</textarea></div>
            <div class="form-row"><label>版本</label><input id="pkgVersion" value="1.0.0" /></div>
            <div class="form-row"><label>文件 JSON</label><textarea id="pkgFiles" rows="18">${esc(JSON.stringify(files, null, 2))}</textarea></div>
          </div>
          <div class="field-error" id="pkgErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.saveComplexAlgorithm()">创建复杂算法</button>
          </div>
        </div>
      `;
    }

    function refreshComplexFiles() {
      const exportName = qs("#pkgExport")?.value.trim() || qs("#pkgName")?.value.trim() || "complex_algorithm";
      const area = qs("#pkgFiles");
      if (area && area.value.includes("def complex_algorithm(")) {
        area.value = JSON.stringify(defaultComplexFiles(exportName), null, 2);
      }
    }

    async function saveComplexAlgorithm() {
      let files = [];
      try {
        files = JSON.parse(qs("#pkgFiles").value);
      } catch (error) {
        qs("#pkgErr").textContent = "文件 JSON 格式不正确";
        return;
      }
      const name = qs("#pkgName").value.trim();
      const namespace = qs("#pkgNamespace").value.trim().replace(/^alg\./, "");
      const exportName = qs("#pkgExport").value.trim();
      if (!name || !namespace || !exportName) {
        qs("#pkgErr").textContent = "包名、所属类别和入口函数不能为空";
        return;
      }
      try {
        const result = await api("/api/v1/packages/create", {
          method: "POST",
          body: JSON.stringify({
            name,
            namespace,
            zh_name: qs("#pkgZhName").value.trim(),
            version: qs("#pkgVersion").value.trim() || "1.0.0",
            entry: "main.py",
            exports: [exportName],
            zh_description: qs("#pkgDesc").value.trim(),
            zh_tags: ["复杂算法", "多文件"],
            module_kind: "component",
            published: false,
            publish_status: "draft",
            files
          })
        });
        closeModal();
        showToast("复杂算法组件已创建为草稿");
        state.highlightId = `${namespace}.${exportName}`;
        await loadModuleData("components");
        switchPage("components");
      } catch (error) {
        qs("#pkgErr").textContent = error.message;
      }
    }

    async function openEditorById(id, page, expandTest = false) {
      const collection = state.data[page] || [];
      const item = collection.find(entry => entry.id === id) || { id };
      await openEditor(item, page, expandTest);
    }

    async function openEditor(item, page, expandTest = false) {
      const source = await api(`/api/v1/algorithm-source/${safeId(item.id)}`);
      const algo = source.algorithm || item;
      state.editing = { id: item.id, page, algo, source, package: null };
      if (algo.packageId) {
        try {
          const packageData = await api(`/api/v1/packages/${safeId(algo.packageId)}`);
          state.editing.package = packageData.package;
        } catch (error) {
          showToast(error.message);
        }
      }
      renderEditorView(expandTest);
      await initEditor();
      if (expandTest) setTestHeight(240);
    }

    function renderEditorView(expandTest = false) {
      const e = state.editing;
      const nsPrefix = namespacePrefix(e.algo);
      const nsFunc = namespaceFunction(e.algo);
      const isOwner = canManageAlgorithm(e.algo);
      const isComponentEditor = e.page === "components" || e.page === "my-algos";
      qs("#main").innerHTML = `
        <div class="editor-view" id="editorView">
          <div class="editor-top">
            <button onclick="window.closeEditor()">返回</button>
            <span class="breadcrumb">${esc(pageTitle(e.page))} / ${esc(getName(e.algo))}</span>
            <button onclick="window.openComponentTestModal()">测试</button>
            <button onclick="window.editCurrentAlgorithmInfo()">基本信息</button>
            ${e.page === "templates" ? `<button onclick="window.editTemplateDescription('${esc(e.id)}')">编辑说明</button>` : ""}
            ${isComponentEditor && canSubmitAlgorithm(e.algo) ? `<button data-status-btn="1" onclick="window.openSubmitModal('${esc(e.id)}')">${getStatus(e.algo) === "rejected" ? "重新提交" : "提交审核"}</button>` : ""}
            ${isComponentEditor && ownsAlgorithm(e.algo) && getStatus(e.algo) === "published" && e.algo.hasReviewDraft ? `<button data-status-btn="1" class="warning" onclick="window.openSubmitModal('${esc(e.id)}')">提交审核</button>` : ""}
            ${isComponentEditor && ownsAlgorithm(e.algo) && getStatus(e.algo) === "reviewing" ? `<button data-status-btn="1" onclick="window.withdrawReview('${esc(e.id)}')">撤回审核</button>` : ""}
            ${isComponentEditor && state.currentUser?.role === "admin" && getStatus(e.algo) === "approved" ? `<button data-status-btn="1" class="success" onclick="window.publishComponent('${esc(e.id)}')">正式发布</button>` : ""}
            <div class="more-menu-wrap" style="position:relative">
              <button onclick="this.nextElementSibling.classList.toggle('hidden')">更多 ▾</button>
              <div class="more-menu hidden" style="position:absolute;top:100%;right:0;z-index:200;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;min-width:120px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,.4)">
                <div class="more-menu-item" onclick="window.openSnippetOverlay();this.closest('.more-menu').classList.add('hidden')">插入片段</div>
                <div class="more-menu-item" onclick="window.showVersions('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">版本历史</div>
                ${isComponentEditor && getStatus(e.algo) === "rejected" ? `<div class="more-menu-item" onclick="window.viewRejectedDraft('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">查看驳回内容</div><div class="more-menu-item danger" onclick="window.discardRejectedDraft('${esc(e.id)}');this.closest('.more-menu').classList.add('hidden')">放弃修改</div>` : ""}
              </div>
            </div>
            <span class="spacer"></span>
            <div class="namespace-edit" id="nsBox">
              <div style="display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center">
                <span class="card-ns">${esc(nsPrefix)}</span>
                <input id="nsInput" value="${esc(nsFunc)}" onblur="window.validateNamespace()" />
              </div>
              <div class="field-error" id="nsErr"></div>
            </div>
            <button onclick="window.saveAndCloseEditor()">保存并退出</button>
            <button class="primary" onclick="window.saveNamespace()">保存</button>
            ${!isOwner && state.currentUser ? `<div class="editor-notice">💡 此算法不属于您，点击「保存」将另存为您的私有草稿</div>` : ""}
          </div>
          <div class="editor-main" id="editorMain">
            <aside class="file-tree" id="fileTree"></aside>
            <div class="tree-resize" onmousedown="window.startTreeResize(event)"></div>
            <div class="monaco-host" id="monacoHost"></div>
          </div>
        </div>
      `;
    }

    async function loadMonaco() {
      if (state.monacoReady) return state.monacoReady;
      state.monacoReady = new Promise(resolve => {
        require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
        require(["vs/editor/editor.main"], () => {
          monaco.editor.defineTheme("algolib-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
              { token: "keyword", foreground: "569cd6" },
              { token: "string", foreground: "ce9178" },
              { token: "comment", foreground: "6a9955" },
              { token: "number", foreground: "b5cea8" },
              { token: "identifier", foreground: "dcdcaa" }
            ],
            colors: { "editor.background": "#040e1f" }
          });
          state.monaco = monaco;
          resolve(monaco);
        });
      });
      return state.monacoReady;
    }

    async function initEditor() {
      const m = await loadMonaco();
      const e = state.editing;
      const source = e.source || {};
      let files = [];
      if (Array.isArray(source.folder_files) && source.folder_files.length) {
        files = source.folder_files.map(file => ({
          filename: file.relative_path || file.filename,
          content: file.content || "",
          isEntry: !!file.is_entry,
          functions: normalizeFunctions(file.functions || [])
        }));
      } else if (e.package && Array.isArray(e.package.files)) {
        files = e.package.files.filter(file => String(file.filename || file.relative_path).endsWith(".py")).map(file => ({
          filename: file.relative_path || file.filename,
          content: file.content || "",
          isEntry: file.filename === e.package.entry,
          functions: normalizeFunctions(file.functions || [])
        }));
      } else {
        files = [{
          filename: (e.algo.sourceFile || "source.py").split(/[\\/]/).pop(),
          content: source.source || "",
          isEntry: true,
          functions: normalizeFunctions([{ func_name: e.algo.funcName, params: e.algo.params || [] }])
        }];
      }
      if (!files.length) files = [{ filename: "source.py", content: "", isEntry: true, functions: [] }];

      if (state.editor) {
        state.editor.dispose();
        state.editor = null;
        window._activeMonaco = null;
      }
      state.models.forEach(model => {
        if (model && !model.isDisposed()) model.dispose();
      });
      state.models.clear();
      state.fileMeta.clear();
      state.viewStates.clear();
      files.forEach(file => {
        const uri = m.Uri.parse(`inmemory://algolib/${encodeURIComponent(e.id)}/${encodeURIComponent(file.filename)}`);
        const existing = m.editor.getModel(uri);
        if (existing && !existing.isDisposed()) existing.dispose();
        const model = m.editor.createModel(file.content, "python", uri);
        state.models.set(file.filename, model);
        state.fileMeta.set(file.filename, file);
      });
      const first = (files.find(file => file.isEntry) || files[0]).filename;
      state.currentFile = first;
      renderFileTree();
      state.editor = m.editor.create(qs("#monacoHost"), {
        model: state.models.get(first),
        theme: "algolib-dark",
        language: "python",
        automaticLayout: true,
        fontSize: 14,
        tabSize: 4,
        autoIndent: "full",
        folding: true,
        bracketPairColorization: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          useShadows: false
        }
      });
      window._activeMonaco = state.editor;
      state.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveCurrentFile());
      state.editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
      await registerCompletionProvider();
      renderTestPanel();
    }

    function normalizeFunctions(functions) {
      return (functions || []).map(fn => {
        if (typeof fn === "string") return { func_name: fn, name: fn, params: [] };
        return {
          ...fn,
          func_name: fn.func_name || fn.name,
          name: fn.name || fn.func_name,
          params: fn.params || []
        };
      }).filter(fn => fn.func_name || fn.name);
    }

    async function refreshEditorFolderFiles(files, activeFile) {
      const m = await loadMonaco();
      const normalized = (files || []).map(file => ({
        filename: file.relative_path || file.filename,
        content: file.content || "",
        isEntry: !!file.is_entry,
        functions: normalizeFunctions(file.functions || [])
      })).filter(file => file.filename);
      if (!normalized.length) return;

      if (!state.editing.source) state.editing.source = {};
      state.editing.source.folder_files = normalized;
      const nextNames = new Set(normalized.map(file => file.filename));

      Array.from(state.models.entries()).forEach(([filename, model]) => {
        if (!nextNames.has(filename)) {
          if (model && !model.isDisposed()) model.dispose();
          state.models.delete(filename);
          state.fileMeta.delete(filename);
          state.viewStates.delete(filename);
        }
      });

      normalized.forEach(file => {
        const uri = m.Uri.parse(`inmemory://algolib/${encodeURIComponent(state.editing.id)}/${encodeURIComponent(file.filename)}`);
        let model = state.models.get(file.filename);
        if (!model || model.isDisposed()) {
          const existing = m.editor.getModel(uri);
          if (existing && !existing.isDisposed()) existing.dispose();
          model = m.editor.createModel(file.content, "python", uri);
          state.models.set(file.filename, model);
        } else if (model.getValue() !== file.content && file.filename !== state.currentFile) {
          model.setValue(file.content);
        }
        state.fileMeta.set(file.filename, file);
      });

      const target = activeFile && state.models.has(activeFile)
        ? activeFile
        : (normalized.find(file => file.isEntry) || normalized[0]).filename;
      renderFileTree();
      switchFile(target);
    }

    function renderFileTree() {
      const files = Array.from(state.fileMeta.values());
      qs("#fileTree").innerHTML = `
        <div class="file-tree-head">
          <span>目录文件</span>
          <button class="ghost" type="button" data-add-file="1" onclick="window.addSourceFile(event)">＋ 新增文件</button>
        </div>
        ${files.map(file => {
          const names = (file.functions || []).map(fn => fn.func_name || fn.name).filter(Boolean);
          return `
            <div class="file-item ${file.filename === state.currentFile ? "active" : ""}" data-file-name="${esc(file.filename)}">
              <div class="file-name" style="display:flex;align-items:center;gap:4px">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(file.filename)}${file.isEntry ? " · entry" : ""}</span>
                <button class="ghost" type="button" style="font-size:11px;padding:1px 5px;flex-shrink:0" data-rename-file="${esc(file.filename)}" onclick="event.stopPropagation();window.renameSourceFile(this.dataset.renameFile)" title="重命名">改名</button>
              </div>
              <div class="file-functions">${names.length ? `def ${esc(names.join(", "))}` : "无函数"}</div>
            </div>
          `;
        }).join("")}
      `;
      qsa("[data-file-name]", qs("#fileTree")).forEach(item => {
        item.addEventListener("click", () => switchFile(item.dataset.fileName || ""));
      });
    }

    function switchFile(filename) {
      if (!state.editor || !state.models.has(filename)) return;
      if (state.currentFile) state.viewStates.set(state.currentFile, state.editor.saveViewState());
      state.currentFile = filename;
      state.editor.setModel(state.models.get(filename));
      const viewState = state.viewStates.get(filename);
      if (viewState) state.editor.restoreViewState(viewState);
      state.editor.focus();
      renderFileTree();
      renderTestPanel();
    }

    function openSourceFileModal(mode, oldName = "") {
      const isRename = mode === "rename";
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:440px">
          <h3>${isRename ? "重命名文件" : "新增 Python 文件"}</h3>
          <div class="form-grid">
            ${isRename ? `<div class="form-row"><label>当前文件</label><input value="${esc(oldName)}" disabled /></div>` : ""}
            <div class="form-row"><label>文件名</label><input id="sourceFileNameInput" value="${esc(isRename ? oldName : "helpers.py")}" placeholder="例如 helpers.py" /></div>
          </div>
          <div class="field-error" id="sourceFileErr"></div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.confirmSourceFileModal('${esc(mode)}','${esc(oldName)}')">${isRename ? "确认改名" : "创建文件"}</button>
          </div>
        </div>
      `;
      window.setTimeout(() => qs("#sourceFileNameInput")?.focus(), 0);
    }

    function addSourceFile(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openSourceFileModal("add");
    }

    function renameSourceFile(oldName) {
      if (!oldName) return;
      openSourceFileModal("rename", oldName);
    }

    async function confirmSourceFileModal(mode, oldName = "") {
      const clean = qs("#sourceFileNameInput")?.value.trim() || "";
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(clean) || clean === "__init__.py") {
        qs("#sourceFileErr").textContent = "文件名必须是普通 .py 文件，例如 helpers.py";
        return;
      }
      if (mode === "rename" && clean === oldName) {
        closeModal();
        return;
      }
      try {
        if (mode === "rename") await doRenameSourceFile(oldName, clean);
        else await doAddSourceFile(clean);
        closeModal();
      } catch (error) {
        const err = qs("#sourceFileErr");
        if (err) err.textContent = error.message;
        else showToast(error.message);
      }
    }

    async function doAddSourceFile(clean) {
      const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/add-file`, {
        method: "POST",
        body: JSON.stringify({ filename: clean, content: "# 新文件\n" })
      });
      await refreshEditorFolderFiles(result.folder_files || [], clean);
      showToast("文件已创建");
    }

    async function doRenameSourceFile(oldName, clean) {
      const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/rename-file`, {
        method: "PATCH",
        body: JSON.stringify({ old_name: oldName, new_name: clean })
      });
      if (result.algorithm) {
        state.editing.algo = result.algorithm;
        state.editing.id = result.algorithm.id || state.editing.id;
      }
      await refreshEditorFolderFiles(result.folder_files || [], clean);
      showToast(`文件已重命名为 ${clean}`);
    }

    // workspace textarea 界面的文件重命名（新建算法时）
    function renameWorkspaceFile(oldPath) {
      const newName = window.prompt("请输入新文件名（如 helpers.py）", oldPath);
      if (!newName || newName.trim() === oldPath) return;
      const clean = newName.trim();
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.py$/.test(clean)) {
        showToast("文件名格式不正确，必须以 .py 结尾");
        return;
      }
      const file = newAlgoState.files.find(f => f.relative_path === oldPath);
      if (!file) return;
      updateWorkspaceFileContent();
      file.relative_path = clean;
      if (newAlgoState.currentFile === oldPath) newAlgoState.currentFile = clean;
      renderWorkspaceFiles();
      showToast(`已重命名为 ${clean}`);
    }

    async function _saveAsPrivateDraft() {
      const algo = state.editing?.algo;
      if (!algo) return;
      const content = state.models.get(state.currentFile)?.getValue() || "";
      const funcName = qs("#nsInput")?.value.trim() || algo.funcName || algo.name || "my_func";
      const category = algo.namespace || "custom";
      const moduleKind = state.editing.page === "templates" ? "template" : "component";
      try {
        const result = await api("/api/v1/algorithms/create", {
          method: "POST",
          body: JSON.stringify({
            name: funcName,
            zh_name: algo.zhName || funcName,
            category,
            version: algo.version || "1.0.0",
            zh_description: algo.zhDescription || "",
            zh_tags: algo.zhTags || [],
            code: content,
            module_kind: moduleKind,
            publish_status: "draft",
            input_example: algo.inputExample || ""
          })
        });
        const newAlgo = result.algorithm;
        if (newAlgo) {
          state.editing.id = newAlgo.id;
          state.editing.algo = newAlgo;
          await loadModuleData(state.editing.page);
          showToast("✅ 已另存为您的私有草稿");
          refreshEditorStatusButtons();
          // Update namespace display to new algo
          const nsInput = qs("#nsInput");
          if (nsInput) nsInput.value = namespaceFunction(newAlgo);
        }
      } catch (err) {
        showToast(err.message);
      }
    }

    async function saveCurrentFile() {
      if (!state.editing || !state.currentFile) return;
      const content = state.models.get(state.currentFile)?.getValue() || "";
      const packageId = state.editing.algo.packageId || state.editing.package?.package_id;
      const isOwner = canManageAlgorithm(state.editing.algo);
      if (!packageId) {
        if (!isOwner) {
          await _saveAsPrivateDraft();
          return;
        }
        try {
          const result = await api(`/api/v1/algorithm-source/${safeId(state.editing.id)}/files/${safeId(state.currentFile)}`, {
            method: "POST",
            body: JSON.stringify({ content })
          });
          state.editing.algo = result.algorithm || state.editing.algo;
          state.editing.source.folder_files = result.folder_files || state.editing.source.folder_files;
          if (result.is_draft_mode) {
            showToast("已保存为草稿（提交审核后生效）");
          } else {
            showToast("文件已保存");
          }
          refreshEditorStatusButtons();
        } catch (error) {
          showToast(error.message);
        }
        return;
      }
      try {
        await api(`/api/v1/packages/${safeId(packageId)}/files/${safeId(state.currentFile)}`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        showToast("文件已保存");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function registerCompletionProvider() {
      const m = await loadMonaco();
      try {
        const data = await api("/api/v1/stubs/completions");
        state.completionItems = data.items || data.completions || data.algorithms || [];
      } catch (error) {
        state.completionItems = [];
      }
      if (state.completionDisposable) state.completionDisposable.dispose();
      state.completionDisposable = m.languages.registerCompletionItemProvider("python", {
        triggerCharacters: ["."],
        provideCompletionItems(model, position) {
          const before = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: Math.max(1, position.column - 12),
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });
          if (!before.includes("alg.")) return { suggestions: [] };
          return {
            suggestions: state.completionItems.map(item => {
              const call = item.callPrefix || item.call_prefix || item.label || "";
              const params = item.params || [];
              const insertText = item.insertText || item.callSnippet || `${call}(${params.map((param, index) => `\${${index + 1}:${param.name || "arg"}}`).join(", ")})`;
              return {
                label: call,
                kind: m.languages.CompletionItemKind.Function,
                insertText,
                insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: item.zhDescription || item.zh_description || item.documentation || "",
                detail: item.detail || call,
                range: null
              };
            })
          };
        }
      });
    }

    function validateNamespace() {
      const value = qs("#nsInput").value.trim();
      const hasChinese = /[\u4e00-\u9fa5\uff00-\uffef]/.test(value);
      const ok = /^[a-z_][a-z0-9_]*$/.test(value);
      qs("#nsBox").classList.toggle("invalid", !ok);
      qs("#nsErr").textContent = ok ? "" : hasChinese ? "函数名不能包含中文，请使用小写字母和下划线" : "函数名只能使用小写字母、数字和下划线（如 lgbm_train）";
      return ok;
    }

    async function saveNamespace() {
      if (!validateNamespace()) return;
      const isOwner = canManageAlgorithm(state.editing.algo);
      if (!isOwner) {
        await _saveAsPrivateDraft();
        return;
      }
      const newNamespace = `${namespacePrefix(state.editing.algo)}${qs("#nsInput").value.trim()}`;
      try {
        const result = await api(`/api/v1/algorithms/${safeId(state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ namespace: newNamespace })
        });
        state.editing.id = result.algorithm.id;
        state.editing.algo = result.algorithm;
        showToast("函数调用名已更新");
      } catch (error) {
        showToast(error.message);
      }
    }

    function closeEditor() {
      const page = state.editing?.page || state.page;
      if (state.editor) {
        state.editor.dispose();
        state.editor = null;
      }
      state.models.forEach(model => {
        if (model && !model.isDisposed()) model.dispose();
      });
      state.models.clear();
      state.fileMeta.clear();
      state.viewStates.clear();
      state.editing = null;
      window._activeMonaco = null;
      switchPage(page);
    }

    async function saveAndCloseEditor() {
      await saveCurrentFile();
      closeEditor();
    }

    function setTestHeight(height) {
      state.testHeight = Math.max(0, Math.min(500, Number(height) || 0));
      const panel = qs("#testPanel");
      if (!panel) return;
      panel.style.height = `${state.testHeight}px`;
      panel.classList.toggle("open", state.testHeight > 0);
      state.editor?.layout();
    }

    function startTestResize(event) {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = state.testHeight || 0;
      function move(moveEvent) {
        const next = Math.max(120, Math.min(500, startHeight - (moveEvent.clientY - startY)));
        setTestHeight(next);
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }

    function startTreeResize(event) {
      event.preventDefault();
      const root = qs("#editorView");
      const startX = event.clientX;
      const initial = parseInt(getComputedStyle(root).getPropertyValue("--tree-width")) || 232;
      function move(moveEvent) {
        const width = Math.max(120, Math.min(320, initial + moveEvent.clientX - startX));
        root.style.setProperty("--tree-width", `${width}px`);
        state.editor?.layout();
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }

    function currentFunctions() {
      return state.fileMeta.get(state.currentFile)?.functions || normalizeFunctions([{ func_name: state.editing?.algo?.funcName, params: state.editing?.algo?.params || [] }]);
    }
    function currentFunction() {
      const name = qs("#funcSelect")?.value;
      return currentFunctions().find(fn => (fn.func_name || fn.name) === name) || currentFunctions()[0] || { func_name: state.editing?.algo?.funcName, params: [] };
    }

    function renderTestPanel() {
      const panel = qs("#testPanel");
      if (!panel || !state.editing) return;
      const functions = currentFunctions();
      panel.innerHTML = `
        <select id="funcSelect" onchange="window.renderParams()">
          ${functions.map(fn => `<option value="${esc(fn.func_name || fn.name)}">${esc(fn.func_name || fn.name)}</option>`).join("")}
        </select>
        ${state.editing?.algo?.inputExample ? `<div class="control-row" style="margin-bottom:4px;gap:8px"><button class="ghost" style="padding:2px 10px;font-size:12px" onclick="window.loadInputExample()">📋 加载输入示例</button><span style="color:var(--text-dim);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px">${esc(state.editing.algo.inputExample.slice(0,80))}</span></div>` : ""}
        <div id="params" class="param-grid"></div>
        <div class="control-row">
          <button class="primary" id="runBtn" onclick="window.runTest()">▶ 运行</button>
          <select id="timeout"><option value="5">5s</option><option value="30">30s</option><option value="60">60s</option></select>
          <button onclick="window.saveTestCase()">保存测试用例</button>
          <select id="history" onchange="window.loadTestCase()"><option value="">历史记录</option></select>
          <button onclick="window.generateExampleData()">生成示例数据</button>
        </div>
        <div class="tabs">
          <button class="active" data-mode="json" onclick="window.switchOutput('json')">JSON</button>
          <button data-mode="viz" onclick="window.switchOutput('viz')">可视化</button>
        </div>
        <div class="output" id="output"><pre>等待运行</pre></div>
        <div id="runStatus" class="field-error"></div>
      `;
      renderParams();
      // Auto-fill from stored inputExample if available
      if (state.editing?.algo?.inputExample) {
        try {
          const parsed = JSON.parse(state.editing.algo.inputExample);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            renderParams(parsed);
          }
        } catch { /* ignore invalid json */ }
      }
      loadHistoryOptions();
    }

    function renderParams(values = {}) {
      const fn = currentFunction();
      const params = fn.params || [];
      qs("#params").innerHTML = params.map(param => {
        const name = param.name || "";
        const type = String(param.type || param.annotation || "str");
        const rawValue = values[name];
        const value = rawValue ?? "";
        if (/bool/i.test(type)) {
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><select data-param="${esc(name)}" data-type="${esc(type)}"><option value="false">false</option><option value="true" ${rawValue === true || rawValue === "true" ? "selected" : ""}>true</option></select></div>`;
        }
        if (/list|dict|DataFrame|dataframe/i.test(type)) {
          const textVal = (rawValue !== undefined && rawValue !== null && typeof rawValue === "object") ? JSON.stringify(rawValue) : String(value);
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><textarea rows="4" data-param="${esc(name)}" data-type="${esc(type)}" placeholder="${/DataFrame|dataframe/.test(type) ? "粘贴 CSV" : "JSON"}">${esc(textVal)}</textarea></div>`;
        }
        if (/int|float|number/i.test(type)) {
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input type="number" data-param="${esc(name)}" data-type="${esc(type)}" value="${esc(value)}" /></div>`;
        }
        return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input data-param="${esc(name)}" data-type="${esc(type)}" value="${esc(value)}" /></div>`;
      }).join("") || '<div class="empty">当前函数无参数</div>';
    }

    function refreshEditorStatusButtons() {
      if (!state.editing) return;
      const topBar = document.querySelector(".editor-top");
      if (!topBar) return;
      const e = state.editing;
      const status = getStatus(e.algo);
      const id = e.id;
      const isComponentEditor = e.page === "components" || e.page === "my-algos";
      // Remove both static (data-status-btn) and previously dynamic (data-dynamic) buttons
      topBar.querySelectorAll("[data-status-btn],[data-dynamic]").forEach(b => b.remove());
      const insertBefore = topBar.querySelector(".spacer") || topBar.querySelector(".more-menu-wrap");
      const addBtn = (text, cls, fn) => {
        const btn = document.createElement("button");
        btn.dataset.statusBtn = "1";
        if (cls) btn.className = cls;
        btn.textContent = text;
        btn.onclick = fn;
        topBar.insertBefore(btn, insertBefore);
      };
      if (isComponentEditor && canSubmitAlgorithm(e.algo)) {
        addBtn(status === "rejected" ? "重新提交" : "提交审核", "", () => window.openSubmitModal(id));
      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "published" && e.algo.hasReviewDraft) {
        addBtn("提交审核", "warning", () => window.openSubmitModal(id));
      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "reviewing") {
        addBtn("撤回审核", "", () => window.withdrawReview(id));
      } else if (isComponentEditor && state.currentUser?.role === "admin" && status === "approved") {
        addBtn("正式发布", "success", () => window.publishComponent(id));
      }
    }

    function collectParams() {
      const payload = {};
      qsa("[data-param]").forEach(input => {
        const name = input.dataset.param;
        const type = input.dataset.type || "";
        payload[name] = parseParamValueByType(type, input.value);
      });
      return payload;
    }

    function generateExampleData() {
      // Prefer stored inputExample from creation
      const savedExample = state.editing?.algo?.inputExample;
      if (savedExample) {
        try {
          const parsed = JSON.parse(savedExample);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            // Plain object: keys match param names
            renderParams(parsed);
            return;
          }
          // Array or primitive: assign to the first param
          const params = currentFunction().params || [];
          if (params.length > 0) {
            renderParams({ [params[0].name]: parsed });
            return;
          }
        } catch { /* fall through to auto-generate */ }
      }
      const values = {};
      (currentFunction().params || []).forEach(param => {
        const type = String(param.type || param.annotation || "str");
        if (/DataFrame|dataframe/i.test(type)) values[param.name] = "a,b,c\n1,2,3\n4,5,6\n7,8,9\n2,3,4\n5,6,7";
        else if (/list|List/i.test(type)) {
          if (/float/i.test(type)) values[param.name] = "[1.0, 2.0, 3.0]";
          else if (/int/i.test(type)) values[param.name] = "[1, 2, 3]";
          else if (/str/i.test(type)) values[param.name] = "[\"a\", \"b\", \"c\"]";
          else values[param.name] = "[1, 2, 3]";
        }
        else if (/dict|Dict/i.test(type)) values[param.name] = "{\"key\": \"value\"}";
        else if (/int/i.test(type)) values[param.name] = 10;
        else if (/float|number/i.test(type)) values[param.name] = 1.0;
        else if (/bool/i.test(type)) values[param.name] = true;
        else values[param.name] = "example";
      });
      renderParams(values);
    }

    async function runTest() {
      const button = qs("#runBtn");
      const started = performance.now();
      button.disabled = true;
      button.textContent = "运行中...";
      try {
        const fn = currentFunction();
        const functionName = fn.func_name || fn.name;
        const params = collectParams();
        const content = state.models.get(state.currentFile)?.getValue() || "";
        const algoStatus = state.editing?.algo?.publishStatus || state.editing?.algo?.status || "";
        const isPublished = algoStatus === "published";
        const body = state.editing?.algo?.id
          ? isPublished
            ? { namespace: state.editing.algo.namespace, function: functionName, params }
            : { namespace: state.editing.algo.namespace, function: functionName, params, allow_unpublished: true }
          : { content, function: functionName, kwargs: params };
        const result = await api(state.editing?.algo?.id ? "/api/v1/run" : "/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify(body)
        });
        state.lastRunResult = result.result;
        renderOutput(state.outputMode);
        qs("#runStatus").textContent = `✅ ${result.elapsed_ms ?? Math.round(performance.now() - started)} ms`;
      } catch (error) {
        qs("#runStatus").textContent = `❌ ${Math.round(performance.now() - started)} ms`;
        qs("#output").innerHTML = `<pre>${esc(error.message)}</pre>`;
      } finally {
        button.disabled = false;
        button.textContent = "▶ 运行";
      }
    }

    function switchOutput(mode) {
      state.outputMode = mode;
      qsa(".tabs button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
      renderOutput(mode);
    }

    function renderOutput(mode) {
      const value = state.lastRunResult;
      const out = qs("#output");
      if (!out) return;
      if (mode === "json") {
        out.innerHTML = `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
        return;
      }
      if (Array.isArray(value) && Array.isArray(value[0])) {
        const flat = value.flat().map(Number);
        const min = Math.min(...flat);
        const max = Math.max(...flat);
        out.innerHTML = `<div class="heatmap" style="grid-template-columns: repeat(${value[0].length}, minmax(24px, 1fr))">${value.flat().map(cell => {
          const ratio = max === min ? .5 : (Number(cell) - min) / (max - min);
          const color = `color-mix(in srgb, var(--primary) ${Math.round((1 - ratio) * 100)}%, var(--accent))`;
          return `<div class="heatcell" title="${esc(cell)}" style="background:${color}"></div>`;
        }).join("")}</div>`;
        return;
      }
      if (Array.isArray(value)) {
        const points = value.map(Number);
        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const coords = points.map((point, index) => {
          const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
          const y = 100 - ((point - min) / (max - min || 1)) * 90;
          return `${x},${y}`;
        }).join(" ");
        out.innerHTML = `<svg class="linechart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
        return;
      }
      if (value && typeof value === "object") {
        out.innerHTML = `<table class="kv-table"><tbody>${Object.entries(value).map(([key, val]) => `<tr><th>${esc(key)}</th><td>${esc(JSON.stringify(val))}</td></tr>`).join("")}</tbody></table>`;
        return;
      }
      out.innerHTML = `<pre>${esc(value)}</pre>`;
    }

    function testCaseKey() {
      return `algolib_tc_${state.editing?.id || "source"}_${currentFunction().func_name || currentFunction().name}`;
    }
    function saveTestCase() {
      const key = testCaseKey();
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      items.unshift({ time: new Date().toISOString(), params: collectParams() });
      localStorage.setItem(key, JSON.stringify(items.slice(0, 10)));
      loadHistoryOptions();
      showToast("测试用例已保存");
    }
    function loadHistoryOptions() {
      const select = qs("#history");
      if (!select) return;
      const items = JSON.parse(localStorage.getItem(testCaseKey()) || "[]");
      select.innerHTML = '<option value="">历史记录</option>' + items.map((item, index) => `<option value="${index}">${esc(item.time)}</option>`).join("");
    }
    function loadTestCase() {
      const index = qs("#history").value;
      if (index === "") return;
      const items = JSON.parse(localStorage.getItem(testCaseKey()) || "[]");
      renderParams(items[Number(index)]?.params || {});
    }

    function editCurrentAlgorithmInfo() {
      if (!state.editing?.algo) return;
      openAlgorithmInfoModal(state.editing.algo, state.editing.page);
    }

    async function editTemplateDescription(id) {
      const item = state.editing?.algo || (state.data.templates || []).find(e => e.id === id);
      if (!item) { showToast("未找到模板"); return; }
      const curDesc = item.zhDescription || item.zh_description || "";
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:600px">
          <h3>编辑使用说明</h3>
          <div class="form-grid">
            <div class="form-row full"><label>使用说明（zh_description）</label><textarea id="tplDescInput" rows="8" style="font-family:inherit;resize:vertical">${esc(curDesc)}</textarea></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window.saveTemplateDescription('${esc(id)}')">保存</button>
          </div>
        </div>
      `;
    }

    async function saveTemplateDescription(id) {
      const desc = qs("#tplDescInput")?.value ?? "";
      closeModal();
      try {
        const res = await api(`/api/v1/algorithms/${safeId(id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ zh_description: desc })
        });
        if (state.editing?.algo) {
          state.editing.algo.zhDescription = desc;
          state.editing.algo.zh_description = desc;
        }
        const items = state.data.templates || [];
        const idx = items.findIndex(e => e.id === id);
        if (idx >= 0) { items[idx].zhDescription = desc; items[idx].zh_description = desc; }
        showToast("使用说明已保存");
      } catch (err) { showToast(err.message); }
    }

    function editAlgorithmInfo(id, page) {
      const item = (state.data[page] || []).find(entry => entry.id === id);
      if (!item) {
        showToast("未找到算法条目");
        return;
      }
      openAlgorithmInfoModal(item, page);
    }

    function openAlgorithmInfoModal(item, page) {
      const prefix = namespacePrefix(item);
      const funcName = namespaceFunction(item);
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>基本信息</h3>
          <div class="form-grid">
            <div class="form-row"><label>中文名称</label><input value="${esc(item.zhName || "")}" disabled /></div>
            <div class="form-row"><label>描述</label><textarea rows="4" disabled>${esc(item.zhDescription || "")}</textarea></div>
            <div class="form-row"><label>命名空间</label><input value="${esc(item.namespace || "")}" disabled /></div>
            <div class="form-row"><label>标签</label><input value="${esc((item.zhTags || []).join(","))}" disabled /></div>
            <div class="form-row"><label>版本</label><input value="${esc(item.version || "1.0.0")}" disabled /></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">关闭</button>
            <button class="primary" onclick="window.closeModal();window.openEditorById('${esc(item.id)}','${esc(page)}')">去编辑</button>
          </div>
        </div>
      `;
    }

    async function saveAlgorithmInfo(id, page) {
      const item = state.editing?.id === id ? state.editing.algo : (state.data[page] || []).find(entry => entry.id === id);
      if (!item) {
        qs("#infoErr").textContent = "未找到算法条目";
        return;
      }
      const funcName = qs("#infoFuncName").value.trim();
      if (!/^[a-z_][a-z0-9_]*$/.test(funcName)) {
        qs("#infoErr").textContent = "函数调用名只能使用小写字母、数字和下划线";
        return;
      }
      const namespace = `${namespacePrefix(item)}${funcName}`;
      const payload = {
        zh_name: qs("#infoZhName").value.trim(),
        zh_description: qs("#infoDesc").value.trim(),
        namespace,
        zh_tags: qs("#infoTags").value.split(",").map(item => item.trim()).filter(Boolean),
        version: qs("#infoVersion").value.trim() || "1.0.0"
      };
      try {
        const result = await api(`/api/v1/algorithms/${safeId(id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        closeModal();
        showToast("基本信息已更新");
        if (state.editing?.id === id) {
          state.editing.id = result.algorithm.id;
          state.editing.algo = result.algorithm;
          const nsInput = qs("#nsInput");
          if (nsInput) nsInput.value = namespaceFunction(result.algorithm);
        }
        await loadModuleData(page);
        if (state.page === page) renderCards(page);
      } catch (error) {
        qs("#infoErr").textContent = error.message;
      }
    }

    async function publishAsComponent(id, button) {
      button?.blur();
      const item = (state.data.templates || []).find(e => e.id === id);
      if (!item) { showToast("未找到模板条目"); return; }

      // 获取组件分类
      let compCats = state.categories.components || [];
      if (!compCats.length) {
        try {
          const catData = await api("/api/v1/categories?module_kind=component");
          compCats = normalizeListPayload(catData, "categories");
          state.categories.components = compCats;
        } catch (_e) { compCats = []; }
      }

      // 获取模板源码
      let templateCode = "";
      try {
        const src = await api(`/api/v1/algorithm-source/${safeId(id)}`);
        templateCode = src.source || src.folder_files?.[0]?.content || "";
      } catch (_e) {}

      const defaultName = String(item.funcName || item.id || "").split(".").pop() || "my_algorithm";
      const catOptions = compCats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zhName || c.zh_name || c.namespace)}</option>`).join("");
      const usageTips = item.zhDescription || item.description || "";
      const defaultTags = (item.zhTags || []).join(",");
      const defaultInput = item.inputExample || '{"data":[0.1,0.6,0.9],"threshold":0.5}';

      qs("#main").innerHTML = `
        <div class="new-workspace">
          <div class="editor-top">
            <button onclick="window.switchPage('templates')">返回</button>
            <strong>基于模板新建组件：${esc(item.zhName || defaultName)}</strong>
            <span class="spacer"></span>
            <button onclick="window.testTplSource()">测试代码</button>
            <button class="ghost" onclick="window.saveTplDraft('${esc(id)}')">保存草稿</button>
            <button class="primary" onclick="window.confirmPublishAsComponent('${esc(id)}')">提交审核</button>
          </div>
          <details class="template-usage-details" open>
            <summary>📖 模板使用说明（点击折叠）</summary>
            <div class="template-usage-body">${esc(usageTips || "暂无使用说明")}</div>
          </details>
          <div class="new-form-grid">
            <label>组件函数名<input id="tplName" value="${esc(defaultName)}" /></label>
            <label>所属分类
              <select id="tplCategory" onchange="window.onTplCatChange()">
                ${catOptions}
                <option value="__new__">＋ 新建分类...</option>
              </select>
            </label>
            <label id="tplNewCatRow" class="full" style="display:none">新分类信息
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input id="tplCategoryName" placeholder="中文显示名，如 统计算法" style="flex:1;min-width:140px" />
                <input id="tplCategoryNs" placeholder="英文命名空间，如 statistics" style="flex:1;min-width:140px" />
              </div>
            </label>
            <label>版本<input id="tplVersion" value="1.0.0" /></label>
            <label>中文名称<input id="tplZhName" value="${esc(item.zhName || "")}" /></label>
            <label class="wide">标签<input id="tplTags" value="${esc(defaultTags)}" placeholder="逗号分隔" /></label>
            <label class="full">描述<textarea id="tplDesc" rows="2">${esc(usageTips)}</textarea></label>
            <label class="full">输入示例 JSON<textarea id="tplInputExample" rows="2">${esc(defaultInput)}</textarea></label>
          </div>
          <div class="file-editor-grid">
            <div class="file-list-panel" id="tplFileList">
              <button class="active">${esc(defaultName)}.py</button>
            </div>
            <textarea id="tplCode" class="file-edit-area" spellcheck="false">${esc(templateCode)}</textarea>
          </div>
          <div id="tplOutput" class="output hidden"></div>
        </div>
      `;
      // 恢复分类默认选中
      const firstCat = compCats[0];
      if (firstCat && qs("#tplCategory")) qs("#tplCategory").value = firstCat.namespace;
    }

    function onTplCatChange() {
      const v = qs("#tplCategory")?.value;
      const row = qs("#tplNewCatRow");
      if (row) row.style.display = v === "__new__" ? "" : "none";
    }

    function inferTplParamType(value) {
      if (typeof value === "boolean") return "bool";
      if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
      if (Array.isArray(value)) return "list";
      if (value && typeof value === "object") return "dict";
      return "str";
    }

    function splitTopLevelParams(paramText) {
      const items = [];
      let current = "";
      let depth = 0;
      for (const ch of paramText || "") {
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) {
          if (current.trim()) items.push(current.trim());
          current = "";
          continue;
        }
        current += ch;
      }
      if (current.trim()) items.push(current.trim());
      return items;
    }

    function getTplFunctionParams(functionName) {
      const source = qs("#tplCode")?.value || "";
      if (!source.trim()) return [];
      const escapedName = String(functionName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!escapedName) return [];
      const re = new RegExp(`def\\s+${escapedName}\\s*\\(([^)]*)\\)\\s*(?:->\\s*[^:]+)?\\s*:`, "m");
      const m = source.match(re);
      if (!m) return [];
      return splitTopLevelParams(m[1]).map(raw => {
        let text = raw.trim();
        if (!text || text === "/") return null;
        text = text.replace(/^\*\*?/, "");
        const [left] = text.split("=");
        const [namePart, annPart] = left.split(":");
        const name = (namePart || "").trim();
        const type = (annPart || "").trim() || "str";
        if (!name || name === "self" || name === "cls") return null;
        return { name, type };
      }).filter(Boolean);
    }

    function buildTplParamValues(paramsMeta, inputObj) {
      const values = {};
      const parsed = (inputObj && typeof inputObj === "object" && !Array.isArray(inputObj)) ? inputObj : {};
      const orderedValues = Object.values(parsed);
      paramsMeta.forEach((param, index) => {
        if (Object.prototype.hasOwnProperty.call(parsed, param.name)) {
          values[param.name] = parsed[param.name];
          return;
        }
        if (index < orderedValues.length) {
          values[param.name] = orderedValues[index];
          return;
        }
        values[param.name] = /bool/i.test(param.type) ? false : (/list|dict/i.test(param.type) ? "" : "");
      });
      return values;
    }

    function renderTplTestParams(values = {}, paramsMeta = []) {
      const wrap = qs("#tplTestParams");
      if (!wrap) return;
      const normalizedMeta = Array.isArray(paramsMeta) ? paramsMeta : [];
      const entries = normalizedMeta.length
        ? normalizedMeta.map(param => [param.name, values?.[param.name], param.type || inferTplParamType(values?.[param.name])])
        : Object.entries(values || {}).map(([name, rawValue]) => [name, rawValue, inferTplParamType(rawValue)]);
      if (state.tplTestMode === "files") {
        wrap.innerHTML = entries.map(([name, _rv, type]) => {
          const typeText = String(type || "str");
          const upload = state.tplFileUploads[name];
          const btnLabel = upload ? `✓ ${esc(upload.filename)}` : "选择文件";
          const btnStyle = upload ? "color:#16a34a" : "";
          const pathInfo = upload
            ? `<div style="font-size:11px;color:#888;margin-top:2px">路径: ${esc(upload.path)}</div>`
            : `<div style="font-size:11px;color:#aaa;margin-top:2px">支持图片、音频、npy 等任意格式，文件路径自动注入参数</div>`;
          return `<div class="param-field"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px"><label style="margin:0">${esc(name)} · ${esc(typeText)}</label><button type="button" class="ghost" style="padding:2px 10px;font-size:12px;${btnStyle}" onclick="window.openTplBinaryUpload('${esc(name)}')">${btnLabel}</button></div>${pathInfo}</div>`;
        }).join("") || '<div class="empty">未解析到函数参数，请检查函数名或源码。</div>';
        return;
      }
      wrap.innerHTML = entries.map(([name, rawValue, type]) => {
        const typeText = String(type || "str");
        const importButton = /list|dict|DataFrame|dataframe/i.test(typeText)
          ? `<button type="button" class="ghost" style="padding:2px 10px;font-size:12px" onclick="window.openTplParamImport('${esc(name)}')">导入文件</button>`
          : "";
        const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px"><label style="margin:0">${esc(name)} · ${esc(typeText)}</label>${importButton}</div>`;
        if (/bool/i.test(typeText)) {
          return `<div class="param-field"><label>${esc(name)} · bool</label><select data-param="${esc(name)}" data-type="bool"><option value="false"${rawValue === false ? " selected" : ""}>false</option><option value="true"${rawValue === true ? " selected" : ""}>true</option></select></div>`;
        }
        if (/list|dict|DataFrame|dataframe/i.test(typeText)) {
          const textValue = rawValue === "" ? "" : JSON.stringify(rawValue, null, 2);
          const placeholder = /DataFrame|dataframe/i.test(typeText)
            ? "支持 CSV / JSON 数组"
            : (/list/i.test(typeText) ? "支持 JSON 数组，或逗号/换行分隔，如 0.1,0.6,0.9" : "支持 JSON 对象，或 key=value / key:value 多行输入");
          return `<div class="param-field">${head}<textarea rows="4" data-param="${esc(name)}" data-type="${esc(typeText)}" placeholder="${esc(placeholder)}">${esc(textValue || "")}</textarea></div>`;
        }
        if (/int|float|number/i.test(typeText)) {
          return `<div class="param-field">${head}<input type="number" data-param="${esc(name)}" data-type="${esc(typeText)}" value="${esc(String(rawValue ?? ""))}" /></div>`;
        }
        return `<div class="param-field">${head}<input data-param="${esc(name)}" data-type="${esc(typeText)}" value="${esc(String(rawValue ?? ""))}" /></div>`;
      }).join("") || '<div class="empty">未解析到函数参数，请检查函数名或源码。</div>';
    }

    function collectTplTestParams() {
      const payload = {};
      qsa("#tplTestParams [data-param]").forEach(input => {
        const name = input.dataset.param;
        const type = input.dataset.type || "str";
        payload[name] = parseParamValueByType(type, input.value);
      });
      return payload;
    }

    function openTplParamImport(paramName) {
      state.tplImportTarget = paramName;
      const input = qs("#tplParamFileInput");
      if (input) input.click();
    }

    async function onTplParamFileSelected(event) {
      const file = event?.target?.files?.[0];
      const paramName = state.tplImportTarget;
      if (!file || !paramName) return;
      const field = qs(`#tplTestParams [data-param="${CSS.escape(paramName)}"]`);
      if (!field) return;
      const type = field.dataset.type || "str";
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        try {
          const parsed = JSON.parse(text);
          field.value = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
        } catch (_error) {
          field.value = text;
        }
      } else {
        field.value = text;
      }
      state.tplImportTarget = "";
      event.target.value = "";
      if (/list|dict|DataFrame|dataframe/i.test(type)) {
        try {
          const parsed = parseParamValueByType(type, field.value);
          field.value = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
        } catch (_error) { /* keep raw text */ }
      }
      showToast(`已导入 ${file.name} 到参数 ${paramName}`);
    }

    function setTplTestMode(mode) {
      state.tplTestMode = mode;
      if (mode === "params") state.tplFileUploads = {};
      const paramsBtn = qs("#tplModeParamsBtn");
      const filesBtn = qs("#tplModeFilesBtn");
      const hint = qs("#tplModeHint");
      const loadExBtn = qs("#tplLoadExBtn");
      if (paramsBtn) paramsBtn.classList.toggle("primary", mode === "params");
      if (filesBtn) filesBtn.classList.toggle("primary", mode === "files");
      if (hint) hint.textContent = mode === "files"
        ? "上传文件，文件路径自动注入参数（适合图片 / 音频 / npy）"
        : "直接在表单中输入参数值";
      if (loadExBtn) loadExBtn.style.display = mode === "files" ? "none" : "";
      const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
      const paramsMeta = getTplFunctionParams(fnName);
      renderTplTestParams({}, paramsMeta);
    }

    function openTplBinaryUpload(paramName) {
      state.tplImportTarget = paramName;
      const input = qs("#tplBinaryFileInput");
      if (input) input.click();
    }

    async function onTplBinaryFileSelected(event) {
      const file = event?.target?.files?.[0];
      const paramName = state.tplImportTarget;
      event.target.value = "";
      state.tplImportTarget = "";
      if (!file || !paramName) return;
      const statusEl = qs("#tplRunStatus");
      if (statusEl) statusEl.textContent = `正在上传 ${file.name}...`;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const resp = await fetch("/api/v1/test/upload-temp", {
          method: "POST",
          headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
          body: formData,
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        state.tplFileUploads[paramName] = { path: result.path, filename: result.filename || file.name };
        if (statusEl) statusEl.textContent = "";
        showToast(`已上传 ${file.name}`);
        const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
        renderTplTestParams({}, getTplFunctionParams(fnName));
      } catch (err) {
        if (statusEl) statusEl.textContent = `上传失败: ${err.message}`;
        showToast(`上传失败: ${err.message}`);
      }
    }

    function testTplSource() {
      state.tplTestMode = "params";
      state.tplFileUploads = {};
      const name = qs("#tplName")?.value.trim() || "my_algorithm";
      let parsed = {};
      const raw = qs("#tplInputExample")?.value || "{}";
      try {
        parsed = JSON.parse(raw);
      } catch (_e) {
        showToast("输入示例 JSON 格式错误，请先修正");
        parsed = {};
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        parsed = { input: parsed ?? "" };
      }
      const paramsMeta = getTplFunctionParams(name);
      const filledValues = buildTplParamValues(paramsMeta, parsed);

      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:920px;width:min(92vw,920px)">
          <h3>测试代码</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <button id="tplModeParamsBtn" class="primary" onclick="window.setTplTestMode('params')">普通参数模式</button>
            <button id="tplModeFilesBtn" onclick="window.setTplTestMode('files')">外部文件模式</button>
            <span id="tplModeHint" style="font-size:12px;color:#888">直接在表单中输入参数值</span>
          </div>
          <div class="form-grid" style="margin-bottom:8px">
            <div class="form-row"><label>函数名</label><input id="tplTestFunction" value="${esc(name)}" onblur="window.refreshTplTestParamsFromFunction()" /></div>
            <div class="form-row"><label>超时</label><select id="tplTestTimeout"><option value="5">5s</option><option value="30">30s</option><option value="60">60s</option></select></div>
          </div>
          <div id="tplTestParams" class="param-grid"></div>
          <div class="modal-actions" style="justify-content:flex-start">
            <button id="tplLoadExBtn" onclick="window.loadTplInputExample()">加载输入示例</button>
            <button class="primary" id="tplRunBtn" onclick="window.runTplSourceTest()">▶ 运行</button>
            <span id="tplRunStatus" class="field-error"></span>
          </div>
          <div class="output" id="tplTestOutput"><pre>等待运行</pre></div>
          <input id="tplParamFileInput" type="file" accept=".json,.csv,.txt" class="hidden" onchange="window.onTplParamFileSelected(event)" />
          <input id="tplBinaryFileInput" type="file" accept="*" class="hidden" onchange="window.onTplBinaryFileSelected(event)" />
          <div class="modal-actions">
            <button onclick="window.closeModal()">关闭</button>
          </div>
        </div>
      `;
      renderTplTestParams(filledValues, paramsMeta);
    }

    function refreshTplTestParamsFromFunction() {
      const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
      const paramsMeta = getTplFunctionParams(fnName);
      const current = collectTplTestParams();
      const filled = buildTplParamValues(paramsMeta, current);
      renderTplTestParams(filled, paramsMeta);
    }

    function loadTplInputExample() {
      const raw = qs("#tplInputExample")?.value || "{}";
      try {
        let parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = { input: parsed ?? "" };
        const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
        const paramsMeta = getTplFunctionParams(fnName);
        const filled = buildTplParamValues(paramsMeta, parsed);
        renderTplTestParams(filled, paramsMeta);
        showToast("已加载输入示例");
      } catch (_e) {
        showToast("输入示例 JSON 格式错误");
      }
    }

    async function runTplSourceTest() {
      const button = qs("#tplRunBtn");
      const status = qs("#tplRunStatus");
      const output = qs("#tplTestOutput");
      if (!button || !status || !output) return;
      const started = performance.now();
      button.disabled = true;
      button.textContent = "运行中...";
      status.textContent = "";
      try {
        let kwargs;
        const fnName = qs("#tplTestFunction")?.value.trim() || qs("#tplName")?.value.trim() || "my_algorithm";
        const timeout = Number(qs("#tplTestTimeout")?.value || "5");
        if (state.tplTestMode === "files") {
          kwargs = {};
          const paramsMeta = getTplFunctionParams(fnName);
          const missing = paramsMeta.filter(p => !state.tplFileUploads[p.name]).map(p => p.name);
          if (missing.length > 0) {
            showToast(`请先为以下参数选择文件: ${missing.join(", ")}`);
            return;
          }
          paramsMeta.forEach(p => { kwargs[p.name] = state.tplFileUploads[p.name].path; });
        } else {
          kwargs = collectTplTestParams();
          if (qs("#tplInputExample")) qs("#tplInputExample").value = JSON.stringify(kwargs, null, 2);
        }
        const result = await api("/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify({
            content: qs("#tplCode")?.value || "",
            function: fnName,
            kwargs,
            timeout
          })
        });
        const elapsed = result.elapsed_ms ?? Math.round(performance.now() - started);
        status.textContent = `✅ ${elapsed} ms`;
        output.innerHTML = `<pre>${esc(JSON.stringify(result.result ?? result, null, 2))}</pre>`;
      } catch (error) {
        status.textContent = `❌ ${Math.round(performance.now() - started)} ms`;
        output.innerHTML = `<pre>${esc(error.message)}</pre>`;
      } finally {
        button.disabled = false;
        button.textContent = "▶ 运行";
      }
    }

    async function saveTplDraft(templateId) {
      const name = qs("#tplName")?.value.trim();
      let catValue = qs("#tplCategory")?.value || "";
      const version = qs("#tplVersion")?.value.trim() || "1.0.0";
      const zhName = qs("#tplZhName")?.value.trim() || "";
      const tags = (qs("#tplTags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
      const desc = qs("#tplDesc")?.value.trim() || "";
      const inputExample = qs("#tplInputExample")?.value.trim() || "";
      const code = qs("#tplCode")?.value || "";

      if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) { showToast("函数名只能使用小写字母、数字和下划线"); return; }
      if (catValue === "__new__") {
        const catName = qs("#tplCategoryName")?.value.trim();
        const catNs = qs("#tplCategoryNs")?.value.trim();
        if (!catName || !catNs) { showToast("请填写新分类名称和命名空间"); return; }
        if (/[\u4e00-\u9fff]/.test(catNs) || !/^[a-z_][a-z0-9_.]*$/.test(catNs)) { showToast("分类命名空间只能使用小写字母、数字和下划线"); return; }
        try {
          await api("/api/v1/categories", { method: "POST", body: JSON.stringify({ namespace: catNs, zh_name: catName, module_kind: "component" }) });
          catValue = catNs;
        } catch (err) { showToast(err.message); return; }
      }
      if (!catValue) { showToast("请选择所属分类"); return; }
      const btn = qs("[onclick*='saveTplDraft']");
      if (btn) { btn.disabled = true; btn.textContent = "保存中..."; }
      try {
        const result = await api(`/api/v1/algorithms/${safeId(templateId)}/publish-as-component`, {
          method: "POST",
          body: JSON.stringify({ name, zh_name: zhName, new_namespace: `alg.${catValue}`, version, category: catValue, description: desc, zh_tags: tags, input_example: inputExample, code })
        });
        const newId = result.algorithm?.id || "";
        showToast('✅ 已保存为草稿，可在"算法组件"列表中找到并提交审核');
        state.highlightId = newId;
        await loadModuleData("components");
        switchPage("components");
        window.setTimeout(() => { state.highlightId = ""; if (state.page === "components") renderCards("components"); }, 2000);
      } catch (err) {
        showToast(err.message);
        if (btn) { btn.disabled = false; btn.textContent = "保存草稿"; }
      }
    }

    function confirmPublishAsComponent(templateId) {
      const name = qs("#tplName")?.value.trim();
      const catValue = qs("#tplCategory")?.value || "";
      const catLabel = qs("#tplCategory option:checked")?.textContent || catValue;
      const version = qs("#tplVersion")?.value.trim() || "1.0.0";
      const zhName = qs("#tplZhName")?.value.trim() || name || "";
      const desc = qs("#tplDesc")?.value.trim() || "";
      const tagsRaw = qs("#tplTags")?.value || "";

      if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) { showToast("函数名只能使用小写字母、数字和下划线"); return; }
      if (!catValue || catValue === "__new__") { showToast("请先选择或新建分类"); return; }

      const vOpts = versionUpgradeOptions(version);
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>确认创建并提交审核</h3>
          <p class="desc" style="margin:0 0 12px">以下信息将基于模板创建新组件，并立即进入审核流程。</p>
          <div class="form-grid">
            <div class="form-row"><label>函数名</label><span style="padding:6px 0">${esc(name)}</span></div>
            <div class="form-row"><label>所属分类</label><span style="padding:6px 0">${esc(catLabel)}</span></div>
            <div class="form-row"><label>版本号</label>
              <select id="pacVersionBump">
                ${vOpts.map((o, i) => `<option value="${esc(o.value)}"${i === 0 ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row"><label>中文名称</label><input id="pacZhName" value="${esc(zhName)}" /></div>
            <div class="form-row"><label>描述</label><textarea id="pacDesc" rows="2">${esc(desc)}</textarea></div>
            <div class="form-row"><label>标签 <span style="color:var(--text-dim);font-size:12px">逗号分隔</span></label><input id="pacTags" value="${esc(tagsRaw)}" /></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="primary" onclick="window._doPublishAsComponent('${esc(templateId)}')">确认创建并提交</button>
          </div>
        </div>
      `;
    }

    async function _doPublishAsComponent(templateId) {
      let catValue = qs("#tplCategory")?.value || "";
      if (catValue === "__new__") {
        const catName = qs("#tplCategoryName")?.value.trim();
        const catNs = qs("#tplCategoryNs")?.value.trim();
        if (!catName || !catNs) { showToast("请填写新分类名称和命名空间"); return; }
        if (/[\u4e00-\u9fff]/.test(catNs) || !/^[a-z_][a-z0-9_.]*$/.test(catNs)) { showToast("分类命名空间只能使用小写字母、数字和下划线"); return; }
        try {
          await api("/api/v1/categories", { method: "POST", body: JSON.stringify({ namespace: catNs, zh_name: catName, module_kind: "component" }) });
          catValue = catNs;
        } catch (err) { closeModal(); showToast(err.message); return; }
      }

      const name = qs("#tplName")?.value.trim();
      const version = qs("#pacVersionBump")?.value || qs("#tplVersion")?.value.trim() || "1.0.0";
      const zhName = qs("#pacZhName")?.value.trim() || qs("#tplZhName")?.value.trim() || "";
      const tags = (qs("#pacTags")?.value || qs("#tplTags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
      const desc = qs("#pacDesc")?.value.trim() || qs("#tplDesc")?.value.trim() || "";
      const inputExample = qs("#tplInputExample")?.value.trim() || "";
      const code = qs("#tplCode")?.value || "";

      const confirmBtn = qs("#modalRoot .primary");
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "提交中..."; }

      try {
        const result = await api(`/api/v1/algorithms/${safeId(templateId)}/publish-as-component`, {
          method: "POST",
          body: JSON.stringify({ name, zh_name: zhName, new_namespace: `alg.${catValue}`, version, category: catValue, description: desc, zh_tags: tags, input_example: inputExample, code })
        });
        const newComponentId = result.algorithm?.id;
        if (newComponentId) {
          try {
            await api(`/api/v1/algorithms/${safeId(newComponentId)}/submit`, {
              method: "POST",
              body: JSON.stringify({ version_bump: version, zh_name: zhName, description: desc })
            });
            closeModal();
            showToast("✅ 已基于模板创建组件并提交审核");
          } catch (_submitErr) {
            closeModal();
            showToast("✅ 组件已创建（提交审核失败，请在组件列表手动提交）");
          }
        } else {
          closeModal();
          showToast("✅ 已基于模板创建组件草稿");
        }
        state.highlightId = newComponentId || "";
        await loadModuleData("components");
        switchPage("components");
        window.setTimeout(() => { state.highlightId = ""; if (state.page === "components") renderCards("components"); }, 2000);
      } catch (error) {
        closeModal();
        showToast(error.message);
      }
    }

    async function submitReview(id) { return openSubmitModal(id); }

    function findAlgorithmInState(id) {
      return [...(state.data.components || []), ...(state.data["my-algos"] || [])].find(a => a.id === id) || {};
    }

    function openSubmitModal(id) {
      const item = findAlgorithmInState(id);
      if (!item.id && state.editing?.id === id) Object.assign(item, state.editing.algo || {});
      if (!canSubmitAlgorithm(item) && !(ownsAlgorithm(item) && getStatus(item) === "published" && item.hasReviewDraft)) {
        showToast("只能提交您自己的私有算法");
        return;
      }
      const currentVer = item.version || "1.0.0";
      const isFirstRelease = currentVer === "1.0.0";
      const vOpts = versionUpgradeOptions(currentVer);
      const defaultIdx = isFirstRelease ? 0 : 1;
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>提交审核</h3>
          <div class="form-grid">
            <div class="form-row"><label>版本迭代方式</label>
              <select id="srVersionBump">
                ${vOpts.map((o, i) => `<option value="${esc(o.value)}"${i === defaultIdx ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row"><label>中文名称 <span style="color:var(--text-dim);font-size:12px">（可留空保持不变）</span></label><input id="srZhName" value="${esc(item.zhName || "")}" /></div>
            <div class="form-row"><label>描述 <span style="color:var(--text-dim);font-size:12px">（可留空保持不变）</span></label><textarea id="srDesc" rows="3">${esc(item.zhDescription || "")}</textarea></div>
            <div class="form-row"><label>标签 <span style="color:var(--text-dim);font-size:12px">（逗号分隔，可留空）</span></label><input id="srTags" value="${esc((item.zhTags || []).join(","))}" /></div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="warning" onclick="window.confirmSubmitReview('${esc(id)}')">确认提交审核</button>
          </div>
        </div>
      `;
    }

    async function confirmSubmitReview(id) {
      const version = qs("#srVersionBump")?.value || "";
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
          body: JSON.stringify({ version_bump: version })
        });
        showToast("已提交审核");
        await loadModuleData(state.page === "my-algos" || state.editing?.page === "my-algos" ? "my-algos" : "components");
        if (state.editing && state.editing.id === id) {
          // In editor: update local algo state and refresh toolbar (no renderCards needed)
          const updated = findAlgorithmInState(id);
          if (updated) state.editing.algo = { ...state.editing.algo, ...updated };
          refreshEditorStatusButtons();
        } else if (state.page === "review") {
          await renderReviewPage();
        } else {
          renderCards(state.page === "my-algos" ? "my-algos" : "components");
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
              <button class="ghost" onclick="window.discardRejectedDraft('${esc(id)}');window.closeModal()">放弃修改，恢复原状</button>
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
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>审核通过确认</h3>
          <p style="color:var(--text-dim);margin:0 0 16px">确认通过此算法审核？通过后状态变为"待发布"，可进行正式发布。</p>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="success" onclick="window.confirmApproveReview('${esc(id)}')">确认通过</button>
          </div>
        </div>
      `;
    }

    async function confirmApproveReview(id) {
      closeModal();
      try {
        await api(`/api/v1/algorithms/${safeId(id)}/approve`, { method: "POST" });
        showToast("审核已通过");
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

    async function editSnippet(id) {
      const snippet = id ? (await api(`/api/v1/snippets/${safeId(id)}`)).snippet : {
        name: "", zh_name: "", body: "", language: "python", tags: [], scope: "private", version: "1.0"
      };
      state.snippetEditing = { id, snippet };
      qs("#main").innerHTML = `
        <div class="editor-view snippet-editor" id="snippetEditorView">
          <div class="editor-top">
            <button onclick="window.closeSnippetEditor()">返回</button>
            <span class="breadcrumb">代码片段 / ${esc(snippet.zh_name || snippet.name || "新建片段")}</span>
            <span class="spacer"></span>
            <button onclick="window.copySnippetFromEditor()">复制</button>
            <button class="primary" onclick="window.saveSnippet('${esc(id)}')">保存</button>
          </div>
          <div class="snippet-meta">
            <div class="snippet-top-field"><label>触发名</label><input id="snName" value="${esc(snippet.name)}" placeholder="例如 csv_to_records" /></div>
            <div class="snippet-top-field"><label>中文名</label><input id="snZhName" value="${esc(snippet.zh_name || "")}" placeholder="例如 CSV 转记录片段" /></div>
            <div class="snippet-top-field"><label>权限</label><select id="snScope"><option value="private">私有</option><option value="team">共享</option></select></div>
            <div class="snippet-top-field"><label>语言</label><input id="snLanguage" value="${esc(snippet.language || "python")}" /></div>
            <div class="snippet-top-field"><label>标签</label><input id="snTags" value="${esc((snippet.tags || []).join(","))}" placeholder="逗号分隔，如 CSV,DataFrame" /></div>
            <div class="snippet-top-field"><label>版本</label><input id="snVersion" value="${esc(snippet.version || "1.0")}" /></div>
          </div>
          <div class="snippet-code-shell">
            <div class="snippet-code-title"><span>代码内容</span><span class="tag">Python</span><span class="spacer"></span><span>Ctrl+S 保存，Ctrl+Alt+S 插入片段</span></div>
            <div class="monaco-host" id="snippetMonacoHost"></div>
          </div>
        </div>
      `;
      qs("#snScope").value = snippet.scope || "private";
      await initSnippetEditor(snippet.body || "");
    }

    async function saveSnippet(id) {
      if (state.snippetEditor) {
        const model = state.snippetEditor.getModel();
        if (model) state.snippetEditing.snippet.body = model.getValue();
      }
      const payload = {
        name: qs("#snName").value.trim(),
        zh_name: qs("#snZhName").value.trim(),
        language: qs("#snLanguage").value.trim() || "python",
        scope: qs("#snScope").value,
        tags: qs("#snTags").value.split(",").map(item => item.trim()).filter(Boolean),
        version: qs("#snVersion").value.trim() || "1.0",
        body: state.snippetEditing?.snippet?.body || ""
      };
      try {
        await api(id ? `/api/v1/snippets/${safeId(id)}` : "/api/v1/snippets", {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        });
        showToast("片段已保存");
        await loadModuleData("snippets");
        closeSnippetEditor();
      } catch (error) {
        showToast(error.message);
      }
    }

    async function initSnippetEditor(content) {
      const m = await loadMonaco();
      if (state.snippetEditor) {
        state.snippetEditor.dispose();
        state.snippetEditor = null;
      }
      const uri = m.Uri.parse(`inmemory://algolib/snippet/${encodeURIComponent(state.snippetEditing?.id || "new")}.py`);
      const existing = m.editor.getModel(uri);
      if (existing && !existing.isDisposed()) existing.dispose();
      const model = m.editor.createModel(content, "python", uri);
      state.snippetEditor = m.editor.create(qs("#snippetMonacoHost"), {
        model,
        theme: "algolib-dark",
        language: "python",
        automaticLayout: true,
        fontSize: 14,
        tabSize: 4,
        autoIndent: "full",
        folding: true,
        bracketPairColorization: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: false }
      });
      window._activeMonaco = state.snippetEditor;
      state.snippetEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveSnippet(state.snippetEditing?.id || ""));
      state.snippetEditor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.KeyS, () => openSnippetOverlay());
    }

    function closeSnippetEditor() {
      if (state.snippetEditor) {
        const model = state.snippetEditor.getModel();
        state.snippetEditor.dispose();
        if (model && !model.isDisposed()) model.dispose();
        state.snippetEditor = null;
      }
      state.snippetEditing = null;
      window._activeMonaco = state.editor || null;
      switchPage("snippets");
    }

    async function copySnippetFromEditor() {
      const text = state.snippetEditor?.getValue() || "";
      await copyTextToClipboard(text);
    }

    async function insertSnippetById(id) {
      try {
        const data = await api(`/api/v1/snippets/${safeId(id)}`);
        insertSnippet(data.snippet.body || "");
      } catch (error) {
        showToast(error.message);
      }
    }

    function copyTextToClipboard(text) {
      const value = String(text || "");
      function fallbackCopy() {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
        document.body.appendChild(el);
        el.focus();
        el.select();
        try { document.execCommand("copy"); showToast("已复制到剪贴板"); }
        catch (_err) { showToast("复制失败，请手动选择代码后复制"); }
        document.body.removeChild(el);
      }
      if (navigator.clipboard) {
        return navigator.clipboard.writeText(value)
          .then(() => showToast("已复制到剪贴板"))
          .catch(() => fallbackCopy());
      }
      fallbackCopy();
      return Promise.resolve();
    }

    function insertSnippet(body) {
      if (!window._activeMonaco || !state.monaco) {
        copyTextToClipboard(body);
        return;
      }
      const editor = window._activeMonaco;
      const position = editor.getPosition();
      const line = editor.getModel().getLineContent(position.lineNumber);
      const indent = (line.match(/^\s*/) || [""])[0];
      const text = String(body).split("\n").map((lineText, index) => index === 0 ? lineText : indent + lineText).join("\n");
      editor.executeEdits("snippet-insert", [{
        range: new state.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text
      }]);
      editor.focus();
    }

    async function copySnippet(id) {
      try {
        const data = await api(`/api/v1/snippets/${safeId(id)}`);
        await copyTextToClipboard(data.snippet.body || "");
      } catch (error) {
        showToast(error.message);
      }
    }

    async function deleteSnippet(id) {
      if (!confirm("确认删除这个代码片段？")) return;
      try {
        await api(`/api/v1/snippets/${safeId(id)}`, { method: "DELETE" });
        showToast("片段已删除");
        await loadModuleData("snippets");
        renderCards("snippets");
      } catch (error) {
        showToast(error.message);
      }
    }

    function openSnippetOverlay() {
      const overlay = qs("#snippetOverlay");
      overlay.classList.remove("hidden");
      overlay.innerHTML = `
        <div class="overlay-card">
          <input id="snippetSearchInput" placeholder="搜索代码片段，回车插入" autocomplete="off" />
          <div id="snippetSearchResults"></div>
        </div>
      `;
      const input = qs("#snippetSearchInput");
      input.focus();
      input.addEventListener("input", () => searchSnippetOverlay(input.value));
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSnippetOverlay();
        if (event.key === "ArrowDown") { state.snippetCursor = Math.min(state.snippetCursor + 1, state.snippetResults.length - 1); renderSnippetResults(); event.preventDefault(); }
        if (event.key === "ArrowUp") { state.snippetCursor = Math.max(state.snippetCursor - 1, 0); renderSnippetResults(); event.preventDefault(); }
        if (event.key === "Enter" && state.snippetResults[state.snippetCursor]) {
          insertSnippet(state.snippetResults[state.snippetCursor].body || "");
          closeSnippetOverlay();
        }
      });
      searchSnippetOverlay("");
    }

    function closeSnippetOverlay() {
      qs("#snippetOverlay").classList.add("hidden");
      qs("#snippetOverlay").innerHTML = "";
    }

    async function searchSnippetOverlay(keyword) {
      try {
        const data = await api(`/api/v1/snippets?q=${encodeURIComponent(keyword || "")}`);
        state.snippetResults = normalizeListPayload(data, "snippets");
        state.snippetCursor = 0;
        renderSnippetResults();
      } catch (error) {
        qs("#snippetSearchResults").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      }
    }

    function renderSnippetResults() {
      const root = qs("#snippetSearchResults");
      root.innerHTML = state.snippetResults.map((snippet, index) => `
        <div class="snippet-result ${index === state.snippetCursor ? "active" : ""}" onclick="window.pickSnippet(${index})">
          <strong>${esc(snippet.zh_name || snippet.name)}</strong>
          <div class="snippet-preview">${esc(String(snippet.body || "").slice(0, 40))}</div>
        </div>
      `).join("") || '<div class="empty">暂无片段</div>';
    }

    function pickSnippet(index) {
      const snippet = state.snippetResults[index];
      if (!snippet) return;
      insertSnippet(snippet.body || "");
      closeSnippetOverlay();
    }

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

    async function renderReviewPage() {
      qs("#main").innerHTML = `<h1>算法审核</h1><div class="empty">加载审核队列...</div>`;
      try {
        await loadModuleData("components");
        const items = (state.data.components || []).filter(item => {
          const s = getStatus(item);
          return ["reviewing", "rejected", "approved"].includes(s) || (s === "published" && item.hasReviewDraft);
        });
        qs("#main").innerHTML = `
          <h1>算法审核</h1>
          <section class="stat-bar">
            <article class="stat-card"><div class="stat-label">审核中</div><div class="stat-value">${items.filter(i => getStatus(i) === "reviewing").length}</div></article>
            <article class="stat-card"><div class="stat-label">未通过</div><div class="stat-value">${items.filter(i => getStatus(i) === "rejected").length}</div></article>
            <article class="stat-card"><div class="stat-label">待发布</div><div class="stat-value">${items.filter(i => getStatus(i) === "approved").length}</div></article>
          </section>
          <table class="api-table">
            <thead><tr><th>算法</th><th>命名空间</th><th>状态</th><th>描述</th><th>操作</th></tr></thead>
            <tbody>${items.map(item => {
              const status = getStatus(item);
              return `<tr>
                <td>${esc(getName(item))}</td>
                <td><code>${esc(getNs(item, "components"))}</code></td>
                <td><span class="tag ${statusClass(status)}">${esc(statusLabel(status))}${item.hasReviewDraft && status === "published" ? " (有草稿)" : ""}</span></td>
                <td>${esc(getDesc(item))}</td>
                <td>
                  <button onclick="window.openEditorById('${esc(item.id)}','components',true)">查看/测试</button>
                  ${status === "published" && item.hasReviewDraft ? `<button onclick="window.openSubmitModal('${esc(item.id)}')">提交审核</button>` : ""}
                  ${status === "rejected" ? `<button class="ghost" onclick="window.viewRejectReason('${esc(item.id)}')">查看驳回原因</button><button class="warning" onclick="window.undoRejectReview('${esc(item.id)}')">撤销驳回</button>` : ""}
                  ${status === "reviewing" ? `<button onclick="window.approveReview('${esc(item.id)}')">通过</button><button class="danger" onclick="window.rejectReview('${esc(item.id)}')">驳回</button>` : ""}
                  ${status === "approved" ? `<button class="success" onclick="window.publishComponent('${esc(item.id)}')">发布</button>` : ""}
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
        if (["components", "templates", "snippets", "my-algos"].includes(state.page)) {
          await loadModuleData(state.page);
          renderNav();
          hydrateFilters(state.page);
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

    function tickClock() {
      qs("#clock").textContent = new Date().toLocaleString();
    }

    function bindGlobalKeys() {
      document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.altKey && !event.metaKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          openSnippetOverlay();
        }
        if (event.key === "Escape" && !qs("#snippetOverlay").classList.contains("hidden")) {
          closeSnippetOverlay();
        }
      });
      qs("#modalRoot").addEventListener("click", event => {
        if (event.target.id === "modalRoot") closeModal();
      });
      document.addEventListener("click", event => {
        if (!event.target.closest(".more-menu-wrap")) {
          qsa(".more-menu").forEach(m => m.classList.add("hidden"));
        }
      });
    }

    function showLoginPage() {
      const lp = qs("#loginPage");
      const app = qs("#appShell");
      lp.style.display = "flex";
      if (app) app.style.display = "none";
    }

    function hideLoginPage() {
      const lp = qs("#loginPage");
      const app = qs("#appShell");
      lp.style.display = "none";
      if (app) app.style.display = "";
    }

    async function doLogin() {
      const username = qs("#loginUsername").value.trim();
      const password = qs("#loginPassword").value;
      const errEl = qs("#loginError");
      errEl.style.display = "none";
      if (!username || !password) { errEl.textContent = "请输入用户名和密码"; errEl.style.display = "block"; return; }
      try {
        const resp = await fetch(BASE + "/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || "登录失败");
        localStorage.setItem("algolib_token", data.token);
        localStorage.setItem("algolib_user", JSON.stringify(data.user));
        state.currentUser = data.user;
        hideLoginPage();
        renderNav();
        switchPage("components");
        connectSse();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = "block";
      }
    }

    async function doLogout() {
      try { await api("/api/v1/auth/logout", { method: "POST" }); } catch (_) { /* ignore */ }
      localStorage.removeItem("algolib_token");
      localStorage.removeItem("algolib_user");
      state.currentUser = null;
      if (state.sse) { state.sse.close(); state.sse = null; }
      showLoginPage();
    }

    document.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && qs("#loginPage") && qs("#loginPage").style.display !== "none") doLogin();
    });

    // ─── 我的算法页面 ────────────────────────────────────────────────
    async function renderMyAlgorithmsPage() {
      qs("#main").innerHTML = `
        <h1>我的算法</h1>
        <div class="toolbar">
          <input id="filterSearch" placeholder="搜索名称、命名空间、描述、标签" oninput="window.applyFilters()" />
          <select id="filterCategory" onchange="window.applyFilters()"><option value="">全部分类</option></select>
          <select id="filterStatus" onchange="window.applyFilters()"><option value="">全部状态</option></select>
          <button onclick="window.applyFilters()">筛选</button>
          <span class="spacer"></span>
          <button class="primary" onclick="window.openAlgorithmCreateModal('component')">＋ 新建算法</button>
        </div>
        <div class="quick-filters" id="quickFilters">
          <button class="active" data-qf="" onclick="window.setQuickFilter('','my-algos')">全部</button>
          <button class="qf-success" data-qf="published" onclick="window.setQuickFilter('published','my-algos')">已发布</button>
          <button data-qf="draft" onclick="window.setQuickFilter('draft','my-algos')">草稿</button>
          <button class="qf-warning" data-qf="reviewing" onclick="window.setQuickFilter('reviewing','my-algos')">审核中</button>
          <button data-qf="rejected" onclick="window.setQuickFilter('rejected','my-algos')">已驳回</button>
        </div>
        <section id="stats" class="stat-bar"></section>
        <section id="list">${skeletonHtml()}</section>
      `;
      try {
        const data = await api("/api/v1/user/algorithms");
        const algos = data.algorithms || [];
        state.data["my-algos"] = algos;
        const cats = {};
        algos.forEach(a => {
          const key = String(a.namespace || "custom").split(".")[0] || "custom";
          if (!cats[key]) cats[key] = [];
          cats[key].push(a);
        });
        state.categories["my-algos"] = Object.keys(cats).map(ns => ({ namespace: ns, zh_name: ns }));
        renderNav();
        hydrateFilters("my-algos");
        renderCards("my-algos");
      } catch (err) {
        if (qs("#list")) qs("#list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      }
    }

    async function refreshMyAlgoList() {
      const listEl = qs("#my-algo-list");
      if (!listEl) return;
      try {
        const data = await api("/api/v1/user/algorithms");
        const algos = data.algorithms || [];
        if (algos.length === 0) {
          listEl.innerHTML = '<div class="empty">暂无私有算法，点击右上角"新建算法"开始</div>';
          return;
        }
        listEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:4px 0">
          ${algos.map(a => {
            const ps = a.publishStatus || "draft";
            const statusCls = statusClass(ps);
            const statusTxt = { draft: "草稿", reviewing: "审核中", rejected: "已拒绝", approved: "已批准", published: "已发布" }[ps] || ps;
            const canEdit = ps === "draft" || ps === "rejected";
            const canSubmit = ps === "draft" || ps === "rejected";
            const canWithdraw = ps === "reviewing";
            const canDelete = ps === "draft" || ps === "rejected";
            return `<div class="card" style="position:relative;padding:16px">
              <span class="tag ${statusCls} status-badge">${esc(statusTxt)}</span>
              <div style="font-weight:600;margin-bottom:4px;padding-right:60px">${esc(a.zhName || a.callPrefix || a.id)}</div>
              <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">${esc(a.callPrefix || a.id)}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${canEdit ? `<button style="font-size:12px;padding:4px 10px" onclick="window.openMyAlgoEditor('${esc(a.id)}')">编辑</button>` : `<button style="font-size:12px;padding:4px 10px" onclick="window.openMyAlgoEditor('${esc(a.id)}')">查看</button>`}
                ${canSubmit ? `<button class="primary" style="font-size:12px;padding:4px 10px" onclick="window.openSubmitReviewModal('${esc(a.id)}')">提交审核</button>` : ""}
                ${canWithdraw ? `<button style="font-size:12px;padding:4px 10px" onclick="window.withdrawMyAlgoReview('${esc(a.id)}')">撤回提交</button>` : ""}
                ${canDelete ? `<button class="danger" style="font-size:12px;padding:4px 10px" onclick="window.deleteMyAlgo('${esc(a.id)}')">删除</button>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>`;
      } catch (err) {
        listEl.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      }
    }

    function openNewAlgoModal() {
      openModal(`
        <h2 style="margin:0 0 18px">新建算法</h2>
        <div class="form-group"><label>算法名称（英文，小写字母/数字/下划线）</label><input id="na_name" placeholder="my_algorithm" /></div>
        <div class="form-group"><label>中文名称</label><input id="na_zhname" placeholder="我的算法" /></div>
        <div class="form-group"><label>所属文件夹（英文，可选）</label><input id="na_folder" placeholder="custom" value="custom" /></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doCreateMyAlgo()">创建</button>
        </div>
      `);
    }

    async function doCreateMyAlgo() {
      const name = qs("#na_name").value.trim();
      const zh_name = qs("#na_zhname").value.trim();
      const folder = qs("#na_folder").value.trim() || "custom";
      if (!name) { showToast("算法名称不能为空"); return; }
      if (!/^[a-z][a-z0-9_]*$/.test(name)) { showToast("算法名称只能包含小写字母、数字和下划线，且须以字母开头"); return; }
      try {
        const data = await api("/api/v1/user/algorithms", {
          method: "POST",
          body: JSON.stringify({ name, zh_name, folder }),
        });
        closeModal();
        showToast("算法已创建");
        if (data.algorithm && data.algorithm.id) {
          openMyAlgoEditor(data.algorithm.id);
        } else {
          renderMyAlgorithmsPage();
        }
      } catch (err) { showToast(err.message); }
    }

    // ─── 我的算法编辑器 ────────────────────────────────────────────
    async function openMyAlgoEditor(algoId) {
      const main = qs("#main");
      main.innerHTML = `<div style="padding:16px 0">
        <button onclick="window.switchPage('my-algos')" style="margin-bottom:12px">← 返回我的算法</button>
        <div id="myeditor-header" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <span id="myeditor-title" style="font-weight:600;font-size:16px">加载中…</span>
          <span id="myeditor-status" class="tag"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px" id="myeditor-actions"></div>
        <div style="position:relative">
          <textarea id="myeditor-code" spellcheck="false" style="width:100%;min-height:420px;font-family:monospace;font-size:13px;background:var(--surface-2,#1e1e1e);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:12px;box-sizing:border-box;resize:vertical;tab-size:4;outline:none" placeholder="// 加载中…"></textarea>
          <span id="myeditor-saved" style="position:absolute;bottom:8px;right:12px;font-size:11px;color:var(--text-dim);pointer-events:none"></span>
        </div>
        <div style="margin-top:16px">
          <div style="font-weight:600;margin-bottom:6px">运行测试</div>
          <textarea id="mytest-input" spellcheck="false" style="width:100%;height:80px;font-family:monospace;font-size:12px;background:var(--surface-2,#1e1e1e);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical" placeholder='{"a": 1, "b": 2}'></textarea>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button onclick="window.runMyAlgoTest('${esc(algoId)}')">▶ 运行</button>
          </div>
          <pre id="mytest-output" style="margin-top:8px;background:var(--surface-2,#1e1e1e);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:12px;min-height:60px;white-space:pre-wrap;overflow:auto;max-height:300px"></pre>
        </div>
      </div>`;

      // 绑定 Ctrl+S
      const codeEl = qs("#myeditor-code");
      codeEl.addEventListener("keydown", async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          await saveMyAlgoSource(algoId);
        }
        // Tab 键插入空格
        if (e.key === "Tab") {
          e.preventDefault();
          const start = codeEl.selectionStart;
          const end = codeEl.selectionEnd;
          codeEl.value = codeEl.value.slice(0, start) + "    " + codeEl.value.slice(end);
          codeEl.selectionStart = codeEl.selectionEnd = start + 4;
        }
      });

      // 加载源码
      try {
        const src = await api(`/api/v1/algorithm-source/${encodeURIComponent(algoId)}`);
        const algo = src.algorithm || {};
        const ps = algo.publishStatus || "draft";
        const statusTxt = { draft: "草稿", reviewing: "审核中", rejected: "已拒绝", approved: "已批准", published: "已发布" }[ps] || ps;
        qs("#myeditor-title").textContent = algo.zhName || algo.callPrefix || algoId;
        const statusEl = qs("#myeditor-status");
        statusEl.textContent = statusTxt;
        statusEl.className = `tag ${statusClass(ps)}`;

        // 动作按钮
        const actionsEl = qs("#myeditor-actions");
        const canSubmit = ps === "draft" || ps === "rejected";
        const canWithdraw = ps === "reviewing";
        const isReadonly = ps === "published" || ps === "reviewing" || ps === "approved";
        if (isReadonly) codeEl.readOnly = true;
        if (canSubmit) {
          actionsEl.innerHTML += `<button class="primary" onclick="window.openSubmitReviewModal('${esc(algoId)}')">提交审核</button>`;
        }
        if (canWithdraw) {
          actionsEl.innerHTML += `<button onclick="window.withdrawMyAlgoReview('${esc(algoId)}')">撤回提交</button>`;
        }
        if (!isReadonly) {
          actionsEl.innerHTML += `<button onclick="window.saveMyAlgoSource('${esc(algoId)}')">保存 (Ctrl+S)</button>`;
        }
        if (algo.rejectReason || (src.reviewDraft && src.reviewDraft.reject_reason)) {
          const reason = algo.rejectReason || src.reviewDraft.reject_reason;
          actionsEl.innerHTML += `<span style="color:var(--danger,#f55);font-size:12px;align-self:center">驳回原因：${esc(reason)}</span>`;
        }

        codeEl.value = src.source || "";
      } catch (err) {
        codeEl.value = `# 加载失败: ${err.message}`;
      }
    }

    async function saveMyAlgoSource(algoId) {
      const codeEl = qs("#myeditor-code");
      if (!codeEl) return;
      const savedEl = qs("#myeditor-saved");
      if (savedEl) savedEl.textContent = "保存中…";
      try {
        await api(`/api/v1/algorithm-source/${encodeURIComponent(algoId)}`, {
          method: "PATCH",
          body: JSON.stringify({ content: codeEl.value }),
        });
        if (savedEl) savedEl.textContent = "已保存 ✓";
        window.setTimeout(() => { if (savedEl) savedEl.textContent = ""; }, 2000);
      } catch (err) {
        showToast("保存失败：" + err.message);
        if (savedEl) savedEl.textContent = "";
      }
    }

    async function runMyAlgoTest(algoId) {
      const inputEl = qs("#mytest-input");
      const outputEl = qs("#mytest-output");
      const codeEl = qs("#myeditor-code");
      outputEl.textContent = "运行中…";
      try {
        let params = {};
        try { params = JSON.parse(inputEl.value || "{}"); } catch { showToast("输入参数 JSON 格式错误"); return; }
        const data = await api("/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify({ content: codeEl.value, kwargs: params }),
        });
        outputEl.textContent = JSON.stringify(data.result ?? data, null, 2);
      } catch (err) {
        outputEl.textContent = "错误：" + err.message;
      }
    }

    // ─── 提交审核弹窗 ────────────────────────────────────────────────
    function openSubmitReviewModal(algoId) {
      openModal(`
        <h2 style="margin:0 0 18px">提交算法审核</h2>
        <div class="form-group"><label>功能描述</label><textarea id="sr_desc" rows="3" style="width:100%;box-sizing:border-box" placeholder="简要描述该算法的功能和用途"></textarea></div>
        <div class="form-group"><label>输入参数说明</label><textarea id="sr_input" rows="2" style="width:100%;box-sizing:border-box" placeholder="描述输入参数类型、格式及含义"></textarea></div>
        <div class="form-group"><label>输出格式说明</label><input id="sr_output" style="width:100%;box-sizing:border-box" placeholder="例：返回 float 类型的计算结果" /></div>
        <div class="form-group"><label>算法类型</label>
          <select id="sr_type" style="width:100%;box-sizing:border-box">
            <option value="数学计算">数学计算</option>
            <option value="信号处理">信号处理</option>
            <option value="机器学习">机器学习</option>
            <option value="深度学习">深度学习</option>
            <option value="时序分析">时序分析</option>
            <option value="数据预处理">数据预处理</option>
            <option value="统计分析">统计分析</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="form-group"><label>目标应用场景（可选）</label><input id="sr_apps" style="width:100%;box-sizing:border-box" placeholder="例：振动分析、故障诊断" /></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doSubmitReview('${esc(algoId)}')">提交审核</button>
        </div>
      `);
    }

    async function doSubmitReview(algoId) {
      const description = qs("#sr_desc").value.trim();
      const input_params = qs("#sr_input").value.trim();
      const output_format = qs("#sr_output").value.trim();
      const algo_type = qs("#sr_type").value;
      const target_apps = qs("#sr_apps").value.trim();
      if (!description) { showToast("请填写功能描述"); return; }
      try {
        await api(`/api/v1/algorithms/${encodeURIComponent(algoId)}/submit`, {
          method: "POST",
          body: JSON.stringify({ metadata: { description, input_params, output_format, algo_type, target_apps } }),
        });
        closeModal();
        showToast("已提交审核");
        if (qs("#my-algo-list")) {
          refreshMyAlgoList();
        } else {
          switchPage("my-algos");
        }
      } catch (err) { showToast(err.message); }
    }

    async function withdrawMyAlgoReview(algoId) {
      if (!confirm("确定撤回审核提交？算法将返回草稿状态。")) return;
      try {
        await api(`/api/v1/algorithms/${encodeURIComponent(algoId)}/withdraw`, { method: "POST" });
        showToast("已撤回提交");
        if (qs("#my-algo-list")) refreshMyAlgoList();
        else switchPage("my-algos");
      } catch (err) { showToast(err.message); }
    }

    async function deleteMyAlgo(algoId) {
      if (!confirm("确定删除该算法？此操作不可恢复。")) return;
      try {
        await api(`/api/v1/algorithms/${encodeURIComponent(algoId)}`, { method: "DELETE" });
        showToast("算法已删除");
        refreshMyAlgoList();
      } catch (err) { showToast(err.message); }
    }

    async function renderUsersPage() {
      qs("#main").innerHTML = `
        <h1>用户管理</h1>
        <div class="toolbar">
          <span class="spacer"></span>
          <button class="primary" onclick="window.openCreateUserModal()">新建用户</button>
        </div>
        <section id="list"><div class="skeleton"></div></section>
      `;
      try {
        const data = await api("/api/v1/admin/users");
        const users = data.users || [];
        qs("#list").innerHTML = users.length === 0 ? '<div class="empty">暂无用户</div>' : `
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--line);text-align:left">
                <th style="padding:8px 12px;color:var(--text-dim)">用户名</th>
                <th style="padding:8px 12px;color:var(--text-dim)">显示名</th>
                <th style="padding:8px 12px;color:var(--text-dim)">角色</th>
                <th style="padding:8px 12px;color:var(--text-dim)">状态</th>
                <th style="padding:8px 12px;color:var(--text-dim)">创建时间</th>
                <th style="padding:8px 12px;color:var(--text-dim)">操作</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `<tr style="border-bottom:1px solid var(--line)">
                <td style="padding:8px 12px">${esc(u.username)}</td>
                <td style="padding:8px 12px">${esc(u.display_name || "")}</td>
                <td style="padding:8px 12px"><span class="tag ${u.role === "admin" ? "warning" : ""} status-badge">${esc(u.role)}</span></td>
                <td style="padding:8px 12px"><span class="tag ${u.status === "active" ? "success" : "danger"} status-badge">${esc(u.status)}</span></td>
                <td style="padding:8px 12px;font-size:12px;color:var(--text-dim)">${esc((u.created_at || "").slice(0, 10))}</td>
                <td style="padding:8px 12px">
                  <button onclick="window.openResetPasswordModal('${esc(u.id)}')" style="font-size:12px;padding:4px 8px;margin-right:4px">重置密码</button>
                  <button onclick="window.toggleUserStatus('${esc(u.id)}','${u.status === "active" ? "disabled" : "active"}')" style="font-size:12px;padding:4px 8px;margin-right:4px" class="${u.status === "active" ? "danger" : "success"}">${u.status === "active" ? "禁用" : "启用"}</button>
                  ${u.id !== (state.currentUser && state.currentUser.id) ? `<button onclick="window.deleteUser('${esc(u.id)}')" class="danger" style="font-size:12px;padding:4px 8px">删除</button>` : ""}
                </td>
              </tr>`).join("")}
            </tbody>
          </table>
        `;
      } catch (err) {
        qs("#list").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      }
    }

    function openCreateUserModal() {
      openModal(`
        <h2 style="margin:0 0 18px">新建用户</h2>
        <div class="form-group"><label>用户名</label><input id="cu_username" placeholder="英文字母、数字、下划线" /></div>
        <div class="form-group"><label>显示名</label><input id="cu_display_name" placeholder="中文姓名（可选）" /></div>
        <div class="form-group"><label>密码</label><input id="cu_password" type="password" placeholder="至少8位" /></div>
        <div class="form-group"><label>角色</label>
          <select id="cu_role"><option value="user">普通用户</option><option value="admin">管理员</option></select>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doCreateUser()">创建</button>
        </div>
      `);
    }

    async function doCreateUser() {
      const username = qs("#cu_username").value.trim();
      const display_name = qs("#cu_display_name").value.trim();
      const password = qs("#cu_password").value;
      const role = qs("#cu_role").value;
      if (!username || !password) { showToast("用户名和密码不能为空"); return; }
      try {
        await api("/api/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({ username, display_name, password, role }),
        });
        closeModal();
        showToast("用户已创建");
        renderUsersPage();
      } catch (err) { showToast(err.message); }
    }

    function openResetPasswordModal(userId) {
      openModal(`
        <h2 style="margin:0 0 18px">重置密码</h2>
        <div class="form-group"><label>新密码</label><input id="rp_password" type="password" placeholder="至少8位" /></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button onclick="window.closeModal()">取消</button>
          <button class="primary" onclick="window.doResetPassword('${userId}')">重置</button>
        </div>
      `);
    }

    async function doResetPassword(userId) {
      const password = qs("#rp_password").value;
      if (!password) { showToast("请输入新密码"); return; }
      try {
        await api(`/api/v1/admin/users/${userId}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ new_password: password }),
        });
        closeModal();
        showToast("密码已重置");
      } catch (err) { showToast(err.message); }
    }

    async function toggleUserStatus(userId, newStatus) {
      try {
        await api(`/api/v1/admin/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        showToast(newStatus === "active" ? "已启用" : "已禁用");
        renderUsersPage();
      } catch (err) { showToast(err.message); }
    }

    async function deleteUser(userId) {
      if (!confirm("确定删除该用户？此操作不可恢复。")) return;
      try {
        await api(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
        showToast("用户已删除");
        renderUsersPage();
      } catch (err) { showToast(err.message); }
    }

    // ── Component test modal (Req 5 / Req 3) ──────────────────────────
    async function openComponentTestModalById(id) {
      const allComps = [...(state.data.components || [])];
      let algo = allComps.find(a => a.id === id);
      if (!algo) { showToast("找不到该算法信息"); return; }
      _openCompTestModal(algo, null);
    }

    function openComponentTestModal() {
      if (!state.editing) return;
      const content = state.models?.get(state.currentFile)?.getValue() || null;
      _openCompTestModal(state.editing.algo, content);
    }

    function _openCompTestModal(algo, sourceContent) {
      state.compTestMode = "params";
      state.compTestFileUploads = {};
      state._compTestAlgo = algo;
      state._compTestSource = sourceContent;
      const hasExample = !!(algo?.inputExample);
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:680px;width:90vw">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="margin:0">测试：${esc(algo?.zhName || algo?.funcName || algo?.name || "")}</h3>
            <button onclick="window.closeModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-dim)">✕</button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
            <button id="ctParamsBtn" class="primary" onclick="window.setCompTestMode('params')" style="font-size:12px;padding:4px 12px">普通参数模式</button>
            <button id="ctFilesBtn" class="ghost" onclick="window.setCompTestMode('files')" style="font-size:12px;padding:4px 12px">外部文件模式</button>
            ${hasExample ? `<button class="ghost" onclick="window.loadCompTestExample()" style="font-size:12px;padding:4px 12px">📋 填入示例</button>` : ""}
          </div>
          ${hasExample ? `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;padding:6px 8px;background:var(--bg-deep);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">示例数据: ${esc((algo.inputExample || "").slice(0, 120))}</div>` : ""}
          <div id="ctParams" class="param-grid" style="max-height:320px;overflow-y:auto"></div>
          <div class="control-row" style="margin-top:8px;gap:8px">
            <button class="primary" id="ctRunBtn" onclick="window.runCompTest()">▶ 运行</button>
            <select id="ctTimeout" style="padding:4px 8px"><option value="5">5s</option><option value="30">30s</option><option value="60">60s</option></select>
          </div>
          <div id="ctStatus" style="margin-top:4px;font-size:12px;color:var(--text-dim)"></div>
          <div id="ctOutput" style="margin-top:8px;background:var(--bg-deep);border-radius:6px;padding:10px;min-height:60px;max-height:240px;overflow:auto;font-size:13px"><pre style="margin:0;color:var(--text-dim)">等待运行</pre></div>
        </div>
      `;
      renderCompTestParams();
      // Auto-fill example data on open
      if (hasExample) loadCompTestExample();
    }

    function loadCompTestExample() {
      const algo = state._compTestAlgo;
      if (!algo?.inputExample) return;
      try {
        const parsed = JSON.parse(algo.inputExample);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          renderCompTestParams(parsed);
        } else {
          const params = algo?.params || [];
          if (params.length > 0) renderCompTestParams({ [params[0].name]: parsed });
        }
      } catch { /* ignore invalid json */ }
    }

    function setCompTestMode(mode) {
      state.compTestMode = mode;
      qs("#ctParamsBtn")?.classList.toggle("primary", mode === "params");
      qs("#ctParamsBtn")?.classList.toggle("ghost", mode !== "params");
      qs("#ctFilesBtn")?.classList.toggle("primary", mode === "files");
      qs("#ctFilesBtn")?.classList.toggle("ghost", mode !== "files");
      renderCompTestParams();
    }

    function renderCompTestParams(values = {}) {
      const container = qs("#ctParams");
      if (!container) return;
      const params = state._compTestAlgo?.params || [];
      if (!params.length) { container.innerHTML = '<div class="empty">该函数无参数</div>'; return; }
      if (state.compTestMode === "files") {
        container.innerHTML = params.map(p => {
          const uploaded = state.compTestFileUploads?.[p.name];
          return `<div class="param-field">
            <label>${esc(p.name)} · ${esc(String(p.type || p.annotation || "Any"))}</label>
            <div style="display:flex;gap:8px;align-items:center">
              <label class="ghost" style="cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:4px;font-size:12px">选择文件
                <input type="file" style="display:none" onchange="window.onCompTestBinaryFileSelected(event,'${esc(p.name)}')" />
              </label>
              ${uploaded ? `<span style="color:var(--success,#3fb950);font-size:12px">✅ ${esc(uploaded.filename)}</span>` : `<span style="color:var(--text-dim);font-size:12px">未选择</span>`}
            </div>
          </div>`;
        }).join("");
      } else {
        container.innerHTML = params.map(p => {
          const type = String(p.type || p.annotation || "str");
          const name = p.name;
          const rawVal = values[name];
          const valStr = rawVal !== undefined && rawVal !== null
            ? (typeof rawVal === "object" ? JSON.stringify(rawVal) : String(rawVal))
            : "";
          if (/bool/i.test(type)) {
            const isTrueSelected = rawVal === true || rawVal === "true" || rawVal === 1;
            return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><select data-ct-param="${esc(name)}" data-ct-type="${esc(type)}"><option value="false"${!isTrueSelected ? " selected" : ""}>false</option><option value="true"${isTrueSelected ? " selected" : ""}>true</option></select></div>`;
          }
          if (/list|dict|DataFrame|dataframe/i.test(type)) {
            return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><textarea rows="3" data-ct-param="${esc(name)}" data-ct-type="${esc(type)}" placeholder="${/DataFrame|dataframe/.test(type) ? "粘贴 CSV" : "JSON"}">${esc(valStr)}</textarea></div>`;
          }
          if (/int|float|number/i.test(type)) {
            return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input type="number" data-ct-param="${esc(name)}" data-ct-type="${esc(type)}" value="${esc(valStr)}" /></div>`;
          }
          return `<div class="param-field"><label>${esc(name)} · ${esc(type)}</label><input data-ct-param="${esc(name)}" data-ct-type="${esc(type)}" value="${esc(valStr)}" /></div>`;
        }).join("");
      }
    }

    async function onCompTestBinaryFileSelected(event, paramName) {
      const file = event.target.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const result = await fetch("/api/v1/test/upload-temp", {
          method: "POST",
          headers: { Authorization: state.token ? `Bearer ${state.token}` : "" },
          body: formData
        }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.detail || "上传失败"))));
        if (!state.compTestFileUploads) state.compTestFileUploads = {};
        state.compTestFileUploads[paramName] = { path: result.path, filename: result.filename };
        renderCompTestParams();
      } catch (err) { showToast("文件上传失败: " + err.message); }
    }

    function collectCompTestParams() {
      const payload = {};
      qsa("[data-ct-param]").forEach(input => {
        const name = input.dataset.ctParam;
        const type = input.dataset.ctType || "";
        payload[name] = parseParamValueByType(type, input.value);
      });
      return payload;
    }

    async function runCompTest() {
      const btn = qs("#ctRunBtn");
      const status = qs("#ctStatus");
      const output = qs("#ctOutput");
      if (!btn) return;
      const started = performance.now();
      btn.disabled = true;
      btn.textContent = "运行中...";
      if (status) status.textContent = "";
      try {
        const algo = state._compTestAlgo;
        const sourceContent = state._compTestSource;
        const fnName = algo?.funcName || algo?.name || "main";
        const timeout = Number(qs("#ctTimeout")?.value || "5");
        let kwargs;
        if (state.compTestMode === "files") {
          kwargs = {};
          const params = algo?.params || [];
          const missing = params.filter(p => !state.compTestFileUploads?.[p.name]).map(p => p.name);
          if (missing.length > 0) { showToast(`请先为以下参数选择文件: ${missing.join(", ")}`); return; }
          params.forEach(p => { kwargs[p.name] = state.compTestFileUploads[p.name].path; });
        } else {
          kwargs = collectCompTestParams();
        }
        const algoStatus = algo?.publishStatus || algo?.status || "";
        const isPublished = algoStatus === "published";
        let body, url;
        if (sourceContent) {
          url = "/api/v1/run-source";
          body = { content: sourceContent, function: fnName, kwargs, timeout };
        } else if (algo?.id) {
          url = "/api/v1/run";
          body = isPublished
            ? { namespace: algo.namespace, function: fnName, params: kwargs }
            : { namespace: algo.namespace, function: fnName, params: kwargs, allow_unpublished: true };
        } else {
          showToast("无法确定运行方式"); return;
        }
        const result = await api(url, { method: "POST", body: JSON.stringify(body) });
        const elapsed = result.elapsed_ms ?? Math.round(performance.now() - started);
        if (status) status.textContent = `✅ ${elapsed} ms`;
        if (output) output.innerHTML = `<pre style="margin:0">${esc(JSON.stringify(result.result ?? result, null, 2))}</pre>`;
      } catch (err) {
        if (status) status.textContent = `❌ ${Math.round(performance.now() - started)} ms`;
        if (output) output.innerHTML = `<pre style="margin:0;color:var(--danger,#f85149)">${esc(err.message)}</pre>`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "▶ 运行"; }
      }
    }

    // ── Fork view (Req 1 / Req 2) ─────────────────────────────────────
    async function openForkView(id, moduleKind) {
      showToast("正在加载...");
      const dataKey = moduleKind === "template" ? "templates" : "components";
      const allItems = [...(state.data[dataKey] || [])];
      const algo = allItems.find(a => a.id === id);
      let sourceCode = "";
      try {
        const srcResult = await api(`/api/v1/algorithm-source/${safeId(id)}`);
        sourceCode = srcResult.source || "";
      } catch (err) { showToast("加载源码失败: " + err.message); return; }
      // Fix: normalize cats to array (api() returns {success, categories:[...]}, not an array)
      const catsRaw = await api(`/api/v1/categories?module_kind=${moduleKind}`).catch(() => null);
      const cats = Array.isArray(catsRaw) ? catsRaw : (catsRaw?.categories || []);
      const catOptions = cats.length
        ? cats.map(c => `<option value="${esc(c.namespace)}">${esc(c.zh_name || c.namespace)}</option>`).join("")
        : `<option value="custom">custom</option>`;
      const algoCatNs = (algo?.namespace || "").split(".").slice(0, -1).join(".");
      const defaultCatVal = cats.find(c => c.namespace === algoCatNs)?.namespace || cats[0]?.namespace || "custom";
      const kindLabel = moduleKind === "template" ? "算法模板" : "算法组件";
      const defaultInputExample = esc(algo?.inputExample || "");
      qs("#main").innerHTML = `
        <div style="padding:24px;max-width:760px;margin:0 auto;overflow-y:auto;height:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <button onclick="window.switchPage('${esc(dataKey)}')">← 返回</button>
            <h2 style="margin:0">另存为我的${esc(kindLabel)}</h2>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>函数名 <span style="color:var(--danger,#f85149)">*</span></label>
              <input id="forkName" value="${esc(algo?.funcName || algo?.name || "")}" placeholder="小写字母+数字+下划线" /></div>
            <div class="form-row"><label>中文名称</label>
              <input id="forkZhName" value="${esc(algo?.zhName || "")}"/></div>
            <div class="form-row"><label>所属分类</label>
              <select id="forkCategory">${catOptions}</select></div>
            <div class="form-row"><label>版本号</label>
              <input id="forkVersion" value="${esc(algo?.version || "1.0.0")}" /></div>
            <div class="form-row"><label>描述</label>
              <textarea id="forkDesc" rows="2">${esc(algo?.zhDescription || "")}</textarea></div>
            <div class="form-row"><label>标签 <span style="color:var(--text-dim);font-size:12px">逗号分隔</span></label>
              <input id="forkTags" value="${esc((algo?.zhTags || []).join(","))}" /></div>
            <div class="form-row"><label>输入示例 JSON <span style="color:var(--text-dim);font-size:12px">（将在测试窗口自动填充）</span></label>
              <textarea id="forkInputExample" rows="2" placeholder='{"param1": 1, "param2": "value"}'>${defaultInputExample}</textarea></div>
          </div>
          <div style="margin:16px 0 6px;font-weight:500;font-size:13px">源代码</div>
          <textarea id="forkCode" rows="18" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;padding:10px;background:var(--bg-deep);border:1px solid var(--border);border-radius:6px;color:var(--text);resize:vertical">${esc(sourceCode)}</textarea>
          <div class="field-error" id="forkErr" style="margin-top:6px"></div>
          <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap">
            <button onclick="window.switchPage('${esc(dataKey)}')">取消</button>
            <button class="ghost" onclick="window.saveFork('${esc(id)}','${esc(moduleKind)}','draft')">保存草稿</button>
            <button class="primary" onclick="window.saveFork('${esc(id)}','${esc(moduleKind)}','submit')">提交审核</button>
          </div>
        </div>
      `;
      if (qs("#forkCategory") && defaultCatVal) qs("#forkCategory").value = defaultCatVal;
    }

    function openForkTemplateView(id) { return openForkView(id, "template"); }
    function openForkComponentView(id) { return openForkView(id, "component"); }

    async function saveFork(originalId, moduleKind, action) {
      const name = qs("#forkName")?.value.trim();
      const zhName = qs("#forkZhName")?.value.trim() || name;
      const catValue = qs("#forkCategory")?.value.trim() || "custom";
      const version = qs("#forkVersion")?.value.trim() || "1.0.0";
      const desc = qs("#forkDesc")?.value.trim() || "";
      const tags = (qs("#forkTags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
      const code = qs("#forkCode")?.value || "";
      const errEl = qs("#forkErr");
      if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) {
        if (errEl) errEl.textContent = "函数名只能使用小写字母、数字和下划线";
        return;
      }
      if (!code.trim()) { if (errEl) errEl.textContent = "源代码不能为空"; return; }
      if (errEl) errEl.textContent = "";
      const namespace = catValue.replace(/^alg\./, "");
      const dataKey = moduleKind === "template" ? "templates" : "components";
      const inputExample = qs("#forkInputExample")?.value.trim() || "";
      try {
        const result = await api("/api/v1/algorithms/create", {
          method: "POST",
          body: JSON.stringify({
            name, zh_name: zhName, category: namespace, version,
            zh_description: desc, zh_tags: tags, code,
            module_kind: moduleKind, publish_status: "draft", input_example: inputExample
          })
        });
        const newId = result.algorithm?.id || "";
        if (action === "submit" && newId) {
          try {
            await api(`/api/v1/algorithms/${safeId(newId)}/submit`, { method: "POST", body: JSON.stringify({ version_bump: version }) });
            showToast("✅ 已保存并提交审核");
          } catch { showToast("✅ 已保存草稿（提交审核失败，请在列表中手动提交）"); }
        } else {
          showToast("✅ 已保存为草稿");
        }
        state.highlightId = newId;
        await loadModuleData(dataKey);
        switchPage(dataKey);
        window.setTimeout(() => { state.highlightId = ""; if (state.page === dataKey) renderCards(dataKey); }, 2000);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    }

    function init() {
      renderNav();
      bindGlobalKeys();
      switchPage("components");
      connectSse();
      tickClock();
      window.setInterval(tickClock, 1000);
    }

    window.api = api;
    window.showToast = showToast;
    window.switchPage = switchPage;
    window.renderPage = renderPage;
    window.applyFilters = applyFilters;
    window.setQuickFilter = setQuickFilter;
    window.toggleFolder = toggleFolder;
    window.editCategory = editCategory;
    window.saveCategory = saveCategory;
    window.deleteCategory = deleteCategory;
    window.confirmDeleteCategory = confirmDeleteCategory;
    window.createSubcategory = createSubcategory;
    window.saveSubcategory = saveSubcategory;
    window.createRootCategory = createRootCategory;
    window.saveRootCategory = saveRootCategory;
    window.createNew = createNew;
    window.openAlgorithmCreateModal = openAlgorithmCreateModal;
    window.refreshCreateCodeName = refreshCreateCodeName;
    window.testNewAlgorithmSource = testNewAlgorithmSource;
    window.saveNewAlgorithm = saveNewAlgorithm;
    window.openComplexAlgorithmModal = openComplexAlgorithmModal;
    window.refreshComplexFiles = refreshComplexFiles;
    window.saveComplexAlgorithm = saveComplexAlgorithm;
    window.openEditor = openEditor;
    window.openEditorById = openEditorById;
    window.closeEditor = closeEditor;
    window.saveAndCloseEditor = saveAndCloseEditor;
    window.initEditor = initEditor;
    window.switchFile = switchFile;
    window.addSourceFile = addSourceFile;
    window.openSourceFileModal = openSourceFileModal;
    window.confirmSourceFileModal = confirmSourceFileModal;
    window.saveCurrentFile = saveCurrentFile;
    window.validateNamespace = validateNamespace;
    window.saveNamespace = saveNamespace;
    window.setTestHeight = setTestHeight;
    window.startTestResize = startTestResize;
    window.startTreeResize = startTreeResize;
    window.renderParams = renderParams;
    window.runTest = runTest;
    window.switchOutput = switchOutput;
    window.generateExampleData = generateExampleData;
    function loadInputExample() {
      const example = state.editing?.algo?.inputExample;
      if (!example) return;
      try {
        const values = JSON.parse(example);
        renderParams(values);
        showToast("已加载输入示例");
      } catch { showToast("输入示例格式错误"); }
    }
    window.loadInputExample = loadInputExample;
    window.saveTestCase = saveTestCase;
    window.loadTestCase = loadTestCase;
    window.editCurrentAlgorithmInfo = editCurrentAlgorithmInfo;
    window.editTemplateDescription = editTemplateDescription;
    window.saveTemplateDescription = saveTemplateDescription;
    window.editAlgorithmInfo = editAlgorithmInfo;
    window.openAlgorithmInfoModal = openAlgorithmInfoModal;
    window.saveAlgorithmInfo = saveAlgorithmInfo;
    window.publishAsComponent = publishAsComponent;
    window.confirmPublishAsComponent = confirmPublishAsComponent;
    window._doPublishAsComponent = _doPublishAsComponent;
    window.saveTplDraft = saveTplDraft;
    window.onTplCatChange = onTplCatChange;
    window.testTplSource = testTplSource;
    window.refreshTplTestParamsFromFunction = refreshTplTestParamsFromFunction;
    window.loadTplInputExample = loadTplInputExample;
    window.openTplParamImport = openTplParamImport;
    window.onTplParamFileSelected = onTplParamFileSelected;
    window.setTplTestMode = setTplTestMode;
    window.openTplBinaryUpload = openTplBinaryUpload;
    window.onTplBinaryFileSelected = onTplBinaryFileSelected;
    window.runTplSourceTest = runTplSourceTest;
    window.openComponentTestModalById = openComponentTestModalById;
    window.openComponentTestModal = openComponentTestModal;
    window.setCompTestMode = setCompTestMode;
    window.renderCompTestParams = renderCompTestParams;
    window.loadCompTestExample = loadCompTestExample;
    window.onCompTestBinaryFileSelected = onCompTestBinaryFileSelected;
    window.runCompTest = runCompTest;
    window.openForkTemplateView = openForkTemplateView;
    window.openForkComponentView = openForkComponentView;
    window.saveFork = saveFork;
    window.submitReview = submitReview;
    window.openSubmitModal = openSubmitModal;
    window.confirmSubmitReview = confirmSubmitReview;
    window.viewRejectedDraft = viewRejectedDraft;
    window.viewRejectReason = viewRejectReason;
    window.undoRejectReview = undoRejectReview;
    window.discardRejectedDraft = discardRejectedDraft;
    window.validateAlgCategoryNs = validateAlgCategoryNs;
    window.onWsCatChange = onWsCatChange;
    window.saveWorkspaceAlgorithm = saveWorkspaceAlgorithm;
    window.testWorkspaceSource = testWorkspaceSource;
    window.applyWorkspaceTemplate = applyWorkspaceTemplate;
    window.switchWorkspaceFile = switchWorkspaceFile;
    window.updateWorkspaceFileContent = updateWorkspaceFileContent;
    window.renameWorkspaceFile = renameWorkspaceFile;
    window.renameSourceFile = renameSourceFile;
    window.onAlgCatChange = onAlgCatChange;
    window.withdrawReview = withdrawReview;
    window.approveReview = approveReview;
    window.confirmApproveReview = confirmApproveReview;
    window.rejectReview = rejectReview;
    window.confirmRejectReview = confirmRejectReview;
    window.publishComponent = publishComponent;
    window.deprecateComponent = deprecateComponent;
    window.showVersions = showVersions;
    window.snapshotVersion = snapshotVersion;
    window.deleteAlgorithm = deleteAlgorithm;
    window.showApiDoc = showApiDoc;
    window.editSnippet = editSnippet;
    window.saveSnippet = saveSnippet;
    window.closeSnippetEditor = closeSnippetEditor;
    window.copySnippetFromEditor = copySnippetFromEditor;
    window.insertSnippet = insertSnippet;
    window.insertSnippetById = insertSnippetById;
    window.copyTextToClipboard = copyTextToClipboard;
    window.copySnippet = copySnippet;
    window.deleteSnippet = deleteSnippet;
    window.openSnippetOverlay = openSnippetOverlay;
    window.closeSnippetOverlay = closeSnippetOverlay;
    window.searchSnippetOverlay = searchSnippetOverlay;
    window.pickSnippet = pickSnippet;
    window.closeModal = closeModal;
    window.loadCurrentPage = loadCurrentPage;
    window.updateCardNamespace = updateCardNamespace;
    window.doLogin = doLogin;
    window.doLogout = doLogout;
    window.renderUsersPage = renderUsersPage;
    window.renderMyAlgorithmsPage = renderMyAlgorithmsPage;
    window.openNewAlgoModal = openNewAlgoModal;
    window.doCreateMyAlgo = doCreateMyAlgo;
    window.openMyAlgoEditor = openMyAlgoEditor;
    window.saveMyAlgoSource = saveMyAlgoSource;
    window.runMyAlgoTest = runMyAlgoTest;
    window.openSubmitReviewModal = openSubmitReviewModal;
    window.doSubmitReview = doSubmitReview;
    window.withdrawMyAlgoReview = withdrawMyAlgoReview;
    window.deleteMyAlgo = deleteMyAlgo;
    window.openCreateUserModal = openCreateUserModal;
    window.doCreateUser = doCreateUser;
    window.openResetPasswordModal = openResetPasswordModal;
    window.doResetPassword = doResetPassword;
    window.toggleUserStatus = toggleUserStatus;
    window.deleteUser = deleteUser;

    (async function initWithAuth() {
      tickClock();
      window.setInterval(tickClock, 1000);
      bindGlobalKeys();

      const token = localStorage.getItem("algolib_token");
      if (token) {
        try {
          const resp = await fetch(BASE + "/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const data = await resp.json();
            state.currentUser = data.user || data;
            localStorage.setItem("algolib_user", JSON.stringify(state.currentUser));
            hideLoginPage();
            renderNav();
            switchPage("components");
            connectSse();
            return;
          }
        } catch (_) { /* network error */ }
      }
      showLoginPage();
    })();
  