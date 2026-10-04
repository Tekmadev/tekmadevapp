import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Undo2 } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { loaderSettingsQuery, resetLoaderSettings, saveLoaderSettings, settingsKeys } from '@/api/endpoints/settings';
import { errorMessage, MESSAGES } from '@/api/errors';
import type { LoaderSettings } from '@/api/schemas/settings';
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { session } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { Slider } from '@/components/form/Slider';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { radius, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useLoaderStore } from '@/loader/settings';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { LoaderPreview } from './LoaderPreview';
import {
  DELAY_FIELD,
  isOriginal,
  PULL_FIELDS,
  RESET_MESSAGE,
  RESET_TOAST,
  SAVED_TOAST,
  sameSettings,
  SPEED_FIELDS,
  UNSAVED_NOTE,
  withValue,
  type LoaderField,
} from './logic';

const IN_USE_NOTE = 'Every page on the site and this app use these settings.';
const VIEW_ONLY_NOTE = 'View only. Your role cannot change the loader.';

const previewLoader = (settings: LoaderSettings | null) => useLoaderStore.getState().preview(settings);

/**
 * Loader (brief 8.14; `loader.view`, owners and managers): the black hole's
 * six settings for the whole site and this app. The live preview stays pinned
 * at the top; dragging a slider previews the value at once (every mark in the
 * app reads the loader store on the UI thread), with a haptic per step.
 * Nothing reaches the site until "Save for the whole site". "Undo changes"
 * drops the draft; "Reset to original" puts the brief's defaults back
 * everywhere after a hold. Without `loader.write` the sliders show the saved
 * values, locked, and the buttons are left out.
 */
export function LoaderScreen() {
  return (
    <RequireCapability cap="loader.view">
      <LoaderBody />
    </RequireCapability>
  );
}

function LoaderBody() {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const canWrite = useCan('loader.write');
  const query = useQuery(loaderSettingsQuery());
  useRefreshOnFocus([settingsKeys.loader()]);

  const saved = query.data;
  // The owner's unsaved values; null while nothing was touched.
  const [draft, setDraft] = useState<LoaderSettings | null>(null);
  const [replay, setReplay] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);

  // The server's values are the truth: once they land, every loader in this app uses them too.
  useEffect(() => {
    if (saved) useLoaderStore.getState().apply(saved);
  }, [saved]);
  // Leaving the screen ends the preview; the app goes back to the saved values.
  useEffect(() => () => previewLoader(null), []);

  const values = draft ?? saved;
  const changed = draft !== null && saved !== undefined && !sameSettings(draft, saved);

  /** The server answered a save or reset: show it everywhere, here first. */
  const landed = (result: LoaderSettings, message: string) => {
    queryClient.setQueryData(settingsKeys.loader(), result);
    useLoaderStore.getState().apply(result);
    previewLoader(null);
    setDraft(null);
    notice.ok(message);
    // GET /me carries the same values and is cached for the next cold start; refresh it quietly.
    session.refreshMe().catch(() => undefined);
  };

  const save = useMutation({
    mutationFn: (next: LoaderSettings) => saveLoaderSettings(next),
    onSuccess: (result) => landed(result, SAVED_TOAST),
  });
  const reset = useMutation({
    mutationFn: () => resetLoaderSettings(),
    onSuccess: (result) => landed(result, RESET_TOAST),
  });
  const busy = save.isPending || reset.isPending;

  const change = (key: keyof LoaderSettings, value: number) => {
    const base = draft ?? saved;
    if (!base) return;
    const next = withValue(base, key, value);
    setDraft(next);
    // Straight to the loader store (not through an effect), so the marks move with the finger.
    previewLoader(next);
  };

  const undo = () => {
    setDraft(null);
    previewLoader(null);
  };

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const result = await query.refetch();
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  let body: ReactNode;
  if (values) {
    body = (
      <>
        {query.isRefetchError && online ? (
          <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
        ) : null}
        <SliderGroup title="Speed" fields={SPEED_FIELDS} values={values} disabled={busy || !canWrite} onChange={change} />
        <SliderGroup title="Pull" fields={PULL_FIELDS} values={values} disabled={busy || !canWrite} onChange={change} />
        <SliderGroup
          title="Appear delay"
          fields={[DELAY_FIELD]}
          values={values}
          disabled={busy || !canWrite}
          onChange={change}
          // Letting go of the delay plays it again in the preview.
          onChangeEnd={() => setReplay((n) => n + 1)}
        />
        {canWrite ? (
          <View style={styles.actions}>
            <Text variant="small" color={changed ? 'ink2' : 'ink3'} align="center" accessibilityLiveRegion="polite">
              {changed ? UNSAVED_NOTE : IN_USE_NOTE}
            </Text>
            <PendingButton
              label="Save for the whole site"
              pendingLabel="Saving"
              fullWidth
              disabled={!changed || reset.isPending}
              onPress={() => (draft ? save.mutateAsync(draft) : undefined)}
              accessibilityHint="Every page on the site and this app switch to these settings."
            />
            <View style={styles.row}>
              <Button
                label="Undo changes"
                variant="secondary"
                icon={Undo2}
                disabled={!changed || busy}
                onPress={undo}
                style={styles.half}
                accessibilityHint="Goes back to the saved settings. Nothing is sent."
              />
              <Button
                label="Reset to original"
                variant="secondary"
                icon={RotateCcw}
                // Already the originals with nothing changed: there is nothing to reset.
                disabled={!online || busy || (saved !== undefined && isOriginal(saved) && !changed)}
                onPress={() => setResetOpen(true)}
                style={styles.half}
              />
            </View>
          </View>
        ) : (
          <Text variant="small" color="ink3" align="center" style={styles.viewOnly}>
            {VIEW_ONLY_NOTE}
          </Text>
        )}
      </>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: a skeleton would never end, so say why.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = <LoaderSkeleton />;
  }

  return (
    <>
      <Screen
        title="Loader"
        subtitle="The black hole, tuned for the whole site"
        back
        onRefresh={onRefresh}
        refetching={query.isFetching && saved !== undefined}
        offlineBanner={saved !== undefined}
        queryKey={settingsKeys.loader()}
        // The preview stays in view while any slider below is dragged.
        stickyHeaderIndices={[0]}
      >
        <LoaderPreview key="preview" replay={replay} onReplay={() => setReplay((n) => n + 1)} />
        <View key="body" style={styles.body}>
          {body}
        </View>
      </Screen>
      <ConfirmSheet
        visible={resetOpen && canWrite}
        onClose={() => setResetOpen(false)}
        title="Reset to original"
        message={RESET_MESSAGE}
        confirmLabel="Hold to reset"
        pendingLabel="Resetting"
        tone="ink"
        onConfirm={() => reset.mutateAsync()}
      />
    </>
  );
}

type SliderGroupProps = {
  title: string;
  fields: readonly LoaderField[];
  values: LoaderSettings;
  /** While a save or reset is on its way, so nothing changes under it. */
  disabled: boolean;
  onChange: (key: keyof LoaderSettings, value: number) => void;
  onChangeEnd?: () => void;
};

function SliderGroup({ title, fields, values, disabled, onChange, onChangeEnd }: SliderGroupProps) {
  return (
    <Section title={title} spacing={space[6]}>
      <Card style={styles.card}>
        {fields.map((field) => (
          <Slider
            key={field.key}
            label={field.label}
            value={values[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            format={field.format}
            help={field.help}
            disabled={disabled}
            onChange={(value) => onChange(field.key, value)}
            onChangeEnd={onChangeEnd}
          />
        ))}
      </Card>
    </Section>
  );
}

/** The slider cards' shape while the saved values load (after showAfterMs). */
function LoaderSkeleton() {
  return (
    <SkeletonGroup>
      {[2, 3, 1].map((count, i) => (
        <View key={i} style={styles.skeletonGroup}>
          <Skeleton width={96} height={18} />
          <Skeleton shape="block" height={count * SLIDER_HEIGHT + (count - 1) * space[5] + space[4] * 2} style={styles.skeletonCard} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** A slider with its label row, track and one line of help. */
const SLIDER_HEIGHT = 112;

const styles = StyleSheet.create({
  body: { paddingTop: space[3] },
  refetchError: { marginBottom: space[4] },
  card: { gap: space[5] },
  actions: { gap: space[3], marginTop: space[1] },
  viewOnly: { marginTop: space[1] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  half: { flexGrow: 1, flexBasis: 150 },
  skeletonGroup: { gap: space[3], marginBottom: space[6] },
  skeletonCard: { borderRadius: radius.card },
});
