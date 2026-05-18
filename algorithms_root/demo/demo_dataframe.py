from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="表格数据处理",
    zh_description="演示表格（list[dict]）输入，输出为处理后的表格。",
    zh_tags=["演示", "表格"],
    version="1.0.0",
    input_example='{"rows": [{"name": "张三", "score": 85}, {"name": "李四", "score": 92}, {"name": "王五", "score": 78}]}',
)
def demo_dataframe(rows: list[dict]) -> list[dict]:
    """给表格数据添加排名列。

    Args:
        rows: 包含 name 和 score 字段的数据行。
    """

    sorted_rows = sorted(rows, key=lambda r: r.get("score", 0), reverse=True)
    for i, row in enumerate(sorted_rows):
        row["rank"] = i + 1
        row["level"] = "优秀" if row.get("score", 0) >= 90 else ("良好" if row.get("score", 0) >= 80 else "一般")
    return sorted_rows
