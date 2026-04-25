"""
algo_service.routers.signal_proc — 信号处理路由
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from algo_service.models.schemas import AlgoResponse

router = APIRouter(prefix="/signal_proc", tags=["signal_proc"])


def _wrap(res: dict, algo_id: str) -> AlgoResponse:
    if "error" in res and res["error"]:
        return AlgoResponse(success=False, algo_id=algo_id, result=None, meta=res.get("meta", {}), error=res["error"])
    return AlgoResponse(success=True, algo_id=algo_id, result=res["result"], meta=res.get("meta", {}))


class FFTReq(BaseModel):
    signal: list[float]
    fs: float = 1.0
    n_fft: Optional[int] = None


class DFTReq(BaseModel):
    signal: list[float]
    normalize: bool = False


class DCTReq(BaseModel):
    signal: list[float]
    dct_type: int = 2
    norm: Optional[str] = "ortho"


class WaveletReq(BaseModel):
    signal: list[float]
    wavelet_name: str = "db4"
    level: int = 3


class ConvReq(BaseModel):
    signal: list[float]
    kernel: list[float]
    mode: str = "full"


class AdaptiveReq(BaseModel):
    desired: list[float]
    input_signal: list[float]
    mu: float = 0.01
    filter_order: int = 4


class FilterReq(BaseModel):
    signal: list[float]
    cutoff: float
    fs: float
    order: int = 5


class BandFilterReq(BaseModel):
    signal: list[float]
    lowcut: float
    highcut: float
    fs: float
    order: int = 5


@router.post("/fft", response_model=AlgoResponse)
def fft(req: FFTReq):
    import algolib as alg
    return _wrap(alg.fft(req.signal, req.fs, req.n_fft), "fft")


@router.post("/dft", response_model=AlgoResponse)
def dft(req: DFTReq):
    import algolib as alg
    return _wrap(alg.dft(req.signal, req.normalize), "dft")


@router.post("/dct", response_model=AlgoResponse)
def dct(req: DCTReq):
    import algolib as alg
    return _wrap(alg.dct(req.signal, req.dct_type, req.norm), "dct")


@router.post("/wavelet", response_model=AlgoResponse)
def wavelet(req: WaveletReq):
    import algolib as alg
    return _wrap(alg.wavelet(req.signal, req.wavelet_name, req.level), "wavelet")


@router.post("/conv", response_model=AlgoResponse)
def conv(req: ConvReq):
    import algolib as alg
    return _wrap(alg.conv(req.signal, req.kernel, req.mode), "conv")


@router.post("/adaptive", response_model=AlgoResponse)
def adaptive(req: AdaptiveReq):
    import algolib as alg
    return _wrap(alg.adaptive(req.desired, req.input_signal, req.mu, req.filter_order), "adaptive")


@router.post("/lowpass", response_model=AlgoResponse)
def lowpass(req: FilterReq):
    import algolib as alg
    return _wrap(alg.lowpass(req.signal, req.cutoff, req.fs, req.order), "lowpass")


@router.post("/highpass", response_model=AlgoResponse)
def highpass(req: FilterReq):
    import algolib as alg
    return _wrap(alg.highpass(req.signal, req.cutoff, req.fs, req.order), "highpass")


@router.post("/bandpass", response_model=AlgoResponse)
def bandpass(req: BandFilterReq):
    import algolib as alg
    return _wrap(alg.bandpass(req.signal, req.lowcut, req.highcut, req.fs, req.order), "bandpass")


@router.post("/bandstop", response_model=AlgoResponse)
def bandstop(req: BandFilterReq):
    import algolib as alg
    return _wrap(alg.bandstop(req.signal, req.lowcut, req.highcut, req.fs, req.order), "bandstop")
