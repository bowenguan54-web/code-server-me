"""Anomaly detection template."""

from __future__ import annotations

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="异常检测模板",
    zh_description="用于开发阈值、统计分布或模型驱动的异常检测组件，内置输入校验和结果结构。",
    zh_tags=["模板", "异常检测", "质量监控"],
    version="1.0.0",
)
def anomaly_detection_template(values: list[float], threshold: float = 3.0) -> dict:
    """Return a simple z-score style anomaly scaffold."""

    if not values:
        raise ValueError("values must not be empty")
    numbers = [float(value) for value in values]
    mean_value = sum(numbers) / len(numbers)
    variance = sum((value - mean_value) ** 2 for value in numbers) / len(numbers)
    std_value = variance ** 0.5
    anomalies = []
    for index, value in enumerate(numbers):
        score = 0.0 if std_value == 0 else abs(value - mean_value) / std_value
        if score >= threshold:
            anomalies.append({"index": index, "value": value, "score": round(score, 6)})
    return {
        "template": "anomaly_detection",
        "status": "ready_for_customization",
        "count": len(numbers),
        "mean": mean_value,
        "std": std_value,
        "threshold": threshold,
        "anomalies": anomalies,
    }
