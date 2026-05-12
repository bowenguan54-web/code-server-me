import re, subprocess, sys
src = open('/mnt/e/code-server-me/algo_management.html').read()
m = re.search(r'<script>(.*?)</script>', src, re.DOTALL)
if not m:
    print('no script found'); sys.exit(1)
code = m.group(1)
print(f'Script length: {len(code)} chars')
with open('/tmp/_am_check.js', 'w') as f:
    f.write(code)
r = subprocess.run(['node', '--check', '/tmp/_am_check.js'], capture_output=True, text=True)
if r.returncode != 0:
    print('SYNTAX ERROR:')
    print(r.stderr[:2000])
    sys.exit(1)
else:
    print('SYNTAX OK')
