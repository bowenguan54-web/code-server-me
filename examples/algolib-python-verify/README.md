# AlgoLib Python Verify

这个小项目专门用于验证 AlgoLib 的“编辑器即插即用”能力，重点检查 3 件事：

1. 在 Python 编辑器里输入 `alg.` 是否能触发补全
2. 命令面板里的“插入算法组件”是否能把代码插进当前文件
3. 插入后缺失的 `import` 是否会自动补到文件顶部

## 目录

- `playground.py`
  用来实际触发 `alg.` 补全和命令面板插入
- `data/sample.csv`
  演示用样本数据
- `requirements.txt`
  最小依赖

## 推荐验证步骤

1. 进入项目目录

```bash
cd examples/algolib-python-verify
```

2. 创建虚拟环境并安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. 用 `code-server` 打开 `playground.py`

4. 按下面顺序测试

- 测试 A：把光标放到 `SECTION A` 的 `pass` 那一行，删除 `pass`，输入 `alg.`
- 测试 B：继续输入 `normalize`，确认能筛出 `MinMax 归一化`、`Z-Score 标准化`
- 测试 C：在 `SECTION B` 里按 `Ctrl+Alt+I`，搜索并插入 `随机采样`
- 测试 D：确认文件顶部自动新增了缺失 import
- 测试 E：保存后运行 `python playground.py`

## 推荐先测的算法

- `alg.normalize.minmax`
- `alg.sample.random`
- `alg.stats.describe`

## 你应该看到的结果

- 补全列表能显示算法名称、分类、版本说明
- 选中后代码以 Snippet 形式插入，Tab 可以在占位符之间跳转
- 新增 import 会自动插到文件顶部
- `playground.py` 在你完成插入并把变量名对齐后可以直接运行

## 一个最顺手的验证方式

建议先在 `SECTION A` 插入 `alg.normalize.minmax`：

- 默认占位符里的 `df` 和 `columns` 在文件里已经准备好了
- 插入后通常只需要直接运行就能看到归一化结果

然后在 `SECTION B` 再插入 `alg.sample.random`，验证第二次插入不会把相同 import 重复加很多遍。
