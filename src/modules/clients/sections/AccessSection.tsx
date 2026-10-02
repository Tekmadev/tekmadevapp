import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { requestAccess, updateAccessGrant, type AccessGrantPatch, type NewAccessGrantInput } from '@/api/endpoints/clients';
import type { AccessGrant, AccessProvider, AccessStatus } from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { OptionList, Select } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { formatShortDate } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { RecordCard, RecordHead, RecordRow } from './files/records';
import {
  ACCESS_METHOD_LABELS,
  ACCESS_PROVIDER_LABELS,
  ACCESS_STATUSES,
  handleFormError,
  isFinalAnswer,
  labelFrom,
  optionsFrom,
  tonedFrom,
  tonedOptionsFrom,
  useBundleCache,
  useIntentKey,
  useMeta,
} from './files/shared';
import type { SectionProps } from './types';

const NOTE_MAX = 1000;
const LABEL_MAX = 120;
const NOTE_LABEL = 'Note shown to the client';

const providerName = (meta: Meta | undefined, provider: AccessProvider) => labelFrom(meta?.accessProviders, ACCESS_PROVIDER_LABELS, provider);
const statusOf = (meta: Meta | undefined, status: AccessStatus) => tonedFrom(meta?.accessStatuses, ACCESS_STATUSES, status);
/** The grant's own label when set, otherwise the provider's name. */
const grantName = (meta: Meta | undefined, grant: AccessGrant) => grant.label?.trim() || providerName(meta, grant.provider);

/**
 * Access (brief 8.5, section 3): every access Tekmadev asked the client for.
 * Tap a grant to change its status and the note the client sees; "Request
 * another access" asks for something new.
 */
export function AccessSection({ clientId, bundle }: SectionProps) {
  const meta = useMeta();
  const grants = bundle.accessGrants;
  const [editing, setEditing] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const edited = editing ? (grants.find((g) => g.id === editing) ?? null) : null;

  return (
    <Section title="Access">
      {grants.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact message="No access requests yet." />
        </Card>
      ) : (
        <RecordCard items={grants} keyOf={(g) => g.id} render={(g) => <GrantRow grant={g} meta={meta} onPress={() => setEditing(g.id)} />} />
      )}
      <Button
        label={grants.length === 0 ? 'Request access' : 'Request another access'}
        icon={Plus}
        variant="secondary"
        size="sm"
        onPress={() => setRequesting(true)}
        style={styles.add}
      />

      {edited ? <GrantStatusSheet key={edited.id} clientId={clientId} grant={edited} meta={meta} onClose={() => setEditing(null)} /> : null}
      {requesting ? <RequestAccessSheet clientId={clientId} meta={meta} onClose={() => setRequesting(false)} /> : null}
    </Section>
  );
}

function GrantRow({ grant, meta, onPress }: { grant: AccessGrant; meta: Meta | undefined; onPress: () => void }) {
  const name = grantName(meta, grant);
  const status = statusOf(meta, grant.status);
  const method = grant.method ? labelFrom(meta?.accessMethods, ACCESS_METHOD_LABELS, grant.method) : null;
  const subtitle = [grant.label?.trim() ? providerName(meta, grant.provider) : null, method].filter(Boolean).join(' · ');
  const stamps = [
    grant.clientDoneAt ? `client marked done ${formatShortDate(grant.clientDoneAt)}` : null,
    grant.verifiedAt ? `verified ${formatShortDate(grant.verifiedAt)}${grant.verifiedBy ? ` by ${grant.verifiedBy}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <RecordRow
      onPress={onPress}
      accessibilityLabel={[name, status.label, grant.accountIdentifier, subtitle, stamps].filter(Boolean).join('. ')}
      accessibilityHint="Changes the status and the note the client sees"
    >
      <RecordHead title={name} badge={status} />
      {grant.accountIdentifier ? (
        <Text variant="mono" color="ink2" numberOfLines={1} ellipsizeMode="middle">
          {grant.accountIdentifier}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="small" color="ink3">
          {subtitle}
        </Text>
      ) : null}
      {stamps ? (
        <Text variant="small" color="ink4">
          {stamps}
        </Text>
      ) : null}
    </RecordRow>
  );
}

type GrantSheetProps = { clientId: string; grant: AccessGrant; meta: Meta | undefined; onClose: () => void };

/** Change a grant's status, and optionally the note the client sees (an empty note keeps the old one). */
function GrantStatusSheet({ clientId, grant, meta, onClose }: GrantSheetProps) {
  const cache = useBundleCache(clientId);
  const [status, setStatus] = useState<AccessStatus>(grant.status);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = grantName(meta, grant);
  const currentNote = grant.note?.trim() || null;
  const trimmed = note.trim();
  const dirty = status !== grant.status || trimmed.length > 0;

  const options = tonedOptionsFrom(meta?.accessStatuses, ACCESS_STATUSES);

  const save = useMutation({
    mutationFn: (patch: AccessGrantPatch) => updateAccessGrant(grant.id, patch),
    onSuccess: (updated) => {
      cache.patch((b) => ({ ...b, accessGrants: b.accessGrants.map((g) => (g.id === updated.id ? updated : g)) }));
      void cache.refresh();
    },
  });

  const submit = async () => {
    setErrors({});
    const patch: AccessGrantPatch = {};
    if (status !== grant.status) patch.status = status;
    if (trimmed) patch.note = trimmed;
    const updated = await save.mutateAsync(patch);
    haptics.success();
    notice.ok(patch.status ? `${name}: ${statusOf(meta, updated.status).label}.` : 'Note saved.');
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={name}
      subtitle={grant.accountIdentifier ?? (grant.label?.trim() ? providerName(meta, grant.provider) : undefined)}
      scrollable
      footer={
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          fullWidth
          disabled={!dirty}
          onPress={submit}
          onError={(e) => handleFormError(e, ['note'], setErrors)}
        />
      }
    >
      <View style={styles.form}>
        <View>
          <Text variant="eyebrow" style={styles.eyebrow}>
            Status
          </Text>
          <OptionList<AccessStatus> options={options} value={status} onChange={setStatus} accessibilityLabel="Status" />
        </View>
        {currentNote ? (
          <View style={styles.current}>
            <Text variant="eyebrow">Current note</Text>
            <Text variant="body" color="ink2">
              {currentNote}
            </Text>
          </View>
        ) : null}
        <TextArea
          label={NOTE_LABEL}
          value={note}
          onChangeText={(text) => {
            setNote(text);
            if (errors.note) setErrors({});
          }}
          maxLength={NOTE_MAX}
          help={currentNote ? 'Leave it empty to keep the current note.' : 'The client sees this next to the request in their portal.'}
          error={errors.note}
        />
      </View>
    </Sheet>
  );
}

/** "Request another access": provider (from GET /meta), label, note. */
function RequestAccessSheet({ clientId, meta, onClose }: { clientId: string; meta: Meta | undefined; onClose: () => void }) {
  const cache = useBundleCache(clientId);
  const intent = useIntentKey();
  const [provider, setProvider] = useState<AccessProvider | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const providers = optionsFrom(meta?.accessProviders, ACCESS_PROVIDER_LABELS);

  const create = useMutation({
    mutationFn: ({ input, key }: { input: NewAccessGrantInput; key: string }) => requestAccess(clientId, input, key),
    onSuccess: (grant) => {
      cache.patch((b) => ({ ...b, accessGrants: [...b.accessGrants.filter((g) => g.id !== grant.id), grant] }));
      void cache.refresh();
    },
  });

  const submit = async () => {
    if (!provider) {
      setErrors({ provider: 'Pick what we need access to.' });
      haptics.error();
      return;
    }
    setErrors({});
    const input: NewAccessGrantInput = { provider };
    if (label.trim()) input.label = label.trim();
    if (note.trim()) input.note = note.trim();
    const grant = await create.mutateAsync({ input, key: intent.keyFor(input) });
    intent.reset();
    haptics.success();
    notice.ok(`Access requested: ${grant.label?.trim() || providerName(meta, grant.provider)}.`);
    onClose();
  };

  const clearError = (key: string) => {
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Request another access"
      subtitle="The client sees the request in their portal."
      scrollable
      footer={
        <PendingButton
          label="Request access"
          pendingLabel="Requesting"
          fullWidth
          onPress={submit}
          onError={(e) => {
            if (isFinalAnswer(e)) intent.reset();
            handleFormError(e, ['provider', 'label', 'note'], setErrors);
          }}
        />
      }
    >
      <View style={styles.form}>
        <Select<AccessProvider>
          label="Provider"
          placeholder="Pick what we need access to"
          options={providers}
          value={provider}
          onChange={(v) => {
            setProvider(v);
            clearError('provider');
          }}
          error={errors.provider}
        />
        <TextField
          label="Label"
          value={label}
          onChangeText={(text) => {
            setLabel(text);
            clearError('label');
          }}
          maxLength={LABEL_MAX}
          showCount={false}
          help="Optional. Shown instead of the provider name."
          error={errors.label}
          returnKeyType="next"
        />
        <TextArea
          label={NOTE_LABEL}
          value={note}
          onChangeText={(text) => {
            setNote(text);
            clearError('note');
          }}
          maxLength={NOTE_MAX}
          help="Optional. Say what to do, for example which email to add."
          error={errors.note}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  add: { alignSelf: 'flex-start', marginTop: space[3] },
  form: { gap: space[4], paddingBottom: space[2] },
  eyebrow: { marginBottom: space[1] },
  current: { gap: space[1] },
});
