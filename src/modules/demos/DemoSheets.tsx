import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateDemo, type DemoPatch } from '@/api/endpoints/demos';
import { assigneesQuery } from '@/api/endpoints/leads';
import { ApiError, fieldErrors, MESSAGES } from '@/api/errors';
import type { DemoRequest } from '@/api/schemas/demos';
import { useMe } from '@/auth/session';
import { ErrorState } from '@/components/ErrorState';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { applyDemo, showDemoError } from './cache';
import { DemoFields } from './DemoFields';
import { demoFormErrors, demoFormFrom, demoPatchFrom, type DemoForm, type DemoFormErrors } from './demoForm';
import { isDemoLink, personName } from './labels';

const LINK_MESSAGE = 'Enter a full link starting with https://.';
const NOTE_LIMIT = 1000;

/** Send a patch, put the answer in the cache, say so. A 400 with fields is the caller's to show inline. */
function useDemoWrite(demo: DemoRequest) {
  const queryClient = useQueryClient();
  return {
    save: async (patch: DemoPatch, done: string) => {
      const updated = await updateDemo(demo.id, patch);
      applyDemo(queryClient, updated);
      haptics.success();
      notice.ok(done);
      return updated;
    },
    /** Field errors inline (returned), anything else as a toast. */
    fail: (error: unknown): Record<string, string> => {
      const fields = fieldErrors(error);
      if (error instanceof ApiError && error.status === 400 && Object.keys(fields).length > 0) {
        haptics.error();
        return fields;
      }
      showDemoError(error, queryClient, demo.id);
      return {};
    },
  };
}

/* ---------- edit the request ---------- */

/**
 * Edit the request (PATCH /demos/:id with only what changed): the same fields
 * as "Request a demo". Offered when `can.edit`. Mounted only while open, so
 * each opening starts from the server's copy.
 */
export function DemoEditSheet({ demo, onClose }: { demo: DemoRequest; onClose: () => void }) {
  const write = useDemoWrite(demo);
  const [form, setForm] = useState<DemoForm>(() => demoFormFrom(demo));
  const [errors, setErrors] = useState<DemoFormErrors>({});
  const patch = demoPatchFrom(demo, form);
  const changed = Object.keys(patch).length > 0;

  const change = <K extends keyof DemoForm>(key: K, value: DemoForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as keyof DemoFormErrors]) return e;
      const rest = { ...e };
      delete rest[key as keyof DemoFormErrors];
      return rest;
    });
  };

  const save = async () => {
    const local = demoFormErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      notice.err('Check the highlighted fields.');
      return;
    }
    await write.save(patch, 'Saved.');
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit request"
      subtitle={demo.business.name}
      scrollable
      snapPoints={[0.92]}
      footer={
        <PendingButton
          label="Save changes"
          pendingLabel="Saving"
          fullWidth
          disabled={!changed}
          onPress={save}
          onError={(e) => {
            const fields = write.fail(e);
            if (Object.keys(fields).length > 0) notice.err('Check the highlighted fields.');
            setErrors(fields);
          }}
        />
      }
    >
      <View style={styles.body}>
        <DemoFields form={form} errors={errors} onChange={change} />
      </View>
    </Sheet>
  );
}

/* ---------- the demo link ---------- */

export type DemoLinkSheetProps = {
  demo: DemoRequest;
  /** Start with "Mark it ready to show" on (opened after the server asked for the link first). */
  markReady?: boolean;
  onClose: () => void;
};

/**
 * The demo link (PATCH `demoUrl`, `can.manage`): an https link. While the
 * request is building, "Mark it ready to show" sends the status in the same
 * call, so the link and the step land together. Clearing the link is allowed
 * unless the demo is ready (the server says why).
 */
export function DemoLinkSheet({ demo, markReady = false, onClose }: DemoLinkSheetProps) {
  const write = useDemoWrite(demo);
  const [url, setUrl] = useState(demo.demoUrl ?? '');
  const [ready, setReady] = useState(markReady && demo.status === 'building');
  const [error, setError] = useState<string | null>(null);
  const trimmed = url.trim();
  const changed = trimmed !== (demo.demoUrl ?? '') || ready;

  const save = async () => {
    if (trimmed && !isDemoLink(trimmed)) {
      setError(LINK_MESSAGE);
      haptics.error();
      return;
    }
    const patch: DemoPatch = { demoUrl: trimmed || null };
    if (ready) patch.status = 'ready';
    await write.save(patch, ready ? 'Ready to show. The salesperson can open it now.' : trimmed ? 'Link saved.' : 'Link removed.');
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Demo link"
      subtitle={demo.business.name}
      snapPoints="content"
      footer={
        <PendingButton
          label={ready ? 'Save and mark ready' : 'Save link'}
          pendingLabel="Saving"
          fullWidth
          disabled={!changed}
          onPress={save}
          onError={(e) => setError(write.fail(e).demoUrl ?? null)}
        />
      }
    >
      <View style={styles.body}>
        <TextField
          label="Link"
          placeholder="https://name.vercel.app"
          help="Usually the demo's Vercel link. The salesperson opens it on their phone."
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            setError(null);
          }}
          error={error}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          clearable
          monospace
        />
        {demo.status === 'building' ? (
          <SwitchRow label="Mark it ready to show" description="Saves the link and tells the salesperson it is ready." value={ready} onValueChange={setReady} />
        ) : null}
      </View>
    </Sheet>
  );
}

/* ---------- the builder ---------- */

/** "Nobody" (no email is empty). */
const NOBODY = '';

/**
 * Who builds it (PATCH `builderEmail`, `can.manage`): the team from GET
 * /leads/assignees, plus Nobody. The signed-in person is marked "You".
 */
export function DemoBuilderSheet({ demo, onClose }: { demo: DemoRequest; onClose: () => void }) {
  const write = useDemoWrite(demo);
  const online = useIsOnline();
  const me = useMe();
  const myEmail = me?.user.email.toLowerCase() ?? '';
  const team = useQuery(assigneesQuery());
  const current = demo.builderEmail ?? NOBODY;
  const [draft, setDraft] = useState(current);

  const people = [...(team.data ?? [])];
  // Someone who left the team still shows as the current builder.
  if (demo.builderEmail && !people.some((p) => p.email === demo.builderEmail)) people.unshift({ email: demo.builderEmail, name: null });
  const options: SelectOption<string>[] = [
    { value: NOBODY, label: 'Nobody yet' },
    ...people.map((p) => ({
      value: p.email,
      label: personName(p.email, p.name),
      hint: [p.email.toLowerCase() === myEmail ? 'You' : null, p.name ? p.email : null].filter(Boolean).join(' · ') || undefined,
    })),
  ];
  const chosen = options.find((o) => o.value === draft);

  const save = async () => {
    await write.save({ builderEmail: draft === NOBODY ? null : draft }, draft === NOBODY ? 'Builder removed.' : `${chosen?.label ?? draft} is building it.`);
    onClose();
  };

  let body: ReactNode;
  if (team.data) {
    body = <OptionList<string> options={options} value={draft} onChange={setDraft} accessibilityLabel="Builder" />;
  } else if (team.isPending && team.fetchStatus === 'paused') {
    body = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => team.refetch() : undefined} />;
  } else if (team.isError) {
    body = <ErrorState compact error={team.error} onRetry={() => team.refetch()} />;
  } else {
    body = <SkeletonList rows={4} trailing={false} />;
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Builder"
      subtitle={demo.business.name}
      scrollable
      footer={
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          fullWidth
          disabled={draft === current || !team.data}
          onPress={save}
          onError={(e) => {
            write.fail(e);
          }}
        />
      }
    >
      <View style={styles.body}>{body}</View>
    </Sheet>
  );
}

/* ---------- the builder's note ---------- */

/** A note from the builder to the salesperson (PATCH `builderNote`, `can.manage`): what to know before showing it. */
export function DemoNoteSheet({ demo, onClose }: { demo: DemoRequest; onClose: () => void }) {
  const write = useDemoWrite(demo);
  const [note, setNote] = useState(demo.builderNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();
  const changed = trimmed !== (demo.builderNote ?? '');

  const save = async () => {
    await write.save({ builderNote: trimmed || null }, trimmed ? 'Note saved.' : 'Note removed.');
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Note for the salesperson"
      subtitle={demo.business.name}
      snapPoints="content"
      footer={
        <PendingButton
          label="Save note"
          pendingLabel="Saving"
          fullWidth
          disabled={!changed}
          onPress={save}
          onError={(e) => setError(write.fail(e).builderNote ?? null)}
        />
      }
    >
      <View style={styles.body}>
        <Text variant="small" color="ink3">
          What they should know before showing it: placeholders, pages to skip, what to ask the client.
        </Text>
        <TextArea
          label="Note"
          value={note}
          onChangeText={(v) => {
            setNote(v);
            setError(null);
          }}
          error={error}
          maxLength={NOTE_LIMIT}
          minLines={4}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
