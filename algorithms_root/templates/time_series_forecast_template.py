"""Time-series forecasting template.

Use this shell when building forecasting components for demand, traffic,
finance, IoT telemetry, or other ordered observations.
"""

from __future__ import annotations

from typing import Any

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="时间序列预测模板",
    zh_description="用于开发时间序列预测算法的模板，包含时间列、目标列、预测步长、频率、外生变量和结果格式说明。",
    zh_tags=["模板", "时间序列", "预测", "回归"],
    version="1.0.0",
)
def time_series_forecast_template(
    series: list[dict[str, Any]],
    time_column: str,
    target_column: str,
    horizon: int = 7,
    frequency: str = "D",
    exogenous_columns: list[str] | None = None,
) -> dict[str, Any]:
    """Create a forecasting component from timestamped observations.

    Args:
        series: Ordered observations. Each row should contain a timestamp and a
            target value.
        time_column: Timestamp column name.
        target_column: Numeric target column name.
        horizon: Number of future periods to forecast.
        frequency: Data frequency, such as D, H, W, or M.
        exogenous_columns: Optional external feature columns.

    Example:
        result = alg.templates.time_series_forecast_template(
            series=[
                {"date": "2026-01-01", "sales": 128},
                {"date": "2026-01-02", "sales": 136},
            ],
            time_column="date",
            target_column="sales",
            horizon=14,
            frequency="D",
        )

    Development guide:
        1. Parse and sort timestamps.
        2. Fill missing intervals according to frequency.
        3. Add lag, rolling-window, seasonal, and holiday features.
        4. Train the forecasting model or load an existing one.
        5. Return forecast values, confidence intervals, and diagnostics.
    """
    features = exogenous_columns or []
    if not series:
        raise ValueError("series must not be empty")
    if horizon <= 0:
        raise ValueError("horizon must be greater than 0")
    for column in (time_column, target_column):
        if not column:
            raise ValueError("time_column and target_column must not be empty")
        if any(column not in row for row in series):
            raise ValueError(f"Column '{column}' is missing from at least one row")

    return {
        "template": "time_series_forecast",
        "status": "ready_for_customization",
        "history_length": len(series),
        "time_column": time_column,
        "target_column": target_column,
        "horizon": horizon,
        "frequency": frequency,
        "exogenous_columns": features,
        "next_steps": [
            "Normalize the time index",
            "Create lag and seasonal features",
            "Fit the forecasting model",
            "Generate forecast rows and intervals",
        ],
    }
