import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Search, UserCheck } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { crmInspectQuery, crmKeys, resubscribeCrmContact } from '@/api/endpoints/crm';
import { emailKeys } from '@/api/endpoints/email';
import { ApiError, fieldErrors, MESSAGES } from '@/api/errors';
import type { CrmInspect } from '@/api/schemas/crm';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { JobProgress } from '@/components/automation/JobProgress';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { formatTime } from '@/lib/dates';
import { notice } from '@/lib/notice';
import { isValidEmail } from '@/lib/text';
import { metaQuery, useMinuteClock } from '@/modules/overview/hooks';

import { Comparison, ConsentHistory, InspectNote } from './components/Inspector';
import { RESUBSCRIBE } from './logic';

const INVALID_EMAIL = 'Enter a valid email.';
const ERASED_NOTE = 'This address was erased here. It is never pushed to the CRM again.';

/** The lookup key: what the API compares on (trimmed, lower case). */
const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Contact inspector (brief 8.11, owner only, pushed): one email on this site
 * and in the CRM, side by side, with the not-found reason, the erased note and
 * the consent history. Each lookup calls the CRM live, so nothing here
 * refreshes on its own: no focus, resume or reconnect refetch. Only "Look up"
 * (or a pull) asks again. Opened from a subscriber with `?email=`, it looks
 * that address up once on open, because that tap was the request.
 */
export function ContactInspectorScreen() {
  return (
    <OwnerOnly>
      <InspectorBody />
    </OwnerOnly>
  );
}

function InspectorBody() {
  const params = useLocalSearchParams<{ email?: string }>();
  const given = typeof params.email === 'string' ? params.email.trim() : '';
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const now = useMinuteClock();
  const meta = useQuery(metaQuery());

  const [text, setText] = useState(given);
  const [lookup, setLookup] = useState(() => (isValidEmail(given) ? normalize(given) : ''));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmResub, setConfirmResub] = useState(false);

  // Opened again with another address (a second subscriber): start over on that one.
  const [seenGiven, setSeenGiven] = useState(given);
  if (given !== seenGiven) {
    setSeenGiven(given);
    setText(given);
    setFieldError(null);
    setLookup(isValidEmail(given) ? normalize(given) : '');
  }

  const query = useQuery({
    ...crmInspectQuery(lookup),
    enabled: lookup !== '',
    // The one live call when the screen opens on an address; switching addresses afterwards goes through `run`.
    refetchOnMount: 'always',
  });
  const result = lookup !== '' ? query.data : undefined;

  /** One live lookup of `email`, even when an earlier answer for it is cached. */
  const run = async (email: string) => {
    try {
      await queryClient.fetchQuery({ ...crmInspectQuery(email), staleTime: 0 });
    } catch (error) {
      // The query keeps the error and the screen shows it with Retry; a bad address marks the field.
      const fields = fieldErrors(error);
      if (fields.email) setFieldError(fields.email);
    }
  };

  const submit = async () => {
    const email = normalize(text);
    if (!isValidEmail(email)) {
      setFieldError(INVALID_EMAIL);
      return;
    }
    setFieldError(null);
    setLookup(email);
    await run(email);
  };

  const lookUpAgain = () => (lookup ? run(lookup) : Promise.resolve());

  const resubscribe = async () => {
    if (!result) return;
    const email = result.email;
    const fresh = await resubscribeCrmContact(email);
    queryClient.setQueryData<CrmInspect>(crmKeys.inspect(email), fresh);
    // What the web admin refreshes: the subscriber lists and counts, and the CRM queue.
    void queryClient.invalidateQueries({ queryKey: emailKeys.subscribers() });
    void queryClient.invalidateQueries({ queryKey: emailKeys.overview() });
    void queryClient.invalidateQueries({ queryKey: crmKeys.status() });
    haptics.success();
    notice.ok('Subscriber resubscribed.');
  };

  const onResubError = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'resub_stale') {
      // Their state changed since the lookup: the answer on screen is out of date, so offer a fresh one.
      setConfirmResub(false);
      notice.err(error.message, { action: { label: 'Look up again', onPress: () => void lookUpAgain() } });
      return;
    }
    reportSubmitError(error);
  };

  const onRefresh = async () => {
    if (!connectivity.isOnline() || !lookup) return;
    await lookUpAgain();
  };

  const asking = lookup !== '' && query.isFetching && result === undefined;
  const pausedWithoutData = lookup !== '' && query.isPending && query.fetchStatus === 'paused';

  let body: ReactNode = null;
  if (result) {
    body = (
      <View style={query.isFetching ? styles.stale : null}>
        {query.isError ? (
          // A second lookup of the same address failed: the earlier answer stays, marked with when it was checked.
          <ErrorState compact error={query.error} onRetry={lookUpAgain} style={styles.noteAbove} />
        ) : null}
        <View style={styles.resultHead}>
          <Text variant="title" selectable style={styles.flex}>
            {result.email}
          </Text>
          <Text variant="small" color="ink4" tabular>
            {`Checked ${formatTime(new Date(query.dataUpdatedAt))}`}
          </Text>
        </View>
        {result.erased ? <InspectNote kind="erased" text={ERASED_NOTE} style={styles.noteAbove} /> : null}
        <Comparison result={result} now={now} />
        {result.notFoundReason ? <InspectNote kind="info" text={result.notFoundReason} style={styles.noteBelow} /> : null}
        {result.canResubscribe ? (
          <Card style={styles.resub}>
            <Text variant="body" color="ink2">
              Unsubscribed here, but the CRM shows them mailable again.
            </Text>
            <Button
              label={RESUBSCRIBE}
              icon={UserCheck}
              variant="secondary"
              fullWidth
              disabled={!online}
              onPress={() => setConfirmResub(true)}
              accessibilityHint="Asks you to hold to confirm"
            />
          </Card>
        ) : null}
        <Section title="Consent history" style={styles.history}>
          <ConsentHistory events={result.consentHistory} meta={meta.data} now={now} />
        </Section>
      </View>
    );
  } else if (asking) {
    body = (
      <Card>
        <JobProgress variant="inline" active title="Asking the CRM" note="Each lookup asks the CRM live." />
      </Card>
    );
  } else if (pausedWithoutData) {
    body = <ErrorState message={MESSAGES.network} onRetry={online ? lookUpAgain : undefined} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={lookUpAgain} />;
  }

  return (
    <Screen
      title="Contact inspector"
      back
      keyboardAware
      onRefresh={lookup ? onRefresh : undefined}
      refetching={query.isFetching && result !== undefined}
      offlineBanner={result !== undefined}
      updatedAt={result ? query.dataUpdatedAt : undefined}
    >
      <View style={styles.form}>
        <TextField
          label="Email"
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (fieldError) setFieldError(null);
          }}
          error={fieldError}
          help="Each lookup asks the CRM live."
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="search"
          onSubmitEditing={() => void submit()}
          clearable
        />
        <PendingButton label="Look up" pendingLabel="Looking up" icon={Search} onPress={submit} fullWidth />
      </View>
      {body}
      {result && result.canResubscribe ? (
        <ConfirmSheet
          visible={confirmResub}
          onClose={() => setConfirmResub(false)}
          title="Resubscribe them?"
          message={`Only when ${result.email} asked to come back. They are marked active here again and get marketing email from the CRM.`}
          confirmLabel="Hold to resubscribe"
          pendingLabel="Resubscribing"
          tone="ink"
          onConfirm={resubscribe}
          onError={onResubError}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[3], marginBottom: space[6] },
  stale: { opacity: 0.6 },
  flex: { flex: 1 },
  resultHead: { flexDirection: 'row', alignItems: 'baseline', gap: space[2], marginBottom: space[3] },
  resub: { gap: space[3], marginTop: space[3] },
  noteAbove: { marginBottom: space[3] },
  noteBelow: { marginTop: space[3] },
  history: { marginTop: space[6] },
});
