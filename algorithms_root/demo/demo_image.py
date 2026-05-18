import base64

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="图片信息与灰度转换",
    zh_description="演示图片上传输入，输出为处理后的图片。上传一张图片，返回其灰度版本。",
    zh_tags=["演示", "图片"],
    version="1.0.0",
    input_example="{}",
)
def demo_image(image: str) -> str:
    """将上传的图片转为灰度图并返回 base64。

    Args:
        image: base64 编码的图片数据。
    """

    import io

    try:
        from PIL import Image
    except ImportError:
        return image

    img_bytes = base64.b64decode(image)
    img = Image.open(io.BytesIO(img_bytes))
    gray = img.convert("L")

    buffer = io.BytesIO()
    gray.save(buffer, format="PNG")
    result_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return result_b64
