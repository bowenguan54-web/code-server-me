# AlgoService

算法调用服务——在编写代码时直接调用算法库中的内置算法，并支持热加载用户自定义算法。

## 快速启动

```bash
cd examples
pip install -r algo_service/requirements.txt
pip install -e algolib/  # 或将 examples/ 加入 PYTHONPATH
uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload
```

访问 API 文档：<http://localhost:8000/docs>

---

## 目录结构

```
algo_service/
├── main.py                  # FastAPI 应用入口
├── requirements.txt
├── test_api.py              # 快速冒烟测试
├── models/
│   └── schemas.py           # 统一响应模型 AlgoResponse
├── routers/
│   ├── preprocess.py        # 数据预处理
│   ├── statistics.py        # 统计分析
│   ├── ml.py                # 机器学习
│   ├── timeseries.py        # 时序分析
│   └── signal_proc.py       # 信号处理
├── sdk/
│   ├── registry.py          # 算法注册表
│   ├── decorators.py        # @algo_export 装饰器
│   ├── ast_parser.py        # 静态 AST 扫描
│   ├── sse_manager.py       # SSE 广播管理
│   ├── dynamic_router.py    # 动态路由（load/unload/reload）
│   └── file_watcher.py      # Watchdog 文件监控（防抖 300ms）
└── user_algorithms/
    └── example.py           # 自定义算法示例
```

---

## 内置 API 路由

| 前缀 | 模块 | 代表性接口 |
|------|------|-----------|
| `/api/v1/preprocess/` | 数据预处理 | `normalize` `standardize` `impute` `split` |
| `/api/v1/statistics/` | 统计分析 | `describe` `corr` `anova` `outlier` `ahp` |
| `/api/v1/ml/` | 机器学习 | `svm` `knn` `kmeans` `random_forest` `lgbm` |
| `/api/v1/timeseries/` | 时序分析 | `dtw` `ar` `arma` `lstm_pred` `hilbert` |
| `/api/v1/signal_proc/` | 信号处理 | `fft` `dct` `wavelet` `lowpass` `bandpass` |

---

## 统一响应格式

```json
{
  "success": true,
  "algo_id": "kmeans",
  "result": { "labels": [0, 1, 0, 2], "centers": [...] },
  "meta": { "algorithm": "kmeans", "elapsed_ms": 12.3, "k": 3 },
  "error": null
}
```

---

## 自定义算法

在 `user_algorithms/` 目录下创建 `.py` 文件，用 `@algo_export` 装饰函数：

```python
from algo_service.sdk.decorators import algo_export

@algo_export(
    category="custom",
    description="我的归一化",
    version="1.0.0",
)
def my_normalize(data: list, lo=0.0, hi=1.0) -> dict:
    vmin, vmax = min(data), max(data)
    span = vmax - vmin or 1.0
    result = [(x - vmin) / span * (hi - lo) + lo for x in data]
    return {"result": result, "meta": {}}
```

保存文件后，服务会在 **300ms** 内自动检测并加载，并通过 SSE 推送变更事件给编辑器插件。

---

## SSE 事件（供编辑器插件）

```
GET /api/v1/events/algo-changes
Accept: text/event-stream
```

事件格式：
```json
{ "type": "algo_added", "data": { "path": "...", "algorithms": ["my_func"], "count": 1 } }
{ "type": "algo_updated", "data": { "path": "...", "removed": ["old"], "added": ["new"], "count": 1 } }
{ "type": "algo_removed", "data": { "path": "...", "algorithms": ["my_func"], "count": 1 } }
```

---

## 测试

```bash
# 启动服务后运行
python algo_service/test_api.py
```
