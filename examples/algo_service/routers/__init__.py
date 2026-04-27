from algo_service.routers.preprocess import router as preprocess_router
from algo_service.routers.statistics import router as statistics_router
from algo_service.routers.ml import router as ml_router
from algo_service.routers.timeseries import router as timeseries_router
from algo_service.routers.signal_proc import router as signal_proc_router

__all__ = [
    "preprocess_router",
    "statistics_router",
    "ml_router",
    "timeseries_router",
    "signal_proc_router",
]
