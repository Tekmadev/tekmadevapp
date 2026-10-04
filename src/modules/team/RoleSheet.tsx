import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TeamMember } from '@/api/schemas/team';
import type { Role } from '@/api/types';
import { roleCopy } from '@/auth/permissions';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { useUpdateMember } from './hooks';
import { memberName } from './logic';
import { roleToast, STAFF_COPY } from './staff';

export type RoleSheetProps = {
  member: TeamMember;
  /** The roles this person may give (from roleChoices): Owner only with `team.owners`. */
  roles: readonly Role[];
  onClose: () => void;
};

/**
 * Change role (PATCH /team/:email `role`, `team.role`): Staff, Manager and,
 * for owners, Owner, each with its help line (Owner gold, Manager neutral,
 * Staff muted). Saving waits for the server; the member's sheet underneath
 * shows the new role. Mounted only while open.
 */
export function RoleSheet({ member, roles, onClose }: RoleSheetProps) {
  const update = useUpdateMember();
  const [draft, setDraft] = useState<Role>(member.role);
  const options: SelectOption<Role>[] = roles.map((value) => {
    const copy = roleCopy(value);
    return { value, label: copy.label, hint: copy.help };
  });

  const save = async () => {
    if (draft === member.role) {
      onClose();
      return;
    }
    const updated = await update(member, { role: draft });
    if (updated) {
      haptics.success();
      notice.ok(roleToast(updated, updated.role));
    }
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={STAFF_COPY.changeRole}
      subtitle={memberName(member)}
      scrollable
      footer={<PendingButton label={STAFF_COPY.saveRole} pendingLabel="Saving" fullWidth disabled={draft === member.role} onPress={save} />}
    >
      <View style={styles.body}>
        <OptionList<Role> options={options} value={draft} onChange={setDraft} accessibilityLabel={STAFF_COPY.roleTitle} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[2] },
});
