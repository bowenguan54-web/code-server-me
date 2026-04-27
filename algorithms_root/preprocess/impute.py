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


def impute(data: list, strategy: str = "mean", fill_value=None) -> dict:
    """zh_name: 缺失值填充
    zh_desc: 对列表中的 None/NaN 值进行填充，支持 mean/median/mode/constant/forward/backward
    tags: 缺失值, 填充, 预处理"""
    return _impute(data, strategy, fill_value)
