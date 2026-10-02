import type { OnboardingTemplate } from '@/api/schemas/clients';

import {
  groupTemplates,
  keyError,
  keyFromTitle,
  parsePayloadText,
  payloadToText,
  removeTemplate,
  suggestedSortOrder,
  templateDetails,
  upsertTemplate,
} from '../logic';

const t = (key: string, stage: OnboardingTemplate['stage'], sortOrder: number, extra: Partial<OnboardingTemplate> = {}): OnboardingTemplate => ({
  key,
  title: key,
  stage,
  owner: 'tekmadev',
  kind: 'general',
  plans: [],
  dueOffsetDays: null,
  sortOrder,
  description: null,
  payload: null,
  required: true,
  active: true,
  updatedAt: '2026-09-30T12:00:00.000000Z',
  ...extra,
});

describe('groupTemplates', () => {
  it('orders by stage then sort order, with a header per stage', () => {
    const items = groupTemplates([t('b', 'build', 20), t('w2', 'welcome', 20), t('w1', 'welcome', 10)]);
    expect(items.map((i) => i.id)).toEqual(['stage:welcome', 'template:w1', 'template:w2', 'stage:build', 'template:b']);
    expect(items[0]).toMatchObject({ type: 'stage', count: 2 });
  });
  it('is empty without templates', () => {
    expect(groupTemplates([])).toEqual([]);
  });
});

describe('upsertTemplate and removeTemplate', () => {
  it('replaces by key and keeps the order', () => {
    const list = [t('a', 'welcome', 10), t('b', 'welcome', 20)];
    const next = upsertTemplate(list, t('a', 'welcome', 30, { title: 'Moved' }));
    expect(next.map((x) => [x.key, x.title])).toEqual([
      ['b', 'b'],
      ['a', 'Moved'],
    ]);
    expect(upsertTemplate(list, t('c', 'intake', 5)).map((x) => x.key)).toEqual(['a', 'b', 'c']);
    expect(removeTemplate(list, 'a').map((x) => x.key)).toEqual(['b']);
  });
});

describe('keys', () => {
  it('suggests a key from the title', () => {
    expect(keyFromTitle('Share your logo & brand files!')).toBe('share-your-logo-brand-files');
    expect(keyFromTitle('Café kickoff ')).toBe('cafe-kickoff');
  });
  it('checks format, length and duplicates', () => {
    expect(keyError('', [])).toBe('Enter a key.');
    expect(keyError('bad key', [])).toBe('Use lowercase letters, numbers and dashes for the key.');
    expect(keyError('trailing-', [])).toBe('Use lowercase letters, numbers and dashes for the key.');
    expect(keyError('x'.repeat(61), [])).toBe('Keep the key to 60 characters or fewer.');
    expect(keyError('logo', ['logo'])).toBe('A template with this key already exists.');
    expect(keyError('share-logo', ['logo'])).toBeNull();
  });
});

describe('payload editor', () => {
  it('treats blank as no payload and checks the JSON', () => {
    expect(parsePayloadText('  ')).toEqual({ ok: true, value: null });
    expect(parsePayloadText('{"provider":"google"}')).toEqual({ ok: true, value: { provider: 'google' } });
    expect(parsePayloadText('{provider: google}')).toEqual({ ok: false });
  });
  it('pretty prints the stored payload', () => {
    expect(payloadToText(null)).toBe('');
    expect(payloadToText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('suggestedSortOrder', () => {
  it('goes after the last template in the stage', () => {
    const list = [t('a', 'welcome', 10), t('b', 'welcome', 25), t('c', 'build', 90)];
    expect(suggestedSortOrder(list, 'welcome')).toBe(30);
    expect(suggestedSortOrder(list, 'review')).toBe(10);
  });
});

describe('templateDetails', () => {
  it('shows kind, plans and optional', () => {
    expect(templateDetails(undefined, t('a', 'welcome', 10, { kind: 'upload', plans: ['grow', 'convert'], required: false }))).toBe(
      'Upload · Convert, Grow · optional',
    );
    expect(templateDetails(undefined, t('a', 'welcome', 10))).toBe('General · All plans');
  });
});
