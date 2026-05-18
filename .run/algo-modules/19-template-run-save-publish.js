/*
 * AlgoLib module: 19-template-run-save-publish.js
 * ?????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

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
            <span style="font-size:12px;color:#888">可直接输入参数值，或点击参数右侧「📎 上传」按鈕上传文件（图片、音频、npy 等）</span>
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
        kwargs = collectTplTestParams();
        // Override with uploaded file paths where applicable
        Object.entries(state.tplFileUploads || {}).forEach(([name, info]) => { kwargs[name] = info.multi ? info.paths : info.path; });
        if (qs("#tplInputExample")) qs("#tplInputExample").value = JSON.stringify(kwargs, null, 2);
        const result = await api("/api/v1/run-source", {
          method: "POST",
          body: JSON.stringify({
            content: getTplCode(),
            function: fnName,
            kwargs,
            timeout
          })
        });
        const elapsed = result.elapsed_ms ?? Math.round(performance.now() - started);
        status.textContent = `✅ ${elapsed} ms`;
        showResultWithRenderBtn(output, result.result ?? result);
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
      const code = getTplCode();

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
      const code = getTplCode();

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
