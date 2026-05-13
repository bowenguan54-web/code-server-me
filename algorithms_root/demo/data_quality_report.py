from __future__ import annotations
from algo_service.sdk.decorators import algo_meta

_DEFAULT_DATA = [
    {"id": 1, "name": "张三", "age": 28, "score": 92.5},
    {"id": 2, "name": "", "age": 31, "score": 87.0},
    {"id": 3, "name": "王五", "age": -1, "score": None},
    {"id": 4, "name": "赵六", "age": 45, "score": 95.2},
    {"id": 5, "name": "孙七", "age": 29, "score": 78.3},
    {"id": 5, "name": "孙七", "age": 29, "score": 78.3},
    {"id": 6, "name": "周八", "age": 999, "score": 88.1},
]

_EXTREME_THRESHOLD = 500


def _is_null(v) -> bool:
    """判断值是否为空：None、空字符串、空列表。"""
    if v is None:
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    if isinstance(v, list) and len(v) == 0:
        return True
    return False


@algo_meta(
    zh_name="数据质量报告",
    zh_description="对数据集进行质量检测，输出包含完整性、唯一性、异常值等指标的表格报告",
    zh_tags=["数据质量", "报表", "检测"],
    version="1.0.0",
    input_example='{"data":[{"id":1,"name":"张三","age":28,"score":92.5},{"id":2,"name":"","age":31,"score":87.0},{"id":3,"name":"王五","age":-1,"score":null},{"id":4,"name":"赵六","age":45,"score":95.2},{"id":5,"name":"孙七","age":29,"score":78.3},{"id":5,"name":"孙七","age":29,"score":78.3},{"id":6,"name":"周八","age":999,"score":88.1}],"check_null":true,"check_duplicate":true,"check_range":true}',
)
def data_quality_report(
    data: list = None,
    check_null: bool = True,
    check_duplicate: bool = True,
    check_range: bool = True,
) -> dict:
    """对数据集进行质量检测，返回表格报告。

    测试时输入以下参数：
    {
        "data": [
            {"id":1,"name":"张三","age":28,"score":92.5},
            {"id":2,"name":"","age":31,"score":87.0},
            {"id":3,"name":"王五","age":-1,"score":null},
            {"id":4,"name":"赵六","age":45,"score":95.2},
            {"id":5,"name":"孙七","age":29,"score":78.3},
            {"id":5,"name":"孙七","age":29,"score":78.3},
            {"id":6,"name":"周八","age":999,"score":88.1}
        ],
        "check_null": true,
        "check_duplicate": true,
        "check_range": true
    }

    Args:
        data: 数据列表，每项为一个字典（一行记录），不传则使用内置示例数据
        check_null: 是否检查空值
        check_duplicate: 是否检查重复行
        check_range: 是否检查数值异常
    """
    if data is None:
        data = _DEFAULT_DATA

    total = len(data)
    if total == 0:
        return {
            "__output_type__": "table",
            "title": "数据质量报告（空数据集）",
            "columns": ["字段名", "完整率", "唯一率", "空值数/总数", "范围检测", "状态"],
            "rows": [],
        }

    # 收集所有字段名（保持首次出现顺序）
    fields: list[str] = []
    seen_fields: set[str] = set()
    for row in data:
        for k in row:
            if k not in seen_fields:
                fields.append(k)
                seen_fields.add(k)

    # 检测重复行（整行转为可哈希 tuple 比较）
    dup_count = 0
    if check_duplicate:
        row_keys: list[tuple] = []
        seen_rows: set[tuple] = set()
        for row in data:
            key = tuple(sorted((k, str(v)) for k, v in row.items()))
            if key in seen_rows:
                dup_count += 1
            else:
                seen_rows.add(key)
            row_keys.append(key)

    rows: list[list[str]] = []

    for field in fields:
        values = [row.get(field) for row in data]

        # 空值
        null_count = sum(1 for v in values if _is_null(v)) if check_null else 0
        null_rate = null_count / total
        completeness = f"{(1 - null_rate) * 100:.1f}%"
        null_str = f"{null_count}/{total}" if check_null else "—"

        # 唯一率
        non_null = [v for v in values if not _is_null(v)]
        unique_count = len(set(str(v) for v in non_null))
        uniqueness = f"{unique_count / total * 100:.1f}%" if total > 0 else "—"

        # 数值范围检测
        range_note = "—"
        has_range_issue = False
        if check_range:
            negative_count = 0
            extreme_count = 0
            for v in non_null:
                try:
                    fv = float(v)  # type: ignore[arg-type]
                    if fv < 0:
                        negative_count += 1
                    if fv > _EXTREME_THRESHOLD:
                        extreme_count += 1
                except (TypeError, ValueError):
                    pass
            notes = []
            if negative_count > 0:
                notes.append(f"负值{negative_count}个")
                has_range_issue = True
            if extreme_count > 0:
                notes.append(f"极端值{extreme_count}个(>{_EXTREME_THRESHOLD})")
                has_range_issue = True
            range_note = "、".join(notes) if notes else "正常"

        # 状态
        if null_rate > 0.5:
            status = "❌ 严重问题"
        elif null_rate > 0 or has_range_issue or (check_duplicate and unique_count < len(non_null)):
            status = "⚠️ 有问题"
        else:
            status = "✅ 正常"

        rows.append([field, completeness, uniqueness, null_str, range_note, status])

    # 追加整体重复行统计
    if check_duplicate:
        dup_status = "⚠️ 有问题" if dup_count > 0 else "✅ 正常"
        rows.append([
            "【整体】重复行",
            "—",
            "—",
            "—",
            f"重复行 {dup_count} 个" if dup_count > 0 else "无重复",
            dup_status,
        ])

    col_count = len(fields)
    title = f"数据质量报告（共 {total} 行 × {col_count} 列）"

    return {
        "__output_type__": "table",
        "title": title,
        "columns": ["字段名", "完整率", "唯一率", "空值数/总数", "范围检测", "状态"],
        "rows": rows,
    }
