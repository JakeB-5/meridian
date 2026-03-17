/**
 * AreaChart — Line chart with gradient fill.
 *
 * Extends the LineChart component by forcing area fill and smooth curves.
 * Delegates all rendering to LineChart with overridden config.
 */

import { useMemo } from 'react';
import type { ChartProps } from '../types.js';
import { LineChart } from './line-chart.js';
import { defaultRegistry } from '../chart-registry.js';

export function AreaChart(props: ChartProps): JSX.Element {
  // Override config to always enable area fill
  const areaConfig = useMemo(() => ({
    ...props.config,
    options: {
      ...props.config.options,
      area: true,
      smooth: props.config.options?.smooth !== false, // smooth by default for area
    },
  }), [props.config]);

  return <LineChart {...props} config={areaConfig} />;
}

defaultRegistry.register('area', AreaChart, 'Area Chart');
