import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientsInfiniteQuery, clientsMetaQuery } from '@/api/endpoints/clients';
import { MESSAGES } from '@/api/errors';
import type { ClientRow } from '@/api/schemas/clients';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SearchField } from '@/components/form/SearchField';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/sheet/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { STATUS_TONES, statusLabel } from './list/labels';

function uniqueById(rows: readonly ClientRow[]): ClientRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

export type LogCallPickerProps = {
  visible: boolean;
  onClose: () => void;
  /** The client the call was booked for. The caller opens its Calls section. */
  onPick: (client: ClientRow) => void;
};

/**
 * "Log a booked call" from the quick actions: pick the client first (search by
 * business name or email, server side), then the client's Calls section opens
 * with the log sheet. Lists active clients (not leads, not churned), most
 * recently worked on first.
 */
export function LogCallPicker({ visible, onClose, onPick }: LogCallPickerProps) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({ ...clientsInfiniteQuery({ status: 'active', q }), enabled: visible });
  const meta = useQuery({ ...clientsMetaQuery(), enabled: visible });
  const online = useIsOnline();
  // Once each: a client touched between page loads can move to the next page.
  const rows = uniqueById(list.data?.pages.flatMap((p) => p.items) ?? []);

  const close = () => {
    setQ('');
    onClose();
  };

  let body;
  if (list.isPending && list.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends.
    body = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />;
  } else if (list.isPending) {
    body = <SkeletonList rows={6} trailing={false} />;
  } else if (list.isError && rows.length === 0) {
    body = <ErrorState compact error={list.error} onRetry={() => list.refetch()} />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        compact
        message={q ? 'No clients match that search.' : 'No clients here yet. Paid checkouts create them automatically, or add one by hand.'}
      />
    );
  } else {
    body = (
      <View style={styles.list} accessibilityRole="list">
        {rows.map((row) => (
          <PressableScale
            key={row.id}
            pressedScale={0.98}
            onPress={() => {
              setQ('');
              onPick(row);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${row.businessName}, ${statusLabel(meta.data, row.status)}${row.planName ? `, ${row.planName}` : ''}`}
            accessibilityHint="Opens the client's calls to log the booking"
            style={[styles.row, { borderColor: colors.line }]}
          >
            <View style={styles.rowText}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {row.businessName}
              </Text>
              <Text variant="small" color="ink3" numberOfLines={1}>
                {[row.planName ?? 'No plan yet', row.primaryEmail].join(' · ')}
              </Text>
            </View>
            <Badge label={statusLabel(meta.data, row.status)} tone={STATUS_TONES[row.status]} />
            <Icon icon={ChevronRight} size={18} color="ink4" />
          </PressableScale>
        ))}
        {list.hasNextPage ? (
          <Button
            label="Show more"
            variant="ghost"
            size="sm"
            pending={list.isFetchingNextPage}
            pendingLabel="Loading"
            onPress={() => void list.fetchNextPage()}
            style={styles.more}
          />
        ) : null}
        {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      </View>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Log a booked call"
      subtitle="Pick the client it was booked for."
      snapPoints={[0.85]}
      scrollable
    >
      <View style={styles.body}>
        <SearchField
          onChangeDebounced={(text) => setQ(text.trim())}
          debounceMs={300}
          placeholder="Search business or email"
          accessibilityLabel="Search clients"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          fill="bg2"
        />
        {body}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[4] },
  list: { gap: space[2] },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderRadius: radius.input,
  },
  rowText: { flex: 1, gap: 2 },
  more: { alignSelf: 'center', marginTop: space[2] },
});
