import { CircleCheck, Globe, Star, Zap } from 'lucide-react-native';
import { useState } from 'react';

import { Badge } from '@/components/Badge';
import { Chip } from '@/components/Chip';
import { FilterChips, type FilterChipItem } from '@/components/FilterChips';
import { ScrollTabs, type ScrollTabItem } from '@/components/ScrollTabs';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { space, TONES } from '@/design/tokens';

import { Caption, Demo, Wrap } from '../kitLayout';

type Status = 'all' | 'action' | 'onboarding' | 'live' | 'paused' | 'cancelled';
const STATUS_CHIPS: readonly FilterChipItem<Status>[] = [
  { value: 'all', label: 'All', count: 48 },
  { value: 'action', label: 'Needs action', count: 3 },
  { value: 'onboarding', label: 'Onboarding', count: 7 },
  { value: 'live', label: 'Live', count: 34 },
  { value: 'paused', label: 'Paused', count: 2 },
  { value: 'cancelled', label: 'Cancelled', count: 2, disabled: true },
];

type Source = 'google' | 'instagram' | 'facebook' | 'email' | 'referral';
const SOURCE_CHIPS: readonly FilterChipItem<Source>[] = [
  { value: 'google', label: 'Google', icon: Globe },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'email', label: 'Email' },
  { value: 'referral', label: 'Referral' },
];

type Range = '7d' | '30d' | '90d';
const RANGES: readonly SegmentItem<Range>[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

type Kind = 'clients' | 'leads';
const KINDS: readonly SegmentItem<Kind>[] = [
  { value: 'clients', label: 'Clients', count: 48 },
  { value: 'leads', label: 'Leads', count: 12 },
];

type Tab = 'overview' | 'onboarding' | 'billing' | 'access' | 'calls' | 'notes' | 'activity';
const TABS: readonly ScrollTabItem<Tab>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'onboarding', label: 'Onboarding', count: 4 },
  { value: 'billing', label: 'Billing' },
  { value: 'access', label: 'Access' },
  { value: 'calls', label: 'Calls', count: 2 },
  { value: 'notes', label: 'Notes' },
  { value: 'activity', label: 'Activity' },
];

export function BadgesDemos() {
  const [status, setStatus] = useState<Status | null>('all');
  const [optional, setOptional] = useState<Status | null>(null);
  const [sources, setSources] = useState<Source[]>(['google', 'email']);
  const [range, setRange] = useState<Range>('30d');
  const [kind, setKind] = useState<Kind>('clients');
  const [tab, setTab] = useState<Tab>('overview');
  const [chipOn, setChipOn] = useState(true);

  return (
    <>
      <Demo title="Badges" note="Every tone, always with a word. sm for rows, md for detail headers.">
        <Wrap>
          {TONES.map((tone) => (
            <Badge key={tone} label={tone.charAt(0).toUpperCase() + tone.slice(1)} tone={tone} />
          ))}
        </Wrap>
        <Wrap>
          <Badge label="Paid" tone="ok" dot />
          <Badge label="Overdue" tone="signal" dot />
          <Badge label="Trialing" tone="warn" dot />
          <Badge label="Test" tone="muted" />
        </Wrap>
        <Wrap>
          <Badge label="Live" tone="ok" icon={CircleCheck} size="md" />
          <Badge label="Owner" tone="gold" icon={Star} size="md" />
          <Badge label="Blocked" tone="signal" size="md" dot />
          <Badge label="Manager" size="md" />
        </Wrap>
      </Demo>

      <Demo title="Chip" note="Off, on, with a count, with an icon, disabled.">
        <Wrap>
          <Chip label="Unread" selected={false} onPress={() => undefined} />
          <Chip label="Needs action" count={3} selected={chipOn} onPress={() => setChipOn((v) => !v)} />
          <Chip label="Ads" icon={Zap} selected />
          <Chip label="Archived" disabled />
        </Wrap>
      </Demo>

      <Demo title="Filter chips, single select" note="One is always on, like a tab. Runs edge to edge and scrolls.">
        <FilterChips items={STATUS_CHIPS} value={status} onChange={setStatus} accessibilityLabel="Status" />
        <Caption>{`Selected: ${status ?? 'none'}`}</Caption>
        <FilterChips items={STATUS_CHIPS.slice(1, 4)} value={optional} onChange={setOptional} allowDeselect accessibilityLabel="Optional status" />
        <Caption>{`allowDeselect: tap the selected chip to clear (${optional ?? 'none'})`}</Caption>
      </Demo>

      <Demo title="Filter chips, multi select" note="Any number on.">
        <FilterChips<Source> multiple items={SOURCE_CHIPS} value={sources} onChange={setSources} accessibilityLabel="Sources" />
        <Caption>{sources.length ? `Selected: ${sources.join(', ')}` : 'Selected: none'}</Caption>
      </Demo>

      <Demo title="Segmented control" note="A pill that slides between equal segments.">
        <SegmentedControl items={RANGES} value={range} onChange={setRange} accessibilityLabel="Range" />
        <SegmentedControl items={KINDS} value={kind} onChange={setKind} accessibilityLabel="Kind" />
      </Demo>

      <Demo title="Scroll tabs" note="Section tabs for long detail screens. Paints its own background so it can stick." padded={false} gap={space[2]}>
        <ScrollTabs items={TABS} active={tab} onChange={setTab} bleed={false} accessibilityLabel="Client sections" />
      </Demo>
    </>
  );
}
