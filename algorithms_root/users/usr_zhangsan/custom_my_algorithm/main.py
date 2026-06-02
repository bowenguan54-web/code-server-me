from algo_service.sdk.decorators import algo_meta
from .preprocess import clean_values
from .model import score_values


@algo_meta(
    zh_name="复杂算法示例",
    zh_description="多文件复杂算法入口，演示预处理、模型逻辑和结果封装。",
    zh_tags=["复杂算法", "多文件"],
    version="1.0.1",
)
def my_algorithm(data: list[float], threshold: float = 0.5) -> dict:
    values = clean_values(data)
    scores = score_values(values)
    passed = [value for value, score in zip(values, scores) if score >= threshold]
    return {
        "input_count": len(data),
        "valid_count": len(values),
        "scores": scores,
        "passed": passed,

    }
