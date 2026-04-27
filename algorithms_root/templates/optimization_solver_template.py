"""Optimization solver template."""

from __future__ import annotations

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="优化求解模板",
    zh_description="用于开发约束优化、参数寻优和资源分配类算法组件，提供目标函数和约束结构示例。",
    zh_tags=["模板", "优化", "求解器"],
    version="1.0.0",
)
def optimization_solver_template(
    candidates: list[dict],
    score_field: str,
    limit: int = 3,
) -> dict:
    """Return a simple top-k optimization scaffold."""

    if not candidates:
        raise ValueError("candidates must not be empty")
    if not score_field:
        raise ValueError("score_field must not be empty")
    if limit <= 0:
        raise ValueError("limit must be greater than 0")
    ranked = sorted(candidates, key=lambda item: float(item.get(score_field, 0)), reverse=True)
    return {
        "template": "optimization_solver",
        "status": "ready_for_customization",
        "candidate_count": len(candidates),
        "score_field": score_field,
        "limit": limit,
        "selected": ranked[:limit],
        "next_steps": ["Add constraints", "Implement objective function", "Return solver diagnostics"],
    }
