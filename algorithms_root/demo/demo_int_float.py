from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="整数与小数运算",
    zh_description="演示整数和小数类型输入，输出为数字。",
    zh_tags=["演示", "数学"],
    version="1.0.0",
    input_example='{"a": 10, "b": 3.14}',
)
def demo_int_float(a: int, b: float) -> float:
    """整数与小数的运算示例。

    Args:
        a: 一个整数。
        b: 一个小数。
    """

    return round(a * b + a / (b + 1), 4)
