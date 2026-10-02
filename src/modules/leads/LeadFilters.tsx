import { ChevronDown, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { LeadNeed, LeadSource, LeadStatus, LeadsMeta } from '@/api/schemas/leads';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { SearchField } from '@/components/form/SearchField';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

import { needLabel, needOptions, sourceLabel, sourceOptions, statusBadge, statusOptions, type LeadsViewInfo } from './logic';

type FilterKind = 'source' | 'status' | 'need';

/** The "All ..." choice at the top of each filter sheet (no lead enum uses this value). */
const ALL = '__all';
type All = typeof ALL;

const SHEET: Record<FilterKind, { title: string; all: string; chip: string }> = {
  source: { title: 'Source', all: 'All sources', chip: 'Source' },
  status: { title: 'Status', all: 'All statuses', chip: 'Status' },
  need: { title: 'Need', all: 'All needs', chip: 'Need' },
};

export type LeadFiltersProps = {
  meta: LeadsMeta | undefined;
  searchText: string;
  onSearchText: (text: string) => void;
  /** The trimmed search, after typing pauses (server side). */
  onSearch: (q: string) => void;
  source: LeadSource | null;
  /** The status in effect (Home's quick filter included). */
  status: LeadStatus | null;
  need: LeadNeed | null;
  onSource: (value: LeadSource | null) => void;
  onStatus: (value: LeadStatus | null) => void;
  onNeed: (value: LeadNeed | null) => void;
  /** Home's quick filter, shown as a removable gold chip. */
  view: LeadsViewInfo | null;
  onClearView: () => void;
  /** Resets source, status, need and the quick filter (the search stays). */
  onClearChips: () => void;
};

function withAll<V extends string>(label: string, options: readonly { value: V; label: string }[]): SelectOption<V | All>[] {
  return [{ value: ALL, label }, ...options];
}

/**
 * Search (server side, debounced) and three filter chips: Source, Status and
 * Need. Each chip opens a short sheet of choices and then shows the choice in
 * gold, so the row stays light at large font sizes however long a need label
 * is. Home's "Booked calls" filter appears under the row with an X.
 */
export function LeadFilters(props: LeadFiltersProps) {
  const { meta, source, status, need, view } = props;
  const [sheet, setSheet] = useState<{ kind: FilterKind; open: boolean } | null>(null);
  const close = () => setSheet((s) => (s ? { ...s, open: false } : s));
  const open = (kind: FilterKind) => setSheet({ kind, open: true });
  const chipOn = source !== null || status !== null || need !== null || view !== null;

  const kind = sheet?.kind ?? 'source';
  let list: ReactNode;
  if (kind === 'source') {
    list = (
      <OptionList<LeadSource | All>
        options={withAll(SHEET.source.all, sourceOptions(meta))}
        value={source ?? ALL}
        onChange={(v) => {
          props.onSource(v === ALL ? null : v);
          close();
        }}
        accessibilityLabel="Lead source"
      />
    );
  } else if (kind === 'status') {
    list = (
      <OptionList<LeadStatus | All>
        options={withAll(SHEET.status.all, statusOptions(meta))}
        value={status ?? ALL}
        onChange={(v) => {
          props.onStatus(v === ALL ? null : v);
          close();
        }}
        accessibilityLabel="Lead status"
      />
    );
  } else {
    list = (
      <OptionList<LeadNeed | All>
        options={withAll(SHEET.need.all, needOptions(meta))}
        value={need ?? ALL}
        onChange={(v) => {
          props.onNeed(v === ALL ? null : v);
          close();
        }}
        accessibilityLabel="What the lead needs"
      />
    );
  }

  return (
    <View>
      <View style={styles.search}>
        <SearchField
          value={props.searchText}
          onChangeText={props.onSearchText}
          onChangeDebounced={(text) => props.onSearch(text.trim())}
          debounceMs={300}
          placeholder="Search name, business or email"
          accessibilityLabel="Search leads by name, business, email or phone"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        accessibilityLabel="Lead filters"
      >
        <MenuChip kind="source" value={source ? sourceLabel(meta, source) : null} onPress={() => open('source')} />
        <MenuChip kind="status" value={status ? statusBadge(meta, status).label : null} onPress={() => open('status')} />
        <MenuChip kind="need" value={need ? needLabel(meta, need) : null} onPress={() => open('need')} />
        {chipOn ? <ClearChip onPress={props.onClearChips} /> : null}
      </ScrollView>

      {view ? (
        <View style={styles.view}>
          <ViewChip info={view} onClear={props.onClearView} />
        </View>
      ) : null}

      <Sheet visible={sheet?.open ?? false} onClose={close} title={SHEET[kind].title} scrollable>
        {list}
      </Sheet>
    </View>
  );
}

/** A filter chip that opens its choices: the filter's name, or the choice in gold, and a chevron. */
function MenuChip({ kind, value, onPress }: { kind: FilterKind; value: string | null; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  const selected = value !== null;
  const text = selected ? (isDark ? colors.goldMid : colors.goldDeep) : colors.ink2;
  const name = SHEET[kind].chip;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${value ?? SHEET[kind].all}`}
      accessibilityHint="Opens the choices"
      // 36dp pill, 48dp target.
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.chip,
        selected ? { backgroundColor: colors.goldTint, borderColor: colors.gold } : { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <Text variant="label" weight={selected ? '600' : '500'} numberOfLines={1} style={[styles.chipText, { color: text }]}>
        {value ?? name}
      </Text>
      <Icon icon={ChevronDown} size={15} rawColor={text} strokeWidth={selected ? 2.25 : 1.75} />
    </PressableScale>
  );
}

function ClearChip({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Clear filters"
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.chip, { borderColor: 'transparent' }]}
    >
      <Icon icon={X} size={15} rawColor={colors.ink3} />
      <Text variant="label" color="ink3" numberOfLines={1}>
        Clear
      </Text>
    </PressableScale>
  );
}

/** Home's quick filter said in words, with an X to drop it. Gold like a selected chip, so it reads as "this is on". */
function ViewChip({ info, onClear }: { info: LeadsViewInfo; onClear: () => void }) {
  const { colors, isDark } = useTheme();
  const text = isDark ? colors.goldMid : colors.goldDeep;
  return (
    <PressableScale
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={`Showing ${info.spoken}`}
      accessibilityHint="Removes this filter"
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.viewChip, { backgroundColor: colors.goldTint, borderColor: colors.gold }]}
    >
      <Text variant="label" weight="600" numberOfLines={2} style={[styles.viewLabel, { color: text }]}>
        {info.label}
      </Text>
      <Icon icon={X} size={16} rawColor={text} strokeWidth={2.25} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: layout.gutter, marginTop: space[5], marginBottom: space[2] },
  // Vertical padding keeps the chips' 48dp touch slop inside the scroll view.
  chips: { gap: space[2], paddingHorizontal: layout.gutter, paddingVertical: space[1] + 2, alignItems: 'center' },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingLeft: space[4] - 2,
    paddingRight: space[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  // A long need label is cut, not the row: the sheet shows it whole.
  chipText: { maxWidth: 220 },
  view: { flexDirection: 'row', paddingHorizontal: layout.gutter, marginTop: space[2] },
  viewChip: {
    flexShrink: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[4] - 2,
    paddingRight: space[3],
    paddingVertical: space[1] + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  viewLabel: { flexShrink: 1 },
});
