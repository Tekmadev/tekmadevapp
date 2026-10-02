import { useQuery } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { History, WifiOff } from 'lucide-react-native';
import { Fragment, useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import type { SearchResult } from '@/api/schemas/session';
import type { Role } from '@/api/types';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SearchField } from '@/components/form/SearchField';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { PillButton } from '@/components/parts/PillButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { countLabel } from '@/lib/format';
import { InlineLoader } from '@/loader/InlineLoader';
import { openHref } from '@/modules/inbox/navigation';

import { useVisibility } from '../registry';
import { matchScreens, relatedQueries } from './screenMatch';
import { adminHref, RESULT_TYPES, searchQuery, searchScreensFor, suggestedScreens, type SearchScreen } from './searchData';
import { searchSheet, useSearchStore } from './searchStore';

/** Tall: results have room above the keyboard. */
const SNAP_POINTS = [0.92] as const;
/** Screens shown above the records while typing. */
const SCREEN_LIMIT = 5;
/** Rows line up with the sheet's title: icon, then text from here. */
const ROW_TEXT_INSET = 72;

export const SEARCH_COPY = {
  title: 'Search',
  placeholder: 'Search names, emails, screens',
  noResults: 'Nothing matches that.',
  offline: 'Offline · searching screens only',
} as const;

/**
 * Global search (brief section 7). Mounted once in the signed-in layout and
 * opened from the search button in every tab header (`searchSheet.open()`).
 *
 * Screens match locally on every keystroke (title and keywords, from the
 * registry, so a manager never sees an owner-only screen). Records come from
 * GET /search 250ms after typing pauses (the server filters them by role).
 * The field is pinned at the bottom of the sheet, right above the keyboard:
 * it stays in view while the results scroll and sits under the thumb.
 */
export function SearchSheet() {
  const open = useSearchStore((s) => s.open);

  // Leaving the signed-in area (sign-out) must not leave it open for the next sign-in.
  useEffect(() => () => searchSheet.close(), []);

  return (
    <Sheet
      visible={open}
      onClose={searchSheet.close}
      title={SEARCH_COPY.title}
      snapPoints={SNAP_POINTS}
      scrollable
      footer={<SearchInput />}
      testID="search-sheet"
    >
      <SearchBody />
    </Sheet>
  );
}

/* ---------- data ---------- */

/** The record search for the debounced query (shared by the field's loader and the results). */
function useRecordSearch() {
  const query = useSearchStore((s) => s.query);
  const online = useIsOnline();
  const q = query.trim();
  const result = useQuery({
    ...searchQuery(q),
    enabled: online && q.length > 0,
    // Still typing the same word: keep the last results (dimmed) instead of flashing empty.
    placeholderData: (previous, previousQuery) =>
      previousQuery && relatedQueries(previousQuery.queryKey[1], q) ? previous : undefined,
  });
  return { q, online, result };
}

/** Opening a result: close first, navigate on the next frame (a second tap in the same frame is ignored). */
let navigating = false;
function openResult(href: Href, query: string) {
  if (navigating) return;
  navigating = true;
  searchSheet.remember(query);
  searchSheet.close();
  requestAnimationFrame(() => {
    navigating = false;
    // A tab from a pushed screen (the Inbox has search too) goes back down to the tabs, never a second tab bar.
    openHref(href);
  });
}

/* ---------- field ---------- */

function SearchInput() {
  const text = useSearchStore((s) => s.text);
  const { colors } = useTheme();
  const { q, online, result } = useRecordSearch();
  const loading = online && q.length > 0 && result.isFetching;

  return (
    <View>
      <SearchField
        value={text}
        onChangeText={searchSheet.setText}
        onChangeDebounced={searchSheet.setQuery}
        debounceMs={250}
        autoFocus
        fill="bg2"
        placeholder={SEARCH_COPY.placeholder}
        accessibilityLabel="Search screens and records"
        onSubmitEditing={() => searchSheet.remember(text)}
        testID="search-field"
      />
      {loading ? (
        // The search glass turns into the black hole while records load.
        <View pointerEvents="none" style={styles.loaderSlot}>
          <View style={[styles.loader, { backgroundColor: colors.bg2 }]}>
            <InlineLoader size={16} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- results ---------- */

function SearchBody() {
  const text = useSearchStore((s) => s.text);
  const recents = useSearchStore((s) => s.recents);
  const visibility = useVisibility();
  const screens = searchScreensFor(visibility);
  const { q, online, result } = useRecordSearch();

  const typed = text.trim();
  const screenHits = typed ? matchScreens(screens, typed, SCREEN_LIMIT) : [];
  const failed = online && typed.length > 0 && result.isError;
  const records: SearchResult[] = online && typed && !failed ? (result.data?.results ?? []) : [];
  // The records on screen answer what is in the field (the debounce caught up and nothing is loading).
  const settled = typed === q && result.isSuccess && !result.isPlaceholderData && !result.isFetching;
  // Records for an earlier query (still typing, or loading the next one) are dimmed until they catch up.
  const stale = typed !== q || result.isPlaceholderData;
  const nothing = typed.length > 0 && screenHits.length === 0 && records.length === 0 && !failed && (!online || settled);

  // TalkBack hears how a search went once it settles (silent without a screen reader).
  const total = screenHits.length + records.length;
  const announcement = !typed ? null : nothing ? SEARCH_COPY.noResults : settled ? countLabel(total, 'result', 'results') : null;
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement, q]);

  if (!typed) {
    return <IdleResults recents={recents} suggested={suggestedScreens(screens)} online={online} />;
  }

  return (
    <View style={styles.body}>
      {!online ? <OfflineNote /> : null}
      {screenHits.length > 0 ? (
        <Group label="Screens">
          <Rows items={screenHits} keyOf={(s) => s.key} render={(s) => <ScreenRow screen={s} query={typed} />} />
        </Group>
      ) : null}
      {records.length > 0 ? (
        <Group label="Records" dimmed={stale}>
          <Rows
            items={records}
            keyOf={(r) => `${r.type}:${r.id}`}
            render={(r) => <RecordRow record={r} query={typed} role={visibility.role} />}
          />
        </Group>
      ) : null}
      {failed ? <ErrorState compact error={result.error} onRetry={() => result.refetch()} retrying={result.isFetching} /> : null}
      {nothing ? <EmptyState compact message={SEARCH_COPY.noResults} /> : null}
    </View>
  );
}

function IdleResults({ recents, suggested, online }: { recents: readonly string[]; suggested: readonly SearchScreen[]; online: boolean }) {
  return (
    <View style={styles.body}>
      {!online ? <OfflineNote /> : null}
      {recents.length > 0 ? (
        <Group
          label="Recent"
          action={{ label: 'Clear', hint: 'Forgets your recent searches', onPress: searchSheet.clearRecents }}
        >
          <Rows
            items={recents}
            keyOf={(r) => r}
            render={(r) => (
              <ListRow
                title={r}
                icon={History}
                chevron={false}
                onPress={() => searchSheet.run(r)}
                accessibilityLabel={`Recent search: ${r}`}
                accessibilityHint="Searches for this again"
              />
            )}
          />
        </Group>
      ) : null}
      {suggested.length > 0 ? (
        <Group label="Suggested">
          <Rows items={suggested} keyOf={(s) => s.key} render={(s) => <ScreenRow screen={s} query="" />} />
        </Group>
      ) : null}
    </View>
  );
}

function ScreenRow({ screen, query }: { screen: SearchScreen; query: string }) {
  return (
    <ListRow
      title={screen.title}
      subtitle={screen.subtitle}
      icon={screen.icon}
      chevron={false}
      onPress={() => openResult(screen.href, query)}
      accessibilityLabel={`${screen.title}, screen, ${screen.subtitle}`}
      accessibilityHint="Opens this screen"
    />
  );
}

function RecordRow({ record, query, role }: { record: SearchResult; query: string; role: Role | null }) {
  const type = RESULT_TYPES[record.type];
  return (
    <ListRow
      title={record.title}
      subtitle={record.subtitle || undefined}
      icon={type.icon}
      chevron={false}
      trailing={<TypeLabel label={type.label} />}
      onPress={() => openResult(adminHref(record.url, role), query)}
      accessibilityLabel={[type.label, record.title, record.subtitle].filter(Boolean).join(', ')}
      accessibilityHint="Opens it"
    />
  );
}

function TypeLabel({ label }: { label: string }) {
  return (
    <Text variant="caption" color="ink4" numberOfLines={1} importantForAccessibility="no">
      {label}
    </Text>
  );
}

/* ---------- layout pieces ---------- */

function Group({
  label,
  action,
  dimmed = false,
  children,
}: {
  label: string;
  action?: { label: string; hint: string; onPress: () => void };
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text variant="eyebrow" accessibilityRole="header" style={styles.groupLabel}>
          {label}
        </Text>
        {action ? (
          <PillButton variant="link" label={action.label} accessibilityHint={action.hint} onPress={action.onPress} />
        ) : null}
      </View>
      <View style={[styles.rows, dimmed ? styles.dimmed : null]}>{children}</View>
    </View>
  );
}

function Rows<T>({ items, keyOf, render }: { items: readonly T[]; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  return items.map((item, index) => (
    <Fragment key={keyOf(item)}>
      {index > 0 ? <Divider inset={ROW_TEXT_INSET} insetEnd /> : null}
      {render(item)}
    </Fragment>
  ));
}

function OfflineNote() {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={SEARCH_COPY.offline}
      style={[styles.note, { backgroundColor: colors.bg3, borderColor: colors.line }]}
    >
      <View importantForAccessibility="no-hide-descendants" style={styles.noteRow}>
        <Icon icon={WifiOff} size={14} color="ink3" />
        <Text variant="small" color="ink2" style={styles.noteText}>
          {SEARCH_COPY.offline}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[5], paddingTop: space[1] },
  group: { gap: space[1] },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  groupLabel: { flexShrink: 1 },
  // Rows bring their own 16dp gutter: reach the sheet's edges so they line up with its title.
  rows: { marginHorizontal: -layout.gutter },
  dimmed: { opacity: 0.55 },
  note: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  noteText: { flex: 1 },
  // Over the field's search glass: 1dp border + 16dp padding, glass 18dp wide.
  loaderSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 1 + space[4] - 2,
    justifyContent: 'center',
  },
  loader: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
