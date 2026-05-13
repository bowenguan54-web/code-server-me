from __future__ import annotations
from algo_service.sdk.decorators import algo_meta

_COLORS = ["#1e90ff", "#00f0c8", "#f5a623", "#ff4d6a", "#a855f7", "#00c48c"]

_DEFAULT_MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月"]
_DEFAULT_SERIES = [
    {"name": "产品A", "data": [120, 200, 150, 80, 270, 310]},
    {"name": "产品B", "data": [90, 160, 180, 120, 220, 280]},
]


@algo_meta(
    zh_name="销售趋势图",
    zh_description="根据月度销售数据生成 ECharts 折线图，支持多系列对比",
    zh_tags=["可视化", "图表", "趋势分析"],
    version="1.0.0",
    input_example='{"months":["1月","2月","3月","4月","5月","6月"],"series":[{"name":"产品A","data":[120,200,150,80,270,310]},{"name":"产品B","data":[90,160,180,120,220,280]}],"chart_type":"line","smooth":true,"title":"上半年销售对比"}',
)
def sales_trend_chart(
    months: list = None,
    series: list = None,
    chart_type: str = "line",
    smooth: bool = True,
    title: str = "销售趋势分析",
) -> dict:
    """根据月度销售数据生成 ECharts 图表。

    测试时输入以下参数：
    {
        "months": ["1月","2月","3月","4月","5月","6月"],
        "series": [
            {"name":"产品A","data":[120,200,150,80,270,310]},
            {"name":"产品B","data":[90,160,180,120,220,280]}
        ],
        "chart_type": "line",
        "smooth": true,
        "title": "上半年销售对比"
    }

    Args:
        months: 月份标签列表，不传则使用内置示例数据
        series: 数据系列，每项含 name 和 data，不传则使用内置示例数据
        chart_type: 图表类型 line / bar / area
        smooth: 折线是否平滑（仅 line / area 有效）
        title: 图表标题
    """
    if months is None:
        months = _DEFAULT_MONTHS
    if series is None:
        series = _DEFAULT_SERIES

    echarts_series = []
    for i, s in enumerate(series):
        color = _COLORS[i % len(_COLORS)]
        s_type = "line" if chart_type in ("line", "area") else "bar"
        item: dict = {
            "name": s.get("name", f"系列{i + 1}"),
            "type": s_type,
            "data": s.get("data", []),
            "smooth": smooth if s_type == "line" else False,
            "itemStyle": {"color": color},
            "lineStyle": {"color": color, "width": 2},
            "symbol": "circle",
            "symbolSize": 6,
        }
        if chart_type == "area":
            item["areaStyle"] = {"opacity": 0.15, "color": color}
        echarts_series.append(item)

    option = {
        "title": {
            "text": title,
            "left": "center",
            "textStyle": {"color": "#c8d8f0", "fontSize": 14},
        },
        "tooltip": {"trigger": "axis"},
        "legend": {
            "top": 30,
            "textStyle": {"color": "#c8d8f0"},
        },
        "grid": {"left": "3%", "right": "4%", "bottom": "3%", "containLabel": True},
        "xAxis": {
            "type": "category",
            "data": months,
            "axisLabel": {"color": "#6a8ab0"},
            "axisLine": {"lineStyle": {"color": "#1e3a5f"}},
        },
        "yAxis": {
            "type": "value",
            "axisLabel": {"color": "#6a8ab0"},
            "splitLine": {"lineStyle": {"color": "#0d2340"}},
        },
        "series": echarts_series,
    }

    return {
        "__output_type__": "chart",
        "title": title,
        "option": option,
    }
