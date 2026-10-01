/**
 * The generic Approvals pattern (brief section 12). Future automations (the AI
 * assistant, voice capture, the job worker) propose something and the owner
 * approves it from the phone. The server will send these through `approval.*`
 * notifications and an `/approvals` feed; the app only renders and asks.
 *
 * A proposal's preview is a list of blocks, so a new automation can show its
 * work without a new screen.
 */

export type ApprovalKeyValueRow = { label: string; value: string };

export type ApprovalBlock =
  /** Lightly formatted Markdown: headings, bold, italic, code, links, lists, quotes. */
  | { type: 'markdown'; text: string }
  /** Facts in two columns ("Plan" / "Grow"). Values are display strings from the server. */
  | { type: 'keyValue'; rows: ApprovalKeyValueRow[] }
  | { type: 'image'; url: string; alt: string; caption?: string }
  /** Opens in a Custom Tab. */
  | { type: 'link'; label: string; url: string }
  /** What changes: `before` struck through, `after` highlighted, word by word. */
  | { type: 'diff'; before: string; after: string; label?: string };

export type ApprovalBlockType = ApprovalBlock['type'];

export type ApprovalItem = {
  id: string;
  title: string;
  summary: string;
  /** Who or what proposed it ("AI draft", "Voice note", "Worker"). */
  source?: string;
  /** ISO instant (UTC). Shown in Toronto time. */
  createdAt?: string;
  blocks: ApprovalBlock[];
};
