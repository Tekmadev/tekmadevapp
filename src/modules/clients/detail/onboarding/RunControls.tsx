import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OnboardingPatch } from '@/api/endpoints/clients';
import { MESSAGES } from '@/api/errors';
import type { OnboardingRun, OnboardingStage } from '@/api/schemas/clients';
import { Button } from '@/components/Button';
import { DateField } from '@/components/form/DateField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { PendingButton } from '@/components/PendingButton';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { Sheet } from '@/components/sheet/Sheet';
import { space } from '@/design/tokens';

export type RunControlsProps = {
  run: OnboardingRun;
  stageOptions: readonly SelectOption<OnboardingStage>[];
  stageLabel: (stage: OnboardingStage) => string;
  /** Complete runs and offline: every control is read only. */
  locked: boolean;
  offline: boolean;
  /** Fields of the PATCH in flight, for their "Saving" line. */
  saving: readonly (keyof OnboardingPatch)[];
  /** PATCH /onboardings/:id. Rejects with the API error; these controls show it. */
  onPatch: (patch: OnboardingPatch) => Promise<unknown>;
  /** Choosing Complete in the Stage select: confirm first, it cannot be undone. */
  onAskComplete: () => void;
};

const REASON_MAX = 500;
const SAVING = 'Saving';

type BlockMode = 'block' | 'reason';

/** Marks the run blocked with an optional reason, or edits the reason of a blocked run. */
function BlockSheet({
  open,
  mode,
  initialReason,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: BlockMode;
  initialReason: string;
  onClose: () => void;
  onSave: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState(initialReason);
  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title={mode === 'block' ? 'Mark as blocked' : 'Blocked reason'}
      subtitle="What is it waiting on?"
      footer={
        <PendingButton
          label={mode === 'block' ? 'Mark blocked' : 'Save reason'}
          pendingLabel="Saving"
          fullWidth
          onPress={async () => {
            await onSave(reason.trim());
            onClose();
          }}
        />
      }
    >
      <View style={styles.sheetBody}>
        <TextArea label="Reason" value={reason} onChangeText={setReason} maxLength={REASON_MAX} />
      </View>
    </Sheet>
  );
}

/**
 * The run's own settings: Stage (all 8; Complete asks for HoldToConfirm), the
 * target go-live date, the kickoff date and time, and Blocked with its reason.
 * Each change saves on its own and waits for the server.
 */
export function RunControls({ run, stageOptions, stageLabel, locked, offline, saving, onPatch, onAskComplete }: RunControlsProps) {
  const [block, setBlock] = useState<{ open: boolean; mode: BlockMode; key: number }>({ open: false, mode: 'block', key: 0 });
  const disabled = locked || offline;
  const help = (field: keyof OnboardingPatch, idle?: string | null) => (saving.includes(field) ? SAVING : (idle ?? null));
  const busy = saving.length > 0;

  // A refused change shows the server's message; the control keeps showing the saved value.
  const save = (patch: OnboardingPatch) => {
    onPatch(patch).catch((error: unknown) => reportSubmitError(error));
  };

  const derivedNote = run.derivedStage !== run.stage ? `The checklist puts it at ${stageLabel(run.derivedStage)}.` : null;

  return (
    <View style={styles.wrap}>
      <Select<OnboardingStage>
        label="Stage"
        options={stageOptions}
        value={run.stage}
        disabled={disabled || busy}
        help={help('stage', derivedNote)}
        onChange={(stage) => {
          if (stage === run.stage) return;
          if (stage === 'complete') onAskComplete();
          else save({ stage });
        }}
      />
      <DateField
        label="Target go-live"
        value={run.targetLiveDate}
        optional
        placeholder="Not set"
        rangeError={null}
        disabled={disabled || busy}
        help={help('targetLiveDate')}
        onChange={(date) => {
          if (date !== run.targetLiveDate) save({ targetLiveDate: date });
        }}
      />
      <DateTimeField
        label="Kickoff"
        value={run.kickoffAt}
        optional
        placeholder="Not booked"
        rangeError={null}
        disabled={disabled || busy}
        help={help('kickoffAt')}
        onChange={(instant) => {
          if (instant !== run.kickoffAt) save({ kickoffAt: instant });
        }}
      />
      <View>
        <SwitchRow
          label="Blocked"
          description={run.blocked ? (run.blockedReason ?? 'No reason given') : 'Waiting on something'}
          value={run.blocked}
          disabled={disabled || (busy && !saving.includes('blocked'))}
          pending={saving.includes('blocked') || saving.includes('blockedReason')}
          onValueChange={(next) => {
            if (next) setBlock((b) => ({ open: true, mode: 'block', key: b.key + 1 }));
            else save({ blocked: false });
          }}
        />
        {run.blocked && !disabled ? (
          <Button
            label={run.blockedReason ? 'Edit reason' : 'Add a reason'}
            variant="ghost"
            size="sm"
            style={styles.reasonButton}
            onPress={() => setBlock((b) => ({ open: true, mode: 'reason', key: b.key + 1 }))}
          />
        ) : null}
      </View>
      {offline && !locked ? (
        <Text variant="small" color="ink3">
          {MESSAGES.offline}
        </Text>
      ) : null}

      <BlockSheet
        key={block.key}
        open={block.open}
        mode={block.mode}
        initialReason={run.blockedReason ?? ''}
        onClose={() => setBlock((b) => ({ ...b, open: false }))}
        onSave={(reason) =>
          block.mode === 'block'
            ? onPatch(reason ? { blocked: true, blockedReason: reason } : { blocked: true })
            : onPatch({ blockedReason: reason || null })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  reasonButton: { alignSelf: 'flex-start', marginTop: space[1] },
  sheetBody: { paddingBottom: space[2] },
});
