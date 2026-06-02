/*
 * AlgoLib module: 17-algo-info-admin-publish.js
 * 算法基本信息、管理员发布、版本与修改记录。
 * 修改本文件后请运行 .run/build-algo-lib.sh all 重新构建并注入页面。
 */

    function editCurrentAlgorithmInfo() {
      if (!state.editing?.algo) return;
      openAlgorithmInfoModal(state.editing.algo, state.editing.page);
    }

    async function editTemplateDescription(id) {
      const item = state.editing?.algo || (state.data.templates || []).find(e => e.id === id);
      if (!item) { showToast("未找到模板"); return; }
      const defaultTemplateGuide = `用途：说明这个模板适合开发哪类算法，以及输入、输出和依赖环境。

使用步骤：
1. 点击“编辑”进入模板代码，先阅读顶部注释，确认配置区、核心逻辑区和验证区分别要修改什么。
2. 在配置区填写默认参数，在核心逻辑函数中补全算法主体，并在注释中写清楚每个参数含义。
3. 使用“测试”准备示例输入，确认输出结构符合说明。
4. 点击“发布为组件”，填写组件名称、分类、版本和调用说明后提交审核。

注释要求：
- 文件顶部写清模板用途、适用场景、版本和依赖。
- 每个需要用户修改的位置用清晰注释说明“为什么改、怎么改”。
- 函数 docstring 中写明参数类型、默认值、返回值和异常情况。

使用示例：
from algolib import alg
result = alg.<分类>.<组件函数>(data, **params)
print(result)`;
      const curDesc = item.zhDescription || item.zh_description || defaultTemplateGuide;
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
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal">
          <h3>基本信息</h3>
          <div class="form-grid">
            <div class="form-row"><label>中文名称</label><input value="${esc(item.zhName || "")}" disabled /></div>
            <div class="form-row"><label>描述</label><textarea rows="4" disabled>${esc(item.zhDescription || "")}</textarea></div>
            <div class="form-row"><label>所属分类</label><input value="${esc(item.namespace || "")}" disabled /></div>
            <div class="form-row"><label>标签</label><input value="${esc((item.zhTags || []).join(","))}" disabled /></div>
            <div class="form-row"><label>版本</label><input value="${esc(item.version || "1.0.0")}" disabled /></div>
          </div>
          <h4 style="margin:16px 0 8px">修改记录</h4>
          <div class="output" style="max-height:240px;overflow:auto">
            <table class="api-table" style="font-size:13px">
              <thead><tr><th>操作人</th><th>时间</th><th>动作</th><th>版本变化</th><th>备注</th></tr></thead>
              <tbody id="infoHistoryBody">
                <tr><td colspan="5" style="text-align:center;color:var(--text-dim)">加载中...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">关闭</button>
            <button class="primary" onclick="window.closeModal();window.openEditorById('${esc(item.id)}','${esc(page)}')">打开编辑</button>
          </div>
        </div>
      `;
      loadAlgorithmHistory(item.id || item.registryId || item.callPrefix || "");
    }

    function formatAlgorithmHistoryAction(record) {
      const actionType = record.action_type || record.status || "";
      switch (actionType) {
        case "code_save": return "保存代码";
        case "draft_save": return "保存草稿";
        case "submit":
        case "reviewing":
          return "提交审核";
        case "approve":
        case "approved":
          return "审核通过";
        case "reject":
        case "rejected":
          return "驳回";
        case "publish":
        case "published":
        case "new_publish":
          return "正式发布";
        case "iteration":
          return "版本迭代";
        case "withdraw":
        case "draft":
          return "撤回审核";
        case "deprecate":
        case "deprecated":
          return "下架";
        default:
          return record.status || record.action_type || "未知操作";
      }
    }

    function formatAlgorithmHistoryVersion(record) {
      const fromVersion = String(record.from_version || "").trim();
      const toVersion = String(record.to_version || "").trim();
      if (fromVersion && toVersion && fromVersion !== toVersion) return `${fromVersion} → ${toVersion}`;
      if (toVersion) return toVersion;
      if (fromVersion) return fromVersion;
      return "-";
    }

    function formatAlgorithmHistoryTime(timestamp) {
      if (!timestamp) return "-";
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "-";
      const pad = value => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function truncateAlgorithmHistoryReason(reason) {
      const text = String(reason || "").trim();
      if (!text) return "-";
      return text.length > 30 ? `${text.slice(0, 30)}...` : text;
    }

    async function loadAlgorithmHistory(id) {
      const tbody = qs("#infoHistoryBody");
      if (!tbody) return;
      const emptyHtml = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">暂无修改记录</td></tr>';
      if (!id) {
        tbody.innerHTML = emptyHtml;
        return;
      }
      try {
        const data = await api(`/api/v1/algorithms/${safeId(id)}/publish-history`);
        const history = (Array.isArray(data.history) ? data.history : [])
          .slice()
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
          .slice(0, 50);
        if (!history.length) {
          tbody.innerHTML = emptyHtml;
          return;
        }
        tbody.innerHTML = history.map(record => {
          const operator = record.operator_name || record.operator || "system";
          const time = formatAlgorithmHistoryTime(record.timestamp);
          const action = formatAlgorithmHistoryAction(record);
          const version = formatAlgorithmHistoryVersion(record);
          const note = truncateAlgorithmHistoryReason(record.reason);
          const fullNote = String(record.reason || "").trim();
          return `<tr><td>${esc(operator)}</td><td>${esc(time)}</td><td>${esc(action)}</td><td>${esc(version)}</td><td title="${esc(fullNote)}">${esc(note)}</td></tr>`;
        }).join("");
      } catch (err) {
        tbody.innerHTML = emptyHtml;
      }
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

    async function showTemplateUsage(id) {
      let item = state.data.templates?.find(t => t.id === id)
        || state.data.components?.find(c => c.id === id)
        || state.data["my-algos"]?.find(c => c.id === id);
      if (!item) {
        try {
          const source = await api(`/api/v1/algorithm-source/${safeId(id)}`);
          item = source.algorithm || { id, zhName: id, callPrefix: id, zhDescription: "" };
        } catch (error) {
          showToast(error.message || "未找到模板");
          return;
        }
      }
      let code = "";
      try {
        const source = await api(`/api/v1/algorithm-source/${safeId(id)}`);
        const files = source.folder_files || [];
        const entry = files.find(f => f.is_entry) || files[0];
        code = entry?.content || source.source || "";
      } catch (_error) {
        code = "";
      }
      const name = item.zhName || item.zh_name || item.funcName || id;
      const desc = item.zhDescription || item.zh_description || "该模板提供算法开发骨架，适合复制后按业务场景补充参数、校验、核心逻辑和返回结构。";
      const callPrefix = item.callPrefix || item.displayNamespace || item.funcName || id;
      const tags = getTags(item).slice(0, 6);
      const prevPage = state.page || "templates";
      qs("#main").innerHTML = `
        <section class="readme-view">
          <div class="editor-top" style="margin-bottom:14px">
            <button onclick="window.switchPage('${esc(prevPage)}')">返回</button>
            <strong>使用说明 / ${esc(name)}</strong>
            <span class="spacer"></span>
            <button onclick="window.openEditorById('${esc(id)}','templates')">编辑模板</button>
            <button class="primary" onclick="window.publishAsComponent('${esc(id)}',this)">基于模板新建组件</button>
          </div>
          <article class="algo-card template" style="max-width:none;margin-bottom:14px">
            <span class="tag ${isPublicItem(item) ? "success" : "warning"}" style="position:absolute;right:14px;top:14px">${esc(privacyLabel(item))}</span>
            <h1 style="margin:0 0 8px;font-size:26px">${esc(name)}</h1>
            <div class="card-ns" style="margin-bottom:14px">${esc(callPrefix)}</div>
            <p style="color:var(--text);line-height:1.8;margin:0 0 12px;max-width:920px">${esc(desc)}</p>
            <div class="tags">
              <span class="tag">python</span><span class="tag">v${esc(item.version || "1.0.0")}</span>
              ${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
            </div>
          </article>
          <div class="readme-grid" style="display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:16px;align-items:start">
            <article class="panel-card">
              <h2>使用步骤</h2>
              <ol style="line-height:1.9;color:var(--text);padding-left:20px">
                <li>阅读模板顶部注释，确认适用场景、输入数据格式和返回结构。</li>
                <li>点击 <code>基于模板新建组件</code>，填写组件函数名、所属分类、中文名、版本和标签。</li>
                <li>进入编辑器后，优先修改配置区和核心函数，不要删除必要的装饰器与入口函数。</li>
                <li>点击 <code>检查代码</code> 修正语法、缩进和命名问题，再用测试面板填入示例参数运行。</li>
                <li>测试通过后，普通用户点击 <code>提交审核</code>；管理员可直接 <code>正式发布</code>。</li>
              </ol>
              <h2>调用示例</h2>
              <pre class="code-block">from algolib import alg

# 发布成组件后，可通过命名空间调用
result = ${esc(callPrefix.replace("templates.", "custom."))}(...)</pre>
              <h2>注意事项</h2>
              <ul style="line-height:1.8;color:var(--text);padding-left:20px">
                <li>函数名应与命名空间最后一段保持一致。</li>
                <li>输入参数请写清类型和默认值，便于测试面板自动识别。</li>
                <li>返回值建议使用 dict，方便 API 调用方解析。</li>
              </ul>
            </article>
            <article class="panel-card">
              <h2>模板代码预览</h2>
              <pre class="code-block" style="max-height:520px;overflow:auto">${esc(code || "暂无源码")}</pre>
            </article>
          </div>
        </section>
      `;
    }

    async function openAdminPublishModal(id) {
      const item = (state.data.components || []).concat(state.data.templates || []).find(i => i.id === id)
        || (state.editing?.id === id ? state.editing.algo : null);
      if (!item) { showToast("算法不存在"); return; }
      let draftInfo = null;
      try {
        const draftResp = await api(`/api/v1/algorithms/${safeId(id)}/review-draft`);
        draftInfo = draftResp?.draft || null;
      } catch (error) {
        draftInfo = null;
      }
      // Check for namespace conflicts (same as openSubmitModal)
      let hasConflict = false;
      let conflictPublicPrefix = "";
      let conflictBaseVersion = "";
      let conflictVersionOptions = null;
      try {
        const check = await api(`/api/v1/algorithms/${safeId(id)}/submit-check`);
        hasConflict = !!check.hasConflict;
        if (hasConflict) {
          conflictPublicPrefix = check.publicAlgorithm?.callPrefix || item.callPrefix || "";
          conflictBaseVersion = check.baseVersion || "";
          conflictVersionOptions = check.versionOptions || null;
        }
      } catch (_) {}
      const draftMeta = draftInfo?.metadata || {};
      const name = draftMeta.zh_name || item.zhName || item.funcName || id;
      const desc = draftMeta.zh_description || item.zhDescription || "";
      const itemTags = item.zhTags || item.tags || [];
      const tags = Array.isArray(draftMeta.zh_tags) ? draftMeta.zh_tags.join(",") : (Array.isArray(itemTags) ? itemTags.join(",") : "");
      const baseVersion = draftInfo?.base_public_version || conflictBaseVersion || item.version || "1.0.0";
      const isIteration = draftInfo?.review_kind === "version_iteration" || !!draftInfo?.target_public_call_prefix || !!item.targetPublicCallPrefix || hasConflict;
      const defaultType = draftInfo?.version_bump_type || (isIteration ? "patch" : "keep");
      const bumpOptions = conflictVersionOptions || [
        { value: baseVersion, type: "keep", label: `保持当前版本 ${baseVersion}` },
        { value: _bumpSemver(baseVersion, "patch"), type: "patch", label: `补丁版本 patch` },
        { value: _bumpSemver(baseVersion, "minor"), type: "minor", label: `次版本 minor` },
        { value: _bumpSemver(baseVersion, "major"), type: "major", label: `主版本 major` },
      ];
      const bumpOptsNorm = bumpOptions.map(o => ({ v: o.value || o.v || baseVersion, type: o.type || "patch", label: o.label || o.type }));
      const selectedVersion = draftInfo?.version_bump || (bumpOptsNorm.find(o => o.type === defaultType)?.v || baseVersion);
      const conflictHtml = (hasConflict && !draftInfo) ? `
        <div class="form-row" style="grid-column:1/-1">
          <label>命名空间冲突</label>
          <div class="notice warning" style="margin:0;padding:10px 14px;background:rgba(220,150,0,.12);border:1px solid var(--warning,#e0a800);border-radius:6px">
            该命名空间已被公有算法 <code>${esc(conflictPublicPrefix)}</code> 占用，本次发布将作为<strong>版本迭代</strong>处理，请确认版本策略后发布。
          </div>
        </div>
      ` : "";
      qs("#modalRoot").classList.remove("hidden");
      qs("#modalRoot").innerHTML = `
        <div class="modal" style="max-width:680px">
          <h3>正式发布：${esc(name)}</h3>
          <p class="desc" style="margin:0 0 12px">
            ${isIteration
              ? `这是对现有公有算法 <code>${esc(draftInfo?.target_public_call_prefix || item.targetPublicCallPrefix || conflictPublicPrefix || item.callPrefix || "")}</code> 的版本迭代，请确认版本策略和提交信息后发布。`
              : "这是一次新建发布，确认后将进入公有算法库。"}
          </p>
          <div class="form-grid">
            ${conflictHtml}
            <div class="form-row">
              <label>发布类型</label>
              <span class="tag ${isIteration ? "warning" : "success"}">${isIteration ? "版本迭代" : "新建发布"}</span>
            </div>
            <div class="form-row">
              <label>基础版本</label>
              <span style="padding:6px 0;display:block">${esc(baseVersion)}</span>
            </div>
            <div class="form-row">
              <label>版本迭代方式</label>
              <select id="adminPublishBump" style="width:100%">
                ${bumpOptsNorm.map(o => `<option value="${esc(o.v)}" data-type="${esc(o.type)}" ${o.v === selectedVersion ? "selected" : ""}>${esc(o.label)} → ${esc(o.v)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row">
              <label>中文名称（可微调）</label>
              <input id="adminPublishZhName" value="${esc(name)}" />
            </div>
            <div class="form-row">
              <label>描述（可微调）</label>
              <textarea id="adminPublishDesc" rows="3">${esc(desc)}</textarea>
            </div>
            <div class="form-row">
              <label>标签（逗号分隔）</label>
              <input id="adminPublishTags" value="${esc(tags)}" />
            </div>
            <div class="form-row">
              <label>发布说明 <span style="color:var(--text-dim);font-size:12px">（可选）</span></label>
              <textarea id="adminPublishNote" rows="2" placeholder="本次发布的主要变更...">${esc(draftInfo?.note || "")}</textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button onclick="window.closeModal()">取消</button>
            <button class="success" onclick="window.confirmAdminPublish('${esc(id)}')">确认发布</button>
          </div>
        </div>
      `;
    }

    function _bumpSemver(v, type) {
      const parts = String(v || "1.0.0").split(".").map(Number);
      while (parts.length < 3) parts.push(0);
      if (type === "major") return `${parts[0]+1}.0.0`;
      if (type === "minor") return `${parts[0]}.${parts[1]+1}.0`;
      return `${parts[0]}.${parts[1]}.${parts[2]+1}`;
    }

    async function confirmAdminPublish(id) {
      const sel = qs("#adminPublishBump");
      const version_bump = sel ? sel.value : "";
      const version_bump_type = sel?.selectedOptions?.[0]?.dataset?.type || "patch";
      const note = qs("#adminPublishNote")?.value.trim() || "";
      const zh_name = qs("#adminPublishZhName")?.value.trim() || "";
      const zh_description = qs("#adminPublishDesc")?.value.trim() || "";
      const zh_tags = (qs("#adminPublishTags")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
      const operator_name = state.currentUser?.display_name || state.currentUser?.displayName || state.currentUser?.username || state.currentUser?.id || "admin";
      closeModal();
      try {
        const result = await api(`/api/v1/algorithms/${safeId(id)}/publish`, {
          method: "POST",
          body: JSON.stringify({
            reason: note,
            note,
            target_version: version_bump,
            version_change: version_bump_type,
            version_bump,
            version_bump_type,
            metadata: { zh_name, zh_description, zh_tags, operator_name }
          }),
        });
        showToast("已正式发布");
        const currentPage = state.page;
        const currentParent = typeof parentPageOf === "function" ? parentPageOf(currentPage) : currentPage;
        await loadModuleData("components");
        await loadModuleData("templates");
        if (currentPage === "review") {
          await renderReviewPage();
        } else if (currentPage === "my-algos" || currentParent === "components" || currentParent === "templates") {
          await loadModuleData(currentPage);
          renderCards(currentPage);
        }
        if (state.editing?.id === id) {
          state.editing.algo = result.algorithm;
          refreshEditorStatusButtons();
        }
      } catch (err) {
        showToast(err.message || "发布失败");
      }
    }
