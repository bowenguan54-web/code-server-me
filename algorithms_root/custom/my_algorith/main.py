from algo_service.sdk.decorators import algo_meta
@algo_meta(
    zh_name="自定义算法",
    zh_description="说明算法用途、输入输出和适用场景。",
    zh_tags=["自定义", "组件"],
    version="1.0.0",
    input_example="{\"data\":[0.1,0.6,0.8],\"threshold\":0.5}",
    widget_overrides={"data": "list", "threshold": "float"},
)
def my_algorith(data: list, threshold: float = 0.5) -> dict:
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
