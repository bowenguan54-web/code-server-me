"""
algo_service.routers.preprocess — 数据预处理路由
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Optional

from algo_service.models.schemas import AlgoResponse

router = APIRouter(prefix="/preprocess", tags=["preprocess"])


class SampleRandomReq(BaseModel):
    data: list[Any]
    n: int
    seed: Optional[int] = None


class SampleWeightedReq(BaseModel):
    data: list[Any]
    weights: list[float]
    n: int
    seed: Optional[int] = None


class SampleStratifiedReq(BaseModel):
    data: list[Any]
    labels: list[Any]
    n: int
    seed: Optional[int] = None


class SplitReq(BaseModel):
    data: list[Any]
    test_size: float = 0.2
    seed: Optional[int] = None


class JoinReq(BaseModel):
    tables: list[list[dict]]
    on: str
    how: str = "inner"


class NormalizeReq(BaseModel):
    data: list[float]
    feature_range: list[float] = [0.0, 1.0]


class StandardizeReq(BaseModel):
    data: list[float]


class ImputeReq(BaseModel):
    data: list[Optional[float]]
    strategy: str = "mean"
    fill_value: Optional[float] = None


class CastReq(BaseModel):
    data: list[Any]
    target_type: str


def _wrap(res: dict, algo_id: str) -> AlgoResponse:
    if "error" in res and res["error"]:
        return AlgoResponse(success=False, algo_id=algo_id, result=None, meta=res.get("meta", {}), error=res["error"])
    return AlgoResponse(success=True, algo_id=algo_id, result=res["result"], meta=res.get("meta", {}))


@router.post("/sample_random", response_model=AlgoResponse)
def sample_random(req: SampleRandomReq):
    import algolib as alg
    return _wrap(alg.sample_random(req.data, req.n, req.seed), "sample_random")


@router.post("/sample_weighted", response_model=AlgoResponse)
def sample_weighted(req: SampleWeightedReq):
    import algolib as alg
    return _wrap(alg.sample_weighted(req.data, req.weights, req.n, req.seed), "sample_weighted")


@router.post("/sample_stratified", response_model=AlgoResponse)
def sample_stratified(req: SampleStratifiedReq):
    import algolib as alg
    return _wrap(alg.sample_stratified(req.data, req.labels, req.n, req.seed), "sample_stratified")


@router.post("/split", response_model=AlgoResponse)
def split(req: SplitReq):
    import algolib as alg
    return _wrap(alg.split(req.data, req.test_size, req.seed), "split")


@router.post("/join", response_model=AlgoResponse)
def join(req: JoinReq):
    import algolib as alg
    return _wrap(alg.join(req.tables, req.on, req.how), "join")


@router.post("/normalize", response_model=AlgoResponse)
def normalize(req: NormalizeReq):
    import algolib as alg
    return _wrap(alg.normalize(req.data, tuple(req.feature_range)), "normalize")


@router.post("/standardize", response_model=AlgoResponse)
def standardize(req: StandardizeReq):
    import algolib as alg
    return _wrap(alg.standardize(req.data), "standardize")


@router.post("/impute", response_model=AlgoResponse)
def impute(req: ImputeReq):
    import algolib as alg
    return _wrap(alg.impute(req.data, req.strategy, req.fill_value), "impute")


@router.post("/cast", response_model=AlgoResponse)
def cast(req: CastReq):
    import algolib as alg
    return _wrap(alg.cast(req.data, req.target_type), "cast")
