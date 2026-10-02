import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { sendMemberLink, updateMember, type MemberPatch } from '@/api/endpoints/clients';
import { MESSAGES } from '@/api/errors';
import type { Member, MemberRole, MemberStatus } from '@/api/schemas/clients';
import { Select } from '@/components/form/Select';
import { KeyValue } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatDateTime, relativeTime } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { labelOf, optionsOf, type ClientLabels } from '../labels';
import { refreshClient, updateBundle, upsertById } from '../sectionData';
import { memberLinkAction, memberName, NO_LOGIN } from './teamText';

export type MemberSheetProps = {
  clientId: string;
  member: Member;
  labels: ClientLabels;
  onClose: () => void;
};

type Saving = { field: 'role'; value: MemberRole } | { field: 'status'; value: MemberStatus };

/**
 * One portal user: contact, when they were invited, joined and last seen;
 * role and status selects that save as soon as they change; and "Resend
 * invite" or "Send reset link". Nothing here is optimistic: invites and
 * access wait for the server.
 */
export function MemberSheet({ clientId, member, labels, onClose }: MemberSheetProps) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const [saving, setSaving] = useState<Saving | null>(null);

  const apply = (saved: Member) => {
    updateBundle(queryClient, clientId, (b) => ({ ...b, members: upsertById(b.members, saved) }));
    refreshClient(queryClient, clientId);
  };

  const save = async (change: MemberPatch, next: Saving) => {
    if (saving) return;
    setSaving(next);
    try {
      apply(await updateMember(member.id, change));
      haptics.success();
      notice.ok('Saved.');
    } catch (error) {
      haptics.error();
      reportSubmitError(error);
    } finally {
      setSaving(null);
    }
  };

  const sendLink = async () => {
    const result = await sendMemberLink(member.id);
    apply(result.member);
    haptics.success();
    notice.ok(result.sent === 'invite' ? 'Invite sent.' : 'Reset link sent.');
  };

  const role = saving?.field === 'role' ? saving.value : member.role;
  const status = saving?.field === 'status' ? saving.value : member.status;
  const link = memberLinkAction(member);
  const locked = !online || saving !== null;
  const offlineHelp = online ? null : MESSAGES.offline;

  // "Invited" is set by the invite itself, never chosen by hand. Only someone who has joined
  // can be active: turning a person back on makes them invited again if they never joined.
  const statusOptions = optionsOf(labels.memberStatuses).map((o) => {
    if (o.value === 'invited') return { ...o, disabled: true, hint: 'Until they accept the invite' };
    if (o.value === 'active' && member.status === 'invited') return { ...o, disabled: true, hint: 'Once they accept the invite' };
    if (o.value === 'active' && member.status === 'disabled' && !member.joinedAt) return { ...o, hint: 'Turns them back on as invited' };
    return o;
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={memberName(member)}
      subtitle={member.name ? member.email : labelOf(labels.memberStatuses, member.status)}
      scrollable
      footer={link ? <PendingButton label={link.label} pendingLabel={link.pending} variant="secondary" fullWidth onPress={sendLink} /> : undefined}
    >
      <View style={styles.body}>
        <KeyValue
          inset={0}
          items={[
            { label: 'Email', value: member.email, link: 'email' },
            { label: 'Title', value: member.title },
            { label: 'Invited', value: member.invitedAt ? formatDateTime(member.invitedAt) : null },
            { label: 'Joined', value: member.joinedAt ? formatDateTime(member.joinedAt) : null },
            { label: 'Last seen', value: member.lastSeenAt ? relativeTime(member.lastSeenAt) : NO_LOGIN },
          ]}
        />
        <Select
          label="Role"
          options={optionsOf(labels.memberRoles)}
          value={role}
          onChange={(value) => {
            if (value !== member.role) void save({ role: value }, { field: 'role', value });
          }}
          disabled={locked}
          help={offlineHelp}
        />
        <Select
          label="Status"
          options={statusOptions}
          value={status}
          onChange={(value) => {
            if (value !== member.status) void save({ status: value }, { field: 'status', value });
          }}
          disabled={locked}
          help={offlineHelp ?? (member.status === 'disabled' ? 'Turned off: they cannot sign in to the portal.' : null)}
        />
        {!link ? (
          <Text variant="small" color="ink3">
            Turn them back on to send an invite or a reset link.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
