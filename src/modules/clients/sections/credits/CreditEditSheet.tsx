import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientKeys, saveClientCredits } from '@/api/endpoints/clients';
import { teamKeys, teamQuery } from '@/api/endpoints/team';
import { MESSAGES } from '@/api/errors';
import type { ClientCredit, CreditRole } from '@/api/schemas/clients';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { Select, type SelectOption } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { IconButton } from '@/components/IconButton';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { useMeta } from '../../detail/meta';
import { showSaveError, updateBundle } from '../sectionData';
import {
  CREDIT_COPY,
  creditProblems,
  creditRoleOptions,
  creditsInput,
  draftFromCredits,
  hasProblems,
  MAX_CREDITS,
  NOTE_MAX,
  newDraftRow,
  sameAsSaved,
  sanitizeShareInput,
  totalHundredths,
  totalIsValid,
  totalText,
  type CreditDraftRow,
  type CreditProblems,
} from './logic';

export type CreditEditSheetProps = {
  clientId: string;
  businessName: string;
  /** Every row (the editor is only for `clients.credits.view` + `clients.credits.edit`). */
  credits: readonly ClientCredit[];
  onClose: () => void;
};

const NO_PROBLEMS: CreditProblems = { rows: {} };

/**
 * Edit a client's credits (PUT /clients/:id/credits, `clients.credits.edit`):
 * people from the team (GET /team: env owners and paused people included),
 * a role each (Finder, Booker, Other with their help lines), and a share. The
 * total shows live and must be exactly 100, or no rows at all (nobody gets
 * credit). A note saying why is required; every change is kept in the
 * client's activity. No Idempotency-Key (a PUT: the same credits again change
 * nothing). Mounted only while open, so it starts from the server's copy.
 */
export function CreditEditSheet({ clientId, businessName, credits, onClose }: CreditEditSheetProps) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const online = useIsOnline();
  const me = useMe();
  const meta = useMeta();
  const team = useQuery(teamQuery());
  const [rows, setRows] = useState<CreditDraftRow[]>(() => draftFromCredits(credits));
  const [note, setNote] = useState('');
  // Shown after the first Save press; the total shows from the start.
  const [shown, setShown] = useState<CreditProblems>(NO_PROBLEMS);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const roleOptions: SelectOption<CreditRole>[] = creditRoleOptions(meta.data).map((r) => ({ value: r.value, label: r.label, hint: r.help }));

  // The team, plus anyone credited who has left it (the server refuses them, so they can be swapped out).
  const people = [...(team.data ?? []).map((m) => ({ email: m.email.toLowerCase(), name: m.name }))];
  for (const c of credits) if (!people.some((p) => p.email === c.email.toLowerCase())) people.push({ email: c.email.toLowerCase(), name: c.name });
  const myEmail = me?.user.email.toLowerCase() ?? null;
  const personOptions: SelectOption<string>[] = people
    .map((p) => ({
      value: p.email,
      label: p.name?.trim() || p.email,
      hint: [p.email === myEmail ? 'You' : null, p.name?.trim() ? p.email : null].filter(Boolean).join(' · ') || undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

  const total = totalHundredths(rows);
  const totalOk = totalIsValid(rows);
  const unchanged = sameAsSaved(rows, credits);

  const edit = (key: string, change: Partial<CreditDraftRow>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
    setShown((p) => {
      const nextRows = { ...p.rows };
      delete nextRows[key];
      return { ...p, rows: nextRows, list: undefined };
    });
    setServerErrors({});
  };
  const remove = (key: string) => {
    setRows((list) => list.filter((r) => r.key !== key));
    setShown((p) => ({ ...p, list: undefined }));
    setServerErrors({});
  };
  const add = () => {
    setRows((list) => [...list, newDraftRow(list)]);
    setShown((p) => ({ ...p, list: undefined }));
  };

  const save = async () => {
    const problems = creditProblems(rows, note);
    if (hasProblems(problems)) {
      setShown(problems);
      haptics.error();
      return;
    }
    const saved = await saveClientCredits(clientId, creditsInput(rows, note));
    // The bundle shows the rows at once; its activity (the change and its note) refetches.
    updateBundle(queryClient, clientId, (b) => ({ ...b, credits: saved.credits }));
    queryClient.setQueryData(clientKeys.credits(clientId), saved);
    void queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) });
    // The activity board counts clients won from these shares.
    void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    haptics.success();
    notice.ok(CREDIT_COPY.saved);
    onClose();
  };

  let peopleState: ReactNode = null;
  if (!team.data) {
    if (team.isPending && team.fetchStatus === 'paused') {
      peopleState = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => team.refetch() : undefined} />;
    } else if (team.isError) {
      peopleState = <ErrorState compact error={team.error} onRetry={() => team.refetch()} />;
    } else {
      peopleState = <SkeletonList rows={2} trailing={false} dividers={false} />;
    }
  }

  const listError = shown.list ?? serverErrors.credits ?? null;
  const noteError = shown.note ?? serverErrors.note ?? null;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={CREDIT_COPY.editTitle}
      subtitle={businessName}
      scrollable
      footer={<PendingButton label={CREDIT_COPY.save} pendingLabel="Saving" fullWidth disabled={unchanged} onPress={save} onError={(e) => showSaveError(e, setServerErrors)} />}
    >
      <View style={styles.body}>
        {peopleState}

        {rows.map((row, index) => {
          const issues = shown.rows[row.key];
          return (
            <View key={row.key} style={[styles.row, { borderColor: colors.line }]}>
              <View style={styles.rowHead}>
                <Text variant="eyebrow">{`${CREDIT_COPY.person} ${index + 1}`}</Text>
                <IconButton icon={Trash2} size={20} accessibilityLabel={`Remove person ${index + 1}`} onPress={() => remove(row.key)} />
              </View>
              <Select<string>
                label={CREDIT_COPY.person}
                options={personOptions}
                value={row.email}
                onChange={(email) => edit(row.key, { email })}
                placeholder="Pick someone"
                error={issues?.person}
                searchable={personOptions.length > 8}
              />
              <View style={styles.pair}>
                <Select<CreditRole>
                  label={CREDIT_COPY.role}
                  options={roleOptions}
                  value={row.role}
                  onChange={(role) => edit(row.key, { role })}
                  containerStyle={styles.half}
                />
                <TextField
                  label={CREDIT_COPY.share}
                  value={row.share}
                  onChangeText={(text) => edit(row.key, { share: sanitizeShareInput(text) })}
                  suffix="%"
                  keyboardType="decimal-pad"
                  error={issues?.share}
                  containerStyle={styles.half}
                />
              </View>
            </View>
          );
        })}

        {rows.length === 0 ? (
          <Text variant="body" color="ink3">
            {CREDIT_COPY.nobody}
          </Text>
        ) : null}

        {rows.length < MAX_CREDITS ? <Button label={CREDIT_COPY.add} icon={Plus} variant="secondary" fullWidth onPress={add} /> : null}

        <View style={styles.total} accessible accessibilityLiveRegion="polite" accessibilityLabel={`Total ${totalText(total)}${totalOk ? '' : `. ${CREDIT_COPY.total}`}`}>
          <Text variant="bodyStrong">Total</Text>
          <Text variant="bodyStrong" tabular tone={totalOk ? 'ok' : 'signal'}>
            {rows.length === 0 ? '0%' : totalText(total)}
          </Text>
        </View>
        {!totalOk ? (
          <Text variant="small" tone="signal">
            {CREDIT_COPY.total}
          </Text>
        ) : null}
        {listError && listError !== CREDIT_COPY.total ? (
          <Text variant="small" tone="signal" accessibilityLiveRegion="polite">
            {listError}
          </Text>
        ) : null}

        <TextArea
          label={CREDIT_COPY.note}
          help={CREDIT_COPY.noteHelp}
          value={note}
          onChangeText={(text) => {
            setNote(text);
            setShown((p) => ({ ...p, note: undefined }));
            setServerErrors((e) => {
              const next = { ...e };
              delete next.note;
              return next;
            });
          }}
          error={noteError}
          softLimit={NOTE_MAX}
          minLines={2}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  row: { gap: space[3], borderWidth: 1, borderRadius: radius.input, padding: space[3] },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pair: { flexDirection: 'row', gap: space[3] },
  half: { flex: 1 },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
