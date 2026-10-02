import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket } from 'lucide-react-native';
import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { goLive } from '@/api/endpoints/clients';
import { ApiError } from '@/api/errors';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { PendingButton } from '@/components/PendingButton';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';

import { clientWriteKey, setBundle, settleClientWrite } from './cache';
import { goLiveToast } from './logic';

export type GoLiveButtonProps = {
  clientId: string;
  /** Only this button in a row shows the offline hint. */
  offlineHint?: boolean;
  style?: StyleProp<ViewStyle>;
};

const isCareRequired = (error: unknown): error is ApiError => error instanceof ApiError && error.code === 'care_required';

/**
 * "Go live": POST /clients/:id/go-live straight away. When the plan needs a
 * care plan and none is active, the server answers 422 `care_required`; a
 * sheet then shows its explanation and offers "Go live without a care plan"
 * behind HoldToConfirm, which retries with `override: true`.
 */
export function GoLiveButton({ clientId, offlineHint = true, style }: GoLiveButtonProps) {
  const queryClient = useQueryClient();
  // The message is kept after closing, so the text does not vanish while the sheet slides away.
  const [care, setCare] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  const mutation = useMutation({
    mutationKey: clientWriteKey(clientId),
    mutationFn: (override: boolean) => goLive(clientId, { override }),
    onSuccess: (result) => {
      setBundle(queryClient, clientId, (b) => ({ ...b, client: result.client, guarantee: result.guarantee }));
      haptics.success();
      notice.ok(goLiveToast(result.guarantee));
    },
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  return (
    <>
      <PendingButton
        label="Go live"
        pendingLabel="Going live"
        variant="gold"
        icon={Rocket}
        offlineHint={offlineHint}
        style={style}
        onPress={() => mutation.mutateAsync(false)}
        onError={(error) => {
          if (isCareRequired(error)) setCare({ open: true, message: error.message });
          else reportSubmitError(error);
        }}
      />
      <ConfirmSheet
        visible={care.open}
        onClose={() => setCare((c) => ({ ...c, open: false }))}
        title="Care plan needed"
        message={care.message}
        confirmLabel="Hold to go live without a care plan"
        pendingLabel="Going live"
        tone="ink"
        onConfirm={() => mutation.mutateAsync(true)}
      />
    </>
  );
}
