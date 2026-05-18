from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="文本处理",
    zh_description="演示短文本和长文本输入，输出为处理后的文本。",
    zh_tags=["演示", "文本"],
    version="1.0.0",
    input_example='{"title": "你好世界", "content": "这是一段很长的文本内容，用于演示长文本输入控件的效果。\\n可以包含多行。"}',
)
def demo_text(title: str, content: str) -> str:
    """文本处理示例。

    Args:
        title: 标题（短文本）。
        content: 正文内容（长文本）。
    """

    word_count = len(content)
    line_count = content.count("\n") + 1
    return f"标题：{title}\n字符数：{word_count}\n行数：{line_count}\n首行：{content.split(chr(10))[0]}"
