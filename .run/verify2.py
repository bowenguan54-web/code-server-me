from pathlib import Path
text = Path('/home/guan/code-server-me/src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
print('has_file_buttons', 'data-add-file' in text and 'data-rename-file' in text)
print('has_snippet_editor', 'copySnippetFromEditor' in text and 'snippetMonacoHost' in text)