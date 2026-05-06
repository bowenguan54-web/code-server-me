"""Classification pipeline template.

This template is a complete shell for a supervised classification component.
Copy it, fill in the domain-specific feature engineering and model logic, then
publish the finished version as a component draft.
"""

from __future__ import annotations

from typing import Any

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="分类建模算法模板",
    zh_description="用于快速开发二分类或多分类算法组件的模板，包含输入校验、特征处理、训练配置、输出结构和调用示例。",
    zh_tags=["模板", "分类", "机器学习", "监督学习"],
    version="1.0.0",
)
def classification_pipeline_template(
    train_data: list[dict[str, Any]],
    target_column: str,
    feature_columns: list[str],
    model_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a classification algorithm component from structured data.

    Args:
        train_data: Training rows. Each row is a dictionary containing feature
            values and the target column.
        target_column: Name of the label column.
        feature_columns: Feature column names used by the model.
        model_config: Optional model parameters, such as algorithm name,
            validation split, random seed, and class weights.

    Example:
        result = alg.templates.classification_pipeline_template(
            train_data=[
                {"age": 32, "income": 12000, "label": 1},
                {"age": 45, "income": 8300, "label": 0},
            ],
            target_column="label",
            feature_columns=["age", "income"],
            model_config={"algorithm": "random_forest", "random_state": 42},
        )

    Development guide:
        1. Validate input rows and required columns.
        2. Convert rows into feature matrix X and label vector y.
        3. Add domain feature engineering.
        4. Train or load the selected model.
        5. Return metrics, model metadata, and prediction examples.
    """
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
        raise ValueError(f"Missing columns in train_data: {sorted(set(missing_columns))}")

    return {
        "template": "classification_pipeline",
        "status": "ready_for_customization",
        "sample_count": len(train_data),
        "target_column": target_column,
        "feature_columns": feature_columns,
        "model_config": config,
        "next_steps": [
            "Add feature transformation code",
            "Choose and train the classifier",
            "Calculate validation metrics",
            "Return predictions and model metadata",
        ],
    }
