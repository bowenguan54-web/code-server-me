from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="列表统计",
    zh_description="演示列表输入，输出为 JSON 统计结果。",
    zh_tags=["演示", "列表"],
    version="1.0.0",
    input_example='{"numbers": [3, 1, 4, 1, 5, 9, 2, 6]}',
)
def demo_list(numbers: list) -> dict:
    """对列表进行统计。

    Args:
        numbers: 数字列表。
    """

    nums = [float(n) for n in numbers]
    return {
        "count": len(nums),
        "sum": sum(nums),
        "average": round(sum(nums) / len(nums), 4) if nums else 0,
        "min": min(nums) if nums else None,
        "max": max(nums) if nums else None,
        "sorted": sorted(nums),
    }
