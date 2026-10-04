import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Percent } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { commissionSplitQuery, saveCommissionSplit, settingsKeys } from '@/api/endpoints/settings';
import { MESSAGES, fieldErrors } from '@/api/errors';
import type { CommissionSplit } from '@/api/schemas/settings';
import { useCan } from '@/auth/permissions';
import { ErrorState } from '@/components/ErrorState';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { COMMISSION_COPY, complement, percentText, sameSplit, splitErrors, splitInput, splitSummary, type SplitErrors } from './commission';
import { SettingsGroup } from './SettingsGroup';

type Draft = { finder: string; booker: string };

const fromSplit = (split: CommissionSplit): Draft => ({ finder: percentText(split.finder), booker: percentText(split.booker) });

/**
 * Commission split (GET and PUT /settings/commission): how credit is split
 * between the finder and the booker when a client is created from a lead.
 * Owners (`commission.settings`) edit it, and typing one side fills in the
 * other so they always add up to 100; managers (`clients.credits.view`) see
 * it read only; staff never see it. Shown only to people who may read it.
 */
export function CommissionCard({ index }: { index: number }) {
  const seesSplit = useCan('clients.credits.view');
  if (!seesSplit) return null;
  return <CommissionGroup index={index} />;
}

function CommissionGroup({ index }: { index: number }) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const canEdit = useCan('commission.settings');
  const query = useQuery(commissionSplitQuery());
  useRefreshOnFocus([settingsKeys.commission()]);
  // Null: showing the server's split. Typing starts a draft; saving or a new server value ends it.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<SplitErrors>({});

  const saved = query.data;
  const shown = draft ?? (saved ? fromSplit(saved) : null);

  const edit = (side: 'finder' | 'booker', text: string) => {
    const clean = text.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 6);
    const other = complement(clean);
    const base = shown ?? { finder: '', booker: '' };
    setDraft(side === 'finder' ? { finder: clean, booker: other ?? base.booker } : { booker: clean, finder: other ?? base.finder });
    setErrors({});
  };

  const save = async () => {
    if (!shown) return;
    const local = splitErrors(shown.finder, shown.booker);
    if (local.finder || local.booker) {
      setErrors(local);
      haptics.error();
      return;
    }
    const next = await saveCommissionSplit(splitInput(shown.finder, shown.booker));
    queryClient.setQueryData(settingsKeys.commission(), next);
    setDraft(null);
    haptics.success();
    notice.ok(COMMISSION_COPY.saved);
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error) as SplitErrors;
    if (fields.finder || fields.booker) {
      setErrors(fields);
      haptics.error();
      return;
    }
    reportSubmitError(error);
  };

  let body: ReactNode;
  if (saved && shown) {
    body = canEdit ? (
      <View style={styles.body}>
        <View style={styles.pair}>
          <TextField
            label={COMMISSION_COPY.finder}
            help={COMMISSION_COPY.finderHelp}
            value={shown.finder}
            onChangeText={(text) => edit('finder', text)}
            suffix="%"
            keyboardType="decimal-pad"
            error={errors.finder}
            containerStyle={styles.half}
          />
          <TextField
            label={COMMISSION_COPY.booker}
            help={COMMISSION_COPY.bookerHelp}
            value={shown.booker}
            onChangeText={(text) => edit('booker', text)}
            suffix="%"
            keyboardType="decimal-pad"
            error={errors.booker}
            containerStyle={styles.half}
          />
        </View>
        <Text variant="small" color="ink3">
          {COMMISSION_COPY.help}
        </Text>
        <PendingButton
          label={COMMISSION_COPY.save}
          pendingLabel="Saving"
          variant="secondary"
          fullWidth
          disabled={draft === null || sameSplit(shown.finder, shown.booker, saved)}
          onPress={save}
          onError={onError}
        />
      </View>
    ) : (
      <View style={styles.body} accessible accessibilityLabel={`${COMMISSION_COPY.title}: ${splitSummary(saved)}. ${COMMISSION_COPY.readOnly}`}>
        <Text variant="bodyStrong" tabular>
          {splitSummary(saved)}
        </Text>
        <Text variant="small" color="ink3">
          {COMMISSION_COPY.help}
        </Text>
        <Text variant="small" color="ink3">
          {COMMISSION_COPY.readOnly}
        </Text>
      </View>
    );
  } else if (query.isError) {
    body = <ErrorState compact error={query.error} onRetry={() => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    body = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = (
      <SkeletonGroup style={styles.body}>
        <Skeleton width="60%" />
        <Skeleton width="90%" />
        <Skeleton width="70%" />
      </SkeletonGroup>
    );
  }

  return (
    <SettingsGroup title={COMMISSION_COPY.title} icon={Percent} index={index} padded>
      {body}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingVertical: space[2] },
  pair: { flexDirection: 'row', gap: space[3] },
  half: { flex: 1 },
});
