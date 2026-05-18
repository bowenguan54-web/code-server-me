/*
 * AlgoLib module: 11-legacy-create.js
 * ???????/?????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

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
        showResultWithRenderBtn(out, result);
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
        publish_status: "draft",
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
