import type { InfiniteData } from '@tanstack/react-query';
import { ChevronRight, PenLine } from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import type { Lead, LeadsMeta, TouchPage } from '@/api/schemas/leads';
import { useCan } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { formatFieldDateTime } from '@/components/form/dateTime';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Section } from '@/components/Section';
import { SkeletonList, useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { FollowUpSheet } from './FollowUpSheet';
import { AssigneeSheet, LeadStatusSheet } from './LeadFieldSheets';
import { statusBadge } from './logic';
import { followUpBadge, staffName } from './outreach';
import { TouchTimeline } from './TouchTimeline';

/** The touches query as the detail screen holds it (it also refetches it on pull and focus). */
export type TouchesState = {
  data: InfiniteData<TouchPage> | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  paused: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  refetch: () => unknown;
  loadMore: () => unknown;
};

type RowProps = {
  label: string;
  /** What TalkBack reads after the label. */
  spoken: string;
  children: ReactNode;
  /** Opens the editor; none: read only (no `leads.update`). */
  onPress?: () => void;
  hint?: string;
};

/** One line of the outreach card: label left, value right, a chevron when it opens an editor. */
function Row({ label, spoken, children, onPress, hint }: RowProps) {
  const body = (
    <View style={styles.row}>
      <Text variant="small" color="ink3" style={styles.label}>
        {label}
      </Text>
      <View style={styles.value}>{children}</View>
      {onPress ? <Icon icon={ChevronRight} size={18} color="ink4" /> : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}, ${spoken}`}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={onPress} pressedScale={0.99} accessibilityRole="button" accessibilityLabel={`${label}, ${spoken}`} accessibilityHint={hint}>
      {body}
    </PressableScale>
  );
}

type Editor = 'status' | 'followUp' | 'assignee' | null;

export type OutreachCardProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  now: Date;
  touches: TouchesState;
  /** Opens "Log outreach" (the detail screen owns that sheet: the contact prompt opens it too). */
  onLog: () => void;
};

/**
 * Outreach on the lead detail: the status, the next follow-up (overdue in
 * signal, today in gold), who owns the lead and who added it, each opening its
 * editor for people with `leads.update`; "Log outreach" for `leads.outreach`;
 * then the touches timeline with its own loading, failure and empty states.
 */
export function OutreachCard({ lead, meta, now, touches, onLog }: OutreachCardProps) {
  const canUpdate = useCan('leads.update');
  const canLog = useCan('leads.outreach');
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const [editor, setEditor] = useState<Editor>(null);
  const close = () => setEditor(null);
  const open = (next: Exclude<Editor, null>) => (canUpdate ? () => setEditor(next) : undefined);

  const status = statusBadge(meta, lead.status);
  const followUp = lead.followUpAt ?? null;
  const badge = followUpBadge(followUp, now);
  const followUpText = followUp ? formatFieldDateTime(followUp, now) : 'None planned';
  const owner = lead.assignedTo ? staffName(lead.assignedTo) : 'Nobody';

  const rows: ReactNode[] = [
    <Row key="status" label="Status" spoken={status.label} onPress={open('status')} hint="Changes the status">
      <Badge label={status.label} tone={status.tone} dot />
    </Row>,
    <Row
      key="followUp"
      label="Follow-up"
      spoken={[followUpText, badge?.label].filter(Boolean).join(', ')}
      onPress={open('followUp')}
      hint={followUp ? 'Changes or clears the follow-up' : 'Plans the next follow-up'}
    >
      <Text variant="body" color={followUp ? undefined : 'ink4'} tabular align="right">
        {followUpText}
      </Text>
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
    </Row>,
    <Row key="owner" label="Assigned to" spoken={owner} onPress={open('assignee')} hint="Changes who owns this lead">
      <Text variant="body" color={lead.assignedTo ? undefined : 'ink4'} align="right" numberOfLines={2}>
        {owner}
      </Text>
    </Row>,
  ];
  if (lead.addedBy) {
    const by = staffName(lead.addedBy);
    rows.push(
      <Row key="addedBy" label="Added by" spoken={by}>
        <Text variant="body" align="right" numberOfLines={2}>
          {by}
        </Text>
      </Row>,
    );
  }

  let timeline: ReactNode;
  const count = touches.data?.pages.reduce((n, p) => n + p.items.length, 0) ?? 0;
  if (touches.data && count > 0) {
    timeline = (
      <>
        <TouchTimeline
          data={touches.data}
          meta={meta}
          now={now}
          hasMore={touches.hasMore}
          loadingMore={touches.loadingMore}
          onLoadMore={() => touches.loadMore()}
        />
        {touches.loadMoreFailed ? <ErrorState compact error={touches.error} onRetry={() => touches.loadMore()} /> : null}
      </>
    );
  } else if (touches.data) {
    timeline = <EmptyState compact message="No outreach logged yet." />;
  } else if (touches.paused) {
    // Offline with nothing cached: say so instead of a skeleton that never ends.
    timeline = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => touches.refetch() : undefined} />;
  } else if (touches.isError) {
    timeline = <ErrorState compact error={touches.error} onRetry={() => touches.refetch()} />;
  } else {
    timeline = showSkeleton ? <SkeletonList rows={2} trailing={false} dividers={false} /> : <View style={styles.placeholder} />;
  }

  return (
    <Section title="Outreach">
      <Card padded={false}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <Divider inset={layout.gutter} insetEnd={layout.gutter} /> : null}
            {row}
          </Fragment>
        ))}
      </Card>

      {canLog ? (
        <Button
          label="Log outreach"
          icon={PenLine}
          variant="secondary"
          fullWidth
          onPress={onLog}
          accessibilityHint="Logs a call, email, DM or meeting with this lead"
          style={styles.log}
        />
      ) : null}

      <Card style={styles.timeline}>{timeline}</Card>

      {editor === 'status' ? <LeadStatusSheet lead={lead} meta={meta} onClose={close} /> : null}
      {editor === 'followUp' ? <FollowUpSheet lead={lead} onClose={close} /> : null}
      {editor === 'assignee' ? <AssigneeSheet lead={lead} onClose={close} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[3],
  },
  label: { flexShrink: 0, minWidth: 88 },
  value: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: space[2] },
  log: { marginTop: space[4] },
  timeline: { marginTop: space[4] },
  placeholder: { minHeight: 72 },
});
