import { Lock, UserMinus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { TeamMember } from '@/api/schemas/team';
import { roleCopy } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { KeyValue } from '@/components/KeyValue';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDate, formatDateTime } from '@/lib/dates';

import { canRemove, isSelf, memberName, selfNote, TEAM_COPY } from './logic';

export type TeamMemberSheetProps = {
  member: TeamMember;
  myEmail: string | null;
  /** The signed-in person may remove members (`team.remove`, owners only). */
  mayRemove: boolean;
  onRemove: (member: TeamMember) => void;
  onClose: () => void;
};

/**
 * One team member: email, role, last sign in and when they were added. Owners
 * set by the server environment show a lock and why they cannot be removed;
 * you cannot remove yourself. For an owner, everyone else gets "Remove from
 * team", which opens the hold to confirm sheet on top of this one. A manager
 * never sees Remove.
 */
export function TeamMemberSheet({ member, myEmail, mayRemove, onRemove, onClose }: TeamMemberSheetProps) {
  const badge = roleCopy(member.role);
  const removable = canRemove(member, myEmail, mayRemove);
  const self = isSelf(member, myEmail);

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
              render: <Badge label={badge.label} tone={badge.tone} icon={member.envOwner ? Lock : undefined} />,
            },
            { label: 'Last sign in', value: member.lastSignInAt ? formatDateTime(member.lastSignInAt) : TEAM_COPY.never },
            { label: 'Added', value: formatDate(member.addedAt) },
          ]}
        />
        {member.envOwner ? (
          <View style={styles.note}>
            <Icon icon={Lock} size={16} color="ink3" />
            <Text variant="small" color="ink3" style={styles.noteText}>
              {TEAM_COPY.locked}
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
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  noteText: { flex: 1 },
});
