from typing import Optional

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="可选参数示例",
    zh_description="演示 Optional 可跳过参数。",
    zh_tags=["演示", "可选"],
    version="1.0.0",
    input_example='{"name": "张三", "title": "教授", "department": null}',
)
def demo_optional(name: str, title: Optional[str] = None, department: Optional[str] = None) -> dict:
    """生成名片信息，部分字段可选。

    Args:
        name: 姓名（必填）。
        title: 头衔（可选）。
        department: 部门（可选）。
    """

    card = {"name": name}
    if title is not None:
        card["title"] = title
    if department is not None:
        card["department"] = department
    card["display"] = " · ".join(filter(None, [card.get("title"), name, card.get("department")]))
    return card
