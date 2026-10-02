import type { AdsDay, AdsRange } from '@/api/schemas/ads';
import { Card } from '@/components/Card';
import { AreaChart } from '@/components/charts/AreaChart';
import { EmptyState } from '@/components/EmptyState';
import { Section } from '@/components/Section';
import { formatCount } from '@/lib/format';
import { formatCents, formatCentsCompact } from '@/lib/money';

import { dayPoints, RANGE_WORDS } from '../logic';

const NO_DATA = 'No data yet.';

type DayChartsProps = {
  days: readonly AdsDay[];
  range: AdsRange;
  now: Date;
};

/**
 * "Spend per day" (exact money in the scrub tooltip, short money on the axis)
 * and "Visits from ads per day". Days are Toronto dates from the API, shown
 * as text ("Sep 12"); days with no spend are real zeros the server sent.
 */
export function DayCharts({ days, range, now }: DayChartsProps) {
  const currency = days[0]?.spend.currency ?? 'CAD';
  const spend = dayPoints(days, 'spend', now);
  const visits = dayPoints(days, 'visits', now);
  const period = RANGE_WORDS[range];
  return (
    <>
      <Section title="Spend per day">
        <Card>
          {spend.length > 0 ? (
            <AreaChart
              data={spend}
              name="Spend"
              period={period}
              formatValue={(cents) => formatCents(cents, currency)}
              formatAxis={(cents) => formatCentsCompact(cents, currency)}
            />
          ) : (
            <EmptyState message={NO_DATA} compact />
          )}
        </Card>
      </Section>
      <Section title="Visits from ads per day">
        <Card>
          {visits.length > 0 ? (
            <AreaChart data={visits} name="Visits from ads" period={period} formatValue={formatCount} />
          ) : (
            <EmptyState message={NO_DATA} compact />
          )}
        </Card>
      </Section>
    </>
  );
}
