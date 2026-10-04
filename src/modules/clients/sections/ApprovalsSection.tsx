import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Paperclip, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { requestApproval, type NewApprovalInput } from '@/api/endpoints/clients';
import type { Approval, ApprovalKind, ClientBundle, OnboardingTask } from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { useCan } from '@/auth/permissions';
import { openInBrowser } from '@/components/automation';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormSection } from '@/components/form/FormSection';
import { Select, type SelectOption } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatDateTime, toDate } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { RecordCard, RecordHead, RecordRow } from './files/records';
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STATUSES,
  handleFormError,
  isFinalAnswer,
  labelFrom,
  optionsFrom,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  tonedFrom,
  useBundleCache,
  useIntentKey,
  useMeta,
} from './files/shared';
import type { SectionProps } from './types';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;
const LINK_ERROR = 'Enter a full link starting with https://.';
const ATTACHMENT_ERROR = 'Add a label and a full https:// link for the attachment.';
const isLink = (value: string) => /^https?:\/\/\S+$/i.test(value);

const kindLabel = (meta: Meta | undefined, kind: ApprovalKind) => labelFrom(meta?.approvalKinds, APPROVAL_KIND_LABELS, kind);

function newestFirst(a: Approval, b: Approval) {
  return (toDate(b.requestedAt)?.getTime() ?? 0) - (toDate(a.requestedAt)?.getTime() ?? 0);
}

/**
 * Approvals (brief 8.5, section 5): what the client was asked to sign off, with
 * their feedback. "Request approval" asks for a new one (`clients.approvals.request`);
 * reusing a title makes the next version and supersedes the open one (the server decides).
 */
export function ApprovalsSection({ clientId, bundle }: SectionProps) {
  const meta = useMeta();
  const canRequest = useCan('clients.approvals.request');
  const { colors } = useTheme();
  const [requesting, setRequesting] = useState(false);
  const approvals = [...bundle.approvals].sort(newestFirst);
  const tasks = bundle.onboarding?.tasks ?? [];

  return (
    <Section title="Approvals">
      {approvals.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact message="Nothing requested yet." />
        </Card>
      ) : (
        <RecordCard
          items={approvals}
          keyOf={(a) => a.id}
          render={(a) => (
            <ApprovalRow approval={a} meta={meta} task={tasks.find((t) => t.id === a.taskId)} onOpen={(url) => openInBrowser(url, colors)} />
          )}
        />
      )}
      {canRequest ? (
        <Button label="Request approval" icon={Plus} variant="secondary" size="sm" onPress={() => setRequesting(true)} style={styles.add} />
      ) : null}

      {requesting && canRequest ? <RequestApprovalSheet clientId={clientId} bundle={bundle} meta={meta} onClose={() => setRequesting(false)} /> : null}
    </Section>
  );
}

type RowProps = { approval: Approval; meta: Meta | undefined; task: OnboardingTask | undefined; onOpen: (url: string) => void };

function ApprovalRow({ approval: a, meta, task, onOpen }: RowProps) {
  const { colors } = useTheme();
  const status = tonedFrom(meta?.approvalStatuses, APPROVAL_STATUSES, a.status);
  const version = `v${a.version} · ${kindLabel(meta, a.kind)}`;
  const requested = `Requested ${formatDateTime(a.requestedAt)}${a.requestedBy ? ` by ${a.requestedBy}` : ''}`;
  const decided = a.decidedAt ? `Decided ${formatDateTime(a.decidedAt)}${a.decidedBy ? ` by ${a.decidedBy}` : ''}` : null;
  const feedback = a.feedback?.trim() || null;

  return (
    <RecordRow>
      <View accessible accessibilityLabel={[a.title, status.label, version].join('. ')}>
        <RecordHead title={a.title} badge={status} />
        <Text variant="small" color="ink3" tabular style={styles.version}>
          {version}
        </Text>
      </View>
      {a.description?.trim() ? (
        <Text variant="small" color="ink2" numberOfLines={3}>
          {a.description.trim()}
        </Text>
      ) : null}
      {feedback ? (
        <View style={[styles.quote, { borderLeftColor: colors.goldSoft }]} accessible accessibilityLabel={`Client feedback: ${feedback}`}>
          <Text variant="body" color="ink2">{`“${feedback}”`}</Text>
        </View>
      ) : null}
      {task ? (
        <Text variant="small" color="ink3" numberOfLines={1}>{`Task: ${task.title}`}</Text>
      ) : null}
      <Text variant="small" color="ink4">
        {requested}
      </Text>
      {decided ? (
        <Text variant="small" color="ink4">
          {decided}
        </Text>
      ) : null}
      {a.previewUrl || a.attachment ? (
        <View style={styles.links}>
          {a.previewUrl ? (
            <Button
              label="Open preview"
              icon={ExternalLink}
              variant="secondary"
              size="sm"
              accessibilityLabel={`Open the preview of ${a.title}`}
              accessibilityHint="Opens in the browser"
              onPress={() => a.previewUrl && onOpen(a.previewUrl)}
            />
          ) : null}
          {a.attachment ? (
            <Button
              label={a.attachment.label}
              icon={Paperclip}
              variant="secondary"
              size="sm"
              accessibilityLabel={`Open the attachment ${a.attachment.label}`}
              accessibilityHint="Opens in the browser"
              onPress={() => a.attachment && onOpen(a.attachment.url)}
              style={styles.attachment}
            />
          ) : null}
        </View>
      ) : null}
    </RecordRow>
  );
}

type SheetProps = { clientId: string; bundle: ClientBundle; meta: Meta | undefined; onClose: () => void };

const STAGE_ORDER = Object.keys(STAGE_LABELS);

/** "Request approval": title (required), kind, description, preview URL, linked task, one attachment. */
function RequestApprovalSheet({ clientId, bundle, meta, onClose }: SheetProps) {
  const cache = useBundleCache(clientId);
  const intent = useIntentKey();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ApprovalKind | null>(null);
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const kinds = optionsFrom(meta?.approvalKinds, APPROVAL_KIND_LABELS);
  const tasks = [...(bundle.onboarding?.tasks ?? [])].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.sortOrder - b.sortOrder,
  );
  const taskOptions: SelectOption<string>[] = tasks.map((t) => ({
    value: t.id,
    label: t.title,
    hint: [
      labelFrom(meta?.onboardingStages, STAGE_LABELS, t.stage),
      labelFrom(meta?.taskStatuses, TASK_STATUS_LABELS, t.status),
    ].join(' · '),
  }));

  const create = useMutation({
    mutationFn: ({ input, key }: { input: NewApprovalInput; key: string }) => requestApproval(clientId, input, key),
    onSuccess: (approval) => {
      // A reused title supersedes the open version: the refetch brings that change in.
      cache.patch((b) => ({ ...b, approvals: [...b.approvals.filter((a) => a.id !== approval.id), approval] }));
      void cache.refresh();
    },
  });

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = 'Enter a title.';
    if (previewUrl.trim() && !isLink(previewUrl.trim())) found.previewUrl = LINK_ERROR;
    const hasLabel = attachmentLabel.trim().length > 0;
    const hasUrl = attachmentUrl.trim().length > 0;
    if (hasLabel !== hasUrl || (hasUrl && !isLink(attachmentUrl.trim()))) found.attachment = ATTACHMENT_ERROR;
    return found;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      haptics.error();
      return;
    }
    const input: NewApprovalInput = { title: title.trim() };
    if (kind) input.kind = kind;
    if (description.trim()) input.description = description.trim();
    if (previewUrl.trim()) input.previewUrl = previewUrl.trim();
    if (taskId) input.taskId = taskId;
    if (attachmentUrl.trim()) input.attachment = { label: attachmentLabel.trim(), url: attachmentUrl.trim() };
    const approval = await create.mutateAsync({ input, key: intent.keyFor(input) });
    intent.reset();
    haptics.success();
    notice.ok(approval.version > 1 ? `Approval requested as v${approval.version}.` : 'Approval requested.');
    onClose();
  };

  const dropError = (key: string) => {
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  };
  const edit = (key: string, set: (value: string) => void) => (text: string) => {
    set(text);
    dropError(key);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Request approval"
      subtitle="The client reviews it in their portal."
      snapPoints={[0.92]}
      scrollable
      footer={
        <PendingButton
          label="Request approval"
          pendingLabel="Requesting"
          fullWidth
          onPress={submit}
          onError={(e) => {
            if (isFinalAnswer(e)) intent.reset();
            handleFormError(e, ['title', 'kind', 'description', 'previewUrl', 'taskId', 'attachment'], setErrors);
          }}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Title"
          value={title}
          onChangeText={edit('title', setTitle)}
          maxLength={TITLE_MAX}
          showCount={false}
          help="Use the same title to send a new version."
          error={errors.title}
          autoCapitalize="sentences"
        />
        <Select<ApprovalKind>
          label="Kind"
          placeholder="Other"
          options={kinds}
          value={kind}
          onChange={(v) => {
            setKind(v);
            dropError('kind');
          }}
          onClear={() => setKind(null)}
          error={errors.kind}
        />
        <TextArea
          label="Description"
          value={description}
          onChangeText={edit('description', setDescription)}
          maxLength={DESCRIPTION_MAX}
          showCount={false}
          error={errors.description}
        />
        <TextField
          label="Preview URL"
          value={previewUrl}
          onChangeText={edit('previewUrl', setPreviewUrl)}
          keyboardType="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://"
          error={errors.previewUrl}
        />
        {taskOptions.length > 0 ? (
          <Select<string>
            label="Linked task"
            placeholder="None"
            options={taskOptions}
            value={taskId}
            onChange={(v) => {
              setTaskId(v);
              dropError('taskId');
            }}
            onClear={() => setTaskId(null)}
            help="Optional. A client task waits on this approval."
            error={errors.taskId}
          />
        ) : null}
        <FormSection title="Attachment" description="Optional. One file or page the client should look at.">
          <TextField label="Label" value={attachmentLabel} onChangeText={edit('attachment', setAttachmentLabel)} autoCapitalize="sentences" />
          <TextField
            label="URL"
            value={attachmentUrl}
            onChangeText={edit('attachment', setAttachmentUrl)}
            keyboardType="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://"
            error={errors.attachment}
          />
        </FormSection>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  add: { alignSelf: 'flex-start', marginTop: space[3] },
  version: { marginTop: 2 },
  quote: { borderLeftWidth: 2, paddingLeft: space[3], paddingVertical: 2, marginVertical: space[1] },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  attachment: { maxWidth: '100%' },
  form: { gap: space[4], paddingBottom: space[2] },
});
