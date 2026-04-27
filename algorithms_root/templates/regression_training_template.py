"""Regression training template."""

from __future__ import annotations

from typing import Any

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="回归训练模板",
    zh_description="用于快速开发数值预测类算法组件，包含数据校验、特征列配置、训练参数和返回结构示例。",
    zh_tags=["模板", "回归", "机器学习"],
    version="1.0.0",
)
def regression_training_template(
    train_data: list[dict[str, Any]],
    target_column: str,
    feature_columns: list[str],
    model_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a scaffold response for a regression training component."""

    config = model_config or {}
    if not train_data:
        raise ValueError("train_data must not be empty")
    if not target_column:
        raise ValueError("target_column must not be empty")
    if not feature_columns:
        raise ValueError("feature_columns must not be empty")
    missing_columns = [
        column
        for column in [target_column, *feature_columns]
        if any(column not in row for row in train_data)
    ]
    if missing_columns:
        raise ValueError(f"Missing columns: {sorted(set(missing_columns))}")
    target_values = [float(row[target_column]) for row in train_data]
    return {
        "template": "regression_training",
        "status": "ready_for_customization",
        "sample_count": len(train_data),
        "target_column": target_column,
        "feature_columns": feature_columns,
        "target_mean": sum(target_values) / len(target_values),
        "model_config": config,
        "next_steps": ["Add feature engineering", "Train a regressor", "Return metrics and artifact metadata"],
    }
