import base64

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="多图缩略图生成",
    zh_description="演示多图上传输入，输出为多张缩略图。",
    zh_tags=["演示", "图片", "批量"],
    version="1.0.0",
    input_example="{}",
)
def demo_images(images: list) -> list:
    """将多张图片缩放为 64x64 缩略图并返回。

    Args:
        images: base64 编码的图片列表。
    """

    import io

    try:
        from PIL import Image
    except ImportError:
        return images

    results = []
    for img_b64 in images:
        img_bytes = base64.b64decode(img_b64)
        img = Image.open(io.BytesIO(img_bytes))
        img.thumbnail((64, 64))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        results.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))
    return results
