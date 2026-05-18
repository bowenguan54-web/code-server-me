/*
 * AlgoLib module: 04-nav-router.js
 * ????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function renderNav() {
      const isAlgoGroupActive = state.page.startsWith("components-");
      const isTemplateGroupActive = state.page.startsWith("templates-");
      const algoCollapsed = state.navCollapsed["components-group"];
      const templateCollapsed = state.navCollapsed["templates-group"];

      const subItem = (page, label) => {
        const isActive = state.page === page;
        return `<div class="nav-item ${isActive ? "active" : ""}" data-page="${page}" style="padding-left:26px"><span class="nav-dot" style="width:5px;height:5px;opacity:.7"></span>${label}</div>`;
      };

      const html = [
        '<div class="brand">Algo<span>Lib</span></div>',
        // 算法 group
        `<div class="nav-item nav-group-hd ${isAlgoGroupActive ? "active" : ""}" data-group="components-group" style="display:flex;align-items:center;gap:10px">
          <span class="nav-dot"></span>算法
          <button class="nav-collapse-btn ${algoCollapsed ? "collapsed" : ""}" data-toggle="components-group" style="margin-left:auto" title="${algoCollapsed ? "展开" : "收起"}">▾</button>
        </div>`,
        `<div class="nav-sub-group ${algoCollapsed ? "collapsed" : ""}" data-sub="components-group">${
          [subItem("components-general", "通用算法"), subItem("components-system", "系统算法"), subItem("components-domain", "领域算法")].join("")
        }</div>`,
        // 算法模板 group
        `<div class="nav-item nav-group-hd ${isTemplateGroupActive ? "active" : ""}" data-group="templates-group" style="display:flex;align-items:center;gap:10px">
          <span class="nav-dot"></span>算法模板
          <button class="nav-collapse-btn ${templateCollapsed ? "collapsed" : ""}" data-toggle="templates-group" style="margin-left:auto" title="${templateCollapsed ? "展开" : "收起"}">▾</button>
        </div>`,
        `<div class="nav-sub-group ${templateCollapsed ? "collapsed" : ""}" data-sub="templates-group">${
          [subItem("templates-general", "通用模板"), subItem("templates-system", "系统模板"), subItem("templates-domain", "领域模板")].join("")
        }</div>`,
        ...(() => {
          const snippetCats = state.categories["snippets"] || [];
          const snippetCollapsed = state.navCollapsed["snippets-group"];
          const isSnippetActive = state.page === "snippets";
          const subItems = snippetCats.map(cat => {
            const ns = cat.namespace;
            const isSubActive = isSnippetActive && state.selectedNavNs === ns;
            return `<div class="nav-item nav-snippet-cat${isSubActive ? " active" : ""}" data-ns="${esc(ns)}" style="padding-left:26px"><span class="nav-dot" style="width:5px;height:5px;opacity:.7"></span>${esc(cat.zh_name || ns)}</div>`;
          }).join("");
          return [
            `<div class="nav-item ${isSnippetActive ? "active" : ""}" data-page="snippets" style="display:flex;align-items:center;gap:10px">
              <span class="nav-dot"></span>代码片段
              <button class="nav-collapse-btn ${snippetCollapsed ? "collapsed" : ""}" data-toggle="snippets-group" style="margin-left:auto" title="${snippetCollapsed ? "展开" : "收起"}">▾</button>
            </div>`,
            `<div class="nav-sub-group ${snippetCollapsed ? "collapsed" : ""}" data-sub="snippets-group">${subItems}</div>`
          ];
        })(),
        ...(state.currentUser ? [
          `<div class="nav-item ${state.page === "my-algos" ? "active" : ""}" data-page="my-algos"><span class="nav-dot"></span>我的算法</div>`,
        ] : []),
        ...(state.currentUser?.role === "admin" ? [`<div class="nav-item ${state.page === "review" ? "active" : ""}" data-page="review"><span class="nav-dot"></span>算法审核</div>`] : []),
        `<div class="nav-item ${state.page === "settings" ? "active" : ""}" data-page="settings"><span class="nav-dot"></span>系统设置</div>`,
        ...(state.currentUser?.role === "admin" ? [`<div class="nav-item ${state.page === "users" ? "active" : ""}" data-page="users"><span class="nav-dot"></span>用户管理</div>`] : []),
        state.currentUser ? `<div style="margin-top:auto;padding:10px 8px 0;border-top:1px solid var(--line);font-size:12px;color:var(--text-dim)">
          <div style="color:var(--text);font-weight:600">${esc(state.currentUser.display_name || state.currentUser.username)}</div>
          <div style="margin:2px 0 6px">${esc(state.currentUser.role === "admin" ? "管理员" : "普通用户")}</div>
          <button class="ghost" style="font-size:12px;padding:4px 8px" onclick="window.doLogout()">退出登录</button>
        </div>` : ""
      ];
      qs("#sidebar").innerHTML = html.join("");

      // Group header: clicking navigates to first sub-page; collapse button toggles
      qsa(".nav-group-hd").forEach(el => {
        el.addEventListener("click", (evt) => {
          if (evt.target.classList.contains("nav-collapse-btn")) return;
          const group = el.dataset.group;
          if (group === "components-group") switchPage("components-general");
          else if (group === "templates-group") switchPage("templates-general");
        });
      });

      qsa(".nav-item[data-page]").forEach(el => {
        el.addEventListener("click", (evt) => {
          if (evt.target.classList.contains("nav-collapse-btn")) return;
          const page = el.dataset.page;
          if (!page) return;
          if (state.page === page) {
            const filterCat = qs("#filterCategory");
            if (filterCat) { filterCat.value = ""; applyFilters(); }
            return;
          }
          switchPage(page);
        });
      });

      qsa(".nav-snippet-cat").forEach(el => {
        el.addEventListener("click", () => {
          const ns = el.dataset.ns;
          state.selectedNavNs = ns;
          if (state.page !== "snippets") {
            switchPage("snippets");
            window.setTimeout(() => scrollToSection(ns), 400);
          } else {
            renderNav();
            scrollToSection(ns);
          }
        });
      });

      qsa(".nav-collapse-btn").forEach(btn => {
        btn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          const key = btn.dataset.toggle;
          const isNowCollapsed = !state.navCollapsed[key];
          state.navCollapsed[key] = isNowCollapsed;
          const sub = qs(`.nav-sub-group[data-sub="${key}"]`);
          if (sub) sub.classList.toggle("collapsed", isNowCollapsed);
          btn.classList.toggle("collapsed", isNowCollapsed);
          btn.title = isNowCollapsed ? "展开" : "收起";
        });
      });
    }

    function switchPage(page) {
      // Normalize legacy bare page IDs to first sub-page
      if (page === "components") page = "components-general";
      if (page === "templates") page = "templates-general";
      state.page = page;
      qsa(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
      renderPage(page);
    }

    function renderPage(page) {
      const parentP = parentPageOf(page);
      if (parentP === "components" || parentP === "templates" || page === "snippets" || page === "my-algos") {
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
