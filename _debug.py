import requests

BASE = "http://localhost:8000"

r = requests.post(BASE+"/api/v1/auth/login", json={"username":"zhangsan","password":"Zhangsan@123"})
data = r.json()
token = data.get("token","")
uid = data.get("user",{}).get("id","")
print("Login:", uid, "token len:", len(token))

headers = {"Authorization": "Bearer "+token}

# Create test algo
r2 = requests.post(BASE+"/api/v1/user/algorithms", headers=headers, json={"name":"test_sub","zh_name":"test","folder":"custom"})
print("Create:", r2.status_code, r2.json())

# List
r3 = requests.get(BASE+"/api/v1/user/algorithms", headers=headers)
algos = r3.json().get("algorithms",[])
print("My algos:", len(algos))
for a in algos:
    print("  id=%s ownerId=%s status=%s" % (a.get("id"), a.get("ownerId"), a.get("publishStatus")))

# Submit
if algos:
    aid = algos[0]["id"]
    encoded = requests.utils.quote(aid, safe="")
    print("Submitting:", aid, "encoded:", encoded)
    r4 = requests.post(BASE+"/api/v1/algorithms/"+encoded+"/submit", headers=headers, json={"metadata":{}})
    print("Submit:", r4.status_code, r4.json())
