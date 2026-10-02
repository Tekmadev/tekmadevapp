import type { EmailTemplate, Subscriber } from '@/api/schemas/email';

import {
  applyTemplatePick,
  campaignBody,
  campaignFormErrors,
  campaignKeyLive,
  consentEventDetail,
  consentEventLabel,
  displayLink,
  EMAIL_COPY,
  EMPTY_CAMPAIGN_FORM,
  eraseMessage,
  eventWhere,
  finalCampaignKey,
  isPreviewDocument,
  isValidCampaignKey,
  leftLine,
  previewLinkTarget,
  subscriberStatusBadge,
  templateSuggestions,
  uniqueById,
} from '../logic';

const template = (key: string, name: string): EmailTemplate => ({
  key,
  name,
  subject: `${name} subject`,
  useWhen: 'Any time.',
  html: '<p>Hi {{contact.first_name}}</p>',
  previewHtml: '<p>Hi Daniel</p>',
});

describe('campaign key', () => {
  it('lowercases and dashes live, keeping a trailing dash while typing', () => {
    expect(campaignKeyLive('Newsletter 2026_07')).toBe('newsletter-2026-07');
    expect(campaignKeyLive('Welcome!! ')).toBe('welcome-');
    expect(campaignKeyLive('--Spring  Promo')).toBe('spring-promo');
  });

  it('drops the trailing dash when sending and validates like the server', () => {
    expect(finalCampaignKey('welcome-')).toBe('welcome');
    expect(isValidCampaignKey('newsletter-2026-07')).toBe(true);
    expect(isValidCampaignKey('')).toBe(false);
    expect(isValidCampaignKey('a'.repeat(65))).toBe(false);
  });

  it('needs a key and a name, with the server words', () => {
    expect(campaignFormErrors(EMPTY_CAMPAIGN_FORM)).toEqual({ key: EMAIL_COPY.keyInvalid, name: EMAIL_COPY.nameRequired });
    expect(campaignFormErrors({ ...EMPTY_CAMPAIGN_FORM, key: 'welcome', name: 'Welcome' })).toEqual({});
  });

  it('sends blanks as null and the note as description', () => {
    expect(campaignBody({ key: 'win-back-', name: ' Win-back ', subject: ' ', template: 'win-back', note: 'Quiet leads' })).toEqual({
      key: 'win-back',
      name: 'Win-back',
      subject: null,
      template: 'win-back',
      description: 'Quiet leads',
    });
  });
});

describe('template suggestions', () => {
  const list = [template('welcome', 'Welcome'), template('newsletter', 'Monthly newsletter'), template('win-back', 'Win-back')];

  it('lists everything when empty and filters by key or name', () => {
    expect(templateSuggestions(list, '')).toHaveLength(3);
    expect(templateSuggestions(list, 'month').map((t) => t.key)).toEqual(['newsletter']);
    expect(templateSuggestions(list, 'WIN').map((t) => t.key)).toEqual(['win-back']);
    expect(templateSuggestions(undefined, 'x')).toEqual([]);
  });

  it('fills only the empty fields when a template is picked', () => {
    const filled = applyTemplatePick(EMPTY_CAMPAIGN_FORM, list[1]);
    expect(filled).toMatchObject({ template: 'newsletter', key: 'newsletter', name: 'Monthly newsletter', subject: 'Monthly newsletter subject' });
    const kept = applyTemplatePick({ ...EMPTY_CAMPAIGN_FORM, key: 'newsletter-2026-10', name: 'October' }, list[1]);
    expect(kept).toMatchObject({ template: 'newsletter', key: 'newsletter-2026-10', name: 'October', subject: 'Monthly newsletter subject' });
  });
});

describe('labels', () => {
  it('falls back to the brief when meta is missing', () => {
    expect(subscriberStatusBadge(undefined, 'active')).toEqual({ label: 'Active', tone: 'gold' });
    expect(subscriberStatusBadge(undefined, 'complained').tone).toBe('muted');
    expect(consentEventLabel(undefined, 'complained')).toBe('Marked as spam');
    expect(consentEventLabel(undefined, 'reason')).toBe('Said why they left');
  });

  it('reads how and why an unsubscribe happened', () => {
    const row = { status: 'unsubscribed', reason: 'too_many', unsubscribeSource: 'unsubscribe_page' } as const;
    expect(leftLine(undefined, row)).toBe('Unsubscribed via the unsubscribe page · Too many emails');
    expect(leftLine(undefined, { ...row, reason: null, unsubscribeSource: 'crm_permanent' })).toBe('Unsubscribed via the CRM, as permanent');
    const active: Pick<Subscriber, 'status' | 'reason' | 'unsubscribeSource'> = { status: 'active', reason: null, unsubscribeSource: null };
    expect(leftLine(undefined, active)).toBeNull();
  });

  it('describes a consent event with its source and policy', () => {
    expect(consentEventDetail(undefined, { at: '2026-09-01T12:00:00Z', event: 'unsubscribed', source: 'crm', policyVersion: '2026-04' })).toBe(
      'via the CRM · Policy 2026-04',
    );
    expect(consentEventDetail(undefined, { at: '2026-09-01T12:00:00Z', event: 'bounced', source: 'footer', policyVersion: null })).toBe('Footer');
  });

  it('keeps the erasure warning word for word', () => {
    expect(eraseMessage('a@b.test')).toBe(
      'Erase a@b.test? Their consent history is deleted and the CRM contact is suppressed and tagged erased. This address will never be pushed to the CRM again. This cannot be undone.',
    );
  });
});

describe('engagement and preview', () => {
  it('shortens links and joins device and country', () => {
    expect(displayLink('https://www.tekmadev.com/start/')).toBe('tekmadev.com/start');
    expect(eventWhere({ device: 'mobile', country: 'Canada' })).toBe('Mobile · Canada');
    expect(eventWhere({ device: null, country: null })).toBe('');
  });

  it('loads only the HTML document and opens tracked links at their destination', () => {
    expect(isPreviewDocument('about:blank')).toBe(true);
    expect(isPreviewDocument('https://www.tekmadev.com/')).toBe(false);
    const tracked = `https://www.tekmadev.com/api/email/click?c=welcome&u=${encodeURIComponent('https://www.tekmadev.com/start')}`;
    expect(previewLinkTarget(tracked)).toBe('https://www.tekmadev.com/start');
    expect(previewLinkTarget('https://www.tekmadev.com/blog')).toBe('https://www.tekmadev.com/blog');
    expect(previewLinkTarget('mailto:hello@tekmadev.com')).toBe('mailto:hello@tekmadev.com');
    expect(previewLinkTarget('javascript:alert(1)')).toBeNull();
    expect(previewLinkTarget('about:blank#')).toBeNull();
  });

  it('keeps each subscriber once across pages', () => {
    const pages = [{ items: [{ id: 'a' }, { id: 'b' }] }, { items: [{ id: 'b' }, { id: 'c' }] }];
    expect(uniqueById(pages).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
