def clean_values(data: list[float]) -> list[float]:
    values = []
    for item in data:
        if item is None:
            continue
        values.append(float(item))
    return values
