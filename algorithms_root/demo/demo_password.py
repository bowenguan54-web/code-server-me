import hashlib

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="密码强度检查",
    zh_description="演示密码输入控件。",
    zh_tags=["演示", "安全"],
    version="1.0.0",
    input_example='{"password": "MyP@ssw0rd!"}',
)
def demo_password(password: str) -> dict:
    """检查密码强度并返回哈希值。

    Args:
        password: 要检查的密码。
    """

    length = len(password)
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(not c.isalnum() for c in password)
    score = sum([length >= 8, length >= 12, has_upper, has_lower, has_digit, has_special])
    levels = {0: "极弱", 1: "弱", 2: "弱", 3: "中等", 4: "强", 5: "很强", 6: "极强"}
    return {
        "length": length,
        "strength": levels.get(score, "极强"),
        "score": f"{score}/6",
        "sha256": hashlib.sha256(password.encode()).hexdigest()[:16] + "...",
    }
