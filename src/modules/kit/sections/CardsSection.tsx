import { Archive, CreditCard, Inbox, MailOpen, Receipt, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Avatar, AVATAR_SIZES, type AvatarSize } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { KeyValue } from '@/components/KeyValue';
import { ListRow } from '@/components/ListRow';
import { MetricRows } from '@/components/MetricRows';
import { ProgressBar } from '@/components/ProgressBar';
import { Section } from '@/components/Section';
import { StageTracker } from '@/components/StageTracker';
import { StatCard } from '@/components/StatCard';
import { Text } from '@/components/Text';
import { Sparkline } from '@/components/charts/Sparkline';
import { space } from '@/design/tokens';
import { formatCents } from '@/lib/money';
import { notice } from '@/lib/notice';

import { Caption, Demo, Labeled, Wrap } from '../kitLayout';
import { METRIC_COLUMNS, METRIC_ROWS, ONBOARDING_STAGES, sampleValue, seeded } from '../sampleData';

const AVATAR_KEYS = Object.keys(AVATAR_SIZES) as AvatarSize[];
const STAGE_KEYS = ONBOARDING_STAGES.map((s) => s.value);

/** One "Randomize" press: new figures for the count-up, progress and stage demos. */
function figures(seed: number) {
  return {
    revenue: seeded(seed, 120_000, 2_400_000),
    leads: seeded(seed + 1, 4, 140),
    visits: seeded(seed + 2, 900, 24_000),
    refunds: seeded(seed + 3, 0, 40_000),
    progress: seeded(seed + 4, 5, 100) / 100,
    stage: STAGE_KEYS[seeded(seed + 5, 0, STAGE_KEYS.length - 1)] ?? 'build',
  };
}

const SPARK = Array.from({ length: 14 }, (_, i) => sampleValue(i));

export function CardsDemos() {
  const [seed, setSeed] = useState(1);
  const f = figures(seed);
  const [archived, setArchived] = useState(0);

  return (
    <>
      <Demo title="Card" note="Surface with a hairline border. Pressable cards scale and tick." bare>
        <Card>
          <Text variant="bodyStrong">A plain card</Text>
          <Text variant="small" color="ink3">
            In dark mode it has a faint highlight along the top edge.
          </Text>
        </Card>
        <Card onPress={() => notice.ok('Card pressed.')} accessibilityLabel="Pressable card" accessibilityHint="Shows a notice">
          <Text variant="bodyStrong">A pressable card</Text>
          <Text variant="small" color="ink3">
            Tap me.
          </Text>
        </Card>
        <Card onPress={() => undefined} disabled accessibilityLabel="Disabled card">
          <Text variant="bodyStrong" color="ink4">
            A disabled pressable card
          </Text>
        </Card>
      </Demo>

      <Demo title="Section" note="Eyebrow, 22sp title, optional View all or a custom right side.">
        <Section eyebrow="This week" title="New leads" action={{ onPress: () => notice.ok('View all pressed.') }} spacing={space[2]}>
          <Text variant="small" color="ink3">
            Section content goes here.
          </Text>
        </Section>
        <Divider />
        <Section title="Invoices" right={<Badge label="3 overdue" tone="signal" />} spacing={0}>
          <Text variant="small" color="ink3">
            With a badge on the right instead of the link.
          </Text>
        </Section>
      </Demo>

      <Demo title="Divider" note="Full width, inset, inset both ends, strong." padded={false} gap={space[4]}>
        <Divider />
        <Divider inset />
        <Divider inset={72} />
        <Divider inset insetEnd />
        <Divider strong />
        <View style={styles.inset}>
          <Caption>full · 16 inset · 72 (after a ListRow icon) · both ends · strong</Caption>
        </View>
      </Demo>

      <Demo title="Stat cards" note="Numbers count up from their previous value. Randomize to see it." bare>
        <Button label="Randomize" variant="secondary" size="sm" onPress={() => setSeed((s) => s + 1)} />
        <StatCard
          label="Revenue this month"
          value={f.revenue}
          format={(c) => formatCents(c)}
          sub="12 paid invoices"
          icon={CreditCard}
          trend={{ direction: 'up', label: 'Up 12%' }}
          size="xl"
          emphasis
        />
        <View style={styles.grid}>
          <StatCard label="New leads" value={f.leads} icon={Inbox} trend={{ direction: 'down', label: 'Down 3' }} size="md" style={styles.cell} />
          <StatCard label="Visits" value={f.visits} trend={{ direction: 'flat', label: 'Flat' }} size="md" style={styles.cell} />
        </View>
        <View style={styles.grid}>
          <StatCard
            label="Refunds"
            value={f.refunds}
            format={(c) => formatCents(c)}
            trend={{ direction: 'down', label: 'Down $40', tone: 'ok' }}
            size="md"
            style={styles.cell}
          />
          <StatCard label="Booked calls" value={null} sub="Failed to load" size="md" style={styles.cell} />
        </View>
        <StatCard label="Active clients" value={0} loading sub="Loading" icon={Users} />
        <Caption>{'Missing figures say "Not available", never 0. Loading shows a skeleton after showAfterMs.'}</Caption>
      </Demo>

      <Demo title="Animated number and sparkline" note="The count-up on its own, and the inline trend line.">
        <AnimatedNumber value={f.revenue} format={(c) => formatCents(c)} variant="kpi" />
        <AnimatedNumber value={f.leads} variant="number" tone="gold" />
        <Sparkline values={SPARK} />
        <Sparkline values={SPARK.slice().reverse()} tone="muted" height={20} />
      </Demo>

      <Demo title="List rows" note="Icon or avatar, title, subtitle, meta, value or badge, chevron. Swipe the last two." padded={false} gap={0}>
        <ListRow
          title="Payment received"
          subtitle="Acme Plumbing · Grow plan"
          meta="2:41 PM"
          icon={Receipt}
          iconTone="ok"
          value="$77.50"
          onPress={() => notice.ok('Row pressed.')}
        />
        <Divider inset={72} />
        <ListRow
          title="Northline Roofing"
          subtitle="Onboarding · Build"
          avatar={{ name: 'Northline Roofing' }}
          badge={{ label: 'Blocked', tone: 'signal' }}
          onPress={() => undefined}
        />
        <Divider inset={72} />
        <ListRow title="New booking" subtitle="Maple Dental Studio booked a call for Tuesday" icon={Inbox} iconTone="gold" unread meta="5m ago" />
        <Divider inset={72} />
        <ListRow
          title="Invoice overdue"
          subtitle="Harbour Physio"
          icon={CreditCard}
          iconTone="signal"
          value="3d late"
          valueTone="signal"
          badge={{ label: 'Overdue', tone: 'signal' }}
        />
        <Divider inset={72} />
        <ListRow title="Disabled row" subtitle="Cannot be opened right now" icon={Archive} iconTone="muted" onPress={() => undefined} disabled />
        <Divider inset={72} />
        <ListRow
          title="Swipe me either way"
          subtitle={archived > 0 ? `Archived ${archived} time(s)` : 'Right to mark read, left to archive'}
          icon={MailOpen}
          background="surface"
          leftAction={{ label: 'Mark read', icon: MailOpen, tone: 'gold', onAction: () => notice.ok('Marked as read.') }}
          rightAction={{ label: 'Archive', icon: Archive, onAction: () => setArchived((n) => n + 1) }}
        />
        <Divider inset={72} />
        <ListRow
          title="Swipe left to trash"
          subtitle="Destructive actions still confirm in a sheet"
          icon={Trash2}
          iconTone="signal"
          background="surface"
          rightAction={{ label: 'Trash', icon: Trash2, tone: 'signal', onAction: () => notice.ok('Trash would open a confirm sheet.') }}
        />
      </Demo>

      <Demo title="Key value" note="Tap to copy, call or email; long press copies. Missing values say Not set." padded={false} gap={space[2]}>
        <KeyValue
          items={[
            { label: 'Plan', value: 'Grow' },
            { label: 'Email', value: 'owner@acmeplumbing.ca', link: 'email' },
            { label: 'Phone', value: '(416) 555-0134', link: 'phone' },
            { label: 'Stripe customer', value: 'cus_Q8f2Lk0aZ', copyable: true, mono: true },
            { label: 'Strategist', value: null },
            { label: 'Status', value: 'Live', render: <Badge label="Live" tone="ok" dot /> },
          ]}
        />
        <Divider strong />
        <KeyValue
          layout="stacked"
          items={[
            { label: 'Portal address', value: 'https://account.tekmadev.com/acme-plumbing', copyable: true },
            { label: 'Notes', value: 'Prefers calls after 3 PM. Wants the gallery page before launch.' },
          ]}
        />
      </Demo>

      <Demo title="Metric rows" note="The phone version of a table: a name and up to three numbers." padded={false}>
        <MetricRows
          titleLabel="Source"
          columns={METRIC_COLUMNS}
          rows={METRIC_ROWS.map((r) => (r.id === 'google' ? { ...r, onPress: () => notice.ok('Opens the source.') } : r))}
        />
      </Demo>

      <Demo title="Avatars" note="Initial on gold tint until the photo loads, and when it fails.">
        <Wrap gap={space[3]} align="flex-end">
          {AVATAR_KEYS.map((size) => (
            <Labeled key={size} label={`${size} ${AVATAR_SIZES[size]}`}>
              <Avatar name="Acme Plumbing" size={size} />
            </Labeled>
          ))}
        </Wrap>
        <Wrap gap={space[3]} align="flex-end">
          <Labeled label="two letters">
            <Avatar name="Acme Plumbing" size="lg" letters={2} />
          </Labeled>
          <Labeled label="broken photo">
            <Avatar name="Harbour Physio" size="lg" uri="https://www.tekmadev.com/does-not-exist.png" />
          </Labeled>
          <Labeled label="no name">
            <Avatar size="lg" />
          </Labeled>
        </Wrap>
      </Demo>

      <Demo title="Progress bar" note="Gold or ok; springs to the value. A missing value is an empty bar.">
        <ProgressBar value={f.progress} label="Onboarding" />
        <ProgressBar value={f.progress} tone="ok" label="Required tasks" />
        <ProgressBar value={0.42} />
        <ProgressBar value={null} label="Not reported" />
      </Demo>

      <Demo title="Stage tracker" note="Done stages filled, the current one pulses softly. Randomize moves it." padded={false}>
        <StageTracker stages={ONBOARDING_STAGES} current={f.stage} percent={Math.round(f.progress * 100)} style={styles.inset} />
        <StageTracker stages={ONBOARDING_STAGES} current={null} style={styles.inset} />
        <View style={styles.inset}>
          <Caption>Second tracker: no current stage, so nothing is marked started.</Caption>
        </View>
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: space[3] },
  cell: { flex: 1 },
  inset: { paddingHorizontal: space[4] },
});
