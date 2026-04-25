"""
preprocess — 数据预处理算法组件

包含: sample_random, sample_weighted, sample_stratified,
      split, join, normalize, standardize, impute, cast
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))

from algo_service.sdk.decorators import algo_meta
from examples.algolib.preprocess import (
    sample_random as _sample_random,
    sample_weighted as _sample_weighted,
    sample_stratified as _sample_stratified,
    split as _split,
    join as _join,
    normalize as _normalize,
    standardize as _standardize,
    impute as _impute,
    cast as _cast,
)


@algo_meta(
    zh_name="随机抽样",
    zh_description="从列表中随机抽取 n 个样本，支持有放回/无放回抽样",
    zh_tags=["抽样", "预处理"],
    version="1.0.0",
)
def sample_random(data: list, n: int, replace: bool = False, seed: int = None) -> dict:
    """zh_name: 随机抽样
    zh_desc: 从列表中随机抽取 n 个样本，支持有放回/无放回抽样
    tags: 抽样, 预处理"""
    return _sample_random(data, n, replace, seed)


@algo_meta(
    zh_name="带权重抽样",
    zh_description="按指定权重从列表中抽取 n 个样本",
    zh_tags=["抽样", "预处理"],
    version="1.0.0",
)
def sample_weighted(data: list, weights: list, n: int, replace: bool = True, seed: int = None) -> dict:
    """zh_name: 带权重抽样
    zh_desc: 按指定权重从列表中抽取 n 个样本
    tags: 抽样, 预处理"""
    return _sample_weighted(data, weights, n, replace, seed)


@algo_meta(
    zh_name="分层抽样",
    zh_description="按类别比例从数据集中进行分层随机抽样",
    zh_tags=["抽样", "预处理"],
    version="1.0.0",
)
def sample_stratified(data: list, labels: list, n: int, seed: int = None) -> dict:
    """zh_name: 分层抽样
    zh_desc: 按类别比例从数据集中进行分层随机抽样
    tags: 抽样, 预处理"""
    return _sample_stratified(data, labels, n, seed)


@algo_meta(
    zh_name="数据集分割",
    zh_description="将数据集按比例分割为训练集和测试集",
    zh_tags=["分割", "预处理"],
    version="1.0.0",
)
def split(data: list, test_ratio: float = 0.2, shuffle: bool = True, seed: int = None) -> dict:
    """zh_name: 数据集分割
    zh_desc: 将数据集按比例分割为训练集和测试集
    tags: 分割, 预处理"""
    return _split(data, test_ratio, shuffle, seed)


@algo_meta(
    zh_name="数据合并",
    zh_description="将多个数据列表合并为一个列表",
    zh_tags=["合并", "预处理"],
    version="1.0.0",
)
def join(*datasets) -> dict:
    """zh_name: 数据合并
    zh_desc: 将多个数据列表合并为一个列表
    tags: 合并, 预处理"""
    return _join(*datasets)


@algo_meta(
    zh_name="归一化",
    zh_description="将数值列表映射到 [min_val, max_val] 区间（默认 [0, 1]）",
    zh_tags=["归一化", "预处理"],
    version="1.0.0",
)
def normalize(data: list, min_val: float = 0.0, max_val: float = 1.0) -> dict:
    """zh_name: 归一化
    zh_desc: 将数值列表映射到 [min_val, max_val] 区间
    tags: 归一化, 预处理"""
    return _normalize(data, min_val, max_val)


@algo_meta(
    zh_name="标准化",
    zh_description="对数值列表进行 Z-score 标准化（均值为 0，标准差为 1）",
    zh_tags=["标准化", "预处理"],
    version="1.0.0",
)
def standardize(data: list) -> dict:
    """zh_name: 标准化
    zh_desc: 对数值列表进行 Z-score 标准化（均值为 0，标准差为 1）
    tags: 标准化, 预处理"""
    return _standardize(data)


@algo_meta(
    zh_name="缺失值填充",
    zh_description="对列表中的 None/NaN 值进行填充，支持均值、中位数、众数、常数、前向/后向填充",
    zh_tags=["缺失值", "填充", "预处理"],
    version="1.0.0",
)
def impute(data: list, strategy: str = "mean", fill_value=None) -> dict:
    """zh_name: 缺失值填充
    zh_desc: 对列表中的 None/NaN 值进行填充，支持 mean/median/mode/constant/forward/backward
    tags: 缺失值, 填充, 预处理"""
    return _impute(data, strategy, fill_value)


@algo_meta(
    zh_name="类型转换",
    zh_description="将列表元素批量转换为指定 Python 类型（int/float/str/bool）",
    zh_tags=["类型转换", "预处理"],
    version="1.0.0",
)
def cast(data: list, dtype: str = "float") -> dict:
    """zh_name: 类型转换
    zh_desc: 将列表元素批量转换为指定 Python 类型（int/float/str/bool）
    tags: 类型转换, 预处理"""
    return _cast(data, dtype)
