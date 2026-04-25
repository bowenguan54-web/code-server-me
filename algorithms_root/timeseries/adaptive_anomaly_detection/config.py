"""Configuration objects for adaptive time-series anomaly detection."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DetectionConfig:
    """Runtime parameters for the adaptive detector.

    Attributes:
        window_size: Number of historical points used for the rolling baseline.
        sigma: Standard deviation multiplier used to build the anomaly threshold.
        min_std: Lower bound for standard deviation to avoid unstable thresholds.
    """

    window_size: int = 12
    sigma: float = 3.0
    min_std: float = 1e-6


DEFAULT_CONFIG = DetectionConfig()
