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


def normalize(data: list, min_val: float = 0.0, max_val: float = 1.0) -> dict:
    """zh_name: 归一化
    zh_desc: 将数值列表映射到 [min_val, max_val] 区间
    tags: 归一化, 预处理"""
    return _normalize(data, min_val, max_val)
