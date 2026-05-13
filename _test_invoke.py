#!/usr/bin/env python3
import urllib.request, json

for ns in ['alg.demo.image_processor', 'demo.image_processor']:
    data = json.dumps({'args': [], 'kwargs': {}}).encode()
    req = urllib.request.Request(
        'http://localhost:8000/api/v1/invoke/' + ns,
        data=data, method='POST',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.load(r)
            result = resp.get('result', {})
            print(ns, 'success:', resp.get('success'), 'type:', result.get('__output_type__'))
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(ns, 'HTTP error:', e.code, body[:200])
    except Exception as e:
        print(ns, 'error:', e)
