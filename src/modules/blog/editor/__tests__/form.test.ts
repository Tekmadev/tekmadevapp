import type { PostDetail } from '@/api/schemas/blog';

import {
  buildCreate,
  buildPatch,
  emptyForm,
  firstErrorTab,
  formFromDetail,
  formsEqual,
  hasChanges,
  liveUrl,
  moveRow,
  normalizeDraft,
  provenanceLabel,
  searchSnippet,
  siteUrl,
  tabForField,
  validateForm,
  wordCount,
} from '../form';

const detail: PostDetail = {
  post: {
    id: 'post_1',
    title: 'Speed to lead',
    slug: 'speed-to-lead',
    status: 'published',
    author: { id: 'auth_shajeed', name: 'Shajeed I.', photoUrl: null, role: 'Founder, Tekmadev' },
    category: { id: 'bcat_1', name: 'Booked Appointments' },
    excerpt: 'Reply first.',
    featured: true,
    targetQuery: 'speed to lead',
    metaTitle: null,
    metaDescription: null,
    keywords: ['speed to lead'],
    tags: [],
    canonicalUrl: null,
    noindex: false,
    coverImageUrl: null,
    coverImageAlt: null,
    socialImageUrl: null,
    source: 'manual',
    provenance: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    publishedAt: '2026-09-02T12:00:00.000Z',
  },
  bodyMarkdown: '## Why\n\nBecause.',
  faqs: [{ question: 'Q?', answer: 'A.' }],
  keyTakeaways: ['One.', 'Two.'],
  updatedAt: '2026-09-20T12:00:00.000Z',
};

describe('formFromDetail', () => {
  it('maps nullable text to empty strings', () => {
    const form = formFromDetail(detail);
    expect(form.metaTitle).toBe('');
    expect(form.categoryId).toBe('bcat_1');
    expect(form.keyTakeaways.map((r) => r.text)).toEqual(['One.', 'Two.']);
  });

  it('reuses row keys from the previous form', () => {
    const first = formFromDetail(detail);
    const again = formFromDetail(detail, first);
    expect(again.keyTakeaways.map((r) => r.key)).toEqual(first.keyTakeaways.map((r) => r.key));
    expect(again.faqs[0].key).toBe(first.faqs[0].key);
  });
});

describe('buildPatch', () => {
  const base = formFromDetail(detail);

  it('is empty when nothing changed', () => {
    expect(buildPatch(base, formFromDetail(detail))).toEqual({});
    expect(hasChanges(base, formFromDetail(detail), false)).toBe(false);
  });

  it('sends only what changed, trimmed', () => {
    const form = { ...base, title: '  Speed to lead, again ', metaTitle: 'Speed to lead' };
    expect(buildPatch(base, form)).toEqual({ title: 'Speed to lead, again', metaTitle: 'Speed to lead' });
  });

  it('ignores whitespace-only edits to text fields', () => {
    expect(buildPatch(base, { ...base, title: 'Speed to lead ' })).toEqual({});
  });

  it('clears text with null', () => {
    expect(buildPatch(base, { ...base, excerpt: '   ' })).toEqual({ excerpt: null });
  });

  it('sends the body exactly as typed', () => {
    expect(buildPatch(base, { ...base, body: `${base.body}\n` })).toEqual({ bodyMarkdown: '## Why\n\nBecause.\n' });
  });

  it('sends a cleared slug as null so the server makes a new one', () => {
    expect(buildPatch(base, { ...base, slug: '' })).toEqual({ slug: null });
  });

  it('finalizes a typed slug', () => {
    expect(buildPatch(base, { ...base, slug: 'Speed To Lead 2-' })).toEqual({ slug: 'speed-to-lead-2' });
  });

  it('sends lists without blank rows', () => {
    const form = {
      ...base,
      keyTakeaways: [...base.keyTakeaways, { key: 'x', text: '  ' }],
      faqs: [...base.faqs, { key: 'y', question: '', answer: '' }],
    };
    expect(buildPatch(base, form)).toEqual({});
    const moved = { ...base, keyTakeaways: moveRow(base.keyTakeaways, 1, -1) };
    expect(buildPatch(base, moved)).toEqual({ keyTakeaways: ['Two.', 'One.'] });
  });

  it('sends a category change and a cleared category', () => {
    expect(buildPatch(base, { ...base, categoryId: null })).toEqual({ categoryId: null });
  });
});

describe('buildCreate', () => {
  it('sends the title and only fields with a value', () => {
    const form = { ...emptyForm(), title: ' New post ', body: 'Hello', tags: ['ai'] };
    expect(buildCreate(form)).toEqual({ title: 'New post', bodyMarkdown: 'Hello', tags: ['ai'] });
  });

  it('includes a non-draft status and a typed slug', () => {
    const form = { ...emptyForm(), title: 'T', status: 'in_review' as const, slug: 'My Slug' };
    expect(buildCreate(form)).toEqual({ title: 'T', status: 'in_review', slug: 'my-slug' });
  });
});

describe('changes on a new post', () => {
  it('counts anything typed', () => {
    const base = emptyForm();
    expect(hasChanges(base, emptyForm(), true)).toBe(false);
    expect(hasChanges(base, { ...emptyForm(), body: 'x' }, true)).toBe(true);
  });

  it('compares forms without row keys', () => {
    const a = { ...emptyForm(), keyTakeaways: [{ key: 'a', text: 'One' }] };
    const b = { ...emptyForm(), keyTakeaways: [{ key: 'b', text: 'One' }] };
    expect(formsEqual(a, b)).toBe(true);
  });
});

describe('validateForm', () => {
  it('needs a title', () => {
    expect(validateForm(emptyForm()).title).toBe('Enter a title.');
  });

  it('needs both halves of an FAQ', () => {
    const form = { ...emptyForm(), title: 'T', faqs: [{ key: 'k', question: 'Q?', answer: '' }] };
    expect(validateForm(form).faqs).toBe('Each FAQ needs a question and an answer.');
  });

  it('needs https URLs', () => {
    const form = { ...emptyForm(), title: 'T', canonicalUrl: 'example.com', coverImageUrl: 'http://x.com/a.jpg' };
    const errors = validateForm(form);
    expect(errors.canonicalUrl).toBe('Enter a full https:// URL.');
    expect(errors.coverImageUrl).toBe('Enter a full https:// image URL.');
    expect(firstErrorTab(errors)).toBe('search');
  });

  it('passes a complete form', () => {
    expect(validateForm({ ...emptyForm(), title: 'T', coverImageUrl: 'https://images.tekmadev.com/a.jpg' })).toEqual({});
  });
});

describe('normalizeDraft', () => {
  it('fills fields an older draft did not have', () => {
    const fallback = formFromDetail(detail);
    const draft = normalizeDraft({ title: 'Draft title', body: 'Draft body' }, fallback);
    expect(draft?.title).toBe('Draft title');
    expect(draft?.slug).toBe('speed-to-lead');
    expect(draft?.keyTakeaways.map((r) => r.text)).toEqual(['One.', 'Two.']);
  });

  it('refuses something that is not a draft', () => {
    expect(normalizeDraft('nope', emptyForm())).toBeNull();
    expect(normalizeDraft(null, emptyForm())).toBeNull();
  });
});

describe('helpers', () => {
  it('maps fields to Details tabs', () => {
    expect(tabForField('slug')).toBe('basics');
    expect(tabForField('metaDescription')).toBe('search');
    expect(tabForField('faqs')).toBe('answers');
    expect(tabForField('socialImageUrl')).toBe('media');
    expect(tabForField('title')).toBeNull();
  });

  it('moves rows and ignores moves past the ends', () => {
    expect(moveRow(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveRow(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveRow(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('builds site URLs', () => {
    expect(liveUrl('speed-to-lead')).toBe('https://www.tekmadev.com/blog/speed-to-lead');
    expect(siteUrl('/start')).toBe('https://www.tekmadev.com/start');
    expect(siteUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('labels where an AI draft came from', () => {
    expect(provenanceLabel('video_script')).toBe('Video script');
    expect(provenanceLabel('webinar_transcript')).toBe('Webinar transcript');
  });

  it('counts words, not Markdown markers', () => {
    expect(wordCount('## A heading\n\n- one item\n\n---\n\n| a | b |')).toBe(6);
    expect(wordCount('')).toBe(0);
  });

  it('builds the search result preview', () => {
    const form = { ...emptyForm(), title: 'A title', metaTitle: '', metaDescription: '', excerpt: 'An excerpt.', slug: '' };
    expect(searchSnippet(form, 'saved-slug')).toEqual({
      title: 'A title',
      description: 'An excerpt.',
      breadcrumb: 'tekmadev.com › blog › saved-slug',
    });
    const long = { ...form, metaTitle: 'x'.repeat(80) };
    expect(searchSnippet(long, null).title).toHaveLength(60);
  });
});
