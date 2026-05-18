import math

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="正弦波生成",
    zh_description="演示数字列表输出（前端自动渲染为折线图）。",
    zh_tags=["演示", "图表"],
    version="1.0.0",
    input_example='{"points": 50, "frequency": 2.0}',
)
def demo_chart_line(points: int = 50, frequency: float = 2.0) -> list:
    """生成正弦波数据点。

    Args:
        points: 数据点数量。
        frequency: 频率。
    """

    return [round(math.sin(2 * math.pi * frequency * i / points), 4) for i in range(points)]
