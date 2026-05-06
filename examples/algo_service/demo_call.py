"""
algo_service 调用示例
演示如何通过 HTTP 接口调用已发布的算法（call_prefix 格式：alg.<namespace>.<func_name>）
"""

import json
import requests

BASE = "http://127.0.0.1:8000"


# ── 1. 列出所有已注册算法 ──────────────────────────────────────────────────────
def list_algorithms():
    resp = requests.get(f"{BASE}/api/v1/algorithms")
    resp.raise_for_status()
    algos = resp.json()
    print(f"共 {len(algos)} 个算法：")
    for algo in algos[:10]:
        print(f"  {algo.get('callPrefix') or algo.get('displayNamespace')}  —  {algo.get('zhName') or algo.get('name')}")


# ── 2. 通过 call_prefix 调用算法 ──────────────────────────────────────────────
def invoke_by_call_prefix(call_prefix: str, kwargs: dict):
    """
    call_prefix 格式：alg.<namespace>.<func_name>
    例如：alg.data_utils.normalize_minmax
    """
    resp = requests.post(
        f"{BASE}/api/v1/algorithms/invoke",
        json={"call_prefix": call_prefix, "kwargs": kwargs},
    )
    resp.raise_for_status()
    return resp.json()


# ── 3. 通过算法 ID（namespace.func_name）调用 ─────────────────────────────────
def run_by_id(algorithm_id: str, kwargs: dict):
    """
    algorithm_id 格式：<namespace>.<func_name>
    例如：data_utils.moving_average
    """
    resp = requests.post(
        f"{BASE}/api/v1/algorithms/{algorithm_id}/run",
        json={"kwargs": kwargs},
    )
    resp.raise_for_status()
    return resp.json()


# ── 4. 外部 API Key 鉴权调用 ──────────────────────────────────────────────────
def invoke_external(namespace: str, func_name: str, kwargs: dict, api_key: str):
    resp = requests.post(
        f"{BASE}/api/v1/invoke/{namespace}/{func_name}",
        json=kwargs,
        headers={"X-API-Key": api_key},
    )
    resp.raise_for_status()
    return resp.json()


# ── 5. 直接运行源代码片段（测试场景）─────────────────────────────────────────
def run_source_code():
    source = """
def normalize_minmax(data: list, feature_range: list = [0.0, 1.0]) -> dict:
    lo, hi = feature_range
    min_v, max_v = min(data), max(data)
    span = max_v - min_v or 1
    result = [lo + (x - min_v) / span * (hi - lo) for x in data]
    return {"normalized": result, "min": min_v, "max": max_v}
"""
    resp = requests.post(
        f"{BASE}/api/v1/algorithms/run-source",
        json={
            "source": source,
            "func_name": "normalize_minmax",
            "kwargs": {"data": [10, 20, 30, 40, 50], "feature_range": [0.0, 1.0]},
        },
    )
    resp.raise_for_status()
    return resp.json()


def main():
    print("=" * 60)
    print("示例 1：列出算法")
    print("=" * 60)
    list_algorithms()

    print("\n" + "=" * 60)
    print("示例 2：通过 call_prefix 调用 normalize_minmax")
    print("=" * 60)
    result = invoke_by_call_prefix(
        "alg.data_utils.normalize_minmax",
        {"data": [10, 20, 30, 40, 50], "feature_range": [0.0, 1.0]},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print("示例 3：通过 call_prefix 调用 deduplicate")
    print("=" * 60)
    result = invoke_by_call_prefix(
        "alg.data_utils.deduplicate",
        {"data": [1, 2, 2, 3, 3, 4]},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print("示例 4：通过 algorithm_id 调用 moving_average")
    print("=" * 60)
    result = run_by_id(
        "data_utils.moving_average",
        {"data": [1, 2, 3, 4, 5, 6, 7, 8], "window": 3},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print("示例 5：直接运行源代码")
    print("=" * 60)
    result = run_source_code()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
