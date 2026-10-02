import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, CalendarClock, ExternalLink } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { leadKeys, leadQuery, leadsMetaQuery } from '@/api/endpoints/leads';
import { ApiError, MESSAGES } from '@/api/errors';
import type { Lead, LeadsMeta } from '@/api/schemas/leads';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatPhone } from '@/lib/format';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { LeadContactActions } from './LeadContactActions';
import { LeadDetailSkeleton } from './LeadDetailSkeleton';
import {
  asksQualifiers,
  bookingDistance,
  formatWhen,
  isUpcoming,
  leadTitle,
  needLabel,
  newClientParams,
  referrerText,
  revenueLabel,
  sourceLabel,
  statusBadge,
} from './logic';

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** The booked call, Toronto time, with how far it is ("tomorrow", "3 days ago"). */
function BookingCard({ instant, now }: { instant: string; now: Date }) {
  const { tones } = useTheme();
  const upcoming = isUpcoming(instant, now);
  const when = formatWhen(instant, now);
  const distance = bookingDistance(instant, now);
  const tone = upcoming ? 'ok' : 'muted';
  return (
    <Card accessibilityLabel={`${upcoming ? 'Call booked for' : 'Call was booked for'} ${when}, Toronto time, ${distance}`}>
      <View style={styles.booking}>
        <View style={[styles.bookingIcon, { backgroundColor: tones[tone].bg }]}>
          <Icon icon={CalendarClock} size={20} tone={tone} />
        </View>
        <View style={styles.bookingText}>
          <Text variant="eyebrow">{upcoming ? 'Booked call' : 'Call was booked for'}</Text>
          <Text variant="title" tabular>
            {when}
          </Text>
          <Text variant="small" color="ink3">
            {distance ? `Toronto time · ${distance}` : 'Toronto time'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function LeadBody({ lead, meta, now }: { lead: Lead; meta: LeadsMeta | undefined; now: Date }) {
  const status = statusBadge(meta, lead.status);
  const qualifiers = asksQualifiers(lead);
  const clientId = lead.convertedClientId;

  const details: KeyValueItem[] = [
    { label: 'Business', value: lead.business },
    { label: 'Email', value: lead.email, link: 'email' },
    { label: 'Phone', value: lead.phone ? formatPhone(lead.phone) : null, link: 'phone' },
    ...(qualifiers
      ? [
          { label: 'Need', value: lead.need ? needLabel(meta, lead.need) : null },
          { label: 'Revenue', value: lead.revenue ? revenueLabel(meta, lead.revenue) : null },
        ]
      : []),
    { label: 'Received', value: formatWhen(lead.createdAt, now) },
  ];

  const attribution: KeyValueItem[] = [
    { label: 'UTM source', value: lead.utm.source, copyable: true },
    { label: 'UTM medium', value: lead.utm.medium, copyable: true },
    { label: 'UTM campaign', value: lead.utm.campaign, copyable: true },
    { label: 'Referrer', value: referrerText(lead.referrer), copyable: lead.referrer !== null },
  ];

  return (
    <View>
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} size="md" dot />
        <Badge label={sourceLabel(meta, lead.source)} tone="neutral" size="md" />
      </View>

      <View style={styles.actions}>
        <LeadContactActions lead={lead} />
      </View>

      {clientId ? (
        <Button
          label="Open client"
          variant="secondary"
          icon={ExternalLink}
          fullWidth
          accessibilityHint="This lead is already a client. Opens the client."
          onPress={() => router.push({ pathname: '/clients/[id]', params: { id: clientId } })}
          style={styles.primary}
        />
      ) : (
        <Button
          label="Create client from this lead"
          icon={Building2}
          fullWidth
          accessibilityHint="Opens New client with this lead's details filled in"
          onPress={() => router.push({ pathname: '/clients/new', params: newClientParams(lead) })}
          style={styles.primary}
        />
      )}

      {lead.bookingAt ? (
        <View style={styles.bookingWrap}>
          <BookingCard instant={lead.bookingAt} now={now} />
        </View>
      ) : null}

      <Section title="Details" style={styles.details}>
        <Card padded={false}>
          <KeyValue items={details} />
        </Card>
      </Section>

      {lead.message?.trim() ? (
        <Section title="Message">
          <Card>
            <Text variant="body" selectable>
              {lead.message}
            </Text>
          </Card>
        </Section>
      ) : null}

      <Section title="Attribution" spacing={space[2]}>
        <Card padded={false}>
          <KeyValue items={attribution} />
        </Card>
      </Section>
    </View>
  );
}

/**
 * Lead detail (brief 8.6, GET /leads/:id): the name as the large title, the
 * status and source, one-tap Call, Email, Text and Copy, "Create client from
 * this lead" (or "Open client" once it became one), the booked call in Toronto
 * time, every field with the brief's labels, the message as typed and the
 * attribution. Opened from a list row or Home, it shows the lead already in
 * the cache at once, then loads the full record.
 */
export function LeadDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const now = useMinuteClock();

  // The row it was opened from is on screen at once; the full record always loads behind it.
  const query = useQuery({ ...leadQuery(id), enabled: id !== '', refetchOnMount: 'always' });
  const meta = useQuery(leadsMetaQuery());

  // Back on this screen (from New client, the dialer, another tab) or back in the app: load it again,
  // so a lead that just became a client shows "Open client". A fetch under 5s old is reused.
  useRefetchOnFocus((options) => (id ? query.refetch(options) : undefined), query.dataUpdatedAt);

  // A 404 means the lead is gone: say so instead of showing what was cached.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const lead = notFound ? undefined : query.data;

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (lead) {
    body = <LeadBody lead={lead} meta={meta.data} now={now} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = showSkeleton ? <LeadDetailSkeleton withTitle={false} /> : null;
  }

  return (
    <Screen
      title={lead ? leadTitle(lead) : undefined}
      back
      onRefresh={id ? () => Promise.all([query.refetch(), meta.refetch()]) : undefined}
      refetching={query.isFetching && !query.isPending}
      queryKey={leadKeys.detail(id)}
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  actions: { marginTop: space[5] },
  primary: { marginTop: space[5] },
  bookingWrap: { marginTop: space[5] },
  details: { marginTop: layout.sectionGap },
  booking: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  bookingIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bookingText: { flex: 1, gap: 2 },
});
