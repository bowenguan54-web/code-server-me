from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="日期时间计算",
    zh_description="演示日期时间输入控件。",
    zh_tags=["演示", "时间"],
    version="1.0.0",
    input_example='{"start_datetime": "2025-01-01T08:00", "end_datetime": "2025-12-31T18:00"}',
)
def demo_datetime(start_datetime: str, end_datetime: str) -> dict:
    """计算两个日期时间之间的差距。

    Args:
        start_datetime: 开始时间。
        end_datetime: 结束时间。
    """

    from datetime import datetime

    fmt = "%Y-%m-%dT%H:%M"
    start = datetime.strptime(start_datetime[:16], fmt)
    end = datetime.strptime(end_datetime[:16], fmt)
    delta = end - start
    total_seconds = int(delta.total_seconds())
    return {
        "start": str(start),
        "end": str(end),
        "days": delta.days,
        "hours": total_seconds // 3600,
        "minutes": total_seconds // 60,
        "seconds": total_seconds,
        "description": f"相差 {delta.days} 天 {(total_seconds % 86400) // 3600} 小时",
    }
