from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="字典转换",
    zh_description="演示字典输入，输出为转换后的 JSON。",
    zh_tags=["演示", "字典"],
    version="1.0.0",
    input_example='{"data": {"name": "张三", "age": 28, "city": "北京"}}',
)
def demo_dict(data: dict) -> dict:
    """字典键值翻转与统计。

    Args:
        data: 任意字典。
    """

    return {
        "original": data,
        "keys": list(data.keys()),
        "value_list": list(data.values()),
        "key_count": len(data),
        "reversed": {str(v): k for k, v in data.items()},
    }
