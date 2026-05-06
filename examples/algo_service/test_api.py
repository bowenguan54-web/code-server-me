"""
test_api.py — AlgoService 快速测试脚本
用法：
    cd examples
    uvicorn algo_service.main:app --port 8000 &
    python algo_service/test_api.py
"""

import sys
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000/api/v1"


def post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get(path: str) -> dict:
    with urllib.request.urlopen(f"http://localhost:8000{path}", timeout=10) as resp:
        return json.loads(resp.read())


def check(label: str, resp: dict, expect_success: bool = True) -> None:
    ok = resp.get("success", True)
    status = "✓" if ok == expect_success else "✗"
    print(f"  {status} {label}")
    if not ok:
        print(f"    error: {resp.get('error')}")


def main():
    print("=== Health check ===")
    health = get("/health")
    print(f"  status: {health.get('status')}")

    print("\n=== Preprocess ===")
    check("sample_random", post("/preprocess/sample_random", {"data": list(range(100)), "n": 10, "seed": 42}))
    check("normalize", post("/preprocess/normalize", {"data": [1.0, 2.0, 3.0, 4.0, 5.0]}))
    check("standardize", post("/preprocess/standardize", {"data": [1.0, 2.0, 3.0, 4.0, 5.0]}))
    check("impute", post("/preprocess/impute", {"data": [1.0, None, 3.0, None, 5.0]}))

    print("\n=== Statistics ===")
    check("describe", post("/statistics/describe", {"data": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]}))
    check("pearson", post("/statistics/pearson", {"x": [1.0, 2.0, 3.0], "y": [2.0, 4.0, 5.0]}))
    check("outlier", post("/statistics/outlier", {"data": [1.0, 2.0, 3.0, 100.0, 2.5]}))
    check("anova", post("/statistics/anova", {"groups": [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 9.0]]}))

    print("\n=== ML ===")
    X = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.0, 0.0]]
    y = [0, 1, 1, 0]
    check("svm", post("/ml/svm", {"X_train": X, "y_train": y}))
    check("knn", post("/ml/knn", {"X_train": X, "y_train": y, "k": 3}))
    check("kmeans", post("/ml/kmeans", {"X": X, "k": 2}))
    check("logistic", post("/ml/logistic", {"X_train": X, "y_train": y}))

    print("\n=== Timeseries ===")
    series = [1.0, 2.0, 3.0, 2.5, 3.5, 4.0, 3.8, 5.0, 4.5, 6.0]
    check("dtw", post("/timeseries/dtw", {"s1": [1.0, 2.0, 3.0], "s2": [1.5, 2.5, 3.5]}))
    check("ar", post("/timeseries/ar", {"series": series, "order": 2, "steps": 3}))
    check("arma", post("/timeseries/arma", {"series": series, "p": 1, "q": 1, "steps": 3}))
    check("hilbert", post("/timeseries/hilbert", {"signal": series}))

    print("\n=== Signal processing ===")
    check("fft", post("/signal_proc/fft", {"signal": series, "fs": 100.0}))
    check("dct", post("/signal_proc/dct", {"signal": series}))
    check("conv", post("/signal_proc/conv", {"signal": series, "kernel": [0.25, 0.5, 0.25]}))
    check("lowpass", post("/signal_proc/lowpass", {"signal": series, "cutoff": 10.0, "fs": 100.0}))
    check("bandpass", post("/signal_proc/bandpass", {"signal": series, "lowcut": 5.0, "highcut": 30.0, "fs": 100.0}))

    print("\n=== Custom algorithms (auto-loaded from user_algorithms/) ===")
    algo_list = get("/api/v1/algorithms")
    print(f"  已注册自定义算法数: {len(algo_list)}")
    for a in algo_list:
        print(f"    - {a['name']} ({a['category']}): {a['description']}")

    print("\n=== Done ===")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        print(f"连接失败 ({e.reason})，请先启动服务: uvicorn algo_service.main:app --port 8000")
        sys.exit(1)
