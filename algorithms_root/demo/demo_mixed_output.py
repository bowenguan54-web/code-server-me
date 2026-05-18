import base64
import io

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="综合输出演示",
    zh_description="返回包含文本、数字、表格、图片的混合结构。",
    zh_tags=["演示", "混合"],
    version="1.0.0",
    input_example='{"name": "测试项目", "count": 5}',
)
def demo_mixed_output(name: str, count: int = 5) -> dict:
    """生成包含多种数据类型的混合输出。

    Args:
        name: 项目名称。
        count: 生成数据行数。
    """

    import math

    table = [{"index": i, "value": round(math.sin(i) * 100, 2), "label": f"{name}_{i}"} for i in range(count)]
    chart_data = [round(math.sin(i * 0.5) * 50 + 50, 2) for i in range(count * 4)]

    try:
        from PIL import Image

        img = Image.new("RGB", (100, 100), color=(59, 130, 246))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        sample_image = base64.b64encode(buf.getvalue()).decode("utf-8")
    except ImportError:
        sample_image = None

    result = {
        "summary": f"项目「{name}」共生成 {count} 条数据",
        "table": table,
        "chart_values": chart_data,
        "total": sum(row["value"] for row in table),
    }
    if sample_image:
        result["preview_image"] = sample_image
    return result
