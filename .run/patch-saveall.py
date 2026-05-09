from pathlib import Path
p=Path('/home/guan/code-server-me/src/browser/pages/algo-lib.html')
s=p.read_text(encoding='utf-8')
old='''    async function saveEditorAll() {
      await saveCurrentFile();
    }
'''
new='''    async function saveEditorAll() {
      await saveCurrentFile();
      const input = qs("#nsInput");
      if (state.editing?.algo && input && input.value.trim()) {
        const desired = `${namespacePrefix(state.editing.algo)}${input.value.trim()}`;
        const current = state.editing.algo.callPrefix || state.editing.algo.displayNamespace || `alg.${state.editing.algo.namespace || ""}.${state.editing.algo.funcName || ""}`;
        if (desired !== current) await saveNamespace();
      }
    }
'''
if old in s:
    s=s.replace(old,new)
# de-duplicate export assignment
s=s.replace('    window.saveCurrentFile = saveCurrentFile;\n    window.saveEditorAll = saveEditorAll;\n    window.saveEditorAll = saveEditorAll;', '    window.saveCurrentFile = saveCurrentFile;\n    window.saveEditorAll = saveEditorAll;')
p.write_text(s, encoding='utf-8')
Path('/home/guan/code-server-me/algo_management.html').write_text(s, encoding='utf-8')
rel=Path('/home/guan/code-server-me/release/src/browser/pages/algo-lib.html')
if rel.parent.exists(): rel.write_text(s, encoding='utf-8')
