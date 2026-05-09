from pathlib import Path
for path in [Path('/home/guan/code-server-me/algo_service/routers/stubs.py'), Path('/mnt/e/code-server-me/algo_service/routers/stubs.py')]:
    text = path.read_text(encoding='utf-8')
    text = text.replace('"privacyLabel": "??" if entry.owner_id == "system" else "??",', '"privacyLabel": "公有" if entry.owner_id == "system" else "私有",')
    path.write_text(text, encoding='utf-8')