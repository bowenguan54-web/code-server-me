"""
demo.py  —  验证算法模板即插即用

用法：
    python demo.py

无需安装任何依赖，直接运行即可。
"""
from algo_template import detect_anomalies
import numpy as np
import tensorflow as tf
from algolib import alg

alg.s
def main():
    # ──────────────────────────────────────────────
    # 示例 1：传感器温度读数，第 6、12 个点为异常
    # ──────────────────────────────────────────────
    sensor_data = [
        10.1, 10.3, 9.8, 10.0, 10.2, 9.9,
        35.7,                               # ← 异常：传感器故障
        10.1, 10.4, 9.7, 10.0, 10.3,
        -5.2,                               # ← 异常：掉线后误读
        10.1,
    ]

    print("=" * 50)
    print("示例 1：传感器温度异常检测")
    print("=" * 50)
    result = detect_anomalies(sensor_data, threshold=2.5)
    print(f"  均值: {result['mean']}  标准差: {result['stdev']}")
    print(f"  检测到 {len(result['anomalies'])} 个异常点:")
    for idx, val, z in result["anomalies"]:
        print(f"    第 {idx + 1} 个点  值={val}  Z-Score={z:+.4f}")

    # ──────────────────────────────────────────────
    # 示例 2：接口响应时间（毫秒），只有 1 个尖刺
    # ──────────────────────────────────────────────
    latency_ms = [120, 118, 125, 121, 119, 122, 980, 117, 124, 120, 118]

    print()
    print("=" * 50)
    print("示例 2：接口响应时间尖刺检测")
    print("=" * 50)
    result2 = detect_anomalies(latency_ms, threshold=2.0)
    print(f"  均值: {result2['mean']} ms  标准差: {result2['stdev']} ms")
    if result2["anomalies"]:
        for idx, val, z in result2["anomalies"]:
            print(f"    第 {idx + 1} 个请求  响应时间={val} ms  Z-Score={z:+.4f}")
    else:
        print("    未检测到异常")

    # ──────────────────────────────────────────────
    # 示例 3：全部相同的数据（标准差为 0 的边界情况）
    # ──────────────────────────────────────────────
    flat_data = [5.0] * 8

    print()
    print("=" * 50)
    print("示例 3：全相同数据（边界情况）")
    print("=" * 50)
    result3 = detect_anomalies(flat_data)
    print(f"  均值: {result3['mean']}  标准差: {result3['stdev']}")
    print(f"  异常点: {len(result3['anomalies'])} 个（预期 0 个）")
    


if __name__ == "__main__":
    main()
