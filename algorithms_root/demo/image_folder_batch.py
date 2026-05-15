from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from algo_service.sdk.decorators import algo_meta


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff"}


@algo_meta(
    zh_name="图片文件夹批处理",
    zh_description="接收一个图片文件夹或多张图片文件路径，批量执行缩略图、灰度或复制处理，并把结果保存到输出文件夹。",
    zh_tags=["图片处理", "批量处理", "文件夹"],
    version="1.0.0",
    input_example='{"image_folder":[],"output_folder":"","operation":"thumbnail","max_size":256}',
)
def image_folder_batch(
    image_folder: list | str | None = None,
    output_folder: str = "",
    operation: str = "thumbnail",
    max_size: int = 256,
) -> dict:
    """批量处理上传的图片文件，并返回处理结果表格。

    在测试面板中点击 image_folder 参数旁边的文件夹按钮，选择本地图片文件夹。
    系统会把图片上传到临时目录，并把服务端临时路径列表传给本函数。
    output_folder 留空时，结果会保存到系统临时输出目录。
    """
    input_paths = _normalize_input_paths(image_folder)
    if not input_paths:
        return _table_result([], "未收到图片文件，请在 image_folder 参数处选择文件夹。")

    operation = str(operation or "thumbnail").strip().lower()
    max_size = max(16, min(2048, int(max_size or 256)))
    out_dir = _to_runtime_path(output_folder) if output_folder else Path(tempfile.gettempdir()) / "algolib_image_folder_output" / uuid4().hex[:8]
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[list[str]] = []
    for raw in input_paths:
        source = _to_runtime_path(str(raw))
        if not source.exists() or source.suffix.lower() not in IMAGE_SUFFIXES:
            rows.append([source.name or str(source), "跳过", "", "不是可识别的图片文件"])
            continue
        target = out_dir / f"{source.stem}_{operation}{source.suffix.lower()}"
        try:
            note = _process_one_image(source, target, operation, max_size)
            rows.append([source.name, "成功", str(target), note])
        except (OSError, ValueError, RuntimeError) as exc:
            rows.append([source.name, "失败", "", str(exc)])

    return _table_result(rows, f"图片文件夹批处理完成，输出目录：{out_dir}")


def _normalize_input_paths(image_folder: list | str | None) -> list[str]:
    """Normalize uploaded folder, file list, or directory path to image file paths."""
    if image_folder is None:
        return []
    if isinstance(image_folder, list):
        return [str(item) for item in image_folder if str(item).strip()]
    text = str(image_folder).strip()
    if not text:
        return []
    path = _to_runtime_path(text)
    if path.is_dir():
        return [str(p) for p in sorted(path.rglob("*")) if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES]
    if path.is_file():
        return [str(path)]
    if "\n" in text:
        return [line.strip() for line in text.splitlines() if line.strip()]
    return [text]


def _to_runtime_path(raw_path: str) -> Path:
    """Convert Windows drive paths to WSL mount paths when the service runs in Linux."""
    text = str(raw_path).strip().strip('"').strip("'")
    if len(text) >= 3 and text[1] == ":" and text[2] in ("\\", "/"):
        drive = text[0].lower()
        rest = text[3:].replace("\\", "/").lstrip("/")
        wsl_path = Path("/mnt") / drive / rest
        if wsl_path.exists() or Path("/mnt").exists():
            return wsl_path
    return Path(text).expanduser()


def _process_one_image(source: Path, target: Path, operation: str, max_size: int) -> str:
    """Process one image with Pillow when available, otherwise copy the file."""
    try:
        from PIL import Image, ImageOps  # type: ignore
    except ImportError:
        shutil.copy2(source, target)
        return "未安装 Pillow，已复制原图"

    with Image.open(source) as img:
        if operation == "grayscale":
            result = ImageOps.grayscale(img).convert("RGB")
            note = "已转灰度"
        elif operation == "copy":
            result = img.copy()
            note = "已复制"
        else:
            result = img.copy()
            result.thumbnail((max_size, max_size))
            note = f"已生成缩略图，最长边 {max_size}px"
        result.save(target)
    return note


def _table_result(rows: list[list[str]], title: str) -> dict:
    """Return a frontend-renderable table result."""
    return {
        "__output_type__": "table",
        "title": title,
        "columns": ["文件名", "状态", "输出路径", "说明"],
        "rows": rows,
    }
