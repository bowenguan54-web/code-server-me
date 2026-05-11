from pathlib import Path
import re
p = Path('src/browser/pages/algo-lib.html')
text = p.read_text(encoding='utf-8')
pattern = r'''    async function showTemplateUsage\(id\) \{[\s\S]*?    async function openAdminPublishModal\(id\) \{'''
replacement = r'''    async function showTemplateUsage(id) {
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
              <pre class="code-block">from algolib import alg\n\n# 发布成组件后，可通过命名空间调用\nresult = ${esc(callPrefix.replace("templates.", "custom."))}(...)</pre>
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

    async function openAdminPublishModal(id) {'''
new_text, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit(f'failed to replace showTemplateUsage, count={count}')
p.write_text(new_text, encoding='utf-8')