# === BLOCK: 步骤一：导入依赖与数据读取 [LOCKED] ===
# DESC: 标准数据管道的导入和数据加载阶段，此部分由模板设计者固定，不可修改
"""数据处理管道模板 — 展示分块编辑功能"""
from __future__ import annotations
from typing import Any
from algo_service.sdk.decorators import algo_meta

@algo_meta(
    zh_name="数据处理管道模板",
    zh_description="一个标准的数据 ETL 管道模板：读取→清洗→转换→校验→输出。部分步骤锁定不可修改，中间步骤可自由编辑。",
    zh_tags=["模板", "数据管道", "ETL", "分块演示"],
    version="1.0.0",
    input_example='{"raw_data": [{"name": "张三", "age": 28, "score": null}, {"name": "李四", "age": -1, "score": 85}]}',
)
def data_pipeline_template(raw_data: list[dict[str, Any]]) -> dict[str, Any]:
    """标准数据处理管道。"""
    if not raw_data:
        raise ValueError("raw_data 不能为空")
    data = [dict(row) for row in raw_data]
# === BLOCK: 步骤二：数据清洗 ===
# DESC: 对原始数据进行清洗，处理缺失值、异常值。你可以修改此部分的逻辑。
# HINT: 可调用 alg.preprocess.fill_missing(data, strategy="mean") 等组件
    # ---- 数据清洗 ----
    for row in data:
        for key, value in row.items():
            if value is None:
                row[key] = 0
# === BLOCK: 步骤三：数据转换与特征工程 ===
# DESC: 对清洗后的数据进行类型转换、衍生字段计算等操作
# HINT: 可自由编写转换逻辑，或调用 alg.data_utils 中的组件
    # ---- 数据转换 ----
    for row in data:
        if "age" in row and isinstance(row["age"], (int, float)) and row["age"] < 0:
            row["age"] = abs(row["age"])
# === BLOCK: 步骤四：业务规则校验 ===
# DESC: 根据业务需求对数据进行校验和过滤
# HINT: 可调用 alg.statistics 中的统计组件进行异常检测
    # ---- 业务规则 ----
    valid_data = [row for row in data if row.get("age", 0) > 0]
    invalid_count = len(data) - len(valid_data)
# === BLOCK: 步骤五：结果格式化与输出 [LOCKED] ===
# DESC: 将处理结果格式化为标准输出结构。此部分由模板设计者固定，不可修改。
    result = {
        "processed_data": valid_data,
        "total_count": len(data),
        "valid_count": len(valid_data),
        "invalid_count": invalid_count,
        "status": "success",
    }
    return result
