import json, sys
try:
    with open('/tmp/run_result.json') as f:
        d = json.load(f)
    print('keys:', list(d.keys()))
    r = d.get('result', {})
    print('result type:', type(r).__name__)
    if isinstance(r, dict):
        print('output_type:', r.get('__output_type__'))
        print('title:', r.get('title'))
        print('rows count:', len(r.get('rows', [])))
    else:
        print('result value:', str(r)[:200])
except Exception as e:
    with open('/tmp/run_result.json') as f:
        raw = f.read()
    print('parse error:', e)
    print('raw:', raw[:300])
