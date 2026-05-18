from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="URL 解析",
    zh_description="演示 URL 输入控件。",
    zh_tags=["演示", "URL"],
    version="1.0.0",
    input_example='{"url": "https://example.com/path/page?key=value&lang=zh#section"}',
)
def demo_url(url: str) -> dict:
    """解析 URL 的各个组成部分。

    Args:
        url: 要解析的网址。
    """

    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(url)
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname or "",
        "port": parsed.port,
        "path": parsed.path,
        "query_params": parse_qs(parsed.query),
        "fragment": parsed.fragment,
    }
