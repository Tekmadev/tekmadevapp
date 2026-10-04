import { Lock, Pause, Play, UserCog, UserMinus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { TeamMember } from '@/api/schemas/team';
import { roleCopy } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { KeyValue } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { formatDate, formatDateTime } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { useUpdateMember } from './hooks';
import { canRemove, isSelf, memberName, selfNote, TEAM_COPY } from './logic';
import { accessLock, canPauseMember, isPaused, pausedLine, resumedToast, roleChoices, STAFF_COPY, type TeamPowers } from './staff';

export type TeamMemberSheetProps = {
  member: TeamMember;
  myEmail: string | null;
  /** The signed-in person may remove members (`team.remove`, owners only). */
  mayRemove: boolean;
  /** `team.role`, `team.pause` and `team.owners`. */
  powers: TeamPowers;
  onRemove: (member: TeamMember) => void;
  onChangeRole: (member: TeamMember) => void;
  onPause: (member: TeamMember) => void;
  onClose: () => void;
};

/**
 * One team member: email, role, access (Active, or Paused with when and by
 * whom), last sign in and when they were added. Change role and Pause (a hold
 * sheet on top of this one) or Resume (no hold) follow the person's
 * capabilities and the rules: env owners are locked for everyone, nobody
 * changes their own role or pauses themselves, and only owners touch other
 * owners. Remove stays owners only. A lock explains whatever is not offered.
 */
export function TeamMemberSheet({ member, myEmail, mayRemove, powers, onRemove, onChangeRole, onPause, onClose }: TeamMemberSheetProps) {
  const update = useUpdateMember();
  const badge = roleCopy(member.role);
  const removable = canRemove(member, myEmail, mayRemove);
  const self = isSelf(member, myEmail);
  const paused = isPaused(member);
  const changesRole = roleChoices(member, myEmail, powers).length > 0;
  const pausable = canPauseMember(member, myEmail, powers);
  // Explain a lock only to someone who could otherwise change roles or pause.
  const lock = powers.role || powers.pause ? accessLock(member, myEmail, powers) : member.envOwner ? STAFF_COPY.lockedEnv : null;

  const resume = async () => {
    const updated = await update(member, { paused: false });
    if (!updated) return;
    haptics.success();
    notice.ok(resumedToast(updated));
  };

  const footer = removable ? (
    <Button
      label={TEAM_COPY.removeButton}
      icon={UserMinus}
      variant="destructive"
      fullWidth
      onPress={() => onRemove(member)}
      accessibilityHint="Asks you to hold to confirm"
    />
  ) : undefined;

  return (
    <Sheet visible onClose={onClose} title={memberName(member)} subtitle={member.name ? member.email : badge.label} scrollable footer={footer}>
      <View style={styles.body}>
        <KeyValue
          inset={0}
          items={[
            { label: 'Email', value: member.email, link: 'email' },
            {
              label: 'Role',
              value: badge.label,
              render: (
                <View style={styles.badgeValue}>
                  <Badge label={badge.label} tone={badge.tone} icon={member.envOwner ? Lock : undefined} />
                </View>
              ),
            },
            {
              label: 'Access',
              value: paused ? pausedLine(member) : STAFF_COPY.active,
              render: paused ? (
                <View style={styles.access}>
                  <Badge label={STAFF_COPY.paused} tone="warn" icon={Pause} />
                  <Text variant="small" color="ink3" align="right">
                    {pausedLine(member)}
                  </Text>
                </View>
              ) : undefined,
            },
            { label: 'Last sign in', value: member.lastSignInAt ? formatDateTime(member.lastSignInAt) : TEAM_COPY.never },
            { label: 'Added', value: formatDate(member.addedAt) },
          ]}
        />

        {changesRole || pausable ? (
          <View style={styles.actions}>
            {changesRole ? (
              <Button
                label={STAFF_COPY.changeRole}
                icon={UserCog}
                variant="secondary"
                fullWidth
                onPress={() => onChangeRole(member)}
                accessibilityHint="Opens the role choices"
              />
            ) : null}
            {pausable && paused ? (
              <PendingButton label={STAFF_COPY.resume} pendingLabel={STAFF_COPY.resuming} icon={Play} variant="secondary" fullWidth onPress={resume} />
            ) : null}
            {pausable && !paused ? (
              <Button
                label={STAFF_COPY.pause}
                icon={Pause}
                variant="secondary"
                fullWidth
                onPress={() => onPause(member)}
                accessibilityHint="Asks you to hold to confirm"
              />
            ) : null}
          </View>
        ) : null}

        {lock ? (
          <View style={styles.note}>
            <Icon icon={Lock} size={16} color="ink3" />
            <Text variant="small" color="ink3" style={styles.noteText}>
              {lock}
            </Text>
          </View>
        ) : self ? (
          <Text variant="small" color="ink3">
            {selfNote(mayRemove)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  badgeValue: { flex: 1, alignItems: 'flex-end' },
  access: { flex: 1, alignItems: 'flex-end', gap: space[1] },
  actions: { gap: space[2] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  noteText: { flex: 1 },
});
