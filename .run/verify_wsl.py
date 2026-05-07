from pathlib import Path
t = Path('/home/guan/code-server-me/src/browser/pages/algo-lib.html').read_text(encoding='utf-8')
print('has_components', '\u7b97\u6cd5\u7ec4\u4ef6' in t)
print('removed_api_nav', 'API 管理' not in t and '调用监控' not in t and '运行日志' not in t and '我的提交记录' not in t)