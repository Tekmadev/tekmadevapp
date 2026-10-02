import { POST_STATUSES, type PostStatus } from '@/api/schemas/blog';
import type { Meta } from '@/api/schemas/meta';
import type { SelectOption } from '@/components/form/Select';
import type { Tone } from '@/design/tokens';

/**
 * Post status labels and tones from GET /meta, with the brief's words as the
 * fallback (8.11: published gold; in review neutral; draft and archived muted).
 * There is no "Scheduled": scheduling does not exist on the server.
 */

const FALLBACK: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  in_review: { label: 'In review', tone: 'neutral' },
  published: { label: 'Published', tone: 'gold' },
  archived: { label: 'Archived', tone: 'muted' },
};

export function statusLabel(meta: Pick<Meta, 'blogStatuses'> | undefined, status: PostStatus): { label: string; tone: Tone } {
  const row = meta?.blogStatuses.find((s) => s.value === status);
  return row ? { label: row.label, tone: row.tone } : FALLBACK[status];
}

export function statusOptions(meta: Pick<Meta, 'blogStatuses'> | undefined): SelectOption<PostStatus>[] {
  return POST_STATUSES.map((value) => ({ value, label: statusLabel(meta, value).label }));
}
