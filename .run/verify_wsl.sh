cd /home/guan/code-server-me || exit 1
python3 -m py_compile algo_service/main.py algo_service/routers/algorithms.py algo_service/sdk/registry.py || exit 1
python3 - <<'PY'
from pathlib import Path
t = Path('src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
print('has_components', '\u7b97\u6cd5\u7ec4\u4ef6' in t)
print('removed_api_nav', 'API ??' not in t and '????' not in t and '????' not in t and '??????' not in t)
PY
