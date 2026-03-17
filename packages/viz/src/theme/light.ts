/**
 * Light theme for ECharts — Meridian default.
 * Designed for white/light backgrounds with good contrast.
 */

import { DEFAULT_PALETTE } from '../utils/color-palette.js';

export const lightTheme = {
  color: [...DEFAULT_PALETTE],

  backgroundColor: 'transparent',

  textStyle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 12,
    color: '#374151',
  },

  title: {
    textStyle: {
      fontSize: 16,
      fontWeight: 600,
      color: '#111827',
    },
    subtextStyle: {
      fontSize: 12,
      color: '#6B7280',
    },
    top: 0,
    left: 0,
  },

  legend: {
    textStyle: {
      color: '#4B5563',
      fontSize: 12,
    },
    pageTextStyle: {
      color: '#6B7280',
    },
    itemGap: 12,
    itemWidth: 14,
    itemHeight: 10,
  },

  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    textStyle: {
      color: '#374151',
      fontSize: 12,
    },
    extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); border-radius: 6px;',
  },

  grid: {
    left: 12,
    right: 12,
    top: 40,
    bottom: 12,
    containLabel: true,
  },

  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#D1D5DB',
      },
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: '#6B7280',
      fontSize: 11,
    },
    splitLine: {
      show: false,
    },
  },

  valueAxis: {
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: '#6B7280',
      fontSize: 11,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: '#F3F4F6',
        type: 'dashed' as const,
      },
    },
  },

  line: {
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: {
      width: 2,
    },
    emphasis: {
      lineStyle: {
        width: 3,
      },
    },
  },

  bar: {
    barMaxWidth: 40,
    itemStyle: {
      borderRadius: [2, 2, 0, 0],
    },
  },

  pie: {
    itemStyle: {
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    label: {
      color: '#374151',
    },
  },

  scatter: {
    symbolSize: 8,
  },

  gauge: {
    axisLine: {
      lineStyle: {
        color: [
          [0.3, '#EE6666'],
          [0.7, '#FAC858'],
          [1, '#91CC75'],
        ],
      },
    },
    axisTick: {
      lineStyle: {
        color: '#D1D5DB',
      },
    },
    axisLabel: {
      color: '#6B7280',
    },
    pointer: {
      itemStyle: {
        color: '#5470C6',
      },
    },
    detail: {
      color: '#111827',
    },
  },

  funnel: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#FFFFFF',
    },
    label: {
      color: '#374151',
    },
  },

  treemap: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#FFFFFF',
      gapWidth: 1,
    },
    label: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 500,
    },
    upperLabel: {
      color: '#374151',
      fontSize: 11,
    },
  },

  heatmap: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#FFFFFF',
    },
  },

  map: {
    itemStyle: {
      areaColor: '#F3F4F6',
      borderColor: '#D1D5DB',
    },
    emphasis: {
      itemStyle: {
        areaColor: '#93C5FD',
      },
    },
  },
} as const;
