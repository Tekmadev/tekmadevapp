import type { ApprovalItem } from './types';

/**
 * Proposals for the Kit screen: one of each kind a future automation is
 * likely to send, so every block type is seen in both themes. These are
 * samples only; real proposals will come from the server's /approvals feed.
 */

/** An AI assistant drafted a blog post from a voice note. */
export const blogDraftApproval: ApprovalItem = {
  id: 'apr_blog_missed_calls',
  title: 'New post: Every missed call is a lead you already paid for',
  summary: 'Drafted from your voice note about missed calls. It lands in Blog as a draft, so you can still edit before publishing.',
  source: 'AI draft',
  createdAt: '2026-10-01T13:42:00Z',
  blocks: [
    {
      type: 'keyValue',
      rows: [
        { label: 'Category', value: 'Lead generation' },
        { label: 'Target query', value: 'missed calls small business' },
        { label: 'Length', value: '812 words, about 4 min to read' },
      ],
    },
    {
      type: 'markdown',
      text: [
        '## Every missed call is a lead you already paid for',
        '',
        'Most local service businesses pay for ads, then let **one call in three** go to voicemail. The caller does not leave a message. They ring the next company on the list.',
        '',
        '### What a missed call really costs',
        '',
        '- The ad click that brought them in is spent',
        '- The job goes to a competitor, often for good',
        '- *Nobody* follows up, because nobody knows it happened',
        '',
        '### The fix is boring, and it works',
        '',
        '1. Text back every missed call right away',
        '2. Put a booking link in that text',
        '3. Review the call log every week and close the gaps',
        '',
        '> The best lead is the one that already called you.',
        '',
        'See how the Growth System handles this on [tekmadev.com](https://www.tekmadev.com).',
      ].join('\n'),
    },
  ],
};

/** A pricing review proposes a new price, with what changes on the site. */
export const priceChangeApproval: ApprovalItem = {
  id: 'apr_price_webline_care',
  title: 'Price change: Webline Care',
  summary: 'Raise the monthly care plan for new sign-ups. Current subscribers keep the price they have.',
  source: 'Pricing review',
  createdAt: '2026-09-30T19:05:00Z',
  blocks: [
    {
      type: 'diff',
      label: 'Pricing page',
      before: 'Webline Care: $49 per month. Hosting, backups and small edits included.',
      after: 'Webline Care: $59 per month. Hosting, daily backups and small edits included.',
    },
    {
      type: 'keyValue',
      rows: [
        { label: 'Plan', value: 'Webline Care' },
        { label: 'Current price', value: '$49 / month' },
        { label: 'Proposed price', value: '$59 / month' },
        { label: 'Applies to', value: 'New sign-ups only' },
        { label: 'Active subscribers', value: '38, unchanged' },
        { label: 'Currency', value: 'CAD' },
      ],
    },
    {
      type: 'markdown',
      text: 'Why: hosting and backup costs rose **18%** this year, and backups move from weekly to daily.',
    },
  ],
};

/** The job worker prepared the weekly update for a client. */
export const clientUpdateApproval: ApprovalItem = {
  id: 'apr_update_acme_plumbing',
  title: 'Weekly update for Acme Plumbing',
  summary: 'Email to Daniel with the new homepage and last week’s numbers. Sends once you approve.',
  source: 'Worker',
  createdAt: '2026-10-01T11:20:00Z',
  blocks: [
    {
      type: 'image',
      url: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200&q=80&auto=format&fit=crop',
      alt: 'The new Acme Plumbing homepage photo: grey pipework and valves on a red brick wall',
      caption: 'New homepage photo, live since Monday.',
    },
    {
      type: 'markdown',
      text: [
        'Hi Daniel,',
        '',
        'The new homepage is live. Last week the site brought in **14 calls** and **6 booked jobs**, up from 9 calls and 4 jobs the week before.',
        '',
        'Next up is the emergency service page. Reply to this email if anything looks off.',
      ].join('\n'),
    },
    { type: 'link', label: 'See it in the client portal', url: 'https://account.tekmadev.com' },
  ],
};

export const approvalFixtures: readonly ApprovalItem[] = [blogDraftApproval, priceChangeApproval, clientUpdateApproval];
