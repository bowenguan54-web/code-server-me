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


def sample_random(data: list, n: int, replace: bool = False, seed: int = None) -> dict:
    """zh_name: 随机抽样
    zh_desc: 从列表中随机抽取 n 个样本，支持有放回/无放回抽样
    tags: 抽样, 预处理"""
    return _sample_random(data, n, replace, seed)
