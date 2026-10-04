import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { clientKeys, clientsMetaQuery, createClient, type NewClientInput } from '@/api/endpoints/clients';
import { leadKeys } from '@/api/endpoints/leads';
import { ApiError, fieldErrors } from '@/api/errors';
import type { CreateClientResult, PlanId } from '@/api/schemas/clients';
import { RequireCapability } from '@/auth/RequireCapability';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { isValidEmail } from '@/lib/text';

import { planSelectOptions } from './list/labels';

const REQUIRED = 'Business name and a valid email are required.';
const REUSE_NOTE = 'If a client with this email already exists, it is reused and updated instead of duplicated.';
const FROM_LEAD_NOTE = 'Linked to the lead, so the people who found it and booked the call get credit for this client.';
const NO_PLAN = 'none';

type PlanChoice = PlanId | typeof NO_PLAN;
type Field = 'businessName' | 'email' | 'name' | 'phone' | 'planId' | 'assignedStrategist';
type Errors = Partial<Record<Field, string>>;

/**
 * Route params a lead passes in ("Create client from this lead", brief 8.6).
 * `leadId` links the new client to that lead, which copies the lead's finder
 * and booker to the client's credits (commission credit).
 */
type Prefill = { businessName?: string; email?: string; name?: string; phone?: string; leadId?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** The toast after a create: what happened to the client, then to the invite (brief 8.5). */
export function createdMessage(result: Pick<CreateClientResult, 'reused' | 'invite'>): { tone: 'ok' | 'err'; text: string } {
  const what = result.reused ? 'Existing client updated' : 'Client created';
  if (result.invite === 'failed') return { tone: 'err', text: `${what}, but the invite email failed. Use Resend invite under Team.` };
  return { tone: 'ok', text: result.invite === 'sent' ? `${what}. Invite sent.` : `${what}.` };
}

/** The same checks the server makes, so the obvious mistakes never need a round trip. */
function validate(input: NewClientInput): Errors {
  const errors: Errors = {};
  if (!input.businessName) errors.businessName = 'Enter the business name.';
  if (!isValidEmail(input.email)) errors.email = 'Enter a valid email.';
  if (input.assignedStrategist && !isValidEmail(input.assignedStrategist)) errors.assignedStrategist = 'Enter a valid email.';
  return errors;
}

/**
 * New client (brief 8.5): a pushed screen, also opened from a lead with its
 * details filled in. Creating sends one Idempotency-Key per intent: retrying
 * the same details reuses it, so a timeout never makes two clients; changing
 * anything is a new intent. On success it opens the client in place of this
 * screen and says whether the portal invite went out. Needs `clients.create`
 * (owners and managers): anyone else who lands here is sent back.
 */
export function NewClientScreen() {
  return (
    <RequireCapability cap="clients.create">
      <NewClientForm />
    </RequireCapability>
  );
}

function NewClientForm() {
  const prefill = useLocalSearchParams<Prefill>();
  // Read once: the lead this form was opened from ("Create client from this lead").
  const [leadId] = useState(() => first(prefill.leadId) || null);
  const queryClient = useQueryClient();
  const meta = useQuery(clientsMetaQuery());

  const [businessName, setBusinessName] = useState(() => first(prefill.businessName));
  const [email, setEmail] = useState(() => first(prefill.email));
  const [name, setName] = useState(() => first(prefill.name));
  const [phone, setPhone] = useState(() => first(prefill.phone));
  const [plan, setPlan] = useState<PlanChoice>('grow');
  const [strategist, setStrategist] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ signature: string; key: string } | null>(null);

  const emailRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const create = useMutation({
    mutationFn: ({ input, key }: { input: NewClientInput; key: string }) => createClient(input, key),
    onSuccess: (result, { input }) => {
      // The list (and a reused client's detail) changed; the new client's detail loads on open.
      void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      if (result.reused) void queryClient.invalidateQueries({ queryKey: clientKeys.detail(result.client.id) });
      // The lead now points at its client ("Open client" instead of "Create client").
      if (input.leadId) {
        void queryClient.invalidateQueries({ queryKey: leadKeys.detail(input.leadId) });
        void queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      }
    },
  });

  const planOptions: SelectOption<PlanChoice>[] = [...planSelectOptions(meta.data), { value: NO_PLAN, label: 'No plan yet', hint: 'Pick one later' }];

  /** Changing a field clears its error (and the summary once nothing is left). */
  const clearError = (field: Field) => {
    if (!errors[field]) return;
    const next = { ...errors };
    delete next[field];
    setErrors(next);
    if (Object.keys(next).length === 0) setFormError(null);
  };
  const edit = (field: Field, set: (value: string) => void) => (value: string) => {
    set(value);
    clearError(field);
  };

  const submit = async () => {
    const input: NewClientInput = {
      businessName: businessName.trim(),
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      phone: phone.trim() || null,
      planId: plan === NO_PLAN ? null : plan,
      assignedStrategist: strategist.trim().toLowerCase() || null,
      sendInvite,
      ...(leadId ? { leadId } : {}),
    };
    const local = validate(input);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError(REQUIRED);
      haptics.error();
      return;
    }
    setErrors({});
    setFormError(null);

    // Same details as the last try: the same intent, so the same key.
    const signature = JSON.stringify(input);
    const key = intent?.signature === signature ? intent.key : newIdempotencyKey();
    if (key !== intent?.key) setIntent({ signature, key });

    const result = await create.mutateAsync({ input, key });
    haptics.success();
    const message = createdMessage(result);
    if (message.tone === 'ok') notice.ok(message.text);
    else notice.err(message.text);
    router.replace({ pathname: '/clients/[id]', params: { id: result.client.id } });
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error) as Errors;
    if (error instanceof ApiError && (Object.keys(fields).length > 0 || error.status === 400 || error.status === 409)) {
      setErrors(fields);
      setFormError(error.message);
      haptics.error();
      return;
    }
    reportSubmitError(error);
  };

  return (
    <Screen title="New client" back keyboardAware>
      <View style={styles.form}>
        <TextField
          label="Business name"
          value={businessName}
          onChangeText={edit('businessName', setBusinessName)}
          error={errors.businessName}
          autoCapitalize="words"
          autoComplete="organization"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
          label="Email"
          help="The portal invite goes here."
          value={email}
          onChangeText={edit('email', setEmail)}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => nameRef.current?.focus()}
        />
        <TextField
          ref={nameRef}
          label="Contact name"
          value={name}
          onChangeText={edit('name', setName)}
          error={errors.name}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => phoneRef.current?.focus()}
        />
        <TextField
          ref={phoneRef}
          label="Phone"
          value={phone}
          onChangeText={edit('phone', setPhone)}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Select<PlanChoice>
          label="Plan"
          options={planOptions}
          value={plan}
          onChange={(next) => {
            setPlan(next);
            clearError('planId');
          }}
          error={errors.planId}
        />
        <TextField
          label="Assigned strategist"
          help="Staff email."
          value={strategist}
          onChangeText={edit('assignedStrategist', setStrategist)}
          error={errors.assignedStrategist}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <SwitchRow
          label="Send portal invite"
          description="Emails a sign-in link for the client portal."
          value={sendInvite}
          onValueChange={setSendInvite}
        />
      </View>

      <Text variant="small" color="ink3" style={styles.note}>
        {leadId ? `${FROM_LEAD_NOTE} ${REUSE_NOTE}` : REUSE_NOTE}
      </Text>

      {formError ? (
        <Text variant="small" color="signal" weight="500" accessibilityLiveRegion="polite" style={styles.formError}>
          {formError}
        </Text>
      ) : null}

      <PendingButton label="Create client" pendingLabel="Creating" variant="primary" fullWidth onPress={submit} onError={onError} style={styles.submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  note: { marginTop: space[5] },
  formError: { marginTop: space[4] },
  submit: { marginTop: space[6] },
});
