import type { ToolAnswer } from '@/api/schemas/tools';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { KeyValue } from '@/components/KeyValue';

const NO_ANSWERS = 'No answers were saved with this submission.';

/**
 * What the person typed into the tool: each question above its answer, as
 * the server words it (option values already turned into their labels). The
 * questions are long, so they stack rather than share a line with the answer.
 */
export function AnswersCard({ answers }: { answers: readonly ToolAnswer[] }) {
  if (answers.length === 0) {
    return (
      <Card>
        <EmptyState compact message={NO_ANSWERS} />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <KeyValue layout="stacked" items={answers.map((a) => ({ label: a.label, value: a.value }))} />
    </Card>
  );
}
