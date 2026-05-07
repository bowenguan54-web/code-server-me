from pathlib import Path
text=Path('/home/guan/code-server-me/src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
print('has_file_modal', 'confirmSourceFileModal' in text)
print('has_snippet_editor', 'snippet-editor' in text)
print('has_monaco_shortcut', 'KeyMod.Alt' in text)