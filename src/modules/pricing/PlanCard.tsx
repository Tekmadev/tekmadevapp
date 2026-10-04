import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updatePlan } from '@/api/endpoints/pricing';
import type { PricingPlan } from '@/api/schemas/pricing';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { NumberField } from '@/components/form/NumberField';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';

import { announceSave, handlePriceSaveError, usePricingCache } from './hooks';
import {
  hasErrors,
  isPlanDirty,
  planErrors,
  planPatch,
  pruneEdits,
  planStripeBadge,
  planValues,
  withPlan,
  type PlanEdits,
  type PlanValues,
} from './logic';
import { SaveErrorNote } from './parts';

/**
 * One growth plan (brief 8.12): name, whether Stripe can sell it, the monthly
 * fee and the Build & Install fee in CAD, and Save. The fields show the
 * server's prices until edited; Save stays off until something changed and
 * sends only what changed. A partial Stripe failure shows the API's message
 * here and keeps the price that did not save, so Save can retry it. Without
 * `pricing.write` (staff) the fields are read only and there is no Save.
 */
export function PlanCard({ plan, readOnly = false }: { plan: PricingPlan; readOnly?: boolean }) {
  const cache = usePricingCache();
  const [edits, setEdits] = useState<PlanEdits>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // New server values (a save's answer, a refetch): edits that now match them follow the server again.
  const [seen, setSeen] = useState(plan);
  if (plan !== seen) {
    setSeen(plan);
    setEdits((e) => pruneEdits(e, planValues(plan, {})));
  }

  const values = planValues(plan, edits);
  const dirty = isPlanDirty(plan, values);
  const badge = planStripeBadge(plan);

  const set = <K extends keyof PlanValues>(key: K, value: PlanValues[K]) => {
    setEdits((e) => ({ ...e, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
    setSaveError(null);
  };

  const save = async () => {
    const local = planErrors(values);
    if (hasErrors(local)) {
      setErrors(local);
      haptics.error();
      return;
    }
    setSaveError(null);
    const result = await updatePlan(plan.id, planPatch(plan, values));
    cache.apply((p) => withPlan(p, result.plan));
    setErrors({});
    cache.refresh();
    announceSave(result.stripe);
  };

  const onError = (error: unknown) =>
    handlePriceSaveError(error, {
      setErrors,
      setSaveError,
      onPartial: cache.refresh,
    });

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header" style={styles.name}>
          {plan.name}
        </Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <NumberField
        label="Monthly (CAD)"
        mode="money"
        value={values.monthly}
        onChange={(v) => set('monthly', v)}
        min={0}
        required
        readOnly={readOnly}
        error={errors.monthly}
      />
      <NumberField
        label="Build & Install fee (CAD)"
        mode="money"
        value={values.setup}
        onChange={(v) => set('setup', v)}
        min={0}
        required
        readOnly={readOnly}
        error={errors.setup}
      />
      {saveError ? <SaveErrorNote message={saveError} /> : null}
      {readOnly ? null : (
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          fullWidth
          disabled={!dirty}
          onPress={save}
          onError={onError}
          accessibilityHint={dirty ? `Saves the ${plan.name} prices to the site and Stripe` : 'Nothing has changed yet'}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  name: { flexShrink: 1, marginRight: 'auto' },
});
