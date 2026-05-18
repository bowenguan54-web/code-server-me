from typing import Literal

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="单位换算",
    zh_description="演示 Literal 下拉选择输入。",
    zh_tags=["演示", "选择"],
    version="1.0.0",
    input_example='{"value": 100, "from_unit": "km", "to_unit": "mi"}',
)
def demo_literal(value: float, from_unit: Literal["km", "mi", "m", "ft"], to_unit: Literal["km", "mi", "m", "ft"]) -> str:
    """长度单位换算。

    Args:
        value: 数值。
        from_unit: 源单位。
        to_unit: 目标单位。
    """

    to_meter = {"km": 1000, "mi": 1609.344, "m": 1, "ft": 0.3048}
    meters = value * to_meter[from_unit]
    result = meters / to_meter[to_unit]
    return f"{value} {from_unit} = {round(result, 6)} {to_unit}"
