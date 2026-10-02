import { BellOff, CircleCheck, ExternalLink, RotateCcw } from 'lucide-react-native';

import { MESSAGES } from '@/api/errors';
import type { NotificationItem } from '@/api/schemas/notifications';
import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';

import { CATEGORY_LABELS, INBOX_COPY, isOpenAction } from './logic';

export type NotificationActionsSheetProps = {
  /** The long-pressed row (kept while the sheet animates closed). */
  item: NotificationItem | null;
  visible: boolean;
  onClose: () => void;
  online: boolean;
  onOpen: (item: NotificationItem) => void;
  onToggleResolved: (item: NotificationItem) => void;
  onQuiet: (item: NotificationItem) => void;
};

/**
 * Long press on a row: Open, Mark as handled / Reopen (needs-action rows), and
 * Make this category quiet (hidden once the category already is). Writes are
 * disabled offline with "You are offline".
 */
export function NotificationActionsSheet({ item, visible, onClose, online, onOpen, onToggleResolved, onQuiet }: NotificationActionsSheetProps) {
  const offlineHint = online ? undefined : MESSAGES.offline;
  const items: ActionSheetItem[] = [];
  if (item) {
    items.push({ label: INBOX_COPY.open, icon: ExternalLink, onPress: () => onOpen(item) });
    if (item.needs_action) {
      const open = isOpenAction(item);
      items.push({
        label: open ? INBOX_COPY.markHandled : INBOX_COPY.reopen,
        icon: open ? CircleCheck : RotateCcw,
        disabled: !online,
        hint: offlineHint ?? (open ? 'Handled for the whole team.' : 'It needs action again, for the whole team.'),
        onPress: () => onToggleResolved(item),
      });
    }
    if (!item.is_muted) {
      items.push({
        label: INBOX_COPY.makeQuiet,
        icon: BellOff,
        disabled: !online,
        hint: offlineHint ?? `${CATEGORY_LABELS[item.category]} stops counting toward unread.`,
        onPress: () => onQuiet(item),
      });
    }
  }

  return <ActionSheet visible={visible && item !== null} onClose={onClose} title={item?.title} subtitle={item?.label} items={items} />;
}
