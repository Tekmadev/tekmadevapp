import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { clientKeys } from '@/api/endpoints/clients';
import { createDemo, type NewDemoInput } from '@/api/endpoints/demos';
import { leadKeys } from '@/api/endpoints/leads';
import { ApiError, fieldErrors } from '@/api/errors';
import type { ClientBundle } from '@/api/schemas/clients';
import type { Lead } from '@/api/schemas/leads';
import { RequireCapability } from '@/auth/RequireCapability';
import { Card } from '@/components/Card';
import { DraftRestoreNotice } from '@/components/form/DraftRestoreNotice';
import { useAutosave, useDraftRestore } from '@/components/form/TextArea';
import { ErrorState } from '@/components/ErrorState';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { applyDemo } from './cache';
import { DemoFields } from './DemoFields';
import { demoFormErrors, demoTarget, emptyDemoForm, newDemoInput, type DemoForm, type DemoFormErrors, type DemoFormTarget } from './demoForm';

const CHECK_FIELDS = 'Check the highlighted fields.';
const NO_TARGET = 'Open a client or a lead first, then tap Request a demo.';

type Params = { clientId?: string; leadId?: string; businessName?: string; area?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * Request a demo (contract 2026-10-05, POST /demos): opened from a client, a
 * lead or New client with `clientId` or `leadId`, and the business name and
 * area filled in when known. The business fields, what the client wants to
 * see and when it is needed. One Idempotency-Key per intent (the same details
 * sent again reuse it, so a timeout never asks twice). Server field errors
 * show under their fields; on success "Demo requested." and the request
 * opens in place of this form. What is typed is kept as a local draft until
 * the server has it. Needs `demos.request`.
 */
export function NewDemoScreen() {
  return (
    <RequireCapability cap="demos.request">
      <NewDemoForm />
    </RequireCapability>
  );
}

/** The name of who it is for, from what the app already loaded (the client's bundle or the lead), else the prefill. */
function targetName(queryClient: ReturnType<typeof useQueryClient>, target: DemoFormTarget, fallback: string): string {
  if ('clientId' in target) {
    const bundle = queryClient.getQueryData<ClientBundle>(clientKeys.detail(target.clientId));
    return bundle?.client.businessName ?? fallback;
  }
  const lead = queryClient.getQueryData<Lead>(leadKeys.detail(target.leadId));
  return lead?.business?.trim() || lead?.name?.trim() || fallback;
}

function NewDemoForm() {
  const params = useLocalSearchParams<Params>();
  const queryClient = useQueryClient();
  // Read once: who it is for and what was filled in.
  const [prefill] = useState(() => ({ businessName: first(params.businessName), area: first(params.area) }));
  const [target] = useState(() => demoTarget(first(params.clientId), first(params.leadId)));
  const [forName] = useState(() => (target ? targetName(queryClient, target, prefill.businessName) : ''));
  const [initial] = useState(() => emptyDemoForm(prefill));

  const draftKey = target ? ('clientId' in target ? `demos.new.client.${target.clientId}` : `demos.new.lead.${target.leadId}`) : null;
  const autosave = useAutosave<DemoForm>(draftKey);
  const offer = useDraftRestore<DemoForm>(draftKey, initial);

  const [form, setForm] = useState<DemoForm>(initial);
  const [errors, setErrors] = useState<DemoFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ signature: string; key: string } | null>(null);

  const create = useMutation({
    mutationFn: ({ input, key }: { input: NewDemoInput; key: string }) => createDemo(input, key),
    onSuccess: (demo) => applyDemo(queryClient, demo),
  });

  const change = <K extends keyof DemoForm>(key: K, value: DemoForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    autosave.schedule(next);
    if (errors[key]) {
      const rest = { ...errors };
      delete rest[key];
      setErrors(rest);
      if (Object.keys(rest).length === 0) setFormError(null);
    }
  };

  if (!target) {
    return (
      <Screen title="Request a demo" back>
        <ErrorState message={NO_TARGET} />
      </Screen>
    );
  }

  const submit = async () => {
    const local = demoFormErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError(CHECK_FIELDS);
      haptics.error();
      return;
    }
    setErrors({});
    setFormError(null);
    const input = newDemoInput(target, form);
    // Same details as the last try: the same intent, so the same key.
    const signature = JSON.stringify(input);
    const key = intent?.signature === signature ? intent.key : newIdempotencyKey();
    if (key !== intent?.key) setIntent({ signature, key });

    const demo = await create.mutateAsync({ input, key });
    autosave.clear();
    haptics.success();
    notice.ok('Demo requested.');
    router.replace({ pathname: '/demos/[id]', params: { id: demo.id } });
  };

  const onError = (error: unknown) => {
    if (error instanceof ApiError && (error.status === 400 || error.status === 403 || error.status === 404 || error.status === 409)) {
      setErrors(fieldErrors(error));
      setFormError(error.message);
      haptics.error();
      return;
    }
    reportSubmitError(error);
  };

  const kind = 'clientId' in target ? 'client' : 'lead';

  return (
    <Screen title="Request a demo" back keyboardAware>
      <DraftRestoreNotice
        draft={offer.draft}
        onRestore={() => {
          const restored = offer.restore();
          if (restored) setForm(restored);
        }}
        onDiscard={offer.discard}
        style={styles.draft}
      />

      <Card accessibilityLabel={forName ? `For the ${kind} ${forName}` : `For this ${kind}`} style={styles.target}>
        <Text variant="eyebrow">{kind === 'client' ? 'For the client' : 'For the lead'}</Text>
        <Text variant="title" numberOfLines={2}>
          {forName || (kind === 'client' ? 'This client' : 'This lead')}
        </Text>
        <Text variant="small" color="ink3">
          An owner or manager builds the demo. You get a note in the Inbox when it is ready to show.
        </Text>
      </Card>

      <DemoFields form={form} errors={errors} onChange={change} />

      {formError ? (
        <Text variant="small" color="signal" weight="500" accessibilityLiveRegion="polite" style={styles.formError}>
          {formError}
        </Text>
      ) : null}

      <View style={styles.submit}>
        <PendingButton label="Request a demo" pendingLabel="Requesting" variant="primary" fullWidth onPress={submit} onError={onError} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  draft: { marginBottom: space[4] },
  target: { gap: space[1], marginBottom: space[6] },
  formError: { marginTop: space[5] },
  submit: { marginTop: space[6] },
});
