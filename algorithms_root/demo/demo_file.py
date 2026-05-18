from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="文件分析",
    zh_description="演示文件上传输入（通过服务器路径传入）。",
    zh_tags=["演示", "文件"],
    version="1.0.0",
    input_example="{}",
)
def demo_file(file_path: str) -> dict:
    """分析上传的文件，返回基本信息。

    Args:
        file_path: 上传文件的服务器路径。
    """

    import os

    if not os.path.exists(file_path):
        return {"error": f"文件不存在: {file_path}"}

    stat = os.stat(file_path)
    name = os.path.basename(file_path)
    ext = os.path.splitext(name)[1].lower()

    result = {
        "filename": name,
        "extension": ext,
        "size_bytes": stat.st_size,
        "size_readable": f"{stat.st_size / 1024:.1f} KB",
    }

    if ext in (".txt", ".csv", ".json", ".py", ".md"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        result["line_count"] = content.count("\n") + 1
        result["char_count"] = len(content)
        result["preview"] = content[:500] + ("..." if len(content) > 500 else "")

    return result
