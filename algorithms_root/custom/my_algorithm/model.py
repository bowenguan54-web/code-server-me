def score_values(values: list[float]) -> list[float]:
    if not values:
        return []
    low = min(values)
    high = max(values)
    if low == high:
        return [1.0 for _ in values]
    return [round((value - low) / (high - low), 6) for value in values]
