import { ApiError } from '@/api/errors';

import { diffWords } from '../diff';
import { approvalFixtures } from '../fixtures';
import { isSafeHref, parseInline, parseMarkdown } from '../markdown';
import { createJobRunner } from '../useJobRunner';

const join = (spans: { text: string }[]) => spans.map((s) => s.text).join('');
const marked = (spans: { text: string; changed: boolean }[]) => spans.filter((s) => s.changed).map((s) => s.text.trim());

describe('diffWords', () => {
  it('marks only the words that changed, and keeps the exact text', () => {
    const before = 'Webline Care: $49 per month. Hosting, backups and small edits included.';
    const after = 'Webline Care: $59 per month. Hosting, daily backups and small edits included.';
    const d = diffWords(before, after);
    expect(d.mode).toBe('word');
    expect(join(d.before)).toBe(before);
    expect(join(d.after)).toBe(after);
    expect(marked(d.before)).toEqual(['$49']);
    expect(marked(d.after)).toEqual(['$59', 'daily']);
  });

  it('joins neighbouring changes into one mark across the space between them', () => {
    const d = diffWords('a b c d', 'a x y d');
    expect(marked(d.before)).toEqual(['b c']);
    expect(marked(d.after)).toEqual(['x y']);
  });

  it('marks nothing when the texts are equal', () => {
    const d = diffWords('same text', 'same text');
    expect(marked(d.before)).toEqual([]);
    expect(marked(d.after)).toEqual([]);
  });

  it('falls back to whole-text marks past the size cap', () => {
    const d = diffWords('a b c', 'a b d', 2);
    expect(d.mode).toBe('whole');
    expect(d.before).toEqual([{ text: 'a b c', changed: true }]);
  });
});

describe('markdown', () => {
  it('parses inline styles and links', () => {
    expect(parseInline('Up **14 calls** and *6 jobs*, see [site](https://www.tekmadev.com).')).toEqual([
      { text: 'Up ' },
      { text: '14 calls', bold: true },
      { text: ' and ' },
      { text: '6 jobs', italic: true },
      { text: ', see ' },
      { text: 'site', href: 'https://www.tekmadev.com' },
      { text: '.' },
    ]);
  });

  it('keeps snake_case words plain', () => {
    expect(parseInline('the utm_source_name field')).toEqual([{ text: 'the utm_source_name field' }]);
  });

  it('leaves unclosed markers as typed', () => {
    expect(parseInline('2 * 3 is **six')).toEqual([{ text: '2 * 3 is **six' }]);
  });

  it('parses block structure', () => {
    const blocks = parseMarkdown(
      ['## Title', '', 'One line', 'continues here.', '', '- a', '- b', '', '1. first', '2. second', '', '> quoted', '', '---', '', '```', 'code', '```'].join(
        '\n',
      ),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'divider', 'code']);
    expect(blocks[1]).toEqual({ kind: 'paragraph', spans: [{ text: 'One line continues here.' }] });
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true, start: 1 });
  });

  it('keeps a "#" that belongs to the heading text', () => {
    expect(parseMarkdown('## Learn C#')).toEqual([{ kind: 'heading', level: 2, spans: [{ text: 'Learn C#' }] }]);
  });

  it('only opens web and mail links', () => {
    expect(isSafeHref('https://www.tekmadev.com')).toBe(true);
    expect(isSafeHref('mailto:hello@tekmadev.com')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('intent://scan')).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
  });
});

describe('fixtures', () => {
  it('cover every block type', () => {
    const types = new Set(approvalFixtures.flatMap((a) => a.blocks.map((b) => b.type)));
    expect([...types].sort()).toEqual(['diff', 'image', 'keyValue', 'link', 'markdown']);
  });

  it('have no dashes the brief forbids', () => {
    expect(JSON.stringify(approvalFixtures)).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('createJobRunner', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('tracks a run from start to result', async () => {
    let clock = 1000;
    const d = deferred<number>();
    const runner = createJobRunner(() => d.promise, () => clock);
    const outcome = runner.start();
    expect(runner.getState()).toMatchObject({ status: 'running', running: true, startedAt: 1000 });
    clock = 4000;
    d.resolve(7);
    await expect(outcome).resolves.toEqual({ status: 'done', result: 7 });
    expect(runner.getState()).toMatchObject({ status: 'done', running: false, result: 7, finishedAt: 4000 });
  });

  it('runs one job at a time', async () => {
    const d = deferred<string>();
    const job = jest.fn(() => d.promise);
    const runner = createJobRunner(job);
    const first = runner.start();
    await expect(runner.start()).resolves.toEqual({ status: 'busy' });
    expect(job).toHaveBeenCalledTimes(1);
    d.resolve('ok');
    await first;
  });

  it('cancel aborts the signal and ignores the late answer', async () => {
    const d = deferred<string>();
    let seen: AbortSignal | null = null;
    const runner = createJobRunner((signal) => {
      seen = signal;
      return d.promise;
    });
    const outcome = runner.start();
    runner.cancel();
    expect(seen).not.toBeNull();
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
    expect(runner.getState().status).toBe('cancelled');
    d.resolve('late');
    await expect(outcome).resolves.toEqual({ status: 'cancelled' });
    expect(runner.getState().result).toBeUndefined();
  });

  it('flags a timeout and never retries on its own', async () => {
    const job = jest.fn(async () => {
      throw new ApiError({ status: 0, code: 'timeout', message: 'That took too long.', kind: 'timeout' });
    });
    const runner = createJobRunner(job);
    const outcome = await runner.start();
    expect(outcome).toMatchObject({ status: 'failed', timedOut: true });
    expect(runner.getState()).toMatchObject({ status: 'failed', timedOut: true, running: false });
    expect(job).toHaveBeenCalledTimes(1);
  });
});
