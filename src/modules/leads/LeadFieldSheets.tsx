import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { assigneesQuery, updateLead } from '@/api/endpoints/leads';
import { MESSAGES } from '@/api/errors';
import type { Lead, LeadStatus, LeadsMeta } from '@/api/schemas/leads';
import { useMe } from '@/auth/session';
import { ErrorState } from '@/components/ErrorState';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { applyLead, refreshAfterLeadWrite } from './cache';
import { leadTitle, statusOptions } from './logic';
import { CALENDAR_STATUS_HINT, isMe, isSettableStatus, staffName } from './outreach';

/** The "Nobody" choice (no email is empty). */
const NOBODY = '';

/* ---------- status ---------- */

export type LeadStatusSheetProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  onClose: () => void;
};

/**
 * The lead's status (PATCH /leads/:id `status`, `leads.update`): the statuses
 * from meta in the server's order. Booked and Cancelled come from the booking
 * calendar, so they are shown but cannot be picked. Saving waits for the
 * server; Home refreshes too (booked calls and recent leads show statuses).
 * Mounted only while open.
 */
export function LeadStatusSheet({ lead, meta, onClose }: LeadStatusSheetProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LeadStatus>(lead.status);
  const options: SelectOption<LeadStatus>[] = statusOptions(meta).map((o) =>
    isSettableStatus(o.value) ? o : { ...o, disabled: true, hint: CALENDAR_STATUS_HINT },
  );
  const label = options.find((o) => o.value === draft)?.label ?? draft;

  const save = async () => {
    if (!isSettableStatus(draft) || draft === lead.status) {
      onClose();
      return;
    }
    const updated = await updateLead(lead.id, { status: draft });
    applyLead(queryClient, updated);
    refreshAfterLeadWrite(queryClient, { overview: true });
    haptics.success();
    notice.ok(`Marked ${label.toLowerCase()}.`);
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Status"
      subtitle={leadTitle(lead)}
      scrollable
      footer={
        <PendingButton
          label="Save status"
          pendingLabel="Saving"
          fullWidth
          disabled={draft === lead.status || !isSettableStatus(draft)}
          onPress={save}
        />
      }
    >
      <View style={styles.body}>
        {lead.bookingAt ? (
          <Text variant="small" color="ink3">
            This lead booked a call. The booking calendar sets Booked or Cancelled again if the call is moved or cancelled.
          </Text>
        ) : null}
        <OptionList<LeadStatus> options={options} value={draft} onChange={setDraft} accessibilityLabel="Lead status" />
      </View>
    </Sheet>
  );
}

/* ---------- assigned to ---------- */

export type AssigneeSheetProps = {
  lead: Lead;
  onClose: () => void;
};

/**
 * Who owns the lead (PATCH /leads/:id `assignedTo`, `leads.update`): the team
 * from GET /leads/assignees, plus "Nobody". The signed-in person is marked
 * "You". Saving waits for the server. Mounted only while open.
 */
export function AssigneeSheet({ lead, onClose }: AssigneeSheetProps) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const me = useMe();
  const team = useQuery(assigneesQuery());
  const current = lead.assignedTo?.email ?? NOBODY;
  const [draft, setDraft] = useState<string>(current);

  // Someone who left the team still shows as the current owner.
  const people = [...(team.data ?? [])];
  if (lead.assignedTo && !people.some((p) => p.email === lead.assignedTo?.email)) people.unshift(lead.assignedTo);
  const options: SelectOption<string>[] = [
    { value: NOBODY, label: 'Nobody', hint: 'Anyone on the team can pick it up' },
    ...people.map((p) => ({
      value: p.email,
      label: staffName(p),
      hint: [isMe(p, me?.user.email) ? 'You' : null, p.name ? p.email : null].filter(Boolean).join(' · ') || undefined,
    })),
  ];
  const chosen = options.find((o) => o.value === draft);

  const save = async () => {
    if (draft === current) {
      onClose();
      return;
    }
    const updated = await updateLead(lead.id, { assignedTo: draft === NOBODY ? null : draft });
    applyLead(queryClient, updated);
    refreshAfterLeadWrite(queryClient);
    haptics.success();
    notice.ok(draft === NOBODY ? 'Nobody owns this lead now.' : `Assigned to ${chosen?.label ?? draft}.`);
    onClose();
  };

  let body: ReactNode;
  if (team.data) {
    body = <OptionList<string> options={options} value={draft} onChange={setDraft} accessibilityLabel="Assigned to" />;
  } else if (team.isPending && team.fetchStatus === 'paused') {
    // Offline with no team loaded yet: say so instead of a skeleton that never ends.
    body = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => team.refetch() : undefined} />;
  } else if (team.isError) {
    body = <ErrorState compact error={team.error} onRetry={() => team.refetch()} />;
  } else {
    body = <SkeletonList rows={4} trailing={false} />;
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Assigned to"
      subtitle={leadTitle(lead)}
      scrollable
      footer={<PendingButton label="Save" pendingLabel="Saving" fullWidth disabled={draft === current || !team.data} onPress={save} />}
    >
      <View style={styles.body}>{body}</View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[2] },
});
