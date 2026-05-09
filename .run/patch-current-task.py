from pathlib import Path
root=Path('/home/guan/code-server-me')

# 1. Fix simple-browser labels with unicode escapes and no mojibake.
for rel in [
    'release/lib/vscode/extensions/simple-browser/out/AlgCompletionProvider.js',
    'release/lib/vscode/extensions/simple-browser/out/InsertAlgorithmCommand.js',
]:
    p=root/rel
    s=p.read_text(encoding='utf-8')
    s=s.replace("? '??' : '??'", "? '\\u516c\\u6709' : '\\u79c1\\u6709'")
    s=s.replace("privacy === '??'", "privacy === '\\u79c1\\u6709'")
    p.write_text(s, encoding='utf-8')

# 2. Disable duplicate algorithm completion provider from coder.algolib extension while keeping its commands/status.
for rel in [
    'src/sdk/algolib-extension/extension.js',
    'release/lib/vscode/extensions/algolib/extension.js',
    '.run/fullbuild-extensions/coder.algolib-1.0.0/extension.js',
    '.run/dev-extensions/coder.algolib-1.0.0/extension.js',
]:
    p=root/rel
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    marker='''function refreshCompletionProvider(context) {
  if (completionDisposable) {
    completionDisposable.dispose();
  }'''
    repl='''function refreshCompletionProvider(context) {
  if (completionDisposable) {
    completionDisposable.dispose();
    completionDisposable = undefined;
  }
  // Algorithm completion is provided by the built-in simple-browser provider.
  // Keep this extension for status, refresh, and Ctrl+Alt+S snippet insertion only.
  return;'''
    if marker in s and 'Algorithm completion is provided by the built-in simple-browser provider.' not in s:
        s=s.replace(marker,repl)
    p.write_text(s, encoding='utf-8')

# 3. HTML: snippet permission is not manually selectable; Save button saves code; add default template usage text.
p=root/'src/browser/pages/algo-lib.html'
s=p.read_text(encoding='utf-8-sig')
s=s.replace('<button class="primary" onclick="window.saveNamespace()">保存</button>', '<button class="primary" onclick="window.saveEditorAll()">保存</button>')
s=s.replace('<div class="snippet-top-field"><label>权限</label><select id="snScope"><option value="private">私有</option><option value="team">公有</option></select></div>', '<div class="snippet-top-field"><label>权限</label><input value="私有（审核通过后变为公有）" disabled /></div>')
s=s.replace('      qs("#snScope").value = snippet.scope || "private";\n      await initSnippetEditor(snippet.body || "");', '      await initSnippetEditor(snippet.body || "");')
s=s.replace('        scope: qs("#snScope").value,', '        scope: "private",')
old='''      const curDesc = item.zhDescription || item.zh_description || "";
      qs("#modalRoot").classList.remove("hidden");'''
new='''      const defaultTemplateGuide = `用途：说明这个模板适合开发哪类算法，以及输入、输出和依赖环境。\n\n使用步骤：\n1. 点击“编辑”进入模板代码，先阅读顶部注释，确认配置区、核心逻辑区和验证区分别要修改什么。\n2. 在配置区填写默认参数，在核心逻辑函数中补全算法主体，并在注释中写清楚每个参数含义。\n3. 使用“测试”准备示例输入，确认输出结构符合说明。\n4. 点击“发布为组件”，填写组件名称、分类、版本和调用说明后提交审核。\n\n注释要求：\n- 文件顶部写清模板用途、适用场景、版本和依赖。\n- 每个需要用户修改的位置用清晰注释说明“为什么改、怎么改”。\n- 函数 docstring 中写明参数类型、默认值、返回值和异常情况。\n\n使用示例：\nfrom algolib import alg\nresult = alg.<分类>.<组件函数>(data, **params)\nprint(result)`;
      const curDesc = item.zhDescription || item.zh_description || defaultTemplateGuide;
      qs("#modalRoot").classList.remove("hidden");'''
if old in s:
    s=s.replace(old,new)
insert_after='''    async function saveCurrentFile() {'''
helper='''    function nextPatchVersion(value) {
      const [major, minor, patch] = parseVersion(value || "1.0.0");
      return `${major}.${minor}.${patch + 1}`;
    }

    async function bumpVersionAfterCodeSave(algo, isDraftMode = false) {
      if (!algo || isDraftMode) return;
      const nextVersion = nextPatchVersion(algo.version || "1.0.0");
      try {
        const result = await api(`/api/v1/algorithms/${safeId(algo.id || state.editing.id)}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({ version: nextVersion })
        });
        state.editing.algo = result.algorithm || { ...algo, version: nextVersion };
        state.editing.id = state.editing.algo.id || state.editing.id;
      } catch (error) {
        console.warn("version bump failed", error);
      }
    }

    async function saveEditorAll() {
      await saveCurrentFile();
    }

'''
if helper.strip() not in s:
    s=s.replace(insert_after, helper+insert_after)
s=s.replace('''          if (result.is_draft_mode) {
            showToast("已保存为草稿（提交审核后生效）");
          } else {
            showToast("文件已保存");
          }
          refreshEditorStatusButtons();''', '''          if (result.is_draft_mode) {
            showToast("已保存为草稿（提交审核后生效）");
          } else {
            await bumpVersionAfterCodeSave(state.editing.algo, false);
            showToast(`文件已保存，版本已更新为 ${state.editing.algo.version || "新版本"}`);
          }
          refreshEditorStatusButtons();''')
s=s.replace('''        await api(`/api/v1/packages/${safeId(packageId)}/files/${safeId(state.currentFile)}`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        showToast("文件已保存");''', '''        await api(`/api/v1/packages/${safeId(packageId)}/files/${safeId(state.currentFile)}`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        await bumpVersionAfterCodeSave(state.editing.algo, false);
        showToast(`文件已保存，版本已更新为 ${state.editing.algo.version || "新版本"}`);''')
s += '' if 'window.saveEditorAll = saveEditorAll;' in s else ''
s=s.replace('    window.saveCurrentFile = saveCurrentFile;', '    window.saveCurrentFile = saveCurrentFile;\n    window.saveEditorAll = saveEditorAll;')
p.write_text(s, encoding='utf-8')
(root/'algo_management.html').write_text(s, encoding='utf-8')
if (root/'release/src/browser/pages').exists():
    (root/'release/src/browser/pages/algo-lib.html').write_text(s, encoding='utf-8')

# 4. Backend snippets: normal create/update cannot set public directly.
p=root/'algo_service/routers/snippets.py'
s=p.read_text(encoding='utf-8')
s=s.replace('''    status = _validate_status(payload.publish_status)
    snippet = {''', '''    status = "draft"
    snippet = {''')
s=s.replace('''        "scope": _validate_scope(payload.scope),''', '''        "scope": "private",''')
s=s.replace('''    if "scope" in update and update["scope"] is not None:
        snippet["scope"] = _validate_scope(str(update["scope"]))''', '''    if "scope" in update and update["scope"] is not None and user and user.get("role") == "admin":
        snippet["scope"] = _validate_scope(str(update["scope"]))''')
s=s.replace('''    if "publish_status" in update and update["publish_status"] is not None:
        snippet["publish_status"] = _validate_status(str(update["publish_status"]))''', '''    if "publish_status" in update and update["publish_status"] is not None and user and user.get("role") == "admin":
        snippet["publish_status"] = _validate_status(str(update["publish_status"]))''')
p.write_text(s, encoding='utf-8')
