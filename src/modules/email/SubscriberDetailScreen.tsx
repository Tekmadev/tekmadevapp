import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { MailX, ScanSearch, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteSubscriber, emailKeys, emailMetaQuery, subscriberQuery, unsubscribeSubscriber } from '@/api/endpoints/email';
import { ApiError, MESSAGES } from '@/api/errors';
import type { ConsentEvent, EmailMeta, Subscriber } from '@/api/schemas/email';
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { goBack } from '@/components/Header';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatDateTime } from '@/lib/dates';
import { notice } from '@/lib/notice';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { ConsentTimeline } from './components/ConsentTimeline';
import { SubscriberDetailSkeleton } from './components/EmailSkeleton';
import { afterErase, afterUnsubscribe, cachedSubscriber } from './data';
import {
  crmBadge,
  EMAIL_COPY,
  eraseMessage,
  leftLine,
  reasonLabel,
  signupSourceLabel,
  subscriberStatusBadge,
  unsubscribeMessage,
  unsubscribeSourceLabel,
} from './logic';

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';

type Confirming = 'unsubscribe' | 'erase' | null;

/** The label of the "when they left" row, by how they left. */
const LEFT_LABEL: Record<Exclude<Subscriber['status'], 'active'>, string> = {
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
};

function facts(s: Subscriber, meta: EmailMeta | undefined, now: Date): KeyValueItem[] {
  const crm = crmBadge(s.inCrm);
  return [
    { label: 'Email', value: s.email, copyable: true },
    { label: 'Signed up', value: formatDateTime(s.signedUpAt, now) },
    { label: 'Source', value: signupSourceLabel(meta, s.source) },
    { label: 'Country', value: s.country },
    { label: 'CRM', value: crm.label, render: <Badge label={crm.label} tone={crm.tone} /> },
    ...(s.status !== 'active'
      ? [
          { label: LEFT_LABEL[s.status], value: s.unsubscribedAt ? formatDateTime(s.unsubscribedAt, now) : null },
          ...(s.unsubscribeSource ? [{ label: 'How', value: unsubscribeSourceLabel(meta, s.unsubscribeSource) }] : []),
          ...(s.reason ? [{ label: 'Reason', value: reasonLabel(meta, s.reason) }] : []),
        ]
      : []),
  ];
}

/**
 * One subscriber (brief 8.11, GET /email/subscribers/:id; deep link
 * /admin/email/subscribers/<id>): status and CRM badges, the facts, "Inspect
 * in CRM", the consent history timeline, Unsubscribe (active only) and
 * permanent erasure, both behind HoldToConfirm and both waiting for the
 * server (they touch the CRM). Opened from a row, the header shows at once
 * from the cached list while the history loads. Needs
 * `email.subscribers.view`; Unsubscribe and Delete need
 * `email.subscribers.write`, and "Inspect in CRM" needs `crm.view`.
 */
export function SubscriberDetailScreen() {
  return (
    <RequireCapability cap="email.subscribers.view">
      <SubscriberBody />
    </RequireCapability>
  );
}

function SubscriberBody() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id);
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const now = useMinuteClock();
  const canWrite = useCan('email.subscribers.write');
  const canInspect = useCan('crm.view');
  const [fromList] = useState(() => (id ? cachedSubscriber(queryClient, id) : undefined));
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [erased, setErased] = useState(false);

  const meta = useQuery(emailMetaQuery());
  const query = useQuery({ ...subscriberQuery(id), enabled: id !== '' && !erased });
  useRefetchOnFocus((options) => (id && !erased ? query.refetch(options) : undefined), query.dataUpdatedAt);

  // A 404 means the subscriber is gone (erased elsewhere): say so instead of showing what was cached.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const detail = notFound ? undefined : query.data;
  const subscriber = detail?.subscriber ?? (notFound ? undefined : fromList);

  const unsubscribe = async () => {
    const result = await unsubscribeSubscriber(id);
    queryClient.setQueryData(emailKeys.subscriber(id), result);
    afterUnsubscribe(queryClient, result.subscriber);
    notice.ok(EMAIL_COPY.unsubscribed);
  };

  const erase = async () => {
    await deleteSubscriber(id);
    setErased(true);
    afterErase(queryClient, id);
    notice.ok(EMAIL_COPY.deleted);
    goBack();
  };

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (subscriber) {
    body = (
      <SubscriberView
        subscriber={subscriber}
        history={detail?.consentHistory}
        historyNode={
          detail ? null : query.isError ? (
            <ErrorState compact error={query.error} onRetry={() => query.refetch()} />
          ) : query.fetchStatus === 'paused' ? (
            <ErrorState compact message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />
          ) : (
            <SubscriberDetailSkeleton withHeader={false} />
          )
        }
        meta={meta.data}
        now={now}
        canWrite={canWrite}
        canInspect={canInspect}
        onUnsubscribe={() => setConfirming('unsubscribe')}
        onErase={() => setConfirming('erase')}
      />
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = <SubscriberDetailSkeleton withHeader />;
  }

  const email = subscriber?.email ?? '';

  return (
    <>
      <Screen
        title="Subscriber"
        back
        onRefresh={id && !erased ? () => Promise.all([query.refetch(), meta.refetch()]) : undefined}
        refetching={query.isFetching && !query.isPending}
        queryKey={emailKeys.subscriber(id)}
      >
        {body}
      </Screen>
      <ConfirmSheet
        visible={confirming === 'unsubscribe'}
        onClose={() => setConfirming(null)}
        title="Unsubscribe?"
        message={unsubscribeMessage(email)}
        confirmLabel="Hold to unsubscribe"
        pendingLabel="Unsubscribing"
        tone="ink"
        onConfirm={unsubscribe}
      />
      <ConfirmSheet
        visible={confirming === 'erase'}
        onClose={() => setConfirming(null)}
        title="Delete for good?"
        message={eraseMessage(email)}
        confirmLabel="Hold to erase"
        pendingLabel="Erasing"
        onConfirm={erase}
      />
    </>
  );
}

type SubscriberViewProps = {
  subscriber: Subscriber;
  /** Undefined until the detail loads (the header came from the cached list). */
  history: readonly ConsentEvent[] | undefined;
  /** What stands in for the history while it is missing (skeleton, error). */
  historyNode: ReactNode;
  meta: EmailMeta | undefined;
  now: Date;
  /** `email.subscribers.write`: Unsubscribe and Delete permanently. */
  canWrite: boolean;
  /** `crm.view`: "Inspect in CRM". */
  canInspect: boolean;
  onUnsubscribe: () => void;
  onErase: () => void;
};

function SubscriberView({ subscriber, history, historyNode, meta, now, canWrite, canInspect, onUnsubscribe, onErase }: SubscriberViewProps) {
  const status = subscriberStatusBadge(meta, subscriber.status);
  const crm = crmBadge(subscriber.inCrm);
  const left = leftLine(meta, subscriber);

  return (
    <View>
      <Text variant="headlineSmall" selectable>
        {subscriber.email}
      </Text>
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} size="md" dot />
        <Badge label={crm.label} tone={crm.tone} size="md" />
      </View>
      {left ? (
        <Text variant="body" color="ink2" style={styles.left}>
          {left}
        </Text>
      ) : null}

      {canInspect ? (
        <Button
          label="Inspect in CRM"
          icon={ScanSearch}
          variant="secondary"
          fullWidth
          accessibilityHint="Compares this address here and in the CRM"
          onPress={() => router.push({ pathname: '/crm/inspect', params: { email: subscriber.email } })}
          style={styles.inspect}
        />
      ) : null}

      <Section title="Details" style={styles.details}>
        <Card padded={false}>
          <KeyValue items={facts(subscriber, meta, now)} />
        </Card>
      </Section>

      <Section title="Consent history">
        {history ? (
          history.length > 0 ? (
            <ConsentTimeline events={history} meta={meta} now={now} />
          ) : (
            <Text variant="body" color="ink3">
              No consent events on record.
            </Text>
          )
        ) : (
          historyNode
        )}
      </Section>

      {canWrite ? (
        <View style={styles.actions}>
          {subscriber.status === 'active' ? (
            <Button
              label="Unsubscribe"
              icon={MailX}
              variant="secondary"
              fullWidth
              accessibilityHint="Asks you to hold to confirm"
              onPress={onUnsubscribe}
            />
          ) : null}
          <Button
            label="Delete permanently"
            icon={Trash2}
            variant="destructive"
            fullWidth
            accessibilityHint="Erases this subscriber. Asks you to hold to confirm"
            onPress={onErase}
          />
        </View>
      ) : (
        <View style={styles.end} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  left: { marginTop: space[3] },
  inspect: { marginTop: space[5] },
  details: { marginTop: layout.sectionGap },
  actions: { gap: space[3], paddingBottom: space[6] },
  end: { height: space[6] },
});
