from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="布尔开关",
    zh_description="演示布尔类型输入。",
    zh_tags=["演示", "布尔"],
    version="1.0.0",
    input_example='{"value": 42, "is_positive": true}',
)
def demo_bool(value: int, is_positive: bool) -> str:
    """布尔控件示例。

    Args:
        value: 数值。
        is_positive: 是否取正值。
    """

    result = abs(value) if is_positive else -abs(value)
    return f"输入 {value}，正值模式={'开' if is_positive else '关'}，结果 = {result}"
