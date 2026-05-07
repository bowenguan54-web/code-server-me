import urllib.request, json

for cred in [('admin','Admin@123'), ('zhangsan','Zhangsan@123')]:
    req = urllib.request.Request('http://localhost:8000/api/v1/auth/login', method='POST',
        data=json.dumps({'username':cred[0],'password':cred[1]}).encode(),
        headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            d = json.load(r)
            u = d.get('user',{})
            print('OK', cred[0], 'id='+u.get('id','?'), 'role='+u.get('role','?'), 'token_len='+str(len(d.get('token',''))))
    except urllib.error.HTTPError as e:
        print('ERR', cred[0], e.code, e.read().decode())
    except Exception as e:
        print('FAIL', cred[0], str(e))
