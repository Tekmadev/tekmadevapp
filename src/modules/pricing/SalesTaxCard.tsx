import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { setSalesTax } from '@/api/endpoints/pricing';
import type { PricingMeta, SalesTax, TaxMode } from '@/api/schemas/pricing';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Divider } from '@/components/Divider';
import { Switch } from '@/components/form/Switch';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { usePricingCache } from './hooks';
import { TAX_MODE_LABEL, taxBadge, taxConfirmCopy, taxModes, withSalesTax } from './logic';

type Pending = { mode: TaxMode; on: boolean };

/**
 * Sales tax (brief 8.12): for Live, and Test mode when the sandbox is
 * configured, the badge (Charging, On, not charging, Off), the API's
 * explanation, the Stripe Tax readiness line and the switch. Turning tax on or
 * off changes what buyers pay, so the switch asks for a HoldToConfirm first
 * and only moves once the server has answered.
 */
export function SalesTaxCard({ salesTax, meta }: { salesTax: SalesTax; meta: PricingMeta | undefined }) {
  const cache = usePricingCache();
  const online = useIsOnline();
  // Kept after closing so the sheet's copy stays put while it slides away.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const modes = taxModes(salesTax);
  const copy = pending ? taxConfirmCopy(pending.mode, pending.on) : null;

  const ask = (mode: TaxMode, on: boolean) => {
    setPending({ mode, on });
    setOpen(true);
  };

  const confirm = async () => {
    if (!pending) return;
    const next = await setSalesTax(pending.mode, pending.on);
    cache.apply((p) => withSalesTax(p, next));
    cache.refresh();
    haptics.success();
    notice.ok(taxConfirmCopy(pending.mode, pending.on).done);
  };

  return (
    <>
      <Card style={styles.card}>
        {modes.map((mode, index) => {
          const status = mode === 'live' ? salesTax.live : salesTax.test;
          if (!status) return null;
          const on = salesTax.setting[mode];
          const badge = taxBadge(meta, status.state);
          const label = TAX_MODE_LABEL[mode];
          return (
            <Fragment key={mode}>
              {index > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.mode}>
                <View style={styles.row}>
                  <View style={styles.titles}>
                    <Text variant="bodyStrong">{label}</Text>
                    <Badge label={badge.label} tone={badge.tone} />
                  </View>
                  <Switch
                    value={on}
                    onValueChange={(next) => ask(mode, next)}
                    disabled={!online}
                    accessibilityLabel={`Sales tax, ${label}`}
                    accessibilityHint={online ? `${badge.label}. Asks you to confirm.` : 'You are offline'}
                  />
                </View>
                <Text variant="small" color="ink2">
                  {status.explanation}
                </Text>
                <Text variant="small" color="ink3">
                  {status.readiness}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </Card>
      <ConfirmSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={copy?.title ?? ''}
        message={copy?.message ?? ''}
        confirmLabel={copy?.confirmLabel ?? 'Hold to confirm'}
        pendingLabel={copy?.pendingLabel}
        tone="ink"
        onConfirm={confirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  divider: { marginHorizontal: 0 },
  mode: { gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  titles: { flex: 1, gap: space[1] + 2, alignItems: 'flex-start' },
});
