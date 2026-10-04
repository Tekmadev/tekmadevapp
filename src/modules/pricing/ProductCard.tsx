import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateProduct } from '@/api/endpoints/pricing';
import type { PricingMeta, PricingProduct } from '@/api/schemas/pricing';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { NumberField } from '@/components/form/NumberField';
import { SwitchRow } from '@/components/form/Switch';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';

import { announceSave, handlePriceSaveError, usePricingCache } from './hooks';
import {
  COMPARE_AT_HELP,
  hasErrors,
  isProductDirty,
  productBadge,
  productErrors,
  productPatch,
  productValues,
  pruneEdits,
  PURCHASABLE_HELP,
  TRIAL_DAYS_MAX,
  TRIAL_DAYS_MIN,
  withProduct,
  type ProductEdits,
  type ProductValues,
} from './logic';
import { SaveErrorNote } from './parts';

/**
 * A product (Webline, brief 8.12): name and tagline, its status, the one-time
 * fee, an optional compare-at price, Webline Care monthly, the first charge
 * delay and Purchasable, saved together with one Save. Amounts go to Stripe;
 * the other fields are site settings that save straight away on the server.
 * Without `pricing.write` (staff) every field is read only and there is no Save.
 */
export function ProductCard({ product, meta, readOnly = false }: { product: PricingProduct; meta: PricingMeta | undefined; readOnly?: boolean }) {
  const cache = usePricingCache();
  const [edits, setEdits] = useState<ProductEdits>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // New server values (a save's answer, a refetch): edits that now match them follow the server again.
  const [seen, setSeen] = useState(product);
  if (product !== seen) {
    setSeen(product);
    setEdits((e) => pruneEdits(e, productValues(product, {})));
  }

  const values = productValues(product, edits);
  const dirty = isProductDirty(product, values);
  const badge = productBadge(meta, product.status);

  const set = <K extends keyof ProductValues>(key: K, value: ProductValues[K]) => {
    setEdits((e) => ({ ...e, [key]: value }));
    setErrors((e) => {
      // The compare-at check depends on the fee too: editing either clears it.
      const clears: string[] = key === 'amount' || key === 'compareAt' ? [key, 'compareAt'] : [key];
      if (!clears.some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of clears) delete next[k];
      return next;
    });
    setSaveError(null);
  };

  const save = async () => {
    const local = productErrors(values);
    if (hasErrors(local)) {
      setErrors(local);
      haptics.error();
      return;
    }
    setSaveError(null);
    const result = await updateProduct(product.id, productPatch(product, values));
    cache.apply((p) => withProduct(p, result.product));
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
      <View style={styles.titles}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header" style={styles.name}>
            {product.name}
          </Text>
          <Badge label={badge.label} tone={badge.tone} />
        </View>
        {product.tagline ? (
          <Text variant="small" color="ink3">
            {product.tagline}
          </Text>
        ) : null}
      </View>
      <NumberField
        label="One-time fee"
        mode="money"
        value={values.amount}
        onChange={(v) => set('amount', v)}
        readOnly={readOnly}
        min={0}
        required
        error={errors.amount}
      />
      <NumberField
        label="Compare-at price (optional)"
        mode="money"
        value={values.compareAt}
        onChange={(v) => set('compareAt', v)}
        readOnly={readOnly}
        min={0}
        help={COMPARE_AT_HELP}
        error={errors.compareAt}
      />
      <NumberField
        label="Webline Care monthly (CAD)"
        mode="money"
        value={values.monthly}
        onChange={(v) => set('monthly', v)}
        readOnly={readOnly}
        min={0}
        required
        error={errors.monthly}
      />
      <NumberField
        label="First charge after"
        suffix="days"
        value={values.trialDays}
        onChange={(v) => set('trialDays', v)}
        readOnly={readOnly}
        min={TRIAL_DAYS_MIN}
        max={TRIAL_DAYS_MAX}
        required
        help="Days before Webline Care first bills, 1 to 365."
        error={errors.trialDays}
      />
      <SwitchRow
        label="Purchasable"
        description={PURCHASABLE_HELP}
        value={values.active}
        onValueChange={(v) => set('active', v)}
        disabled={readOnly}
      />
      {errors.active ? (
        <Text variant="small" tone="signal">
          {errors.active}
        </Text>
      ) : null}
      {saveError ? <SaveErrorNote message={saveError} /> : null}
      {readOnly ? null : (
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          fullWidth
          disabled={!dirty}
          onPress={save}
          onError={onError}
          accessibilityHint={dirty ? `Saves ${product.name} to the site and Stripe` : 'Nothing has changed yet'}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  titles: { gap: space[1] },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  name: { flexShrink: 1, marginRight: 'auto' },
});
