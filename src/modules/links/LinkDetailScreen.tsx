import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, Copy, MousePointerClick, Power, QrCode, Share2, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { linkClicksInfiniteQuery, linkKeys, linksMetaQuery, linksQuery } from '@/api/endpoints/links';
import { MESSAGES } from '@/api/errors';
import type { LinkClick, LinksMeta, ShortLink } from '@/api/schemas/links';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { Text } from '@/components/Text';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatCount } from '@/lib/format';
import { InlineLoader } from '@/loader/InlineLoader';
import { openHref } from '@/modules/inbox/navigation';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { CLICK_DIVIDER_INSET, ClickListSkeleton, ClickRow } from './ClickRow';
import { LinkSheets, openQr, useLinkMutations, type LinkSheet } from './LinkActions';
import { UtmTag } from './LinkCard';
import { flattenClicks, LINK_COPY, linkFinalUrl, shareUrlOf, SLUG_PREFIX, statusBadge, utmChips } from './logic';
import { copyLink, shareLink } from './share';

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

const clickKey = (click: LinkClick) => click.id;
const Separator = () => <Divider inset={CLICK_DIVIDER_INSET} />;

/** Back to where the owner came from, or to the Links list when the screen was opened from a deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else openHref({ pathname: '/marketing', params: { segment: 'links' } });
}

type LinkHeaderProps = {
  link: ShortLink;
  meta: LinksMeta | undefined;
  onSheet: (sheet: LinkSheet) => void;
};

/** Status, clicks, Copy / Share / QR code, every field, then Disable / Enable and Delete. */
function LinkHeader({ link, meta, onSheet }: LinkHeaderProps) {
  const { setActive } = useLinkMutations();
  const status = statusBadge(meta, link.active);
  const url = shareUrlOf(link);
  const chips = utmChips(link);

  const details: KeyValueItem[] = [
    { label: 'Short link', value: url, mono: true, copyable: true },
    { label: 'Destination', value: link.destination, copyable: true },
    { label: 'Opens', value: linkFinalUrl(link), copyable: true },
    { label: 'UTM source', value: link.utmSource, copyable: link.utmSource !== null },
    { label: 'UTM medium', value: link.utmMedium, copyable: link.utmMedium !== null },
    { label: 'UTM campaign', value: link.utmCampaign, copyable: link.utmCampaign !== null },
    { label: 'Internal label', value: link.label },
    { label: 'Created', value: formatDateTime(link.createdAt) },
  ];

  return (
    <View style={styles.gutter}>
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} size="md" dot />
        {chips.map((chip) => (
          <UtmTag key={chip.key} chip={chip} />
        ))}
      </View>
      {link.active ? null : (
        <Text variant="small" color="ink3" style={styles.note}>
          {LINK_COPY.disabledNote}
        </Text>
      )}

      <StatCard
        label="Clicks"
        value={link.clicks}
        format={formatCount}
        sub={`Since ${formatDate(link.createdAt)}`}
        icon={MousePointerClick}
        style={styles.stat}
      />

      <View style={styles.row}>
        <Button label="Copy link" icon={Copy} variant="secondary" size="sm" onPress={() => void copyLink(url)} />
        <Button label="Share" icon={Share2} variant="secondary" size="sm" onPress={() => void shareLink(url)} />
        <Button label="QR code" icon={QrCode} variant="secondary" size="sm" onPress={() => openQr(link)} accessibilityHint="Full screen, to scan, save or share" />
      </View>

      <Section title="Details" style={styles.details} spacing={space[5]}>
        <Card padded={false}>
          <KeyValue items={details} />
        </Card>
        <Text variant="small" color="ink3" style={styles.note}>
          Links cannot be edited after creation.
        </Text>
      </Section>

      <View style={styles.manage}>
        {link.active ? (
          <PendingButton
            label="Disable link"
            icon={Ban}
            variant="secondary"
            fullWidth
            accessibilityHint="It returns 404 at once. Asks you to confirm."
            onPress={() => onSheet({ link, kind: 'disable' })}
            offlineHint={false}
          />
        ) : (
          <PendingButton label="Enable link" pendingLabel="Enabling" icon={Power} variant="secondary" fullWidth onPress={() => setActive(link, true)} offlineHint={false} />
        )}
        <PendingButton
          label="Delete link"
          icon={Trash2}
          variant="ghost"
          fullWidth
          accessibilityHint="Asks you to confirm"
          onPress={() => onSheet({ link, kind: 'delete' })}
        />
      </View>

      <Section title="Click history" spacing={space[1]} style={styles.history} />
    </View>
  );
}

function DetailSkeleton() {
  return (
    <SkeletonGroup style={styles.gutter}>
      <Skeleton width={84} height={26} />
      <Skeleton shape="block" height={128} style={styles.stat} />
      <View style={styles.row}>
        <Skeleton width={112} height={40} />
        <Skeleton width={88} height={40} />
        <Skeleton width={104} height={40} />
      </View>
      <Skeleton shape="block" height={360} style={styles.details} />
    </SkeletonGroup>
  );
}

/**
 * One short link (brief 8.11, "tap a link card to see its own click
 * history"; deep link /admin/links/<id>): the status, the click count, Copy,
 * Share and QR code, every field with the final URL the visitor lands on,
 * Disable / Enable and Delete, then its clicks with infinite scroll. The link
 * comes from GET /links (there is no single-link endpoint), loaded again on
 * open, on focus and on resume.
 */
export function LinkDetailScreen() {
  return (
    <OwnerOnly>
      <LinkDetail />
    </OwnerOnly>
  );
}

function LinkDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const links = useQuery({ ...linksQuery(), refetchOnMount: 'always' });
  const clicks = useInfiniteQuery({ ...linkClicksInfiniteQuery({ linkId: id }), enabled: id !== '' });
  const meta = useQuery(linksMetaQuery());
  useRefetchOnFocus(
    (options) => (id ? Promise.all([links.refetch(options), clicks.refetch(options)]) : undefined),
    links.dataUpdatedAt,
  );

  const [sheet, setSheet] = useState<LinkSheet | null>(null);
  // Deleted here: keep showing it while the screen slides away, instead of "no longer exists".
  const [deleted, setDeleted] = useState<ShortLink | null>(null);

  const link = links.data?.find((l) => l.id === id) ?? deleted ?? undefined;
  const onDeleted = () => {
    if (link) setDeleted(link);
    leave();
  };
  const linksPaused = links.isPending && links.fetchStatus === 'paused';
  const clicksPaused = clicks.isPending && clicks.fetchStatus === 'paused';
  const clickList = link ? flattenClicks(clicks.data?.pages) : [];
  const firstPage = clicks.data?.pages[0]?.items.length ?? 0;

  let header: ReactNode;
  if (!id) {
    header = <ErrorState message={MESSAGES.notFound} />;
  } else if (link) {
    header = <LinkHeader link={link} meta={meta.data} onSheet={setSheet} />;
  } else if (links.data !== undefined && !links.isFetching) {
    // Loaded, and not in the list: deleted (here or on the web).
    header = <ErrorState message={LINK_COPY.notFound} />;
  } else if (linksPaused) {
    header = <ErrorState message={MESSAGES.network} onRetry={online ? () => links.refetch() : undefined} />;
  } else if (links.isError && links.data === undefined) {
    header = <ErrorState error={links.error} onRetry={() => links.refetch()} />;
  } else {
    header = <DetailSkeleton />;
  }

  const empty = !link ? null : clicksPaused ? (
    <View style={styles.gutter}>
      <ErrorState compact message={MESSAGES.network} onRetry={online ? () => clicks.refetch() : undefined} />
    </View>
  ) : clicks.isPending ? (
    <ClickListSkeleton />
  ) : clicks.isError ? (
    <View style={styles.gutter}>
      <ErrorState compact error={clicks.error} onRetry={() => clicks.refetch()} />
    </View>
  ) : (
    <View style={styles.gutter}>
      <EmptyState compact message={LINK_COPY.emptyClicks} />
    </View>
  );

  const footer = link ? (
    <View>
      {clicks.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more clicks">
          <InlineLoader />
        </View>
      ) : null}
      {clicks.isFetchNextPageError ? (
        <View style={styles.gutter}>
          <ErrorState compact error={clicks.error} onRetry={() => clicks.fetchNextPage()} />
        </View>
      ) : null}
      {clicks.isRefetchError && clicks.data !== undefined && online ? (
        <View style={styles.gutter}>
          <ErrorState compact error={clicks.error} onRetry={() => clicks.refetch()} />
        </View>
      ) : null}
    </View>
  ) : null;

  const renderItem = ({ item, index }: ListRenderItemInfo<LinkClick>) => (
    <ClickRow click={item} now={now} showLink={false} index={index} still={reduceMotion || index >= firstPage} />
  );

  const loadMore = () => {
    if (clicks.hasNextPage && !clicks.isFetchingNextPage && !clicks.isFetchNextPageError) void clicks.fetchNextPage();
  };

  const refresh = id ? () => Promise.all([links.refetch(), clicks.refetch(), meta.refetch()]) : undefined;
  const refetching =
    (links.isFetching && links.data !== undefined) || (clicks.isFetching && !clicks.isFetchingNextPage && clicks.data !== undefined);

  return (
    <>
      <ScreenList<LinkClick>
        title={link?.slug}
        eyebrow={link ? SLUG_PREFIX : undefined}
        subtitle={link?.label ?? undefined}
        back
        data={clickList}
        renderItem={renderItem}
        keyExtractor={clickKey}
        extraData={now}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={refresh}
        refetching={refetching}
        queryKey={linkKeys.list()}
      />
      <LinkSheets sheet={sheet} onChange={setSheet} onDeleted={onDeleted} />
    </>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  note: { marginTop: space[2] },
  stat: { marginTop: space[5] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] },
  details: { marginTop: layout.sectionGap },
  manage: { gap: space[2] },
  history: { marginTop: layout.sectionGap },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
