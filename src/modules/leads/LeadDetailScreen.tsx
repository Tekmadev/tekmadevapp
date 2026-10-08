import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, CalendarClock, ExternalLink, PenLine } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { leadKeys, leadQuery, leadsMetaQuery, touchesInfiniteQuery } from '@/api/endpoints/leads';
import { ApiError, MESSAGES } from '@/api/errors';
import type { Lead, LeadsMeta, TouchKind } from '@/api/schemas/leads';
import { useCan, useCanAll, useCapabilities } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatPhone } from '@/lib/format';
import { DemoCard } from '@/modules/demos/DemoCard';
import { openHref } from '@/modules/inbox/navigation';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { ContactLogPrompt } from './ContactLogPrompt';
import { EditLeadSheet } from './EditLeadSheet';
import { LeadContactActions } from './LeadContactActions';
import { LeadDetailSkeleton } from './LeadDetailSkeleton';
import { LogTouchSheet } from './LogTouchSheet';
import { OutreachCard, type TouchesState } from './OutreachCard';
import { CONTACT_PROMPTS, firstName, type ContactChannel } from './outreach';
import {
  asksQualifiers,
  bookingDistance,
  formatWhen,
  isUpcoming,
  leadClientAction,
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

/** The "Log outreach" sheet: the kind it opens on and a pre-filled note. */
type LogIntent = { kind: TouchKind; note: string };

type LeadBodyProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  now: Date;
  touches: TouchesState;
  /** "Edit lead", when the server says this person may (`canEdit`). */
  onEdit?: () => void;
};

function LeadBody({ lead, meta, now, touches, onEdit }: LeadBodyProps) {
  const status = statusBadge(meta, lead.status);
  const qualifiers = asksQualifiers(lead);
  const clientId = lead.convertedClientId;
  const outreach = lead.source === 'outreach';
  // Open client, Create client, or no button (when the capabilities are missing).
  const caps = useCapabilities();
  const clientAction = leadClientAction(clientId, (cap) => caps.includes(cap));
  const canLog = useCan('leads.outreach');
  // After Call, Email or Text: offer to log it, until used or dismissed.
  const [contacted, setContacted] = useState<ContactChannel | null>(null);
  const [logging, setLogging] = useState<LogIntent | null>(null);
  const title = leadTitle(lead);

  // The usual way to reach this lead first: a call, else an email, else a DM.
  const defaultKind: TouchKind = lead.phone ? 'call' : lead.email ? 'email' : 'dm';
  // "Log outreach", or the prompt after a call, email or text: start on that kind, and the prompt has done its job.
  const logFromButton = () => {
    const kind = contacted ? CONTACT_PROMPTS[contacted].kind : defaultKind;
    const note = contacted ? CONTACT_PROMPTS[contacted].note : '';
    setContacted(null);
    setLogging({ kind, note });
  };

  const details: KeyValueItem[] = [
    { label: 'Business', value: lead.business },
    { label: 'Email', value: lead.email || null, link: 'email' },
    { label: 'Phone', value: lead.phone ? formatPhone(lead.phone) : null, link: 'phone' },
    ...(lead.website ? [{ label: 'Website', value: lead.website, copyable: true }] : []),
    ...(qualifiers
      ? [
          { label: 'Need', value: lead.need ? needLabel(meta, lead.need) : null },
          { label: 'Revenue', value: lead.revenue ? revenueLabel(meta, lead.revenue) : null },
        ]
      : []),
    { label: outreach ? 'Added' : 'Received', value: formatWhen(lead.createdAt, now) },
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
        <LeadContactActions lead={lead} onContacted={canLog ? setContacted : undefined} />
      </View>

      {contacted ? (
        <View style={styles.prompt}>
          <ContactLogPrompt
            channel={contacted}
            name={firstName(lead, title)}
            onLog={logFromButton}
            onDismiss={() => setContacted(null)}
          />
        </View>
      ) : null}

      {clientAction === 'open' && clientId ? (
        <Button
          label="Open client"
          variant="secondary"
          icon={ExternalLink}
          fullWidth
          accessibilityHint="This lead is already a client. Opens the client."
          onPress={() => router.push({ pathname: '/clients/[id]', params: { id: clientId } })}
          style={styles.primary}
        />
      ) : clientAction === 'create' ? (
        <Button
          label="Create client from this lead"
          icon={Building2}
          fullWidth
          accessibilityHint="Opens New client with this lead's details filled in"
          onPress={() => router.push({ pathname: '/clients/new', params: newClientParams(lead) })}
          style={styles.primary}
        />
      ) : null}

      {lead.bookingAt ? (
        <View style={styles.bookingWrap}>
          <BookingCard instant={lead.bookingAt} now={now} />
        </View>
      ) : null}

      <View style={styles.details}>
        <OutreachCard lead={lead} meta={meta} now={now} touches={touches} onLog={logFromButton} />
      </View>

      {/* Demo requests for this lead and "Request a demo" (2026-10-05). */}
      <DemoCard target={{ leadId: lead.id }} businessName={lead.business} style={styles.demo} />

      <Section
        title="Details"
        action={onEdit ? { label: 'Edit lead', onPress: onEdit, accessibilityHint: 'Opens the lead details to change them' } : undefined}
      >
        <Card padded={false}>
          <KeyValue items={details} />
        </Card>
      </Section>

      {lead.message?.trim() ? (
        <Section title={outreach ? 'Note' : 'Message'} spacing={outreach ? space[2] : undefined}>
          <Card>
            <Text variant="body" selectable>
              {lead.message}
            </Text>
          </Card>
        </Section>
      ) : null}

      {/* A lead added by hand never visited the site: no attribution to show. */}
      {outreach ? null : (
        <Section title="Attribution" spacing={space[2]}>
          <Card padded={false}>
            <KeyValue items={attribution} />
          </Card>
        </Section>
      )}

      {logging ? <LogTouchSheet lead={lead} meta={meta} kind={logging.kind} note={logging.note} onClose={() => setLogging(null)} /> : null}
    </View>
  );
}

/**
 * Lead detail (brief 8.6, GET /leads/:id): the name as the large title, the
 * status and source, one-tap Call, Email, Text and Copy (then "Log this call"),
 * "Create client from this lead" (or "Open client" once it became one), the
 * booked call in Toronto time, Outreach (status, follow-up, owner, "Log
 * outreach" and the touches timeline), every field with the brief's labels,
 * the message as typed and the attribution (not for leads added by hand).
 * "Edit lead" (the pencil in the header, and next to Details) opens the
 * details to change, only when the server says `canEdit`.
 * Opened from a list row or Home, it shows the lead already in the cache at
 * once, then loads the full record and its touches. Needs `leads.view`; the
 * client button and the outreach controls follow the person's capabilities.
 */
export function LeadDetailScreen() {
  return (
    <RequireCapability cap="leads.view">
      <LeadDetail />
    </RequireCapability>
  );
}

function LeadDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const now = useMinuteClock();
  // Most leads are not clients yet: the skeleton keeps the button's room only for people who can create one.
  const mayCreateClient = useCanAll('leads.convert', 'clients.create');

  // The row it was opened from is on screen at once; the full record always loads behind it.
  const query = useQuery({ ...leadQuery(id), enabled: id !== '', refetchOnMount: 'always' });
  const meta = useQuery(leadsMetaQuery());
  // A 404 means the lead is gone: say so instead of showing what was cached.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  // The outreach timeline loads next to the lead, not after it.
  const touchesQuery = useInfiniteQuery({ ...touchesInfiniteQuery(id), enabled: id !== '' && !notFound });

  // Back on this screen (from New client, the dialer, another tab) or back in the app: load it again,
  // so a lead that just became a client shows "Open client". A fetch under 5s old is reused.
  useRefetchOnFocus((options) => (id ? query.refetch(options) : undefined), query.dataUpdatedAt);
  useRefetchOnFocus((options) => (id && !notFound ? touchesQuery.refetch(options) : undefined), touchesQuery.dataUpdatedAt);

  const lead = notFound ? undefined : query.data;
  // An older server sends no canEdit: no Edit button.
  const canEdit = lead?.canEdit === true;
  const [editing, setEditing] = useState(false);
  const edit = canEdit ? () => setEditing(true) : undefined;
  // "That email is already a lead" on Edit lead: Leads, searching for it (the website's /admin/leads?q=).
  const findExisting = (email: string) => {
    setEditing(false);
    openHref({ pathname: '/customers', params: { segment: 'leads', q: email } });
  };

  const touches: TouchesState = {
    data: touchesQuery.data,
    isPending: touchesQuery.isPending,
    isError: touchesQuery.isError && touchesQuery.data === undefined,
    error: touchesQuery.error,
    paused: touchesQuery.isPending && touchesQuery.fetchStatus === 'paused',
    hasMore: touchesQuery.hasNextPage,
    loadingMore: touchesQuery.isFetchingNextPage,
    loadMoreFailed: touchesQuery.isFetchNextPageError,
    refetch: () => touchesQuery.refetch(),
    loadMore: () => (touchesQuery.isFetchingNextPage ? undefined : touchesQuery.fetchNextPage()),
  };

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (lead) {
    body = <LeadBody lead={lead} meta={meta.data} now={now} touches={touches} onEdit={edit} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = showSkeleton ? <LeadDetailSkeleton withTitle={false} withButton={mayCreateClient} /> : null;
  }

  return (
    <Screen
      title={lead ? leadTitle(lead) : undefined}
      back
      onRefresh={id ? () => Promise.all([query.refetch(), meta.refetch(), notFound ? null : touchesQuery.refetch()]) : undefined}
      refetching={query.isFetching && !query.isPending}
      queryKey={leadKeys.detail(id)}
      headerRight={edit ? <IconButton icon={PenLine} accessibilityLabel="Edit lead" onPress={edit} /> : undefined}
    >
      {body}
      {/* Stays open if canEdit changes meanwhile: a save then says why (403) and closes. */}
      {editing && lead ? <EditLeadSheet lead={lead} meta={meta.data} onClose={() => setEditing(false)} onFindExisting={findExisting} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  actions: { marginTop: space[5] },
  primary: { marginTop: space[5] },
  bookingWrap: { marginTop: space[5] },
  prompt: { marginTop: space[4] },
  details: { marginTop: layout.sectionGap },
  demo: { marginBottom: layout.sectionGap },
  booking: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  bookingIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bookingText: { flex: 1, gap: 2 },
});
