import { CircleCheck, CircleSlash } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import type { Call } from '@/api/schemas/clients';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { reportSubmitError, useSubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { labelOf, toneOf, type ClientLabels } from '../labels';
import { callContactLine, callDetailsLine, callTitle, reviewAction, reviewBadge } from './callText';

export type CallCardProps = {
  call: Call;
  labels: ClientLabels;
  /** Opens the edit sheet. */
  onEdit: (call: Call) => void;
  /** POST /calls/:id/review. Resolves once the cache holds the server's answer. */
  onReview: (call: Call, counts: boolean) => Promise<void>;
};

/**
 * One booked call: who, status and review badges, where it came from and
 * when, then how to reach them. An unreviewed call carries one big action,
 * and swiping the row right does the same thing. Tap to edit.
 */
export function CallCard({ call, labels, onEdit, onReview }: CallCardProps) {
  const online = useIsOnline();
  // The button and the swipe share one submit group, so a review is never sent twice.
  const { busy, run } = useSubmitGroup();
  const needsReview = call.review === 'needs_review';
  const action = reviewAction(call);
  const status = { label: labelOf(labels.callStatuses, call.status), tone: toneOf(labels.callStatuses, call.status) };
  const review = reviewBadge(call, labels);
  const title = callTitle(call);
  const details = callDetailsLine(call, labels);
  const contact = callContactLine(call);

  const submitReview = () => {
    run('review', () => onReview(call, action.counts))?.catch((error: unknown) => reportSubmitError(error));
  };

  // Kept while a review runs (the group refuses a second one), so the row does not remount mid-swipe.
  const swipe =
    needsReview && online
      ? { label: action.label, icon: action.counts ? CircleCheck : CircleSlash, tone: action.counts ? ('ok' as const) : ('neutral' as const), onAction: submitReview }
      : undefined;

  return (
    <Card padded={false}>
      <ListRow
        itemKey={call.id}
        background="surface"
        title={title}
        subtitle={details}
        subtitleLines={2}
        meta={contact || undefined}
        trailing={
          <View style={styles.badges}>
            <Badge label={status.label} tone={status.tone} />
            <Badge label={review.label} tone={review.tone} />
          </View>
        }
        chevron={false}
        onPress={() => onEdit(call)}
        leftAction={swipe}
        accessibilityLabel={[title, status.label, review.label, details, contact].filter(Boolean).join(', ')}
        accessibilityHint="Opens the call to edit it"
      />
      {needsReview ? (
        <View style={styles.action}>
          <Button
            label={action.label}
            pendingLabel="Saving"
            variant={action.counts ? 'primary' : 'secondary'}
            icon={action.counts ? CircleCheck : CircleSlash}
            fullWidth
            pending={busy}
            disabled={!online}
            accessibilityHint={online ? undefined : MESSAGES.offline}
            onPress={submitReview}
          />
          {!online ? (
            <Text variant="small" color="ink3" align="center" style={styles.hint}>
              {MESSAGES.offline}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { alignItems: 'flex-end', gap: space[1], maxWidth: '45%' },
  action: { paddingHorizontal: space[4], paddingBottom: space[4] },
  hint: { marginTop: space[1] + 2 },
});
