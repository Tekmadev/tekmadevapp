import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { pricingKeys, pricingQuery } from '@/api/endpoints/pricing';
import { errorMessage, MESSAGES } from '@/api/errors';
import type { Pricing, PricingMeta } from '@/api/schemas/pricing';
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { metaQuery, useRefetchOnFocus } from '@/modules/overview/hooks';

import { PRICING_NOTE, sortPlans } from './logic';
import { PlanCard } from './PlanCard';
import { PricingSkeleton } from './PricingSkeleton';
import { ProductCard } from './ProductCard';
import { SalesTaxCard } from './SalesTaxCard';

/**
 * Pricing (brief 8.12, `pricing.view`): the Stripe note, the sales tax card,
 * one card per growth plan (cheapest monthly first) and the Webline product.
 * Each card is its own form with its own Save. Cached prices show at once and
 * refresh on focus, on app resume and on a pull; edits in progress are never
 * overwritten by a refetch. A first load shows the skeleton after
 * `showAfterMs`; a failure shows ErrorState, never zeros. Without
 * `pricing.write` (staff) the fields are read only, with no Save and no tax
 * switches; the note stays.
 */
export function PricingScreen() {
  return (
    <RequireCapability cap="pricing.view">
      <PricingBody />
    </RequireCapability>
  );
}

function PricingBody() {
  const online = useIsOnline();
  const canWrite = useCan('pricing.write');
  const query = useQuery(pricingQuery());
  const meta = useQuery(metaQuery());
  const { data, refetch, dataUpdatedAt } = query;
  useRefetchOnFocus(refetch, dataUpdatedAt);
  // Sections pull in only on a first load with nothing cached; a cached screen is just there.
  const [animate] = useState(() => data === undefined);

  // Offline with nothing cached: the read waits for the connection, so a skeleton would never end.
  const waitingOffline = query.isPending && query.fetchStatus === 'paused';

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const [result] = await Promise.all([refetch(), meta.refetch()]);
    // With prices on screen a failed pull keeps them and says why.
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  let body: ReactNode;
  if (data) {
    body = <PricingBlocks data={data} meta={meta.data} animate={animate} readOnly={!canWrite} />;
  } else if (waitingOffline) {
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => refetch() : undefined} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => refetch()} />;
  } else {
    body = <PricingSkeleton />;
  }

  return (
    <Screen
      title="Pricing"
      back
      keyboardAware
      onRefresh={onRefresh}
      refetching={query.isFetching && data !== undefined}
      // "Showing what was loaded at ..."; with nothing loaded the ErrorState says it instead.
      offlineBanner={data !== undefined}
      queryKey={pricingKeys.overview()}
    >
      <StripeNote />
      {body}
    </Screen>
  );
}

/** The note at the top: what saving a price does in Stripe. */
function StripeNote() {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: colors.goldTint }]}>
      <View style={styles.noteIcon}>
        <Icon icon={Info} size={18} color="goldDeep" strokeWidth={2} />
      </View>
      <Text variant="small" color="ink2" style={styles.noteText}>
        {PRICING_NOTE}
      </Text>
    </View>
  );
}

type BlocksProps = { data: Pricing; meta: PricingMeta | undefined; animate: boolean; readOnly: boolean };

/** The loaded sections in order, pulled into place with the list stagger on a first load. */
function PricingBlocks({ data, meta, animate, readOnly }: BlocksProps) {
  const reduceMotion = useReduceMotion();
  const plans = sortPlans(data.plans);
  const blocks: { key: string; node: ReactNode }[] = [
    {
      key: 'tax',
      node: (
        <Section title="Sales tax" spacing={space[6]}>
          <SalesTaxCard salesTax={data.salesTax} meta={meta} readOnly={readOnly} />
        </Section>
      ),
    },
    {
      key: 'plans',
      node: (
        <Section title="Plans" spacing={space[6]}>
          <View style={styles.stack}>
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} readOnly={readOnly} />
            ))}
          </View>
        </Section>
      ),
    },
  ];
  if (data.products.length > 0) {
    blocks.push({
      key: 'products',
      node: (
        <Section title="Products" spacing={space[6]}>
          <View style={styles.stack}>
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} meta={meta} readOnly={readOnly} />
            ))}
          </View>
        </Section>
      ),
    });
  }

  return blocks.map((b, i) => (
    <Animated.View key={b.key} entering={!animate || reduceMotion || i >= STAGGER_MAX ? undefined : enterPull(i)}>
      {b.node}
    </Animated.View>
  ));
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    borderRadius: radius.card,
    padding: space[4],
    marginBottom: space[6],
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1 },
  stack: { gap: space[3] },
});
