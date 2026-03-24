import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import 'echarts-wordcloud'
import { getRewindAnalytics } from '../lib/browserArchiveStore'
import { useI18n } from '../i18n'

export function ActivityTrendChart({ selectedYear = 'all' }: { selectedYear?: number | 'all' }) {
  const analytics = useMemo(() => getRewindAnalytics(selectedYear), [selectedYear])
  const { t } = useI18n()

  if (analytics.totals.conversations === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        {t('charts.noDataTrend')}
      </div>
    )
  }

  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: ['Messages', 'Conversations'],
      textStyle: { color: '#a1a1aa' },
      bottom: 0,
    },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: analytics.monthlyMessageCount.map((entry: any) => entry.label),
      axisLine: { lineStyle: { color: '#555' } },
      axisLabel: { color: '#a1a1aa' },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: '#333', type: 'dashed' as const } },
      axisLabel: { color: '#a1a1aa' },
    },
    series: [
      {
        name: 'Messages',
        type: 'line' as const,
        smooth: true,
        lineStyle: { width: 3, color: '#8b5cf6' },
        areaStyle: { color: 'rgba(139, 92, 246, 0.18)' },
        itemStyle: { color: '#8b5cf6' },
        data: analytics.monthlyMessageCount.map((entry: any) => entry.value),
      },
      {
        name: 'Conversations',
        type: 'line' as const,
        smooth: true,
        lineStyle: { width: 3, color: '#38bdf8' },
        areaStyle: { color: 'rgba(56, 189, 248, 0.14)' },
        itemStyle: { color: '#38bdf8' },
        data: analytics.monthlyConversationCount.map((entry: any) => entry.value),
      }
    ],
  }

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} theme="dark" opts={{ renderer: 'svg' }} />
}

const CLOUD_COLORS = [
  '#ef4444', '#3b82f6', '#eab308', '#10b981', '#8b5cf6',
  '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#a855f7',
  '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#64748b',
]

export function WordCloudChart({ selectedYear = 'all' }: { selectedYear?: number | 'all' }) {
  const analytics = useMemo(() => getRewindAnalytics(selectedYear), [selectedYear])
  const { t } = useI18n()

  if (analytics.totals.conversations === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        {t('charts.noDataCloud')}
      </div>
    )
  }

  if (!analytics.wordCloud.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        {t('charts.notEnoughContent')}
      </div>
    )
  }

  const option = {
    tooltip: {
      show: true,
      formatter: (params: any) => `${params.name}: ${params.value} ${t('charts.occurrences')}`,
    },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center',
      top: 'center',
      width: '90%',
      height: '85%',
      sizeRange: [14, 56],
      rotationRange: [-30, 30],
      rotationStep: 15,
      gridSize: 8,
      drawOutOfBound: false,
      layoutAnimation: true,
      textStyle: {
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 'bold',
        color: () => CLOUD_COLORS[Math.floor(Math.random() * CLOUD_COLORS.length)],
      },
      emphasis: {
        focus: 'self',
        textStyle: {
          textShadowBlur: 10,
          textShadowColor: 'rgba(255, 255, 255, 0.25)',
        },
      },
      data: analytics.wordCloud.map((entry: any) => ({ name: entry.term, value: entry.count })),
    }],
  }

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} opts={{ renderer: 'canvas' }} />
}
