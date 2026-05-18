/*
 * AlgoLib module: 38-fork-copy.js
 * ???????/??????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

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
          await loadModuleData(dataKey);
          switchPage(dataKey);
          window.setTimeout(() => window.openSubmitModal(newId), 300);
        } else {
          showToast("✅ 已保存为草稿");
          state.highlightId = newId;
          await loadModuleData(dataKey);
          switchPage(dataKey);
          window.setTimeout(() => { state.highlightId = ""; if (state.page === dataKey) renderCards(dataKey); }, 2000);
        }
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    }

