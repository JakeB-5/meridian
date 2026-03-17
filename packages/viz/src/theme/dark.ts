/**
 * Dark theme for ECharts — Meridian dark mode.
 * Designed for dark backgrounds with good contrast and readability.
 */

import { DEFAULT_PALETTE } from '../utils/color-palette.js';

// Slightly brighter palette for dark backgrounds
const darkPalette = [
  '#6B8FE6', // brighter blue
  '#A3D98A', // brighter green
  '#FFD66B', // brighter yellow
  '#FF8080', // brighter red
  '#8DD4EB', // brighter light blue
  '#4EBD8A', // brighter teal
  '#FF9B6B', // brighter orange
  '#B87FCC', // brighter purple
  '#FF9DE0', // brighter pink
  '#5EE8FF', // brighter cyan
];

export const darkTheme = {
  color: darkPalette,

  backgroundColor: 'transparent',

  textStyle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 12,
    color: '#D1D5DB',
  },

  title: {
    textStyle: {
      fontSize: 16,
      fontWeight: 600,
      color: '#F3F4F6',
    },
    subtextStyle: {
      fontSize: 12,
      color: '#9CA3AF',
    },
    top: 0,
    left: 0,
  },

  legend: {
    textStyle: {
      color: '#D1D5DB',
      fontSize: 12,
    },
    pageTextStyle: {
      color: '#9CA3AF',
    },
    itemGap: 12,
    itemWidth: 14,
    itemHeight: 10,
  },

  tooltip: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
    textStyle: {
      color: '#F3F4F6',
      fontSize: 12,
    },
    extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.3); border-radius: 6px;',
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
        color: '#4B5563',
      },
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: '#9CA3AF',
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
      color: '#9CA3AF',
      fontSize: 11,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: '#374151',
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
      borderColor: '#111827',
    },
    label: {
      color: '#D1D5DB',
    },
  },

  scatter: {
    symbolSize: 8,
  },

  gauge: {
    axisLine: {
      lineStyle: {
        color: [
          [0.3, '#FF8080'],
          [0.7, '#FFD66B'],
          [1, '#A3D98A'],
        ],
      },
    },
    axisTick: {
      lineStyle: {
        color: '#4B5563',
      },
    },
    axisLabel: {
      color: '#9CA3AF',
    },
    pointer: {
      itemStyle: {
        color: '#6B8FE6',
      },
    },
    detail: {
      color: '#F3F4F6',
    },
  },

  funnel: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#111827',
    },
    label: {
      color: '#D1D5DB',
    },
  },

  treemap: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#111827',
      gapWidth: 1,
    },
    label: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 500,
    },
    upperLabel: {
      color: '#D1D5DB',
      fontSize: 11,
    },
  },

  heatmap: {
    itemStyle: {
      borderWidth: 1,
      borderColor: '#111827',
    },
  },

  map: {
    itemStyle: {
      areaColor: '#374151',
      borderColor: '#4B5563',
    },
    emphasis: {
      itemStyle: {
        areaColor: '#6B8FE6',
      },
    },
  },
} as const;
