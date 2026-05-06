"""Feature engineering template."""

from __future__ import annotations

from typing import Any

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="特征工程模板",
    zh_description="用于开发字段清洗、派生特征和编码转换类算法组件，适合表格数据预处理。",
    zh_tags=["模板", "特征工程", "预处理"],
    version="1.0.0",
)
def feature_engineering_template(rows: list[dict[str, Any]], numeric_columns: list[str]) -> dict[str, Any]:
    """Return a feature engineering scaffold with numeric summaries."""

    if not rows:
        raise ValueError("rows must not be empty")
    if not numeric_columns:
        raise ValueError("numeric_columns must not be empty")
    summaries = {}
    for column in numeric_columns:
        values = [float(row[column]) for row in rows if column in row and row[column] not in (None, "")]
        summaries[column] = {
            "count": len(values),
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "mean": sum(values) / len(values) if values else None,
        }
    return {
        "template": "feature_engineering",
        "status": "ready_for_customization",
        "row_count": len(rows),
        "numeric_columns": numeric_columns,
        "summaries": summaries,
        "next_steps": ["Add derived features", "Encode categorical fields", "Return transformed rows"],
    }
