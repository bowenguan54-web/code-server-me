"""
algolib — 算法库即插即用 Python 包

用法:
    import algolib as alg

    result = alg.kmeans(X, k=3)
    result = alg.normalize(data)
    result = alg.fft(signal, fs=1000)
"""

from algolib.preprocess import (
    sample_random,
    sample_weighted,
    sample_stratified,
    split,
    join,
    normalize,
    standardize,
    impute,
    cast,
)
from algolib.statistics import (
    describe,
    dist,
    corr,
    pearson,
    cov,
    boxplot,
    percentile,
    outlier,
    anova,
    chisq,
    normtest,
    ahp,
    entropy,
    yoy,
)
from algolib.ml import (
    svm,
    knn,
    dtree,
    naive_bayes,
    random_forest,
    logistic,
    linear,
    kmeans,
    gmm,
    rl,
    xgboost,
    lgbm,
)
from algolib.timeseries import (
    dtw,
    lstm_clf,
    transformer,
    cluster_feat,
    cluster_model,
    cluster_shape,
    spectral,
    ar,
    ma,
    arma,
    lstm_pred,
    hilbert,
    hht,
)
from algolib.signal_proc import (
    fft,
    dft,
    dct,
    wavelet,
    conv,
    adaptive,
    lowpass,
    highpass,
    bandpass,
    bandstop,
)

__version__ = "1.0.0"
__all__ = [
    # preprocess
    "sample_random", "sample_weighted", "sample_stratified",
    "split", "join", "normalize", "standardize", "impute", "cast",
    # statistics
    "describe", "dist", "corr", "pearson", "cov", "boxplot",
    "percentile", "outlier", "anova", "chisq", "normtest", "ahp", "entropy", "yoy",
    # ml
    "svm", "knn", "dtree", "naive_bayes", "random_forest",
    "logistic", "linear", "kmeans", "gmm", "rl", "xgboost", "lgbm",
    # timeseries
    "dtw", "lstm_clf", "transformer", "cluster_feat", "cluster_model",
    "cluster_shape", "spectral", "ar", "ma", "arma", "lstm_pred", "hilbert", "hht",
    # signal_proc
    "fft", "dft", "dct", "wavelet", "conv", "adaptive",
    "lowpass", "highpass", "bandpass", "bandstop",
]
