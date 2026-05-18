from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="销售占比分析",
    zh_description="演示饼图数据输出（含 labels 和 values 字段）。",
    zh_tags=["演示", "图表"],
    version="1.0.0",
    input_example='{"sales": {"手机": 4500, "笔记本": 3200, "平板": 1800, "耳机": 950, "其他": 550}}',
)
def demo_chart_pie(sales: dict) -> dict:
    """分析销售数据并返回饼图格式。

    Args:
        sales: 产品名称到销售额的映射。
    """

    total = sum(sales.values())
    return {
        "labels": list(sales.keys()),
        "values": list(sales.values()),
        "total": total,
        "percentages": {k: f"{v / total * 100:.1f}%" for k, v in sales.items()},
    }
