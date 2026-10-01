import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { ActionButton } from '@/components/automation/ActionButton';
import { ApprovalCard } from '@/components/automation/ApprovalCard';
import { approvalFixtures } from '@/components/automation/fixtures';
import { JobProgress } from '@/components/automation/JobProgress';
import { useJobRunner } from '@/components/automation/useJobRunner';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { Caption, Demo, Wrap } from '../kitLayout';
import { delay } from '../sampleData';

/** A pretend long job: about 45 seconds unless cancelled. */
function pretendJob(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('done'), 45_000);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError({ status: 0, code: 'aborted', message: 'Cancelled.', kind: 'aborted' }));
    });
  });
}

const STATUS_COPY = {
  idle: 'Not started.',
  running: 'Running.',
  done: 'Finished.',
  failed: 'Failed.',
  cancelled: 'Cancelled. Work the server already did is not undone.',
} as const;

export function AutomationDemos() {
  const job = useJobRunner(pretendJob);
  const inline = useJobRunner(pretendJob);
  const { start } = job;
  const startInline = inline.start;
  const [actionPending, setActionPending] = useState(false);

  // The section opens with both jobs running, so the running state is what you see first.
  useEffect(() => {
    void start();
    void startInline();
  }, [start, startInline]);

  return (
    <>
      {approvalFixtures.map((item) => (
        <Demo key={item.id} title={`Approval: ${item.source ?? item.title}`} note="Approve, Edit, or Reject with a reason." bare>
          <ApprovalCard
            item={item}
            onApprove={async () => {
              await delay(1500);
              notice.ok('Approved.');
            }}
            onEdit={() => notice.ok('Opens the editor.')}
            onReject={async (reason) => {
              await delay(1000);
              notice.ok(`Rejected: ${reason}`);
            }}
          />
        </Demo>
      ))}

      <Demo title="Job progress" note="The black hole, the step, the elapsed time and Cancel." live>
        <JobProgress
          active={job.running}
          startedAt={job.startedAt}
          title="Pulling from Meta…"
          steps={['Asking Meta', 'Saving rows']}
          note="Up to 2 minutes."
          onCancel={job.cancel}
        />
        {job.running ? null : (
          <>
            <Caption>{STATUS_COPY[job.status]}</Caption>
            <Button label="Start again" variant="secondary" size="sm" onPress={() => void job.start()} />
          </>
        )}
      </Demo>

      <Demo title="Job progress, inline" note="One row for a card." live>
        <JobProgress
          variant="inline"
          active={inline.running}
          startedAt={inline.startedAt}
          title="Rebuilding the test catalog"
          onCancel={inline.cancel}
        />
        {inline.running ? null : (
          <>
            <Caption>{STATUS_COPY[inline.status]}</Caption>
            <Button label="Start again" variant="secondary" size="sm" onPress={() => void inline.start()} />
          </>
        )}
      </Demo>

      <Demo title="Action buttons" note="The approval card's own buttons, in every variant.">
        <Wrap gap={space[2]}>
          <ActionButton label="Approve" icon={Check} onPress={() => setActionPending((v) => !v)} pending={actionPending} pendingLabel="Approving" />
          <ActionButton label="Edit" variant="secondary" onPress={() => undefined} />
          <ActionButton label="Not now" variant="ghost" onPress={() => undefined} />
          <ActionButton label="Reject" variant="destructive" onPress={() => undefined} />
          <ActionButton label="Disabled" onPress={() => undefined} disabled />
        </Wrap>
        <Caption>Tap Approve to toggle its pending state.</Caption>
      </Demo>
    </>
  );
}
