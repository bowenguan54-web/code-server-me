from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "sample.csv"


def load_demo_frame() -> pd.DataFrame:
    frame = pd.read_csv(DATA_FILE)
    frame["created_at"] = pd.to_datetime(frame["created_at"])
    return frame


def print_section(title: str) -> None:
    print(f"\n{'=' * 18} {title} {'=' * 18}")


def main() -> None:
    df = load_demo_frame()
    columns = ["feature_a", "feature_b"]
    series = df["feature_a"]

    print_section("原始数据预览")
    print(df.head())

    print_section("基础上下文")
    print(f"列名: {columns}")
    print(f"样本量: {len(df)}")
    print(f"feature_a 均值: {series.mean():.4f}")

    print_section("SECTION A")
    print("把光标放到 verify_minmax() 里的 pass 上，删除 pass 后输入 alg.")

    def verify_minmax() -> None:
        pass
        alg.d

    verify_minmax()

    print_section("SECTION B")
    print("把光标放到 verify_random_sample() 里的 pass 上，按 Ctrl+Alt+I 测试命令面板插入。")

    def verify_random_sample() -> None:
        pass

    verify_random_sample()

    print_section("SECTION C")
    print("如果你想再测一次，推荐插入 alg.stats.describe。")

    def verify_describe() -> None:
        pass

    verify_describe()

    print_section("结束")
    print("如果你已经插入算法片段，请查看上面的运行结果是否符合预期。")


if __name__ == "__main__":
    main()
