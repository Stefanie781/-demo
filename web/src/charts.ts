import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { PALETTE } from './components';
import type { Trend, TrendPoint } from './types';
import { compact, money, signed } from './utils';

const tooltipBase = {
  backgroundColor: 'rgba(18, 25, 44, 0.96)',
  borderColor: 'rgba(120, 145, 200, 0.3)',
  borderWidth: 1,
  textStyle: { color: '#e8edf7', fontSize: 12 },
  extraCssText: 'box-shadow: 0 12px 30px rgba(0,0,0,.35); border-radius: 10px;'
};
const axisLine = { lineStyle: { color: 'rgba(148,170,214,.18)' } };
const axisLabel = { color: '#8b9bbd', fontSize: 11 };
const splitLine = { lineStyle: { color: 'rgba(148,170,214,.09)', type: 'dashed' as const } };
const base = { backgroundColor: 'transparent', textStyle: { color: '#9aa9c7' }, animationDuration: 480 };

export function netWorthOption(points: TrendPoint[]): EChartsOption {
  return {
    ...base,
    grid: { left: 66, right: 22, top: 24, bottom: 34 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params;
        const point = points[first?.dataIndex ?? 0];
        if (!point) return '';
        return `<b>${point.date}</b><br/>净资产　${money(point.net_assets)}<br/>总资产　${money(point.total_assets)}<br/>日变化　${signed(point.delta)}${point.estimated ? '<br/><span style="color:#f5b955">含结转估算数据</span>' : ''}`;
      }
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: points.map((p) => p.date),
      axisLine, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: string) => value.slice(5) }
    },
    yAxis: {
      type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: number) => compact(value) }, splitLine
    },
    series: [{
      name: '净资产', type: 'line', smooth: 0.32, showSymbol: false, symbol: 'circle', symbolSize: 7,
      data: points.map((p) => p.net_assets),
      lineStyle: { color: '#5b8cff', width: 2.6 },
      itemStyle: { color: '#5b8cff' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(91,140,255,.38)' },
          { offset: 1, color: 'rgba(91,140,255,0)' }
        ])
      }
    }],
    dataZoom: points.length > 70
      ? [{ type: 'inside', start: Math.max(0, 100 - (70 / points.length) * 100), end: 100 }]
      : undefined
  };
}

export function compositionOption(trend: Trend): EChartsOption {
  const dates = trend.points.map((p) => p.date);
  return {
    ...base,
    grid: { left: 66, right: 22, top: 30, bottom: 54 },
    legend: { bottom: 0, textStyle: { color: '#8b9bbd', fontSize: 11 }, itemWidth: 12, itemHeight: 8, type: 'scroll' },
    tooltip: {
      ...tooltipBase, trigger: 'axis',
      valueFormatter: (value: any) => money(Number(value))
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: dates, axisLine, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: string) => value.slice(5) }
    },
    yAxis: {
      type: 'value', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: number) => compact(value) }, splitLine
    },
    series: trend.series.map((item, index) => ({
      name: item.name, type: 'line', stack: 'total', smooth: 0.25, showSymbol: false,
      data: item.data, lineStyle: { width: 1, color: PALETTE[index % PALETTE.length] },
      itemStyle: { color: PALETTE[index % PALETTE.length] },
      areaStyle: { color: PALETTE[index % PALETTE.length], opacity: 0.28 },
      emphasis: { focus: 'series' }
    }))
  };
}

export function deltaOption(points: TrendPoint[]): EChartsOption {
  return {
    ...base,
    grid: { left: 66, right: 22, top: 22, bottom: 30 },
    tooltip: {
      ...tooltipBase, trigger: 'axis',
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params;
        const point = points[first?.dataIndex ?? 0];
        if (!point) return '';
        return `<b>${point.date}</b><br/>净资产变化　${signed(point.delta)}<br/>资金变动　${signed(point.balanceDelta)}<br/>市值变动　${signed(point.marketDelta)}<br/>负债变动　${signed(point.liabilityDelta)}`;
      }
    },
    xAxis: {
      type: 'category', data: points.map((p) => p.date), axisLine, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: string) => value.slice(5) }
    },
    yAxis: {
      type: 'value', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (value: number) => compact(value) }, splitLine
    },
    series: [{
      type: 'bar', barMaxWidth: 22,
      data: points.map((p) => ({
        value: p.delta,
        itemStyle: { color: p.delta >= 0 ? '#2dd4a7' : '#ff6b78', borderRadius: p.delta >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] }
      }))
    }]
  };
}

export function pieOption(items: Array<{ name: string; value: number }>): EChartsOption {
  return {
    ...base,
    color: PALETTE,
    tooltip: {
      ...tooltipBase, trigger: 'item',
      formatter: (params: any) => `${params.marker} ${params.name}<br/><b>${money(params.value)}</b>　${params.percent}%`
    },
    legend: { bottom: 0, textStyle: { color: '#8b9bbd', fontSize: 11 }, itemWidth: 11, itemHeight: 8, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['52%', '76%'], center: ['50%', '44%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#121b2f', borderWidth: 3, borderRadius: 6 },
      label: { show: false },
      labelLine: { show: false },
      data: items.filter((item) => item.value > 0)
    }]
  };
}
