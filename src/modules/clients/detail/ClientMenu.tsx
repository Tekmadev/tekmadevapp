import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { clientKeys, deleteClient } from '@/api/endpoints/clients';
import { overviewKeys } from '@/api/endpoints/overview';
import { useCan } from '@/auth/permissions';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Menu } from '@/components/Menu';
import type { ActionSheetItem } from '@/components/sheet/ActionSheet';
import { notice } from '@/lib/notice';

export type ClientMenuProps = {
  clientId: string;
  businessName: string;
  /** After the client moved to the trash: leave the screen. */
  onTrashed: () => void;
};

/** The brief's exact words for the trash confirm. */
export const trashMessage = (businessName: string) => `Move ${businessName} to trash. Data is kept; the portal stops working for them.`;

/**
 * The header's overflow menu. Today it holds one action, "Move to trash" (a
 * HoldToConfirm sheet, then DELETE /clients/:id), for people with
 * `clients.trash`. Anyone else gets no items, so the menu renders nothing.
 */
export function ClientMenu({ clientId, businessName, onTrashed }: ClientMenuProps) {
  const queryClient = useQueryClient();
  const canTrash = useCan('clients.trash');
  const [confirming, setConfirming] = useState(false);

  const trash = useMutation({
    mutationFn: () => deleteClient(clientId),
    onSuccess: () => {
      // What the web admin refreshes: the Clients list and Home's counts. The detail
      // query is dropped by the screen once it has left (see ClientDetailScreen).
      void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
      notice.ok('Moved to trash.');
      onTrashed();
    },
  });

  const items: ActionSheetItem[] = canTrash
    ? [{ label: 'Move to trash', icon: Trash2, destructive: true, hint: 'Data is kept.', onPress: () => setConfirming(true) }]
    : [];

  return (
    <>
      <Menu items={items} title={businessName} accessibilityLabel="More options for this client" />
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Move to trash?"
        message={trashMessage(businessName)}
        confirmLabel="Hold to move to trash"
        pendingLabel="Moving to trash"
        onConfirm={() => trash.mutateAsync()}
      />
    </>
  );
}
