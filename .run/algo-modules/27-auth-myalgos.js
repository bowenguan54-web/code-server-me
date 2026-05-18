/*
 * AlgoLib module: 27-auth-myalgos.js
 * ?????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

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
          <button class="qf-success" data-qf="published" onclick="window.setQuickFilter('published','my-algos')">公有</button>
          <button data-qf="draft" onclick="window.setQuickFilter('draft','my-algos')">私有</button>
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
        restoreListViewState("my-algos");
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
            const reviewVisible = ["reviewing", "rejected", "approved"].includes(ps);
            const privacyTxt = ps === "published" ? "公有" : "私有";
            const privacyCls = privacyTxt === "公有" ? "success" : "warning";
            const statusCls = statusClass(ps);
            const statusTxt = { reviewing: "审核中", rejected: "已拒绝", approved: "待发布" }[ps] || ps;
            const canEdit = ps === "draft" || ps === "rejected";
            const canSubmit = ps === "draft" || ps === "rejected";
            const canWithdraw = ps === "reviewing";
            const canDelete = ps === "draft" || ps === "rejected";
            return `<div class="card" style="position:relative;padding:16px">
              ${reviewVisible ? `<span class="tag ${statusCls} status-badge">${esc(statusTxt)}</span>` : ""}
              <span class="tag ${privacyCls}" style="position:absolute;right:10px;top:${reviewVisible ? "38px" : "10px"}">${esc(privacyTxt)}</span>
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
          <div id="mytest-output" class="output" style="margin-top:8px;min-height:60px"></div>
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
        const statusTxt = { draft: "私有", reviewing: "审核中", rejected: "已拒绝", approved: "待发布", published: "公有" }[ps] || ps;
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
        showResultWithRenderBtn(outputEl, data.result ?? data);
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
      showConfirm("确定撤回审核提交？算法将返回草稿状态。", async () => {
        try {
          await api(`/api/v1/algorithms/${encodeURIComponent(algoId)}/withdraw`, { method: "POST" });
          showToast("已撤回提交");
          if (qs("#my-algo-list")) refreshMyAlgoList();
          else switchPage("my-algos");
        } catch (err) { showToast(err.message); }
      });
    }

    async function deleteMyAlgo(algoId) {
      showConfirm("确定删除该算法？此操作不可恢复。", async () => {
        try {
          await api(`/api/v1/algorithms/${encodeURIComponent(algoId)}`, { method: "DELETE" });
          showToast("算法已删除");
          refreshMyAlgoList();
        } catch (err) { showToast(err.message); }
      });
    }
