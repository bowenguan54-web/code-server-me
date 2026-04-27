"""
algo_service.routers.timeseries — 时序分析路由
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Optional

from algo_service.models.schemas import AlgoResponse

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


def _wrap(res: dict, algo_id: str) -> AlgoResponse:
    if "error" in res and res["error"]:
        return AlgoResponse(success=False, algo_id=algo_id, result=None, meta=res.get("meta", {}), error=res["error"])
    return AlgoResponse(success=True, algo_id=algo_id, result=res["result"], meta=res.get("meta", {}))


class DTWReq(BaseModel):
    s1: list[float]
    s2: list[float]
    window: Optional[int] = None


class LSTMClfReq(BaseModel):
    X_train: list[list[float]]
    y_train: list[Any]
    X_test: Optional[list[list[float]]] = None
    hidden_layers: list[int] = [64, 32]
    max_iter: int = 200
    seed: Optional[int] = None


class TransformerReq(BaseModel):
    X_train: list[list[float]]
    y_train: list[Any]
    X_test: Optional[list[list[float]]] = None
    d_model: int = 32
    n_heads: int = 4
    seed: Optional[int] = None


class ClusterReq(BaseModel):
    series_list: list[list[float]]
    k: int = 3
    seed: Optional[int] = None


class ClusterModelReq(ClusterReq):
    ar_order: int = 2


class ARReq(BaseModel):
    series: list[float]
    order: int = 1
    steps: int = 5


class MAReq(BaseModel):
    series: list[float]
    order: int = 1
    steps: int = 5


class ARMAReq(BaseModel):
    series: list[float]
    p: int = 1
    q: int = 1
    steps: int = 5


class LSTMPredReq(BaseModel):
    series: list[float]
    steps: int = 5
    lookback: int = 10
    hidden_layers: list[int] = [64, 32]
    max_iter: int = 300
    seed: Optional[int] = None


class HilbertReq(BaseModel):
    signal: list[float]
    fs: float = 1.0


class HHTReq(BaseModel):
    signal: list[float]
    fs: float = 1.0
    max_imfs: int = 5


@router.post("/dtw", response_model=AlgoResponse)
def dtw(req: DTWReq):
    import algolib as alg
    return _wrap(alg.dtw(req.s1, req.s2, req.window), "dtw")


@router.post("/lstm_clf", response_model=AlgoResponse)
def lstm_clf(req: LSTMClfReq):
    import algolib as alg
    return _wrap(alg.lstm_clf(req.X_train, req.y_train, req.X_test, tuple(req.hidden_layers), req.max_iter, req.seed), "lstm_clf")


@router.post("/transformer", response_model=AlgoResponse)
def transformer(req: TransformerReq):
    import algolib as alg
    return _wrap(alg.transformer(req.X_train, req.y_train, req.X_test, req.d_model, req.n_heads, req.seed), "transformer")


@router.post("/cluster_feat", response_model=AlgoResponse)
def cluster_feat(req: ClusterReq):
    import algolib as alg
    return _wrap(alg.cluster_feat(req.series_list, req.k, req.seed), "cluster_feat")


@router.post("/cluster_model", response_model=AlgoResponse)
def cluster_model(req: ClusterModelReq):
    import algolib as alg
    return _wrap(alg.cluster_model(req.series_list, req.k, req.ar_order, req.seed), "cluster_model")


@router.post("/cluster_shape", response_model=AlgoResponse)
def cluster_shape(req: ClusterReq):
    import algolib as alg
    return _wrap(alg.cluster_shape(req.series_list, req.k, req.seed), "cluster_shape")


@router.post("/spectral", response_model=AlgoResponse)
def spectral(req: ClusterReq):
    import algolib as alg
    return _wrap(alg.spectral(req.series_list, req.k, req.seed), "spectral")


@router.post("/ar", response_model=AlgoResponse)
def ar(req: ARReq):
    import algolib as alg
    return _wrap(alg.ar(req.series, req.order, req.steps), "ar")


@router.post("/ma", response_model=AlgoResponse)
def ma(req: MAReq):
    import algolib as alg
    return _wrap(alg.ma(req.series, req.order, req.steps), "ma")


@router.post("/arma", response_model=AlgoResponse)
def arma(req: ARMAReq):
    import algolib as alg
    return _wrap(alg.arma(req.series, req.p, req.q, req.steps), "arma")


@router.post("/lstm_pred", response_model=AlgoResponse)
def lstm_pred(req: LSTMPredReq):
    import algolib as alg
    return _wrap(alg.lstm_pred(req.series, req.steps, req.lookback, tuple(req.hidden_layers), req.max_iter, req.seed), "lstm_pred")


@router.post("/hilbert", response_model=AlgoResponse)
def hilbert(req: HilbertReq):
    import algolib as alg
    return _wrap(alg.hilbert(req.signal, req.fs), "hilbert")


@router.post("/hht", response_model=AlgoResponse)
def hht(req: HHTReq):
    import algolib as alg
    return _wrap(alg.hht(req.signal, req.fs, req.max_imfs), "hht")
