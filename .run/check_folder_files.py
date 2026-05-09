import requests, json
base = 'http://127.0.0.1:8000'
r = requests.get(base + '/api/v1/algorithm-source/custom.my_algorit')
print('status', r.status_code)
print(json.dumps([(f.get('filename'), f.get('relative_path'), f.get('is_entry')) for f in r.json().get('folder_files', [])], ensure_ascii=False, indent=2))
