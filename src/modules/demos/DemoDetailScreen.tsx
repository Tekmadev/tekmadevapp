import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheckBig, ExternalLink, Hammer, PenLine, Undo2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { demoKeys, demoQuery, updateDemo, type DemoPatch } from '@/api/endpoints/demos';
import { assigneesQuery } from '@/api/endpoints/leads';
import { ApiError, MESSAGES } from '@/api/errors';
import type { DemoRequest, DemoStatus } from '@/api/schemas/demos';
import { useCanAny } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { useMe } from '@/auth/session';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { SkeletonList, useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme, type Theme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { notice } from '@/lib/notice';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { applyDemo, showDemoError } from './cache';
import { DemoBuilderSheet, DemoEditSheet, DemoLinkSheet, DemoNoteSheet } from './DemoSheets';
import { DemoTimeline } from './DemoTimeline';
import { demoRowSubtitle, demoStatusBadge, demoSteps, demoTargetName, displayLink, isDemoLink, neededByBadge, personName, type DemoStep } from './labels';

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Opens the demo in a Custom Tab tinted like the app. */
function openDemo(url: string, colors: Theme['colors']) {
  if (!isDemoLink(url)) return;
  WebBrowser.openBrowserAsync(url.trim(), {
    toolbarColor: colors.bg,
    secondaryToolbarColor: colors.bg,
    showTitle: true,
    enableBarCollapsing: true,
  }).catch(() => notice.err('Could not open the demo.'));
}

type OpenSheet = 'edit' | 'link' | 'linkReady' | 'builder' | 'note' | 'cancel' | 'shown' | null;

/**
 * A demo request (contract 2026-10-05, GET /demos/:id): the status, when it
 * is needed, "Open demo" (in a Custom Tab) once there is a link, the
 * builder's note, the business and what the client wants, who asked and who
 * builds it, and the history. Every action follows the server's `can`:
 * builders (`can.manage`) get the status steps, the link, the builder and the
 * note; the requester edits or cancels while it is open and marks it shown
 * once ready. "Mark ready to show" without a link is refused by the server and
 * its message shows under the button, with a way to add the link. Opened
 * from a list row, it shows the row at once and loads the full request.
 */
export function DemoDetailScreen() {
  return (
    <RequireCapability cap="demos.view">
      <DemoDetail />
    </RequireCapability>
  );
}

function DemoDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const now = useMinuteClock();
  const query = useQuery({ ...demoQuery(id), enabled: id !== '', refetchOnMount: 'always' });
  useRefetchOnFocus((options) => (id ? query.refetch(options) : undefined), query.dataUpdatedAt);

  // A 404 means it is gone: say so instead of showing what was cached.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const demo = notFound ? undefined : query.data;

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (demo) {
    body = <DemoBody demo={demo} now={now} historyLoading={query.isFetching} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = showSkeleton ? <SkeletonList rows={6} trailing={false} /> : null;
  }

  return (
    <Screen
      title={demo?.business.name}
      subtitle={demo ? demoRowSubtitle(demo) : undefined}
      back
      onRefresh={id ? () => query.refetch() : undefined}
      refetching={query.isFetching && !query.isPending}
      queryKey={demoKeys.detail(id)}
    >
      {body}
    </Screen>
  );
}

function DemoBody({ demo, now, historyLoading }: { demo: DemoRequest; now: Date; historyLoading: boolean }) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const me = useMe();
  const myEmail = me?.user.email.toLowerCase() ?? '';
  // Builder names come from the team list (GET /leads/assignees), for people who may read it.
  const seesTeam = useCanAny('leads.update', 'leads.create');
  const team = useQuery({ ...assigneesQuery(), enabled: seesTeam });
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const close = () => setSheet(null);

  const nameFor = (email: string) => {
    const lower = email.toLowerCase();
    const member = team.data?.find((m) => m.email === lower);
    if (member) return personName(member.email, member.name);
    if (lower === demo.requestedBy.toLowerCase()) return personName(demo.requestedBy, demo.requestedByName);
    if (lower === myEmail) return personName(email, me?.user.name);
    return email;
  };

  const status = demoStatusBadge(demo.status);
  const needed = neededByBadge(demo.neededBy, demo.status, now);
  const link = isDemoLink(demo.demoUrl) ? demo.demoUrl : null;
  const steps = demoSteps(demo);
  const target = demoTargetName(demo);
  // List rows carry no events: the history is still loading.
  const historyPending = demo.events.length === 0;

  /** A status step. "Start building" makes you the builder when nobody is. */
  const step = async (s: DemoStep) => {
    setStepError(null);
    const patch: DemoPatch = { status: s.status };
    if (s.status === 'building' && demo.status === 'requested' && !demo.builderEmail && myEmail) patch.builderEmail = myEmail;
    const updated = await updateDemo(demo.id, patch);
    applyDemo(queryClient, updated);
    haptics.success();
    notice.ok(stepDone(s.status, demo.status));
  };
  const stepFailed = (error: unknown) => {
    // Ready without a link: the server's message right here, with a way to add it.
    if (error instanceof ApiError && error.status === 400 && error.code === 'demo_url') {
      haptics.error();
      setStepError(error.message);
      return;
    }
    showDemoError(error, queryClient, demo.id);
  };

  const closeRequest = async (to: Extract<DemoStatus, 'shown' | 'cancelled'>) => {
    const updated = await updateDemo(demo.id, { status: to });
    applyDemo(queryClient, updated);
    haptics.success();
    notice.ok(to === 'shown' ? 'Marked as shown.' : 'Request cancelled.');
  };

  const business: KeyValueItem[] = [
    { label: 'Business name', value: demo.business.name },
    { label: 'Kind of business', value: demo.business.type },
    { label: 'Area they serve', value: demo.business.area },
    { label: 'What they sell or do', value: demo.business.offer },
    { label: 'Current website or socials', value: demo.business.website, copyable: demo.business.website !== null },
    { label: 'Logo and brand colours', value: demo.business.brand },
    { label: 'Their customers', value: demo.business.customers },
  ];

  const openTarget = demo.clientId
    ? () => router.push({ pathname: '/clients/[id]', params: { id: demo.clientId ?? '' } })
    : demo.leadId
      ? () => router.push({ pathname: '/leads/[id]', params: { id: demo.leadId ?? '' } })
      : undefined;
  const request: KeyValueItem[] = [
    { label: demo.clientId ? 'Client' : 'Lead', value: target ?? (demo.clientId ? 'A client' : 'A lead'), onPress: openTarget },
    { label: 'Needed by', value: demo.neededBy ? formatCalendarDate(demo.neededBy, now, true) : 'No date' },
    { label: 'Asked by', value: personName(demo.requestedBy, demo.requestedByName) },
    { label: 'Asked on', value: formatDateTime(demo.createdAt, now) },
    { label: 'Builder', value: demo.builderEmail ? nameFor(demo.builderEmail) : 'Nobody yet' },
  ];

  const manageRows: KeyValueItem[] = [
    { label: 'Builder', value: demo.builderEmail ? nameFor(demo.builderEmail) : 'Nobody yet', onPress: () => setSheet('builder') },
    { label: 'Demo link', value: demo.demoUrl ? displayLink(demo.demoUrl) : 'Not added yet', onPress: () => setSheet('link') },
    { label: 'Note for the salesperson', value: demo.builderNote ? 'Added' : 'None', onPress: () => setSheet('note') },
  ];

  return (
    <View>
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} size="md" dot />
        {needed ? <Badge label={needed.label} tone={needed.tone} size="md" /> : null}
      </View>

      {link || demo.builderNote || demo.can.markShown ? (
        <Card style={styles.ready}>
          {link ? (
            <View style={styles.linkLine}>
              <Text variant="eyebrow">Demo</Text>
              <Text variant="body" family="mono" color="ink2" numberOfLines={1} selectable>
                {displayLink(link)}
              </Text>
            </View>
          ) : null}
          {demo.builderNote ? (
            <View style={styles.note}>
              <Text variant="eyebrow">Note from the builder</Text>
              <Text variant="body" selectable>
                {demo.builderNote}
              </Text>
            </View>
          ) : null}
          {link ? (
            <Button label="Open demo" icon={ExternalLink} variant="gold" fullWidth onPress={() => openDemo(link, colors)} accessibilityHint="Opens the demo in the browser" />
          ) : null}
          {demo.can.markShown ? (
            <Button
              label="Mark as shown"
              icon={CircleCheckBig}
              variant="secondary"
              fullWidth
              onPress={() => setSheet('shown')}
              accessibilityHint="Closes the request once you have shown the demo"
            />
          ) : null}
        </Card>
      ) : null}

      {demo.can.manage ? (
        <Section title="Build" style={styles.firstSection}>
          {steps.length > 0 ? (
            <View style={styles.steps}>
              {steps.map((s) => (
                <PendingButton
                  key={s.status}
                  label={s.label}
                  pendingLabel="Saving"
                  icon={s.status === 'building' && demo.status === 'ready' ? Undo2 : s.status === 'building' ? Hammer : CircleCheckBig}
                  variant={demo.status === 'ready' ? 'secondary' : 'primary'}
                  fullWidth
                  accessibilityHint={s.hint}
                  onPress={() => step(s)}
                  onError={stepFailed}
                />
              ))}
              {stepError ? (
                <View style={styles.stepError} accessibilityLiveRegion="polite">
                  <Text variant="small" color="signal" weight="500">
                    {stepError}
                  </Text>
                  <Button label="Add the link" variant="secondary" size="sm" onPress={() => setSheet('linkReady')} style={styles.addLink} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Card padded={false}>
            <KeyValue items={manageRows} />
          </Card>
        </Section>
      ) : null}

      <Section title="Business" style={demo.can.manage ? undefined : styles.firstSection}>
        <Card padded={false}>
          <KeyValue items={business} layout="stacked" />
        </Card>
      </Section>

      <Section title="What they want to see">
        <Card>
          <Text variant="body" color={demo.wants ? undefined : 'ink4'} selectable>
            {demo.wants ?? 'Nothing added. The builder works from the business details.'}
          </Text>
        </Card>
      </Section>

      <Section title="Request">
        <Card padded={false}>
          <KeyValue items={request} />
        </Card>
      </Section>

      <Section title="History">
        {historyPending ? (
          historyLoading ? (
            <SkeletonList rows={2} trailing={false} />
          ) : null
        ) : (
          <DemoTimeline events={demo.events} now={now} nameFor={nameFor} />
        )}
      </Section>

      {demo.can.edit || demo.can.cancel ? (
        <View style={styles.actions}>
          {demo.can.edit ? <Button label="Edit request" icon={PenLine} variant="secondary" fullWidth onPress={() => setSheet('edit')} /> : null}
          {demo.can.cancel ? (
            <Button label="Cancel request" variant="ghost" fullWidth onPress={() => setSheet('cancel')} accessibilityHint="Asks you to hold to confirm" />
          ) : null}
        </View>
      ) : null}

      {sheet === 'edit' ? <DemoEditSheet demo={demo} onClose={close} /> : null}
      {sheet === 'link' || sheet === 'linkReady' ? (
        <DemoLinkSheet
          demo={demo}
          markReady={sheet === 'linkReady'}
          onClose={() => {
            close();
            setStepError(null);
          }}
        />
      ) : null}
      {sheet === 'builder' ? <DemoBuilderSheet demo={demo} onClose={close} /> : null}
      {sheet === 'note' ? <DemoNoteSheet demo={demo} onClose={close} /> : null}
      <ConfirmSheet
        visible={sheet === 'cancel'}
        onClose={close}
        title="Cancel this request?"
        message={`The demo for ${demo.business.name} will not be built, and the request closes for good. To ask again later, request a new demo.`}
        confirmLabel="Hold to cancel the request"
        pendingLabel="Cancelling"
        onConfirm={() => closeRequest('cancelled')}
        onError={(e) => showDemoError(e, queryClient, demo.id)}
        cancelLabel="Keep it"
      />
      <ConfirmSheet
        visible={sheet === 'shown'}
        onClose={close}
        title="Mark as shown?"
        message={`Do this once you have shown the demo to ${target ?? 'the client'}. The request closes for good.`}
        confirmLabel="Hold to mark as shown"
        pendingLabel="Saving"
        tone="ink"
        onConfirm={() => closeRequest('shown')}
        onError={(e) => showDemoError(e, queryClient, demo.id)}
        cancelLabel="Not yet"
      />
    </View>
  );
}

/** The toast after a status step. */
function stepDone(to: DemoStatus, from: DemoStatus): string {
  if (to === 'building') return from === 'ready' ? 'Back to building.' : 'Building it now.';
  if (to === 'ready') return 'Ready to show. The salesperson can open it now.';
  return 'Saved.';
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  ready: { gap: space[4], marginTop: space[5] },
  linkLine: { gap: space[1] },
  note: { gap: space[1] },
  firstSection: { marginTop: layout.sectionGap },
  steps: { gap: space[3], marginBottom: space[4] },
  stepError: { gap: space[2] },
  addLink: { alignSelf: 'flex-start' },
  actions: { gap: space[2], marginTop: space[2] },
});
