import { allowedMarketingSegments, MARKETING_TAB_CAPS, resolveMarketingSegment, toMarketingSegment } from '../types';

/** Which Marketing sections each role sees, and where a route param lands. */

describe('allowedMarketingSegments', () => {
  it('gives owners and managers all four sections', () => {
    expect(allowedMarketingSegments('owner')).toEqual(['blog', 'email', 'links', 'crm']);
    expect(allowedMarketingSegments('manager')).toEqual(['blog', 'email', 'links', 'crm']);
  });

  it('gives staff Blog, Email and Links, never CRM', () => {
    expect(allowedMarketingSegments('staff')).toEqual(['blog', 'email', 'links']);
  });

  it('follows the server list over the role', () => {
    expect(allowedMarketingSegments({ role: 'staff', capabilities: ['links.view', 'crm.view'] })).toEqual(['links', 'crm']);
    expect(allowedMarketingSegments({ role: 'owner', capabilities: [] })).toEqual([]);
    expect(allowedMarketingSegments(null)).toEqual([]);
  });

  it('opens the tab with any one section capability', () => {
    expect(MARKETING_TAB_CAPS).toEqual(['blog.view', 'email.view', 'links.view', 'crm.view']);
  });
});

describe('resolveMarketingSegment', () => {
  it('keeps an allowed section', () => {
    expect(resolveMarketingSegment('links', ['blog', 'email', 'links'])).toBe('links');
  });

  it('falls back to the first allowed section for a forbidden or unknown one', () => {
    expect(resolveMarketingSegment('crm', ['blog', 'email', 'links'])).toBe('blog');
    expect(resolveMarketingSegment('nope', ['email', 'links'])).toBe('email');
    expect(resolveMarketingSegment(undefined, ['links'])).toBe('links');
  });

  it('keeps the old default with nothing allowed (the screen gate leaves anyway)', () => {
    expect(resolveMarketingSegment('crm', [])).toBe('crm');
    expect(toMarketingSegment('x')).toBe('blog');
  });
});
