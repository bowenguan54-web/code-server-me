from __future__ import annotations

import base64
import io
import struct
import zlib

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="图片滤镜处理",
    zh_description="接收一张图片（base64 或文件上传），对其应用灰度、反色、模糊、边缘检测等滤镜，输出处理后的图片",
    zh_tags=["图片处理", "滤镜", "可视化"],
    version="1.0.0",
    input_example='{"image_base64":"<上传图片的base64字符串>","filter_type":"grayscale","intensity":5}',
)
def image_processor(
    image_base64: str = "",
    filter_type: str = "grayscale",
    intensity: int = 3,
) -> dict:
    """图片滤镜处理。

    测试方法：
    1. 在参数面板的 image_base64 字段上传一张图片（支持 PNG/JPG）
    2. 选择 filter_type：grayscale / invert / blur / edge / sepia / brightness
    3. 设置 intensity（1-10）
    4. 点击运行，输出面板将直接显示处理后的图片

    Args:
        image_base64: 图片的 base64 编码字符串
        filter_type: 滤镜类型（grayscale / invert / blur / edge / sepia / brightness）
        intensity: 滤镜强度 1-10

    Returns:
        __output_type__ 为 image 的字典，前端自动渲染为图片
    """
    intensity = max(1, min(10, int(intensity)))
    filter_type = str(filter_type).strip().lower()

    # ── 尝试使用 Pillow ──────────────────────────────────────────────
    try:
        from PIL import Image, ImageFilter, ImageEnhance  # type: ignore
        _HAS_PIL = True
    except ImportError:
        _HAS_PIL = False

    use_fallback = not image_base64 or not str(image_base64).strip()
    fallback_note = ""

    if use_fallback:
        fallback_note = "（使用内置示例图片）"
        img = _make_gradient_image(_HAS_PIL)
    else:
        try:
            raw = base64.b64decode(str(image_base64).strip())
            if _HAS_PIL:
                from PIL import Image  # type: ignore
                img = Image.open(io.BytesIO(raw)).convert("RGBA")
            else:
                img = _decode_png_fallback(raw)
        except Exception as exc:
            fallback_note = f"（图片解码失败，使用内置示例图片：{exc}）"
            img = _make_gradient_image(_HAS_PIL)

    if _HAS_PIL:
        result_img = _apply_filter_pil(img, filter_type, intensity)
    else:
        result_img = _apply_filter_raw(img, filter_type, intensity)

    png_bytes = _encode_png(_HAS_PIL, result_img)
    encoded = base64.b64encode(png_bytes).decode("ascii")

    filter_labels = {
        "grayscale": "灰度",
        "invert": "反色",
        "blur": "高斯模糊",
        "edge": "边缘检测",
        "sepia": "棕褐色调",
        "brightness": "亮度调节",
    }
    label = filter_labels.get(filter_type, filter_type)
    title = f"{label}滤镜处理结果{fallback_note}"

    return {
        "__output_type__": "image",
        "title": title,
        "src": "data:image/png;base64," + encoded,
        "width": 600,
        "alt": f"处理后的图片（{label}，强度 {intensity}）",
    }


# ── PIL 实现 ─────────────────────────────────────────────────────────────────

def _apply_filter_pil(img, filter_type: str, intensity: int):
    from PIL import Image, ImageFilter, ImageEnhance  # type: ignore

    img = img.convert("RGBA")

    if filter_type == "grayscale":
        gray = img.convert("L")
        return gray.convert("RGBA")

    if filter_type == "invert":
        r, g, b, a = img.split()
        r = r.point(lambda v: 255 - v)
        g = g.point(lambda v: 255 - v)
        b = b.point(lambda v: 255 - v)
        return Image.merge("RGBA", (r, g, b, a))

    if filter_type == "blur":
        radius = intensity
        return img.filter(ImageFilter.GaussianBlur(radius=radius))

    if filter_type == "edge":
        rgb = img.convert("RGB")
        edges = rgb.filter(ImageFilter.FIND_EDGES)
        return edges.convert("RGBA")

    if filter_type == "sepia":
        gray = img.convert("L")
        w, h = gray.size
        pixels = list(gray.getdata())
        sepia_pixels = []
        for lum in pixels:
            nr = min(255, int(lum * 1.2))
            ng = int(lum * 1.0)
            nb = int(lum * 0.8)
            sepia_pixels.append((nr, ng, nb, 255))
        out = Image.new("RGBA", (w, h))
        out.putdata(sepia_pixels)
        return out

    if filter_type == "brightness":
        factor = intensity / 5.0
        enhancer = ImageEnhance.Brightness(img)
        return enhancer.enhance(factor)

    # unknown filter — return as-is
    return img


def _make_gradient_image(has_pil: bool):
    """生成 200×200 彩色渐变示例图片。"""
    if has_pil:
        from PIL import Image  # type: ignore
        w, h = 200, 200
        img = Image.new("RGBA", (w, h))
        pixels = []
        for y in range(h):
            for x in range(w):
                r = int(x / w * 255)
                g = int(y / h * 255)
                b = int((1 - x / w) * 200)
                pixels.append((r, g, b, 255))
        img.putdata(pixels)
        return img
    else:
        # return raw pixel array: list of (R,G,B,A) tuples + (width, height)
        w, h = 200, 200
        pixels = []
        for y in range(h):
            for x in range(w):
                r = int(x / w * 255)
                g = int(y / h * 255)
                b = int((1 - x / w) * 200)
                pixels.append((r, g, b, 255))
        return {"pixels": pixels, "width": w, "height": h}


# ── Pure-stdlib fallback ──────────────────────────────────────────────────────

def _decode_png_fallback(raw: bytes) -> dict:
    """极简 PNG 解码（仅支持 RGBA/RGB，无隔行扫描）。失败抛 ValueError。"""
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是有效的 PNG 文件")

    pos = 8
    chunks: dict[str, bytes] = {}
    while pos < len(raw):
        length = struct.unpack(">I", raw[pos:pos+4])[0]
        ctype = raw[pos+4:pos+8].decode("ascii", errors="replace")
        data = raw[pos+8:pos+8+length]
        chunks.setdefault(ctype, data)
        pos += 12 + length

    if "IHDR" not in chunks:
        raise ValueError("缺少 IHDR chunk")
    w, h, bit_depth, color_type = struct.unpack(">IIBB", chunks["IHDR"][:10])
    if bit_depth != 8:
        raise ValueError(f"仅支持 8-bit PNG，当前: {bit_depth}")
    if color_type not in (2, 6):  # 2=RGB, 6=RGBA
        raise ValueError(f"仅支持 RGB/RGBA PNG，color_type={color_type}")

    has_alpha = color_type == 6
    channels = 4 if has_alpha else 3

    idat = b"".join(chunks.get(k, b"") for k in ("IDAT",))
    raw_data = zlib.decompress(idat)

    pixels = []
    stride = w * channels
    for y in range(h):
        row_start = y * (stride + 1)
        filter_byte = raw_data[row_start]
        row = bytearray(raw_data[row_start+1:row_start+1+stride])
        row = _unfilter_row(filter_byte, row, stride, channels)
        for x in range(w):
            base = x * channels
            r, g, b = row[base], row[base+1], row[base+2]
            a = row[base+3] if has_alpha else 255
            pixels.append((r, g, b, a))

    return {"pixels": pixels, "width": w, "height": h}


def _unfilter_row(filter_type: int, row: bytearray, stride: int, bpp: int) -> bytearray:
    if filter_type == 0:
        return row
    if filter_type == 1:  # Sub
        for i in range(bpp, stride):
            row[i] = (row[i] + row[i - bpp]) & 0xFF
    elif filter_type == 2:  # Up — no prior row available in this simplified version
        pass
    elif filter_type == 3:  # Average
        for i in range(stride):
            left = row[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + left // 2) & 0xFF
    elif filter_type == 4:  # Paeth
        for i in range(stride):
            left = row[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + _paeth(left, 0, 0)) & 0xFF
    return row


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _apply_filter_raw(img_data: dict, filter_type: str, intensity: int) -> dict:
    """Pure-stdlib 滤镜实现，操作 (R,G,B,A) 像素列表。"""
    pixels = img_data["pixels"]
    w, h = img_data["width"], img_data["height"]

    if filter_type == "grayscale":
        out = []
        for r, g, b, a in pixels:
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            out.append((lum, lum, lum, a))
        return {"pixels": out, "width": w, "height": h}

    if filter_type == "invert":
        out = [(255 - r, 255 - g, 255 - b, a) for r, g, b, a in pixels]
        return {"pixels": out, "width": w, "height": h}

    if filter_type == "sepia":
        out = []
        for r, g, b, a in pixels:
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            out.append((min(255, int(lum * 1.2)), int(lum), int(lum * 0.8), a))
        return {"pixels": out, "width": w, "height": h}

    if filter_type == "brightness":
        factor = intensity / 5.0
        out = [
            (min(255, int(r * factor)), min(255, int(g * factor)), min(255, int(b * factor)), a)
            for r, g, b, a in pixels
        ]
        return {"pixels": out, "width": w, "height": h}

    if filter_type == "blur":
        radius = intensity
        out = _box_blur(pixels, w, h, radius)
        return {"pixels": out, "width": w, "height": h}

    if filter_type == "edge":
        # Sobel on grayscale
        gray = [int(0.299 * r + 0.587 * g + 0.114 * b) for r, g, b, a in pixels]
        out = _sobel_edge(gray, w, h)
        return {"pixels": out, "width": w, "height": h}

    return img_data


def _box_blur(pixels, w, h, radius):
    """简单 box blur（水平 + 垂直两次一维均值）。"""
    arr = list(pixels)

    def idx(x, y):
        return y * w + x

    # horizontal pass
    tmp = list(arr)
    for y in range(h):
        for x in range(w):
            x0 = max(0, x - radius)
            x1 = min(w - 1, x + radius)
            count = x1 - x0 + 1
            sr = sg = sb = sa = 0
            for xi in range(x0, x1 + 1):
                r, g, b, a = arr[idx(xi, y)]
                sr += r; sg += g; sb += b; sa += a
            tmp[idx(x, y)] = (sr // count, sg // count, sb // count, sa // count)

    # vertical pass
    out = list(tmp)
    for y in range(h):
        for x in range(w):
            y0 = max(0, y - radius)
            y1 = min(h - 1, y + radius)
            count = y1 - y0 + 1
            sr = sg = sb = sa = 0
            for yi in range(y0, y1 + 1):
                r, g, b, a = tmp[idx(x, yi)]
                sr += r; sg += g; sb += b; sa += a
            out[idx(x, y)] = (sr // count, sg // count, sb // count, sa // count)

    return out


def _sobel_edge(gray, w, h):
    Kx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    Ky = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
    out = []
    for y in range(h):
        for x in range(w):
            gx = gy = 0
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    nx = min(w - 1, max(0, x + dx))
                    ny = min(h - 1, max(0, y + dy))
                    v = gray[ny * w + nx]
                    gx += Kx[dy + 1][dx + 1] * v
                    gy += Ky[dy + 1][dx + 1] * v
            mag = min(255, int((gx ** 2 + gy ** 2) ** 0.5))
            out.append((mag, mag, mag, 255))
    return out


# ── PNG 编码 ──────────────────────────────────────────────────────────────────

def _encode_png(has_pil: bool, img_data) -> bytes:
    if has_pil:
        from PIL import Image  # type: ignore
        if isinstance(img_data, Image.Image):
            buf = io.BytesIO()
            img_data.convert("RGBA").save(buf, format="PNG", optimize=False)
            return buf.getvalue()

    # stdlib PNG encoder
    if isinstance(img_data, dict):
        pixels = img_data["pixels"]
        w = img_data["width"]
        h = img_data["height"]
    else:
        raise ValueError("无法编码图片数据")

    def make_chunk(ctype: bytes, data: bytes) -> bytes:
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    ihdr = make_chunk(b"IHDR", ihdr_data)

    raw_rows = []
    for y in range(h):
        row = bytearray()
        row.append(0)  # filter type None
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            row += bytes([r & 0xFF, g & 0xFF, b & 0xFF, a & 0xFF])
        raw_rows.append(bytes(row))

    idat = make_chunk(b"IDAT", zlib.compress(b"".join(raw_rows), 6))
    iend = make_chunk(b"IEND", b"")

    return signature + ihdr + idat + iend
