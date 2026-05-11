from pathlib import Path
import re
html = Path('src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
js = '\n'.join(re.findall(r'<script>([\s\S]*?)</script>', html))
Path('.run/algo-lib-inline-check.js').write_text(js, encoding='utf-8')