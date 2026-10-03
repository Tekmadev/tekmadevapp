import type { CalloutVariant } from '@/api/schemas/blog';

/**
 * The formatting toolbar's text edits (brief 8.11, "Supported Markdown"), as
 * pure functions: each takes the body and the selection and returns the new
 * body and where the selection goes. Inline styles wrap the selection (and
 * unwrap it when it is already wrapped); line styles toggle a prefix on every
 * selected line; blocks are inserted as their own paragraph, with a blank line
 * before and after, so the server never glues them to the text around them.
 */

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/** Selection in order and inside the text. */
export function clampSelection(text: string, selection: Selection): Selection {
  const a = Math.max(0, Math.min(text.length, selection.start));
  const b = Math.max(0, Math.min(text.length, selection.end));
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/* ------------------------------------------------------------------ */
/* Inline: bold and italic                                              */
/* ------------------------------------------------------------------ */

export type InlineStyle = 'bold' | 'italic';

const MARKER: Record<InlineStyle, string> = { bold: '**', italic: '*' };

/** How many `*` sit right before `index` (dir -1) or from `index` on (dir 1). */
function starRun(text: string, index: number, dir: -1 | 1): number {
  let n = 0;
  let i = dir === -1 ? index - 1 : index;
  while (i >= 0 && i < text.length && text[i] === '*') {
    n++;
    i += dir;
  }
  return n;
}

/** A run of stars carries this style: bold needs two (or three, bold italic), italic an odd count. */
function runHas(style: InlineStyle, run: number): boolean {
  return style === 'bold' ? run >= 2 : run % 2 === 1;
}

/** Wrap one line's selected part, keeping spaces outside the markers ("**word** ", not "**word **"). */
function wrapSegment(segment: string, marker: string): { text: string; lead: number; inner: number } {
  const lead = segment.length - segment.trimStart().length;
  const inner = segment.trim();
  if (!inner) return { text: segment, lead, inner: 0 };
  const trail = segment.length - lead - inner.length;
  return { text: `${segment.slice(0, lead)}${marker}${inner}${marker}${segment.slice(segment.length - trail)}`, lead, inner: inner.length };
}

/**
 * Bold or italic. With nothing selected the pair is inserted and the cursor
 * sits between the markers. A selection already wrapped in the style (markers
 * just outside it, or selected along with it) is unwrapped. A selection over
 * several lines wraps each line, because emphasis cannot cross a line break.
 */
export function toggleInline(source: string, selection: Selection, style: InlineStyle): Edit {
  const { start, end } = clampSelection(source, selection);
  const m = MARKER[style];
  const selected = source.slice(start, end);

  if (start === end) {
    const text = `${source.slice(0, start)}${m}${m}${source.slice(end)}`;
    return { text, selection: { start: start + m.length, end: start + m.length } };
  }

  if (!selected.includes('\n')) {
    // Markers just outside the selection: "**|word|**" (a selection with spaces at its edges never is).
    const before = starRun(source, start, -1);
    const after = starRun(source, end, 1);
    if (selected.trim() === selected && runHas(style, before) && runHas(style, after)) {
      const text = `${source.slice(0, start - m.length)}${selected}${source.slice(end + m.length)}`;
      return { text, selection: { start: start - m.length, end: end - m.length } };
    }
    // Markers selected with the word: "|**word**|".
    const lead = starRun(selected, 0, 1);
    const trail = starRun(selected, selected.length, -1);
    if (selected.length > 2 * m.length && lead < selected.length && runHas(style, lead) && runHas(style, trail)) {
      const inner = selected.slice(m.length, selected.length - m.length);
      const text = `${source.slice(0, start)}${inner}${source.slice(end)}`;
      return { text, selection: { start, end: start + inner.length } };
    }
    const wrapped = wrapSegment(selected, m);
    if (wrapped.inner === 0) return { text: source, selection: { start, end } };
    const text = `${source.slice(0, start)}${wrapped.text}${source.slice(end)}`;
    const innerStart = start + wrapped.lead + m.length;
    return { text, selection: { start: innerStart, end: innerStart + wrapped.inner } };
  }

  const lines = selected.split('\n').map((line) => wrapSegment(line, m).text);
  const replaced = lines.join('\n');
  const text = `${source.slice(0, start)}${replaced}${source.slice(end)}`;
  return { text, selection: { start, end: start + replaced.length } };
}

/* ------------------------------------------------------------------ */
/* Lines: headings, lists, quotes                                       */
/* ------------------------------------------------------------------ */

export type LineStyle = 'h2' | 'h3' | 'bullet' | 'numbered' | 'quote';

const HEADING_PREFIX = /^#{1,6}\s+/;
const BULLET_PREFIX = /^\s*[-*+]\s+/;
const NUMBER_PREFIX = /^\s*\d{1,9}[.)]\s+/;
const QUOTE_PREFIX = /^\s*>\s?/;

/** Start and end (exclusive, before the newline) of the lines the selection touches. */
export function lineRange(text: string, selection: Selection): { from: number; to: number } {
  const { start, end } = clampSelection(text, selection);
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  // A selection that ends right after a newline does not include the next line.
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nl = text.indexOf('\n', last);
  return { from, to: nl === -1 ? text.length : nl };
}

function stripListMarker(line: string): string {
  return line.replace(BULLET_PREFIX, '').replace(NUMBER_PREFIX, '');
}

/** One line after the toggle. `index` counts the non-empty lines (for numbering). */
type LineMapper = (line: string, index: number) => string;

function mapperFor(style: LineStyle, lines: string[], single: boolean): LineMapper {
  const content = lines.filter((l) => l.trim() !== '');
  switch (style) {
    case 'h2':
    case 'h3': {
      const prefix = style === 'h2' ? '## ' : '### ';
      const allSet = content.length > 0 && content.every((l) => l.startsWith(prefix) && !l.startsWith(`${prefix.trim()}#`));
      return (line) => {
        const bare = line.replace(HEADING_PREFIX, '');
        return allSet ? bare : `${prefix}${bare}`;
      };
    }
    case 'bullet': {
      const allSet = content.length > 0 && content.every((l) => BULLET_PREFIX.test(l));
      return (line) => (allSet ? line.replace(BULLET_PREFIX, '') : `- ${stripListMarker(line)}`);
    }
    case 'numbered': {
      const allSet = content.length > 0 && content.every((l) => NUMBER_PREFIX.test(l));
      return (line, index) => (allSet ? line.replace(NUMBER_PREFIX, '') : `${index + 1}. ${stripListMarker(line)}`);
    }
    case 'quote': {
      const allSet = content.length > 0 && content.every((l) => QUOTE_PREFIX.test(l));
      // An empty line on its own gets "> " to type after; blank lines inside a selection get ">".
      return (line) => (allSet ? line.replace(QUOTE_PREFIX, '') : line.trim() === '' ? (single ? '> ' : '>') : `> ${line}`);
    }
  }
}

/**
 * H2, H3, bullet list, numbered list and quote: toggles the prefix on every
 * line the selection touches. When every line already has it, it comes off;
 * otherwise it goes on (a heading replaces another heading level, a list
 * marker replaces the other list kind). Numbered lines count 1, 2, 3.
 * Blank lines inside a multi-line selection stay blank (a quote marks them
 * ">" so the quote stays one block).
 */
export function toggleLinePrefix(source: string, selection: Selection, style: LineStyle): Edit {
  const sel = clampSelection(source, selection);
  const { from, to } = lineRange(source, sel);
  const lines = source.slice(from, to).split('\n');
  const single = lines.length === 1;
  const map = mapperFor(style, lines, single);

  let count = 0;
  const next = lines.map((line) => {
    if (!single && line.trim() === '') return style === 'quote' ? map(line, count) : line;
    const out = map(line, count);
    count++;
    return out;
  });

  const replaced = next.join('\n');
  const text = `${source.slice(0, from)}${replaced}${source.slice(to)}`;
  const firstDelta = next[0].length - lines[0].length;
  const totalDelta = replaced.length - (to - from);
  // A cursor moves with its text; a selection that starts at the line start keeps the new prefix in it.
  const keepsLineStart = sel.start !== sel.end && sel.start === from;
  const start = keepsLineStart ? from : Math.max(from, sel.start + firstDelta);
  const end = sel.start === sel.end ? start : Math.max(start, sel.end + totalDelta);
  return { text, selection: { start, end } };
}

/* ------------------------------------------------------------------ */
/* Blocks                                                               */
/* ------------------------------------------------------------------ */

/** Where the cursor or selection goes inside an inserted block (offsets into the block). */
export type BlockSelection = Selection | 'after' | 'end';

/**
 * Replace the selection with `block` as its own paragraph: a blank line before
 * it (unless it starts the body) and after it. The selection lands on `select`
 * (offsets inside the block), at the end of the block ('end', to keep typing
 * in it), or on the new empty line after it ('after').
 */
export function insertBlock(source: string, selection: Selection, block: string, select: BlockSelection = 'after'): Edit {
  const { start, end } = clampSelection(source, selection);
  const before = source.slice(0, start).replace(/[ \t]+$/, '');
  const after = source.slice(end).replace(/^[ \t]+/, '');

  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

  const text = `${before}${lead}${block}${trail}${after}`;
  const blockStart = before.length + lead.length;
  if (select === 'end') {
    const at = blockStart + block.length;
    return { text, selection: { start: at, end: at } };
  }
  if (select === 'after') {
    const at = blockStart + block.length + trail.length;
    return { text, selection: { start: at, end: at } };
  }
  return { text, selection: { start: blockStart + select.start, end: blockStart + select.end } };
}

/** Prefix every line after the first with "> " (blank lines become ">"), for quoted blocks. */
function quoteRest(text: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

/** `> [!tip] text`: the selected text becomes the callout, otherwise the cursor waits after the marker. */
export function insertCallout(source: string, selection: Selection, variant: CalloutVariant): Edit {
  const sel = clampSelection(source, selection);
  const selected = source.slice(sel.start, sel.end).trim();
  const head = `> [!${variant}] `;
  if (!selected) return insertBlock(source, sel, head, 'end');
  return insertBlock(source, sel, `${head}${quoteRest(selected)}`, 'end');
}

export const ANSWER_QUESTION = 'Question?';
export const ANSWER_TEXT = 'The short answer, in two or three sentences.';

/**
 * `> [!answer] Question?` then `> answer text`. A selection becomes the
 * question and the answer placeholder is selected; otherwise the question
 * placeholder is selected.
 */
export function insertAnswer(source: string, selection: Selection): Edit {
  const sel = clampSelection(source, selection);
  const selected = source.slice(sel.start, sel.end).replace(/\s+/g, ' ').trim();
  const question = selected || ANSWER_QUESTION;
  const head = '> [!answer] ';
  const block = `${head}${question}\n> ${ANSWER_TEXT}`;
  if (selected) {
    const at = head.length + question.length + 3;
    return insertBlock(source, sel, block, { start: at, end: at + ANSWER_TEXT.length });
  }
  return insertBlock(source, sel, block, { start: head.length, end: head.length + question.length });
}

export const TABLE_TEMPLATE = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |';

/** A two-column pipe table with its `---` separator row; the first header is selected. */
export function insertTable(source: string, selection: Selection): Edit {
  const at = TABLE_TEMPLATE.indexOf('Column 1');
  return insertBlock(source, selection, TABLE_TEMPLATE, { start: at, end: at + 'Column 1'.length });
}

export const CTA_HEADING = 'Want more booked calls?';
export const CTA_TEMPLATE = `::: cta\nheading: ${CTA_HEADING}\nbody: One or two sentences on what happens next.\nbutton: Book a call\nhref: /start\n:::`;

/** The CTA block (`::: cta`, heading, body, button, href, `:::`); the heading is selected. */
export function insertCta(source: string, selection: Selection): Edit {
  const at = CTA_TEMPLATE.indexOf(CTA_HEADING);
  return insertBlock(source, selection, CTA_TEMPLATE, { start: at, end: at + CTA_HEADING.length });
}

/** `---` on its own line; the cursor goes to the new paragraph after it. */
export function insertDivider(source: string, selection: Selection): Edit {
  return insertBlock(source, selection, '---', 'after');
}

/* ------------------------------------------------------------------ */
/* Links and images                                                     */
/* ------------------------------------------------------------------ */

/** URLs never contain spaces in Markdown: encode them rather than break the syntax. */
function cleanUrl(url: string): string {
  return url.trim().replace(/\s/g, '%20').replace(/\)/g, '%29').replace(/\(/g, '%28');
}

/** `[text](url)`. Brackets in the text would end it early, so they become parentheses. */
export function linkMarkdown(label: string, url: string): string {
  const text = label.replace(/\s+/g, ' ').trim().replace(/\[/g, '(').replace(/\]/g, ')');
  return `[${text || cleanUrl(url)}](${cleanUrl(url)})`;
}

/** Replace the selection with a link; the cursor goes after it. */
export function insertLink(source: string, selection: Selection, label: string, url: string): Edit {
  const { start, end } = clampSelection(source, selection);
  const link = linkMarkdown(label, url);
  const text = `${source.slice(0, start)}${link}${source.slice(end)}`;
  return { text, selection: { start: start + link.length, end: start + link.length } };
}

/**
 * `![alt](url "caption")`, or `![alt](url)` without a caption. The alt text
 * cannot hold brackets and the caption cannot hold double quotes.
 */
export function imageMarkdown(url: string, alt: string, caption: string): string {
  const altText = alt.replace(/\s+/g, ' ').trim().replace(/[[\]]/g, '');
  const captionText = caption.replace(/\s+/g, ' ').trim().replace(/"/g, "'");
  return captionText ? `![${altText}](${cleanUrl(url)} "${captionText}")` : `![${altText}](${cleanUrl(url)})`;
}

/** The image on its own line; the cursor goes to the paragraph after it. */
export function insertImage(source: string, selection: Selection, url: string, alt: string, caption: string): Edit {
  return insertBlock(source, selection, imageMarkdown(url, alt, caption), 'after');
}

/** The alt text an uploaded image starts with (brief update 2026-09-30). */
export const IMAGE_ALT_PLACEHOLDER = 'Describe the image';

/**
 * "Insert image" after an upload: `![Describe the image](url)` on its own line
 * at the cursor (blank lines around it as needed), with "Describe the image"
 * selected so typing replaces it with the real alt text. Selected text is never
 * replaced (the upload finishes seconds after the tap): the image goes after it.
 */
export function insertUploadedImage(source: string, selection: Selection, url: string): Edit {
  const { end } = clampSelection(source, selection);
  const block = `![${IMAGE_ALT_PLACEHOLDER}](${cleanUrl(url)})`;
  return insertBlock(source, { start: end, end }, block, { start: 2, end: 2 + IMAGE_ALT_PLACEHOLDER.length });
}

/**
 * Where a selection made in `before` sits in `after`, when the text changed in
 * the meantime (an upload that finishes after the writer kept typing still
 * lands where the cursor was at the tap). Apply it on every change for exact
 * results. The change is found from the common start and end of the two texts:
 * a point before it stays, a point after it moves by the change in length, and
 * a point inside replaced text goes to where the change starts. Typing exactly
 * at the point leaves the point before the new text.
 */
export function mapSelection(before: string, after: string, selection: Selection): Selection {
  if (before === after) return clampSelection(after, selection);
  const max = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < max && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  const changedEnd = before.length - suffix;
  const delta = after.length - before.length;
  const map = (point: number) => (point <= prefix ? point : point >= changedEnd ? point + delta : prefix);
  return clampSelection(after, { start: map(selection.start), end: map(selection.end) });
}

/** Text the link sheet starts with: the selection, on one line. */
export function selectedText(source: string, selection: Selection): string {
  const { start, end } = clampSelection(source, selection);
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}
