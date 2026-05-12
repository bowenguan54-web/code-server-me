# === BLOCK: 数据加载与验证 [LOCKED] ===
# 此块由平台锁定，不可修改
# 功能：接收输入数据并验证格式

def block_demo_template(data: list[dict], target_column: str, method: str = "default") -> dict:
    """
    数据分析演示模板 — 展示分块编辑器的核心能力。

    Args:
        data: 数据集，列表中每项为一行数据的字典
        target_column: 目标列名（用于预测/分析）
        method: 分析方法，支持 "default" / "weighted" / "robust"

    Returns:
        dict: 包含分析结果、统计指标和可视化数据
    """
    import statistics
    import math

    if not data or not isinstance(data, list):
        raise ValueError("data 必须为非空列表")
    if not target_column:
        raise ValueError("target_column 不能为空")
    if not isinstance(data[0], dict):
        raise ValueError("data 中的每一项必须为字典")
    if target_column not in data[0]:
        raise ValueError(f"目标列 '{target_column}' 不存在于数据中")

    # 提取目标列数值
    raw_values = []
    for i, row in enumerate(data):
        val = row.get(target_column)
        if val is None:
            continue
        try:
            raw_values.append(float(val))
        except (TypeError, ValueError):
            pass  # 跳过无法转换的值

    if len(raw_values) < 2:
        raise ValueError(f"目标列 '{target_column}' 中有效数值不足 2 个，无法分析")

# === BLOCK: 统计特征计算 ===
    # 基础统计指标
    n = len(raw_values)
    mean_val = statistics.mean(raw_values)
    median_val = statistics.median(raw_values)
    std_val = statistics.stdev(raw_values) if n > 1 else 0.0
    min_val = min(raw_values)
    max_val = max(raw_values)
    variance = statistics.variance(raw_values) if n > 1 else 0.0

    # 四分位数
    sorted_vals = sorted(raw_values)
    q1_idx = max(0, int(n * 0.25) - 1)
    q3_idx = min(n - 1, int(n * 0.75))
    q1 = sorted_vals[q1_idx]
    q3 = sorted_vals[q3_idx]
    iqr = q3 - q1

    # 偏度（Pearson 近似）
    if std_val > 0:
        skewness = 3 * (mean_val - median_val) / std_val
    else:
        skewness = 0.0

    stats_summary = {
        "n": n,
        "mean": round(mean_val, 4),
        "median": round(median_val, 4),
        "std": round(std_val, 4),
        "variance": round(variance, 4),
        "min": round(min_val, 4),
        "max": round(max_val, 4),
        "q1": round(q1, 4),
        "q3": round(q3, 4),
        "iqr": round(iqr, 4),
        "skewness": round(skewness, 4),
    }

# === BLOCK: 预测模型（可自定义） ===
    # 您可以在此块中修改预测策略
    # 提示：raw_values 为目标列数值列表，method 为用户指定的方法

    predictions = []

    if method == "weighted":
        # 加权移动平均预测（近期数据权重更高）
        weights = [1.0 / (n - i) for i in range(n)]
        total_w = sum(weights)
        weighted_mean = sum(v * w for v, w in zip(raw_values, weights)) / total_w
        trend = (raw_values[-1] - raw_values[0]) / max(n - 1, 1)
        for i in range(min(5, n)):
            predictions.append(round(weighted_mean + trend * (i + 1), 4))

    elif method == "robust":
        # 基于中位数 + IQR 的鲁棒预测
        for i in range(min(5, n)):
            noise = (iqr * 0.1) * math.sin(i * 0.5)
            predictions.append(round(median_val + noise, 4))

    else:
        # 默认：线性外推预测
        if n >= 2:
            slope = (raw_values[-1] - raw_values[-2])
        else:
            slope = 0.0
        for i in range(min(5, n)):
            predictions.append(round(raw_values[-1] + slope * (i + 1), 4))

# === BLOCK: 数据可视化构建 ===
    # 构造折线图数据（训练序列 + 预测序列）
    actual_series = [round(v, 4) for v in raw_values]
    pred_start_idx = n
    pred_indices = list(range(pred_start_idx, pred_start_idx + len(predictions)))

    # 构造对比表格（最后 5 行实际值 vs 预测值）
    compare_rows = []
    tail = raw_values[-min(5, n):]
    for i, (actual, pred) in enumerate(zip(tail, predictions)):
        err = abs(actual - pred)
        pct = (err / abs(actual) * 100) if actual != 0 else 0.0
        compare_rows.append({
            "序号": n - len(tail) + i + 1,
            "实际值": round(actual, 4),
            "预测值": round(pred, 4),
            "绝对误差": round(err, 4),
            "误差率(%)": round(pct, 2),
        })

    # MAE / RMSE（用对比行计算）
    if compare_rows:
        errors = [abs(r["实际值"] - r["预测值"]) for r in compare_rows]
        mae = round(statistics.mean(errors), 4)
        rmse = round(math.sqrt(statistics.mean([e ** 2 for e in errors])), 4)
    else:
        mae = rmse = 0.0

# === BLOCK: 组装输出结果 [LOCKED] ===
    # 此块由平台锁定，确保输出格式统一
    model_summary = (
        f"模型方法: {method}\n"
        f"样本数量: {n}\n"
        f"目标列: {target_column}\n"
        f"均值: {stats_summary['mean']}  标准差: {stats_summary['std']}\n"
        f"MAE: {mae}  RMSE: {rmse}\n"
        f"预测步数: {len(predictions)}"
    )

    output = {
        "type": "multi_output",
        "outputs": [
            {
                "type": "text_output",
                "title": "模型摘要",
                "content": model_summary,
            },
            {
                "type": "line_output",
                "title": f"{target_column} — 实际值与预测值折线图",
                "x": list(range(n)) + pred_indices,
                "series": [
                    {"name": "实际值", "data": actual_series + [None] * len(predictions)},
                    {"name": "预测值", "data": [None] * n + predictions},
                ],
                "x_label": "数据索引",
                "y_label": target_column,
            },
            {
                "type": "table_output",
                "title": "预测对比（最近 5 条）",
                "columns": ["序号", "实际值", "预测值", "绝对误差", "误差率(%)"],
                "rows": [[r["序号"], r["实际值"], r["预测值"], r["绝对误差"], r["误差率(%)"]] for r in compare_rows],
            },
        ],
        "statistics": stats_summary,
        "predictions": predictions,
    }

    return output
