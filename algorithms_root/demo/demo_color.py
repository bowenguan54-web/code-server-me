from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="颜色分析",
    zh_description="演示颜色选择输入控件。",
    zh_tags=["演示", "颜色"],
    version="1.0.0",
    input_example='{"color": "#3b82f6"}',
)
def demo_color(color: str) -> dict:
    """解析颜色值为 RGB 分量。

    Args:
        color: 十六进制颜色值。
    """

    hex_str = color.lstrip("#")
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    brightness = round((r * 299 + g * 587 + b * 114) / 1000, 1)
    return {
        "hex": f"#{hex_str}",
        "r": r,
        "g": g,
        "b": b,
        "rgb": f"rgb({r}, {g}, {b})",
        "brightness": brightness,
        "is_dark": brightness < 128,
    }
