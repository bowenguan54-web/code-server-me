"""
algo_service.routers.ml — 机器学习路由
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Optional

from algo_service.models.schemas import AlgoResponse

router = APIRouter(prefix="/ml", tags=["ml"])


def _wrap(res: dict, algo_id: str) -> AlgoResponse:
    if "error" in res and res["error"]:
        return AlgoResponse(success=False, algo_id=algo_id, result=None, meta=res.get("meta", {}), error=res["error"])
    return AlgoResponse(success=True, algo_id=algo_id, result=res["result"], meta=res.get("meta", {}))


class SupervisedReq(BaseModel):
    X_train: list[list[float]]
    y_train: list[Any]
    X_test: Optional[list[list[float]]] = None


class SVMReq(SupervisedReq):
    kernel: str = "rbf"
    C: float = 1.0


class KNNReq(SupervisedReq):
    k: int = 5


class DTreeReq(SupervisedReq):
    max_depth: Optional[int] = None
    seed: Optional[int] = None


class NBReq(SupervisedReq):
    var_smoothing: float = 1e-9


class RFReq(SupervisedReq):
    n_estimators: int = 100
    max_depth: Optional[int] = None
    seed: Optional[int] = None


class LogisticReq(SupervisedReq):
    C: float = 1.0
    max_iter: int = 200
    seed: Optional[int] = None


class LinearReq(SupervisedReq):
    pass


class KMeansReq(BaseModel):
    X: list[list[float]]
    k: int = 3
    seed: Optional[int] = None


class GMMReq(BaseModel):
    X: list[list[float]]
    k: int = 3
    seed: Optional[int] = None


class RLReq(BaseModel):
    n_states: int = 10
    n_actions: int = 4
    episodes: int = 100
    gamma: float = 0.99
    alpha: float = 0.1
    epsilon: float = 0.1
    seed: Optional[int] = None


class XGBReq(SupervisedReq):
    n_estimators: int = 100
    max_depth: int = 3
    learning_rate: float = 0.1
    seed: Optional[int] = None


class LGBMReq(SupervisedReq):
    n_estimators: int = 100
    max_depth: int = -1
    learning_rate: float = 0.1
    seed: Optional[int] = None


@router.post("/svm", response_model=AlgoResponse)
def svm(req: SVMReq):
    import algolib as alg
    return _wrap(alg.svm(req.X_train, req.y_train, req.X_test, req.kernel, req.C), "svm")


@router.post("/knn", response_model=AlgoResponse)
def knn(req: KNNReq):
    import algolib as alg
    return _wrap(alg.knn(req.X_train, req.y_train, req.X_test, req.k), "knn")


@router.post("/dtree", response_model=AlgoResponse)
def dtree(req: DTreeReq):
    import algolib as alg
    return _wrap(alg.dtree(req.X_train, req.y_train, req.X_test, req.max_depth, req.seed), "dtree")


@router.post("/naive_bayes", response_model=AlgoResponse)
def naive_bayes(req: NBReq):
    import algolib as alg
    return _wrap(alg.naive_bayes(req.X_train, req.y_train, req.X_test, req.var_smoothing), "naive_bayes")


@router.post("/random_forest", response_model=AlgoResponse)
def random_forest(req: RFReq):
    import algolib as alg
    return _wrap(alg.random_forest(req.X_train, req.y_train, req.X_test, req.n_estimators, req.max_depth, req.seed), "random_forest")


@router.post("/logistic", response_model=AlgoResponse)
def logistic(req: LogisticReq):
    import algolib as alg
    return _wrap(alg.logistic(req.X_train, req.y_train, req.X_test, req.C, req.max_iter, req.seed), "logistic")


@router.post("/linear", response_model=AlgoResponse)
def linear(req: LinearReq):
    import algolib as alg
    return _wrap(alg.linear(req.X_train, req.y_train, req.X_test), "linear")


@router.post("/kmeans", response_model=AlgoResponse)
def kmeans(req: KMeansReq):
    import algolib as alg
    return _wrap(alg.kmeans(req.X, req.k, req.seed), "kmeans")


@router.post("/gmm", response_model=AlgoResponse)
def gmm(req: GMMReq):
    import algolib as alg
    return _wrap(alg.gmm(req.X, req.k, req.seed), "gmm")


@router.post("/rl", response_model=AlgoResponse)
def rl(req: RLReq):
    import algolib as alg
    return _wrap(
        alg.rl(req.n_states, req.n_actions, req.episodes, req.gamma, req.alpha, req.epsilon, req.seed),
        "rl",
    )


@router.post("/xgboost", response_model=AlgoResponse)
def xgboost_route(req: XGBReq):
    import algolib as alg
    return _wrap(alg.xgboost(req.X_train, req.y_train, req.X_test, req.n_estimators, req.max_depth, req.learning_rate, req.seed), "xgboost")


@router.post("/lgbm", response_model=AlgoResponse)
def lgbm_route(req: LGBMReq):
    import algolib as alg
    return _wrap(alg.lgbm(req.X_train, req.y_train, req.X_test, req.n_estimators, req.max_depth, req.learning_rate, req.seed), "lgbm")
