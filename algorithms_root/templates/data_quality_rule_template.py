"""Data quality rule template.

This template is designed for reusable data validation and cleansing rules.
It is useful for preprocessing pipelines and data governance checks.
"""

from __future__ import annotations

from typing import Any

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="数据质量规则模板",
    zh_description="用于开发数据校验、缺失值检查、范围校验、枚举校验和异常记录输出的算法模板。",
    zh_tags=["模板", "数据质量", "预处理", "规则校验"],
    version="1.0.0",
)
def data_quality_rule_template(
    rows: list[dict[str, Any]],
    required_columns: list[str],
    numeric_ranges: dict[str, list[float]] | None = None,
    enum_values: dict[str, list[Any]] | None = None,
) -> dict[str, Any]:
    """Create a data quality validation component.

    Args:
        rows: Input records to validate.
        required_columns: Columns that must exist and must not be null.
        numeric_ranges: Mapping of column name to [min, max] limits.
        enum_values: Mapping of column name to allowed values.

    Example:
        result = alg.templates.data_quality_rule_template(
            rows=[{"city": "北京", "age": 35, "status": "active"}],
            required_columns=["city", "age"],
            numeric_ranges={"age": [0, 120]},
            enum_values={"status": ["active", "inactive"]},
        )

    Development guide:
        1. Add project-specific validation rules.
        2. Record row indexes and failed rule names.
        3. Decide whether invalid rows should be fixed, dropped, or reported.
        4. Return a clean dataset and a structured validation report.
    """
    ranges = numeric_ranges or {}
    enums = enum_values or {}
    if not required_columns:
        raise ValueError("required_columns must not be empty")

    issues: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        for column in required_columns:
            if column not in row or row[column] is None:
                issues.append({"row": index, "column": column, "rule": "required"})
        for column, limits in ranges.items():
            if column in row and row[column] is not None:
                low, high = limits
                value = float(row[column])
                if value < low or value > high:
                    issues.append({"row": index, "column": column, "rule": "range", "value": row[column]})
        for column, allowed in enums.items():
            if column in row and row[column] not in allowed:
                issues.append({"row": index, "column": column, "rule": "enum", "value": row[column]})

    return {
        "template": "data_quality_rule",
        "status": "ready_for_customization",
        "row_count": len(rows),
        "issue_count": len(issues),
        "issues": issues,
        "next_steps": [
            "Add business-specific validation rules",
            "Add automatic repair strategies",
            "Return cleaned rows when rules pass",
            "Persist validation metrics if needed",
        ],
    }
