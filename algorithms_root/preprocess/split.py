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


def split(data: list, test_ratio: float = 0.2, shuffle: bool = True, seed: int = None) -> dict:
    """zh_name: 数据集分割
    zh_desc: 将数据集按比例分割为训练集和测试集
    tags: 分割, 预处理"""
    return _split(data, test_ratio, shuffle, seed)
