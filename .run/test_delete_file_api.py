import requests, json
from jose import jwt
from datetime import datetime, timedelta, timezone
base='http://127.0.0.1:8000'
token=jwt.encode({'sub':'usr_zhangsan','username':'zhangsan','role':'user','exp':datetime.now(timezone.utc)+timedelta(hours=1)}, 'algolib-dev-secret', algorithm='HS256')
headers={'Authorization':'Bearer '+token}
name='codex_delete_probe.py'
# cleanup if previous probe exists
requests.delete(f'{base}/api/v1/algorithm-source/custom.my_algorit/files/{name}', headers=headers)
r=requests.post(f'{base}/api/v1/algorithm-source/custom.my_algorit/add-file', json={'filename':name,'content':'# probe\n'}, headers=headers)
print('add', r.status_code)
r=requests.delete(f'{base}/api/v1/algorithm-source/custom.my_algorit/files/{name}', headers=headers)
print('delete', r.status_code, r.text[:160])
r=requests.get(f'{base}/api/v1/algorithm-source/custom.my_algorit')
files=[f.get('filename') for f in r.json().get('folder_files',[])]
print('probe_exists_after_delete', name in files)
