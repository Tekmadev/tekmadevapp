import { useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateLead } from '@/api/endpoints/leads';
import type { Lead } from '@/api/schemas/leads';
import { Chip } from '@/components/Chip';
import { Calendar } from '@/components/form/Calendar';
import { combineToInstant, dateTimeRangeError, formatFieldDateTime, splitInstant, type DateTimeDraft } from '@/components/form/dateTime';
import { TimePicker } from '@/components/form/TimePicker';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { addDays, toDate, todayToronto } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { applyLead, refreshAfterLeadWrite } from './cache';
import { leadTitle } from './logic';
import { followUpPatch, followUpPresets, sameInstant } from './outreach';

const NINE_AM = { hour: 9, minute: 0 };

/** Where the picker starts: the planned follow-up while it is ahead, else tomorrow at its time (or 9:00 AM). */
function startDraft(current: string | null | undefined, now: Date): DateTimeDraft {
  const split = splitInstant(current);
  const at = toDate(current ?? null);
  if (split && at && at.getTime() > now.getTime()) return split;
  return { date: addDays(todayToronto(now), 1), time: split?.time ?? NINE_AM };
}

export type FollowUpSheetProps = {
  lead: Lead;
  onClose: () => void;
};

/**
 * The next follow-up (PATCH /leads/:id `followUpAt`, `leads.update`): one-tap
 * Tomorrow, In 3 days and Next week, or any Toronto date and time; "Clear"
 * removes it. Saving waits for the server. Mounted only while open, and the
 * clock is read once when it opens.
 */
export function FollowUpSheet({ lead, onClose }: FollowUpSheetProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const [draft, setDraft] = useState<DateTimeDraft>(() => startDraft(lead.followUpAt, now));
  const current = lead.followUpAt ?? null;

  const instant = combineToInstant(draft.date, draft.time);
  const nowIso = now.toISOString();
  const rangeError = dateTimeRangeError(instant, nowIso, null, now);
  const unchanged = sameInstant(current, instant);

  const save = async (next: string | null) => {
    const patch = followUpPatch(current, next);
    if (!patch) {
      onClose();
      return;
    }
    const updated = await updateLead(lead.id, patch);
    applyLead(queryClient, updated);
    refreshAfterLeadWrite(queryClient);
    haptics.success();
    notice.ok(next ? 'Follow-up set.' : 'Follow-up cleared.');
    onClose();
  };

  const presets = followUpPresets(now);

  const footer = (
    <View style={styles.footer}>
      {current ? (
        <View style={styles.footerSide}>
          <PendingButton label="Clear" pendingLabel="Clearing" variant="secondary" fullWidth offlineHint={false} onPress={() => save(null)} />
        </View>
      ) : null}
      <View style={styles.footerSide}>
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          fullWidth
          disabled={!instant || !!rangeError || unchanged}
          onPress={() => (instant ? save(instant) : undefined)}
        />
      </View>
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title="Next follow-up" subtitle={leadTitle(lead)} snapPoints="content" scrollable footer={footer}>
      <View style={styles.body}>
        <View style={styles.presets} accessibilityLabel="Quick dates">
          {presets.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              selected={draft.date === p.date}
              role="radio"
              onPress={() => setDraft({ date: p.date, time: draft.time })}
            />
          ))}
        </View>
        <Calendar value={draft.date} min={todayToronto(now)} onSelect={(date) => setDraft({ date, time: draft.time })} />
        <TimePicker value={draft.time} onChange={(time) => setDraft({ date: draft.date, time })} />
        <View
          style={[styles.summary, { backgroundColor: colors.bg2, borderColor: rangeError ? colors.signal : colors.line }]}
          accessibilityLiveRegion="polite"
        >
          <Icon icon={Globe} size={16} color={rangeError ? 'signal' : 'ink3'} />
          <View style={styles.summaryText}>
            {instant ? (
              <Text variant="bodyStrong" tabular>
                {formatFieldDateTime(instant, now)}
              </Text>
            ) : null}
            <Text variant="small" color={rangeError ? 'signal' : 'ink3'}>
              {rangeError ?? 'Toronto time, whatever zone this phone is in.'}
            </Text>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[5], paddingTop: space[1], paddingBottom: space[2] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingVertical: space[1] + 2 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: space[4] - 2,
    paddingVertical: space[3],
  },
  summaryText: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', gap: space[3] },
  footerSide: { flex: 1 },
});
