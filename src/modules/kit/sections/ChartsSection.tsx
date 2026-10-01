import { useState } from 'react';

import { AreaChart } from '@/components/charts/AreaChart';
import { Donut } from '@/components/charts/Donut';
import { HBars } from '@/components/charts/HBars';
import { formatCents, formatCentsCompact } from '@/lib/money';
import { notice } from '@/lib/notice';

import { Caption, Demo } from '../kitLayout';
import { areaSeries, COUNTRIES, DONUT_SOURCES, TOP_PAGES } from '../sampleData';

export function ChartsDemos() {
  // Built once per visit: today's Toronto date anchors the labels.
  const [visits] = useState(() => areaSeries(30));
  const [revenue] = useState(() => areaSeries(30).map((p, i) => ({ ...p, value: p.value * 100 + (i % 3) * 50 })));

  return (
    <>
      <Demo title="Area chart" note="30 days. Draws in on mount. Swipe sideways (or hold, then drag) to scrub, with a tick per point.">
        <AreaChart data={visits} name="Pageviews" period="last 30 days" />
      </Demo>

      <Demo title="Area chart, money" note="Values in cents: the tooltip shows exact dollars, the axis is compact.">
        <AreaChart data={revenue} height={140} name="Revenue" period="last 30 days" formatValue={(c) => formatCents(c)} formatAxis={(c) => formatCentsCompact(c)} />
      </Demo>

      <Demo title="Donut" note="Nine sources: the top seven, then Other. Tap a slice or a legend row to highlight it.">
        <Donut data={DONUT_SOURCES} name="Traffic sources" />
      </Demo>

      <Demo title="Horizontal bars" note="Ranked as the API sends them. Long paths are cut in the middle.">
        <HBars data={TOP_PAGES} ellipsize="middle" onPressRow={(row) => notice.ok(`Opens ${row.label}.`)} />
      </Demo>

      <Demo title="Horizontal bars, with flags" note="A leading emoji, no tap.">
        <HBars data={COUNTRIES} />
        <Caption>Rows animate their growth on mount.</Caption>
      </Demo>
    </>
  );
}
