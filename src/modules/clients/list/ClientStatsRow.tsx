import { StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { ClientStats } from '@/api/schemas/clients';
import { StatCard } from '@/components/StatCard';
import { layout, space } from '@/design/tokens';

/** What tapping a stat card filters to (only cards with an exact matching filter). */
export type StatFilter = { kind: 'status'; status: 'lead' | 'live' } | { kind: 'view'; view: 'blocked' | 'behind' };

type StatDef = {
  key: keyof ClientStats;
  label: string;
  sub?: string;
  filter?: StatFilter;
  hint?: string;
};

/**
 * Brief 8.5 order and sub lines. Onboarding counts onboarding plus pending,
 * which no single chip matches, so it is the one card that does not filter.
 */
const STATS: readonly StatDef[] = [
  { key: 'leads', label: 'Leads', sub: 'signed up, not paid', filter: { kind: 'status', status: 'lead' }, hint: 'Shows leads' },
  { key: 'onboarding', label: 'Onboarding', sub: 'includes pending' },
  { key: 'live', label: 'Live', filter: { kind: 'status', status: 'live' }, hint: 'Shows live clients' },
  { key: 'blocked', label: 'Blocked', sub: 'waiting on something', filter: { kind: 'view', view: 'blocked' }, hint: 'Shows blocked onboardings' },
  { key: 'behindPace', label: 'Behind pace', sub: 'guarantee running', filter: { kind: 'view', view: 'behind' }, hint: 'Shows clients behind pace' },
];

export type ClientStatsRowProps = {
  /** From the first page; undefined while the list loads. */
  stats: ClientStats | undefined;
  loading: boolean;
  onFilter: (filter: StatFilter) => void;
};

/** The five stat cards, scrolling sideways edge to edge under the section tabs. */
export function ClientStatsRow({ stats, loading, onFilter }: ClientStatsRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Client counts"
    >
      {STATS.map((s) => {
        const filter = s.filter;
        return (
          <StatCard
            key={s.key}
            label={s.label}
            value={stats ? stats[s.key] : null}
            sub={s.sub}
            size="md"
            loading={loading}
            onPress={filter && stats ? () => onFilter(filter) : undefined}
            accessibilityHint={filter ? s.hint : undefined}
            style={styles.card}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: layout.gutter, gap: space[3], alignItems: 'stretch' },
  // Wide enough for "BEHIND PACE" at font scale 1.3.
  card: { width: 172 },
});
