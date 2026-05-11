from pathlib import Path
p=Path('src/browser/pages/algo-lib.html')
text=p.read_text(encoding='utf-8')
text=text.replace('''      const item = (state.data.components || []).concat(state.data.templates || []).find(i => i.id === id);
      if (!item) { showToast("算法不存在"); return; }
''','''      const item = (state.data.components || []).concat(state.data.templates || []).find(i => i.id === id)
        || (state.editing?.id === id ? state.editing.algo : null);
      if (!item) { showToast("算法不存在"); return; }
''')
p.write_text(text,encoding='utf-8')