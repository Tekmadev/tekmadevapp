import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { UserSearch } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { crmKeys } from '@/api/endpoints/crm';
import { MESSAGES } from '@/api/errors';
import type { CrmAttentionItem, CrmMeta } from '@/api/schemas/crm';
import { useCan } from '@/auth/permissions';
import { ErrorState } from '@/components/ErrorState';
import { ListRow } from '@/components/ListRow';
import { Card } from '@/components/Card';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { AppCard, MergeFieldsCard } from '@/modules/crm/components/AppCard';
import { AttentionHeader, AttentionRow, NothingStuck } from '@/modules/crm/components/Attention';
import { ConnectionCard } from '@/modules/crm/components/ConnectionCard';
import { CrmSkeleton } from '@/modules/crm/components/CrmSkeleton';
import { QueueCard, RunLog } from '@/modules/crm/components/QueueSection';
import { ReconcileCard } from '@/modules/crm/components/ReconcileCard';
import { SwitchCards } from '@/modules/crm/components/SwitchCards';
import { useCrmJobs, useCrmStatus } from '@/modules/crm/hooks';
import { attentionKey } from '@/modules/crm/logic';
import { metaQuery, useMinuteClock } from '@/modules/overview/hooks';

import type { MarketingSegmentChrome, MarketingSegmentProps } from './types';

const rowKey = (item: CrmAttentionItem) => attentionKey(item);

/**
 * CRM sync (brief 8.11, `crm.view`; always "the CRM", never a vendor name).
 * One read (GET /crm) feeds the whole segment: the connection with Verify, the
 * three switches, the webhook app, the queue with Sync now and the run log,
 * the last reconcile with Run now, then "Needs attention" as the list rows
 * (multi-select Retry and Discard), the way into the contact inspector and the
 * merge fields. Verify, Sync now and Run now are long jobs, one at a time,
 * never retried; whatever happens they refetch the status, so the run log
 * says what the server did. Every action needs `crm.write`; without it the
 * segment reads only (owners and managers hold both by default). The Marketing
 * shell shows this segment only with `crm.view`.
 */
export function CrmSegment({ chrome }: MarketingSegmentProps) {
  return <CrmBody chrome={chrome} />;
}

function CrmBody({ chrome }: { chrome: MarketingSegmentChrome }) {
  const canWrite = useCan('crm.write');
  const now = useMinuteClock();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const query = useCrmStatus();
  const meta = useQuery(metaQuery());
  const jobs = useCrmJobs();
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const data = query.data;
  const crmMeta: Partial<CrmMeta> | undefined = meta.data;
  const items = data?.attention ?? [];
  // Items that left the list (retried elsewhere, a refetch) drop out of the selection on their own.
  const selected = items.filter((i) => selectedKeys.has(attentionKey(i)));
  const verified = data?.connection.health === 'verified';

  const toggle = (item: CrmAttentionItem) => {
    const key = attentionKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectAll = () => setSelectedKeys(new Set(items.map(attentionKey)));
  const clearSelection = () => setSelectedKeys(new Set());

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    await Promise.all([query.refetch(), meta.refetch()]);
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<CrmAttentionItem>) => (
    <Animated.View entering={!reduceMotion && index < STAGGER_MAX ? enterPull(index) : undefined} style={styles.item}>
      <AttentionRow item={item} meta={crmMeta} now={now} selected={canWrite && selectedKeys.has(attentionKey(item))} onToggle={canWrite ? toggle : null} />
    </Animated.View>
  );

  const header = (
    <View>
      {chrome.switcher}
      {data ? (
        <View style={styles.gutter}>
          {query.isRefetchError && online ? (
            <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
          ) : null}
          <Section title="Connection">
            <ConnectionCard connection={data.connection} meta={crmMeta} now={now} verify={jobs.verify} busy={jobs.busy} canWrite={canWrite} />
          </Section>
          <Section title="Switches">
            <SwitchCards switches={data.switches} meta={crmMeta} verified={verified} online={online} now={now} canWrite={canWrite} />
          </Section>
          <Section title="Webhook app">
            <AppCard app={data.app} meta={crmMeta} />
          </Section>
          <Section title="Queue">
            <QueueCard queue={data.queue} sync={jobs.sync} busy={jobs.busy} verified={verified} canWrite={canWrite} />
          </Section>
          <Section title="Run log">
            <RunLog runs={data.runs} meta={crmMeta} now={now} />
          </Section>
          <Section title="Last reconcile">
            <ReconcileCard last={data.lastReconcile} now={now} reconcile={jobs.reconcile} busy={jobs.busy} verified={verified} canWrite={canWrite} />
          </Section>
          <AttentionHeader items={items} selected={canWrite ? selected : []} onSelectAll={selectAll} onClear={clearSelection} canWrite={canWrite} />
        </View>
      ) : null}
    </View>
  );

  let empty: ReactNode;
  if (data) {
    empty = <NothingStuck />;
  } else if (query.isPending && query.fetchStatus === 'paused') {
    // Offline with nothing cached. The fetch resumes by itself once the connection is back.
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else {
    empty = <CrmSkeleton />;
  }

  const footer = (
    <View>
      {data ? (
        <View style={[styles.gutter, styles.footer]}>
          <Section title="Contact inspector">
            <Card padded={false}>
              <ListRow
                title="Look up a contact"
                subtitle="Compare one email on this site and in the CRM, side by side."
                subtitleLines={2}
                icon={UserSearch}
                iconTone="gold"
                background="none"
                onPress={() => router.push('/crm/inspect')}
              />
            </Card>
          </Section>
          <Section title="Merge fields">
            <Text variant="small" color="ink3" style={styles.help}>
              Tap a tag to copy it, then paste it in a CRM template.
            </Text>
            <MergeFieldsCard fields={data.mergeFields} />
          </Section>
        </View>
      ) : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  return (
    <ScreenList<CrmAttentionItem>
      {...chrome.screen}
      data={data ? items : []}
      renderItem={renderItem}
      keyExtractor={rowKey}
      extraData={{ selectedKeys, now, meta: meta.data, reduceMotion, canWrite }}
      ListHeaderComponent={header}
      ListEmptyComponent={<View style={styles.gutter}>{empty}</View>}
      ListFooterComponent={footer}
      onRefresh={onRefresh}
      refetching={query.isFetching && data !== undefined}
      // The banner says "showing what was loaded at ..."; with nothing loaded the ErrorState says it instead.
      offlineBanner={data !== undefined}
      queryKey={crmKeys.status()}
    />
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  refetchError: { marginBottom: space[4] },
  item: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  footer: { marginTop: space[6] },
  help: { marginBottom: space[3] },
});
