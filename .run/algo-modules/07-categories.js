/*
 * AlgoLib module: 07-categories.js
 * ????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

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

    const newAlgoState = {
      files: [],
      currentFile: "",
      editor: null,
      models: new Map(),
      mode: "template",
      importedFromPicker: false,
      functions: [],
      widgetParams: [],
      widgetOverrides: {},
      returnPage: ""
    };
