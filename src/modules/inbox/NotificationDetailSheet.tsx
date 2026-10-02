import { useQuery } from '@tanstack/react-query';
import { CircleCheck, ExternalLink, Mail, RotateCcw } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { notificationQuery } from '@/api/endpoints/notifications';
import { MESSAGES } from '@/api/errors';
import type { NotificationItem } from '@/api/schemas/notifications';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { formatCount } from '@/lib/format';

import { CATEGORY_LABELS, INBOX_COPY, isOpenAction } from './logic';

export type NotificationDetailSheetProps = {
  /** The row to show (kept while the sheet animates closed). Its cache entry is written before opening. */
  id: string | null;
  visible: boolean;
  onClose: () => void;
  online: boolean;
  /** Where "Open" goes, when the row has a destination the caller may open. */
  canOpen: (item: NotificationItem) => boolean;
  onOpen: (item: NotificationItem) => void;
  /** Resolves once the server answered (it reports its own errors). */
  onToggleResolved: (item: NotificationItem) => Promise<void>;
  onMarkUnread: (item: NotificationItem) => void;
};

/**
 * A notification on its own: the full body, when it happened, how often, who
 * caused it and whether someone handled it. Used for rows without an
 * action_url (and rows whose destination this role cannot open). Reads the
 * row from the query cache, so every optimistic or server change shows here
 * too. No request is made: the row is already known.
 */
export function NotificationDetailSheet({
  id,
  visible,
  onClose,
  online,
  canOpen,
  onOpen,
  onToggleResolved,
  onMarkUnread,
}: NotificationDetailSheetProps) {
  const { data: item } = useQuery({ ...notificationQuery(id ?? ''), enabled: false });
  const shown = id !== null && item !== undefined ? item : null;

  return (
    <Sheet
      visible={visible && shown !== null}
      onClose={onClose}
      title={shown?.title}
      subtitle={shown ? `${CATEGORY_LABELS[shown.category]} · ${shown.label}` : undefined}
      scrollable
      footer={shown ? <Footer item={shown} online={online} canOpen={canOpen(shown)} onOpen={onOpen} onToggleResolved={onToggleResolved} onMarkUnread={onMarkUnread} /> : null}
    >
      {shown ? <Body item={shown} /> : null}
    </Sheet>
  );
}

function Body({ item }: { item: NotificationItem }) {
  const openAction = isOpenAction(item);
  const resolved = item.needs_action && item.resolved_at !== null;
  const resolvedLine = resolved
    ? [item.resolved_by ? `Resolved by ${item.resolved_by}` : INBOX_COPY.resolved, item.resolved_at ? formatDateTime(item.resolved_at) : null]
        .filter(Boolean)
        .join(', ')
    : null;

  const rows: (KeyValueItem | null)[] = [
    { label: 'When', value: formatDateTime(item.last_occurred_at) },
    item.occurrences > 1 ? { label: 'Happened', value: `${formatCount(item.occurrences)} times` } : null,
    item.actor_label ? { label: 'From', value: item.actor_label } : null,
    { label: 'Category', value: CATEGORY_LABELS[item.category] },
    item.needs_action ? { label: 'Status', value: openAction ? INBOX_COPY.needsAction : resolvedLine } : null,
  ];

  const badges = [
    openAction ? <Badge key="action" label={INBOX_COPY.needsAction} tone="gold" size="md" /> : null,
    resolved ? <Badge key="resolved" label={INBOX_COPY.resolved} tone="ok" size="md" icon={CircleCheck} /> : null,
    item.severity === 'critical' ? <Badge key="critical" label="Critical" tone="signal" size="md" /> : null,
    item.is_test ? <Badge key="test" label={INBOX_COPY.test} tone="neutral" size="md" /> : null,
    item.is_muted ? <Badge key="quiet" label={INBOX_COPY.quiet} tone="muted" size="md" /> : null,
  ].filter(Boolean);

  return (
    <View style={styles.body}>
      {badges.length ? <View style={styles.badges}>{badges}</View> : null}
      {item.body ? (
        <Text variant="body" color="ink2" selectable>
          {item.body}
        </Text>
      ) : null}
      <KeyValue items={rows} inset={0} />
    </View>
  );
}

function Footer({
  item,
  online,
  canOpen,
  onOpen,
  onToggleResolved,
  onMarkUnread,
}: {
  item: NotificationItem;
  online: boolean;
  canOpen: boolean;
  onOpen: (item: NotificationItem) => void;
  onToggleResolved: (item: NotificationItem) => Promise<void>;
  onMarkUnread: (item: NotificationItem) => void;
}) {
  const openAction = isOpenAction(item);
  if (!canOpen && !item.needs_action && !item.is_read) return null;
  return (
    <View style={styles.footer}>
      {canOpen ? <Button label={INBOX_COPY.open} icon={ExternalLink} onPress={() => onOpen(item)} fullWidth /> : null}
      {item.needs_action ? (
        <PendingButton
          label={openAction ? INBOX_COPY.markHandled : INBOX_COPY.reopen}
          pendingLabel={openAction ? 'Marking as handled' : 'Reopening'}
          icon={openAction ? CircleCheck : RotateCcw}
          variant={canOpen ? 'secondary' : 'primary'}
          onPress={() => onToggleResolved(item)}
          fullWidth
        />
      ) : null}
      {item.is_read ? (
        <Button
          label={INBOX_COPY.markUnread}
          icon={Mail}
          variant="ghost"
          disabled={!online}
          accessibilityHint={online ? undefined : MESSAGES.offline}
          onPress={() => onMarkUnread(item)}
          fullWidth
        />
      ) : null}
      {/* PendingButton brings its own offline hint; without one, say it once here. */}
      {!online && !item.needs_action && item.is_read ? (
        <Text variant="small" color="ink3" align="center">
          {MESSAGES.offline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: { gap: space[2] },
});
