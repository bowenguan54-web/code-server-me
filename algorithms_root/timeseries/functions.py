"""
timeseries — 时序分析算法组件

包含: dtw, lstm_clf, transformer, cluster_feat, cluster_model,
      cluster_shape, spectral, ar, ma, arma, lstm_pred, hilbert, hht
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))

from algo_service.sdk.decorators import algo_meta
from examples.algolib.timeseries import (
    dtw as _dtw,
    lstm_clf as _lstm_clf,
    transformer as _transformer,
    cluster_feat as _cluster_feat,
    cluster_model as _cluster_model,
    cluster_shape as _cluster_shape,
    spectral as _spectral,
    ar as _ar,
    ma as _ma,
    arma as _arma,
    lstm_pred as _lstm_pred,
    hilbert as _hilbert,
    hht as _hht,
)


@algo_meta(
    zh_name="动态时间规整",
    zh_description="计算两条时间序列之间的 DTW 距离，支持 Sakoe-Chiba 带宽约束",
    zh_tags=["相似度", "时序", "DTW"],
    version="1.0.0",
)
def dtw(s1: list, s2: list, window: int = None) -> dict:
    """zh_name: 动态时间规整
    zh_desc: 计算两条时间序列之间的 DTW 距离，支持 Sakoe-Chiba 带宽约束
    tags: 相似度, 时序, DTW"""
    return _dtw(s1, s2, window)


@algo_meta(
    zh_name="LSTM 序列分类",
    zh_description="基于 MLP 近似的 LSTM 序列分类，适合展平的时间序列特征输入",
    zh_tags=["分类", "时序", "深度学习"],
    version="1.0.0",
)
def lstm_clf(X_train: list, y_train: list, X_test: list = None,
             hidden_layers: tuple = (64, 32), max_iter: int = 200, seed: int = None) -> dict:
    """zh_name: LSTM 序列分类
    zh_desc: 基于 MLP 近似的 LSTM 序列分类，适合展平的时间序列特征输入
    tags: 分类, 时序, 深度学习"""
    return _lstm_clf(X_train, y_train, X_test, hidden_layers, max_iter, seed)


@algo_meta(
    zh_name="Transformer 序列分类",
    zh_description="基于自注意力机制的 Transformer 时序分类（numpy 实现）",
    zh_tags=["分类", "时序", "Transformer", "注意力机制"],
    version="1.0.0",
)
def transformer(X_train: list, y_train: list, X_test: list = None,
                d_model: int = 32, n_heads: int = 4, seed: int = None) -> dict:
    """zh_name: Transformer 序列分类
    zh_desc: 基于自注意力机制的 Transformer 时序分类（numpy 实现）
    tags: 分类, 时序, Transformer, 注意力机制"""
    return _transformer(X_train, y_train, X_test, d_model, n_heads, seed)


@algo_meta(
    zh_name="基于特征的时序聚类",
    zh_description="提取时序统计特征（均值、方差、偏度等）后用 K-Means 聚类",
    zh_tags=["聚类", "时序", "特征提取"],
    version="1.0.0",
)
def cluster_feat(series_list: list, k: int = 3, seed: int = None) -> dict:
    """zh_name: 基于特征的时序聚类
    zh_desc: 提取时序统计特征（均值、方差、偏度等）后用 K-Means 聚类
    tags: 聚类, 时序, 特征提取"""
    return _cluster_feat(series_list, k, seed)


@algo_meta(
    zh_name="基于模型的时序聚类",
    zh_description="拟合每条时序的 AR 模型系数后用 K-Means 进行聚类",
    zh_tags=["聚类", "时序", "自回归"],
    version="1.0.0",
)
def cluster_model(series_list: list, ar_order: int = 3, k: int = 3, seed: int = None) -> dict:
    """zh_name: 基于模型的时序聚类
    zh_desc: 拟合每条时序的 AR 模型系数后用 K-Means 进行聚类
    tags: 聚类, 时序, 自回归"""
    return _cluster_model(series_list, ar_order, k, seed)


@algo_meta(
    zh_name="基于形态的时序聚类",
    zh_description="对归一化时序进行形态对齐后用谱聚类分组",
    zh_tags=["聚类", "时序", "谱聚类"],
    version="1.0.0",
)
def cluster_shape(series_list: list, k: int = 3, seed: int = None) -> dict:
    """zh_name: 基于形态的时序聚类
    zh_desc: 对归一化时序进行形态对齐后用谱聚类分组
    tags: 聚类, 时序, 谱聚类"""
    return _cluster_shape(series_list, k, seed)


@algo_meta(
    zh_name="谱分析",
    zh_description="对时间序列进行频谱分析，输出主频率、功率谱及周期性指标",
    zh_tags=["频谱", "时序", "信号分析"],
    version="1.0.0",
)
def spectral(series: list, fs: float = 1.0) -> dict:
    """zh_name: 谱分析
    zh_desc: 对时间序列进行频谱分析，输出主频率、功率谱及周期性指标
    tags: 频谱, 时序, 信号分析"""
    return _spectral(series, fs)


@algo_meta(
    zh_name="自回归模型（AR）",
    zh_description="拟合自回归 AR(p) 模型并进行多步预测",
    zh_tags=["预测", "时序", "自回归"],
    version="1.0.0",
)
def ar(series: list, p: int = 3, steps: int = 5) -> dict:
    """zh_name: 自回归模型（AR）
    zh_desc: 拟合自回归 AR(p) 模型并进行多步预测
    tags: 预测, 时序, 自回归"""
    return _ar(series, p, steps)


@algo_meta(
    zh_name="移动平均模型（MA）",
    zh_description="拟合移动平均 MA(q) 模型，输出残差及多步预测",
    zh_tags=["预测", "时序", "移动平均"],
    version="1.0.0",
)
def ma(series: list, q: int = 3, steps: int = 5) -> dict:
    """zh_name: 移动平均模型（MA）
    zh_desc: 拟合移动平均 MA(q) 模型，输出残差及多步预测
    tags: 预测, 时序, 移动平均"""
    return _ma(series, q, steps)


@algo_meta(
    zh_name="ARMA 模型",
    zh_description="拟合 ARMA(p,q) 模型（自回归+移动平均混合），输出系数和多步预测",
    zh_tags=["预测", "时序", "ARMA"],
    version="1.0.0",
)
def arma(series: list, p: int = 2, q: int = 1, steps: int = 5) -> dict:
    """zh_name: ARMA 模型
    zh_desc: 拟合 ARMA(p,q) 模型（自回归+移动平均混合），输出系数和多步预测
    tags: 预测, 时序, ARMA"""
    return _arma(series, p, q, steps)


@algo_meta(
    zh_name="LSTM 时序预测",
    zh_description="基于 MLP 滑动窗口的时序预测，适合单变量时间序列外推",
    zh_tags=["预测", "时序", "深度学习"],
    version="1.0.0",
)
def lstm_pred(series: list, window: int = 5, steps: int = 3,
              hidden_layers: tuple = (32, 16), max_iter: int = 300, seed: int = None) -> dict:
    """zh_name: LSTM 时序预测
    zh_desc: 基于 MLP 滑动窗口的时序预测，适合单变量时间序列外推
    tags: 预测, 时序, 深度学习"""
    return _lstm_pred(series, window, steps, hidden_layers, max_iter, seed)


@algo_meta(
    zh_name="Hilbert 变换",
    zh_description="对实数信号进行 Hilbert 变换，输出解析信号的包络、瞬时频率和瞬时相位",
    zh_tags=["信号分析", "时序", "Hilbert"],
    version="1.0.0",
)
def hilbert(signal: list, fs: float = 1.0) -> dict:
    """zh_name: Hilbert 变换
    zh_desc: 对实数信号进行 Hilbert 变换，输出包络、瞬时频率和瞬时相位
    tags: 信号分析, 时序, Hilbert"""
    return _hilbert(signal, fs)


@algo_meta(
    zh_name="希尔伯特-黄变换（HHT）",
    zh_description="基于经验模态分解（EMD）和 Hilbert 谱分析的时频分析方法",
    zh_tags=["时频分析", "时序", "HHT", "EMD"],
    version="1.0.0",
)
def hht(signal: list, fs: float = 1.0, n_imfs: int = 5) -> dict:
    """zh_name: 希尔伯特-黄变换（HHT）
    zh_desc: 基于 EMD 和 Hilbert 谱分析的时频分析方法
    tags: 时频分析, 时序, HHT, EMD"""
    return _hht(signal, fs, n_imfs)
