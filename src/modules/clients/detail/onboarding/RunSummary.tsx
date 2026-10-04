import type { OnboardingRun, OnboardingStage } from '@/api/schemas/clients';
import { KeyValue } from '@/components/KeyValue';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';

export type RunSummaryProps = {
  run: OnboardingRun;
  stageLabel: (stage: OnboardingStage) => string;
};

/**
 * The run's settings, read only: for people who help with onboarding but may
 * not change the run itself (no `clients.onboarding`, such as staff). Same
 * facts as RunControls (stage, target go-live, kickoff, blocked), as label and
 * value rows, so nothing looks tappable that would only be refused.
 */
export function RunSummary({ run, stageLabel }: RunSummaryProps) {
  const stage = stageLabel(run.stage);
  const derived = run.derivedStage !== run.stage ? `${stage} (the checklist puts it at ${stageLabel(run.derivedStage)})` : stage;
  return (
    <KeyValue
      inset={0}
      items={[
        { label: 'Stage', value: derived },
        { label: 'Target go-live', value: run.targetLiveDate ? formatCalendarDate(run.targetLiveDate, undefined, true) : null },
        { label: 'Kickoff', value: run.kickoffAt ? formatDateTime(run.kickoffAt) : null },
        { label: 'Blocked', value: run.blocked ? (run.blockedReason?.trim() || 'Yes, no reason given') : 'No' },
      ]}
    />
  );
}
