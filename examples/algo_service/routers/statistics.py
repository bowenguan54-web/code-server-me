"""
algo_service.routers.statistics — 统计分析路由
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Optional

from algo_service.models.schemas import AlgoResponse

router = APIRouter(prefix="/statistics", tags=["statistics"])


def _wrap(res: dict, algo_id: str) -> AlgoResponse:
    if "error" in res and res["error"]:
        return AlgoResponse(success=False, algo_id=algo_id, result=None, meta=res.get("meta", {}), error=res["error"])
    return AlgoResponse(success=True, algo_id=algo_id, result=res["result"], meta=res.get("meta", {}))


class ListReq(BaseModel):
    data: list[float]


class TwoListReq(BaseModel):
    x: list[float]
    y: list[float]


class MatrixReq(BaseModel):
    matrix: list[list[float]]
    method: str = "pearson"


class BoxplotReq(BaseModel):
    data: list[float]


class PercReq(BaseModel):
    data: list[float]
    q: list[float] = [25.0, 50.0, 75.0]


class OutlierReq(BaseModel):
    data: list[float]
    method: str = "zscore"
    threshold: float = 3.0


class AnovaReq(BaseModel):
    groups: list[list[float]]


class ChisqReq(BaseModel):
    observed: list[float]
    expected: Optional[list[float]] = None


class AHPReq(BaseModel):
    matrix: list[list[float]]


class EntropyReq(BaseModel):
    data: list[float]
    base: Optional[float] = None


class YOYReq(BaseModel):
    current: list[float]
    previous: list[float]


@router.post("/describe", response_model=AlgoResponse)
def describe(req: ListReq):
    import algolib as alg
    return _wrap(alg.describe(req.data), "describe")


@router.post("/dist", response_model=AlgoResponse)
def dist(req: ListReq):
    import algolib as alg
    return _wrap(alg.dist(req.data), "dist")


@router.post("/corr", response_model=AlgoResponse)
def corr(req: MatrixReq):
    import algolib as alg
    return _wrap(alg.corr(req.matrix, req.method), "corr")


@router.post("/pearson", response_model=AlgoResponse)
def pearson(req: TwoListReq):
    import algolib as alg
    return _wrap(alg.pearson(req.x, req.y), "pearson")


@router.post("/cov", response_model=AlgoResponse)
def cov(req: MatrixReq):
    import algolib as alg
    return _wrap(alg.cov(req.matrix), "cov")


@router.post("/boxplot", response_model=AlgoResponse)
def boxplot(req: BoxplotReq):
    import algolib as alg
    return _wrap(alg.boxplot(req.data), "boxplot")


@router.post("/percentile", response_model=AlgoResponse)
def percentile(req: PercReq):
    import algolib as alg
    return _wrap(alg.percentile(req.data, req.q), "percentile")


@router.post("/outlier", response_model=AlgoResponse)
def outlier(req: OutlierReq):
    import algolib as alg
    return _wrap(alg.outlier(req.data, req.method, req.threshold), "outlier")


@router.post("/anova", response_model=AlgoResponse)
def anova(req: AnovaReq):
    import algolib as alg
    return _wrap(alg.anova(req.groups), "anova")


@router.post("/chisq", response_model=AlgoResponse)
def chisq(req: ChisqReq):
    import algolib as alg
    return _wrap(alg.chisq(req.observed, req.expected), "chisq")


@router.post("/normtest", response_model=AlgoResponse)
def normtest(req: ListReq):
    import algolib as alg
    return _wrap(alg.normtest(req.data), "normtest")


@router.post("/ahp", response_model=AlgoResponse)
def ahp(req: AHPReq):
    import algolib as alg
    return _wrap(alg.ahp(req.matrix), "ahp")


@router.post("/entropy", response_model=AlgoResponse)
def entropy(req: EntropyReq):
    import algolib as alg
    return _wrap(alg.entropy(req.data, req.base), "entropy")


@router.post("/yoy", response_model=AlgoResponse)
def yoy(req: YOYReq):
    import algolib as alg
    return _wrap(alg.yoy(req.current, req.previous), "yoy")
