import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createCoupon } from '@/api/endpoints/coupons';
import { fieldErrors, MESSAGES } from '@/api/errors';
import type { Meta } from '@/api/schemas/meta';
import { ErrorState } from '@/components/ErrorState';
import { DateField } from '@/components/form/DateField';
import { NumberField } from '@/components/form/NumberField';
import { Select } from '@/components/form/Select';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { codeLive } from '@/lib/text';

import { CouponFace } from './CouponCard';
import { useCouponsCache, useIntentKey } from './hooks';
import {
  CODE_MAX,
  CODE_PLACEHOLDER,
  COUPON_MESSAGES,
  couponErrors,
  couponInput,
  createdToast,
  durationOptions,
  emptyCouponForm,
  isMonthlyScope,
  LABEL_MAX,
  minExpiry,
  previewFace,
  scopeOptions,
  typeOptions,
  type CouponErrors,
  type CouponField,
  type CouponForm,
} from './logic';

export type NewCouponSheetProps = {
  /** GET /meta (scopes with their help, durations, discount types). Undefined while it loads or after it failed. */
  meta: Meta | undefined;
  /** Why meta is missing: still loading, failed (with the error), or offline with nothing cached. */
  metaState: { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'offline' };
  onRetryMeta: () => Promise<unknown>;
  onClose: () => void;
};

/**
 * New coupon (brief 8.13). Mounted only while open, so each opening is a
 * fresh form and a fresh intent (one Idempotency-Key, reused on retry). A
 * live preview at the top shows the coupon as the list will. The code is
 * uppercased as it is typed; one-time scopes have no duration (they apply
 * once). Local checks use the server's own messages; whatever the server
 * still refuses shows inline and as a toast with its message.
 */
export function NewCouponSheet({ meta, metaState, onRetryMeta, onClose }: NewCouponSheetProps) {
  const upsert = useCouponsCache();
  const keyFor = useIntentKey();
  const scopes = meta?.couponScopes ?? [];
  const [form, setForm] = useState<CouponForm>(() => emptyCouponForm(meta?.couponScopes[0]?.value ?? null));
  const [errors, setErrors] = useState<CouponErrors>({});
  // Read the clock once, when the sheet opens.
  const [now] = useState(() => new Date());
  const [earliest] = useState(() => minExpiry(now));

  // Meta can land after the sheet opened (a cold start): pick the first scope then, during render.
  const firstScope = scopes[0]?.value ?? null;
  if (form.appliesTo === null && firstScope !== null) setForm((f) => ({ ...f, appliesTo: firstScope }));

  /** Change a field and clear the errors it answers (its own, unless others are named). */
  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K], clears: readonly CouponField[] = [key as CouponField]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!clears.some((field) => field in e)) return e;
      const next = { ...e };
      for (const field of clears) delete next[field];
      return next;
    });
  };

  const monthly = isMonthlyScope(scopes, form.appliesTo);
  const chosenScope = scopes.find((s) => s.value === form.appliesTo);
  const face = previewFace(form, scopes, meta, now);

  const submit = async () => {
    const local = couponErrors(form, scopes, now);
    if (Object.keys(local).length > 0 || form.appliesTo === null) {
      setErrors(local);
      haptics.error();
      return;
    }
    const input = couponInput(form, form.appliesTo, scopes);
    const coupon = await createCoupon(input, keyFor(input));
    upsert(coupon);
    haptics.success();
    notice.ok(createdToast(coupon.code));
    onClose();
  };

  // The API's message as a toast, and its field errors inline on the same inputs.
  const onError = (error: unknown) => {
    setErrors(fieldErrors(error));
    haptics.error();
    reportSubmitError(error);
  };

  const footer = (
    <PendingButton label="Create coupon" pendingLabel="Creating" fullWidth disabled={!meta} onPress={submit} onError={onError} />
  );

  return (
    <Sheet visible onClose={onClose} title="New coupon" scrollable snapPoints={[0.92]} footer={footer}>
      {meta ? (
        <View style={styles.body}>
          <View style={styles.preview}>
            <Text variant="eyebrow">Preview</Text>
            <CouponFace face={face} />
          </View>
          <TextField
            label="Code"
            placeholder={CODE_PLACEHOLDER}
            value={form.code}
            onChangeText={(t) => set('code', codeLive(t))}
            monospace
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_MAX}
            showCount={false}
            help="Optional. Letters, numbers and dashes. Leave it blank for an auto code."
            error={errors.code}
          />
          <TextField
            label="Internal label"
            value={form.label}
            onChangeText={(t) => set('label', t)}
            maxLength={LABEL_MAX}
            help="Only you see this."
            error={errors.label}
          />
          <View style={styles.group}>
            <Text variant="label" color="ink2">
              Discount type
            </Text>
            <SegmentedControl
              items={typeOptions(meta)}
              value={form.type}
              onChange={(v) => set('type', v, ['type', 'percent', 'amount'])}
              accessibilityLabel="Discount type"
            />
          </View>
          {form.type === 'percent' ? (
            <NumberField
              label="Percent"
              suffix="%"
              value={form.percent}
              onChange={(v) => set('percent', v)}
              min={1}
              max={100}
              required
              help="1 to 100."
              error={errors.percent ?? errors.type}
            />
          ) : (
            <NumberField
              label="Amount (CAD)"
              mode="money"
              value={form.amount}
              onChange={(v) => set('amount', v)}
              min={1}
              required
              error={errors.amount ?? errors.type}
            />
          )}
          <View style={styles.group}>
            <Select
              label="Applies to"
              options={scopeOptions(scopes)}
              value={form.appliesTo}
              onChange={(v) => set('appliesTo', v, ['appliesTo', 'duration', 'months'])}
              placeholder="Pick one"
              error={errors.appliesTo}
            />
            {chosenScope && !errors.appliesTo ? (
              <Text variant="small" color="ink3" tone={chosenScope.value === 'anything' ? 'signal' : undefined} style={styles.help}>
                {chosenScope.help}
              </Text>
            ) : null}
          </View>
          {monthly ? (
            <Select
              label="Duration"
              options={durationOptions(meta)}
              value={form.duration}
              onChange={(v) => set('duration', v, ['duration', 'months'])}
              error={errors.duration}
            />
          ) : null}
          {monthly && form.duration === 'repeating' ? (
            <NumberField
              label="Months"
              suffix="months"
              value={form.months}
              onChange={(v) => set('months', v)}
              min={1}
              required
              error={errors.months}
            />
          ) : null}
          <NumberField
            label="Max redemptions"
            placeholder="Unlimited"
            value={form.maxRedemptions}
            onChange={(v) => set('maxRedemptions', v)}
            min={1}
            help="Optional. Leave it empty for unlimited."
            error={errors.maxRedemptions}
          />
          <DateField
            label="Expires"
            value={form.expiresAt}
            onChange={(v) => set('expiresAt', v)}
            min={earliest}
            optional
            placeholder="Never"
            help="Optional. Leave it empty for no expiry."
            rangeError={COUPON_MESSAGES.expirespast}
            error={errors.expiresAt}
          />
        </View>
      ) : metaState.status === 'error' ? (
        <ErrorState compact error={metaState.error} onRetry={onRetryMeta} />
      ) : metaState.status === 'offline' ? (
        <ErrorState compact message={MESSAGES.network} />
      ) : (
        <SkeletonList rows={5} leading={false} trailing={false} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  preview: { gap: space[2], marginBottom: space[2] },
  group: { gap: space[2] },
  help: { paddingHorizontal: space[1] },
});
