from algo_service.sdk.decorators import algo_meta
@algo_meta(
    zh_name="my_algor",
    zh_description="在这里编写算法逻辑。",
    zh_tags=[],
    version="1.0.1",
)
def my_algor(data: list, threshold: float = 0.5) -> dict:
    """在这里编写算法逻辑。

    Args:
        data: 输入数据。
        threshold: 阈值参数。
    """
    passed = [item for item in data if float(item) >= threshold]
    return {
        "input_count": len(data),
        "passed_count": len(passed),

    }
