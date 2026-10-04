import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useEffect, useEffectEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { reviewCall } from '@/api/endpoints/clients';
import type { Call } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Section } from '@/components/Section';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { CallCard } from './calls/CallCard';
import { CallEditSheet } from './calls/CallEditSheet';
import { GuaranteeCard, ReviewBanner } from './calls/GuaranteeCard';
import { LogCallSheet } from './calls/LogCallSheet';
import { applyCallResult, refreshClient, useClientLabels } from './sectionData';
import type { SectionProps } from './types';

/** Calls shown at first; more on request, so a long history never slows the screen. */
const PAGE = 12;

const LOG_CALL_ACTION = 'log-call';

/**
 * Calls, the guarantee (brief 8.5, section 7): the guarantee card for eligible
 * clients, the CRM review banner, every booked call with its one review
 * action, the edit sheet and "Log a booked call". The route action `log-call`
 * opens that sheet once.
 *
 * Roles: logging needs `clients.calls.log`. Reviewing (the review button, the
 * swipe, the edit sheet and the review banner, which asks for "your review")
 * needs `clients.calls.review`; without it the calls are read only.
 */
export function CallsSection({ clientId, bundle, action, onActionHandled }: SectionProps) {
  const queryClient = useQueryClient();
  const labels = useClientLabels();
  const canLog = useCan('clients.calls.log');
  const canReview = useCan('clients.calls.review');
  const { calls, guarantee, client } = bundle;

  const [logOpen, setLogOpen] = useState(action === LOG_CALL_ACTION);
  const [seenAction, setSeenAction] = useState(action);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  // A new route action (also when the section is already on screen) opens the sheet once.
  if (action !== seenAction) {
    setSeenAction(action);
    if (action === LOG_CALL_ACTION) setLogOpen(true);
  }

  const handled = useEffectEvent(() => onActionHandled?.());
  useEffect(() => {
    if (action === LOG_CALL_ACTION) handled();
  }, [action]);

  const editing = editingId ? (calls.find((c) => c.id === editingId) ?? null) : null;

  const review = async (call: Call, counts: boolean) => {
    const result = await reviewCall(call.id, counts);
    applyCallResult(queryClient, clientId, result);
    refreshClient(queryClient, clientId, { lists: true, overview: true });
    haptics.success();
    notice.ok(counts ? 'Marked as a real prospect.' : 'Marked as not counting.');
  };

  const visible = calls.slice(0, shown);
  const remaining = calls.length - visible.length;

  return (
    <Section
      title="Calls"
      right={canLog ? <Button label="Log a booked call" icon={Plus} size="sm" variant="secondary" onPress={() => setLogOpen(true)} /> : undefined}
    >
      <View style={styles.stack}>
        {guarantee.eligible ? <GuaranteeCard guarantee={guarantee} labels={labels} /> : null}
        {guarantee.needsReview > 0 && canReview ? <ReviewBanner count={guarantee.needsReview} /> : null}

        {calls.length === 0 ? (
          <EmptyState compact message="No booked calls yet." />
        ) : (
          visible.map((call) => (
            <CallCard
              key={call.id}
              call={call}
              labels={labels}
              onEdit={canReview ? (c) => setEditingId(c.id) : undefined}
              onReview={canReview ? review : undefined}
            />
          ))
        )}

        {remaining > 0 ? (
          <Button
            label={`Show ${Math.min(PAGE, remaining)} more`}
            variant="ghost"
            size="sm"
            onPress={() => setShown((n) => n + PAGE)}
            accessibilityHint={`${remaining} older calls not shown`}
            style={styles.more}
          />
        ) : null}
      </View>

      {logOpen && canLog ? (
        <LogCallSheet clientId={clientId} businessName={client.businessName} labels={labels} onClose={() => setLogOpen(false)} />
      ) : null}
      {editing && canReview ? (
        <CallEditSheet key={editing.id} clientId={clientId} call={editing} labels={labels} onClose={() => setEditingId(null)} />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[3] },
  more: { alignSelf: 'center' },
});
