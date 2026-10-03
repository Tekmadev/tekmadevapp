import type { Author, BlogCategory, Faq, Post, PostDetail, PostRow, PostSource, PostStatus, Provenance } from '../../schemas/blog';
import { daysAgo, hoursAgo, minutesAgo } from '../router';

/**
 * Fixtures for the "blog" domain. Realistic data, same shapes as the live API.
 * This is mutable in-memory state: the blog routes change it, so lists,
 * details and category counts stay consistent after every mutation.
 *
 * Posts are about local service businesses, AI and booked appointments.
 * No build or delivery times anywhere (owner rule), and the CRM is never named.
 */

export const BLOG_AUTHORS: Author[] = [
  {
    id: 'auth_shajeed',
    name: 'Shajeed I.',
    photoUrl: 'https://www.tekmadev.com/images/team/shajeed-i.jpg',
    role: 'Founder, Tekmadev',
  },
  { id: 'auth_team', name: 'Tekmadev Team', photoUrl: null, role: null },
];

export type CategoryRecord = { id: string; name: string; slug: string; createdAt: string };

/** Mutated in place (never reassigned): GET /meta shares this array. */
export const blogCategories: CategoryRecord[] = [
  { id: 'bcat_aiauto01', name: 'AI & Automation', slug: 'ai-automation', createdAt: daysAgo(240) },
  { id: 'bcat_booked01', name: 'Booked Appointments', slug: 'booked-appointments', createdAt: daysAgo(240) },
  { id: 'bcat_locseo01', name: 'Local SEO', slug: 'local-seo', createdAt: daysAgo(231) },
  { id: 'bcat_websit01', name: 'Websites', slug: 'websites', createdAt: daysAgo(200) },
  { id: 'bcat_cases001', name: 'Case Studies', slug: 'case-studies', createdAt: daysAgo(150) },
  // No posts yet: the Categories screen shows "0 posts".
  { id: 'bcat_reviews1', name: 'Reviews & Reputation', slug: 'reviews-reputation', createdAt: daysAgo(12) },
];

export type PostRecord = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  featured: boolean;
  authorId: string;
  categoryId: string | null;
  excerpt: string | null;
  targetQuery: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  tags: string[];
  canonicalUrl: string | null;
  noindex: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  socialImageUrl: string | null;
  source: PostSource;
  provenance: Provenance | null;
  bodyMarkdown: string;
  faqs: Faq[];
  keyTakeaways: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Set when moved to the trash. Trashed posts are hidden but keep their slug. */
  trashedAt: string | null;
};

/** A version snapshot, recorded on every save (the toast says so). */
export type RevisionRecord = { id: string; postId: string; at: string; by: string; title: string; bodyMarkdown: string };

const IMG = 'https://images.tekmadev.com/blog';

/* ------------------------------------------------------------------ */
/* Bodies                                                               */
/* ------------------------------------------------------------------ */

const BODY_AI_HVAC = `# AI follow-up for HVAC companies: from missed call to booked visit

Every HVAC owner in Hamilton knows the feeling. The phone rings while the whole crew is on a roof in Stoney Creek, nobody picks up, and by the time someone calls back the homeowner has **already booked someone else**.

> [!answer] What does AI follow-up do for an HVAC company?
> It answers every missed call with a text within seconds, asks the two or three questions your dispatcher would ask, and offers real times from your calendar.
> The homeowner books a visit without waiting for a callback, and your team gets a short summary of the job.

## Why missed calls cost more than you think

A furnace that quits in January is not a "maybe later" job. The homeowner calls three companies and books the first one that answers. Owners we talk to guess they miss *one call in ten*. When they pull the call log, it is usually closer to one in four during working hours.

| Season | Calls per week | Missed (typical) | Jobs lost at a 40% close rate |
| --- | --- | --- | --- |
| Shoulder (April, October) | 60 | 15 | 6 |
| Peak heating (January) | 140 | 42 | 17 |
| Peak cooling (July) | 120 | 33 | 13 |

> [!info] These are illustrative numbers for a three-truck shop. Pull your own from your phone system's call log before you decide anything.

### What a good follow-up looks like

1. A text goes out the moment the call is missed.
2. It asks what is wrong: no heat, no cooling, a strange noise, or maintenance.
3. It asks for the address, so you can check the service area before anyone drives out.
4. It offers two or three real times from the dispatch calendar.
5. A person gets a summary and can take over at any point.

The tone matters. A short, plain message beats a wall of text:

\`\`\`text
Hi, it's Harbour HVAC. Sorry we missed your call.
Is this about no heat, no cooling, or something else?
Reply here and we'll get you booked.
\`\`\`

![A technician checking a furnace in a Burlington basement](${IMG}/hvac-furnace-check.jpg "Most winter calls are no-heat emergencies: the first reply wins the job.")

## What to automate, and what to keep human

- **Automate:** the first reply, the triage questions, the booking link, the reminder the day before.
- **Keep human:** pricing conversations, warranty questions, anything that sounds upset.
- **Never automate:** a promise about an arrival time you cannot keep.

> [!tip] Put your service area in the first reply. It saves a wasted trip to a postal code you do not cover.

> [!warning] Do not add someone to a promo list just because they called for a quote. Following up on their request is fine; marketing messages need their consent under CASL.

#### A note on after-hours calls

After-hours calls are where AI follow-up earns its keep. The homeowner gets an answer at 11 PM, picks a slot for the morning, and your dispatcher starts the day with a booked schedule instead of a voicemail inbox. Use \`after-hours\` as a tag on those bookings so you can see how many there are each month.

> The best part is the morning. I open my phone and the first visits are already booked.
>
> Our dispatcher used to spend the first hour of every day returning voicemails.

For a deeper look at reply speed, read [speed to lead](https://www.tekmadev.com/blog/speed-to-lead-first-five-minutes).

---

::: cta
heading: See what your missed calls are worth
body: Book a free call. We will look at your call log together and show you where booked visits are leaking.
button: Book a free call
href: /start
:::
`;

const BODY_AI_GUIDE = `## The short version

Most local service businesses do not have a lead problem. They have a **follow-up** problem. People ask, nobody answers fast enough, and the job goes to whoever replied first.

> [!answer] Can AI really book appointments for a local business?
> Yes, when it is connected to your real calendar and kept to a narrow job: answer fast, ask the right questions, offer real times, hand over to a person when it gets complicated.

### The three moments that decide a booking

1. **The first reply.** Within a minute, not within the hour.
2. **The qualifying questions.** Two or three, never ten.
3. **The offer of a time.** Real slots, not "someone will call you".

## A simple setup that works

- A missed-call text and a web chat that share one script
- A booking page tied to the calendar your team already uses
- Reminders by text the day before and two hours before
- A weekly look at what was booked, what was missed, and why

> [!tip] Start with one channel. Missed calls are usually the biggest leak, so start there.

> [!info] Everything in this guide works with the tools most trades already use: a phone number, a calendar and a website.

> [!warning] Never let an AI quote a price it has not been given. Give it ranges you are happy to stand behind, or have it hand over to a person.

### How the numbers usually move

| Metric | Before | After |
| --- | --- | --- |
| Median first reply | 3 h 40 min | 45 s |
| Calls answered or followed up | 71% | 98% |
| Booked appointments per month | 38 | 61 |

These numbers come from a mix of clinics and trades in Hamilton and Ottawa. Yours will differ: measure your own *before* numbers first.

![Booked appointments on a phone calendar](${IMG}/booked-calendar.jpg "A full calendar is the only metric that pays the bills.")

> We stopped arguing about which ad was working. The calendar tells us.

#### What the AI actually says

\`\`\`json
{
  "greeting": "Hi {{contact.first_name}}, thanks for reaching out to Rideau Lawn & Garden.",
  "question": "Is this for a one-time cleanup or weekly maintenance?",
  "offer": "I can book you Tuesday at 9:00 or Wednesday at 1:30. Which works?"
}
\`\`\`

---

::: cta
heading: Get booked appointments, not just leads
body: See how the Growth System connects your calls, forms and calendar.
button: See the Growth System
href: /growth-system
:::
`;

const BODY_SPEED = `## The first five minutes

When someone fills in a form on a contractor's website, they are rarely filling in only one. The business that replies first books the job far more often than the business that replies best.

### What "fast" means in practice

- Under one minute for a text reply
- Under five minutes for a call back during working hours
- First thing the next morning for anything after hours, with a text sent at once

> [!tip] Put the reply time on a screen your team sees every day. What gets seen gets fixed.

## How to get there without hiring

You do not need another receptionist. You need the first reply to happen on its own, and the right person to get a clear summary. Read [what an AI receptionist actually does](https://www.tekmadev.com/blog/what-an-ai-receptionist-does-for-a-plumbing-company) for the details.
`;

const BODY_RECEPTIONIST = `## It answers, it asks, it books

An AI receptionist for a plumbing company does three things: it answers every call or message, it asks what the problem is and where, and it books a visit on your calendar.

### What it does not do

- It does not quote prices you have not given it
- It does not promise arrival times
- It does not pretend to be a person when someone asks

> [!answer] Will customers mind talking to an AI?
> Most do not, as long as it is quick, polite and gets them booked. The ones who want a person get one.

## The result

At [Acme Plumbing](https://acmeplumbing.test), the team stopped losing evening calls. The first visits of the day are now booked before the shop opens.
`;

const BODY_GBP = `## Ten things to check this week

1. Your primary category matches the job you want most.
2. Service areas list the towns you actually drive to (Hamilton, Burlington, Stoney Creek, Ancaster).
3. Hours are right, including holiday hours.
4. The booking link goes to a page that books, not to your home page.
5. At least ten recent photos of real jobs.
6. Every review from the last month has a reply.
7. Products or services are filled in with plain names.
8. The business description says who you help and where.
9. Questions and answers has your own top three questions answered.
10. Your phone number matches your website exactly.

> [!info] A complete profile does not guarantee rankings. It removes the reasons not to show you.
`;

const BODY_REVIEWS = `Asking for a review feels awkward because most people ask at the wrong moment. Ask right after the customer says something nice, not three weeks later by email.

## A script that works

> "Thanks, that means a lot. Would you mind saying that in a Google review? I'll text you the link right now."

Then send the link. Not a link to your website, the direct review link.

- Ask in person, then follow with a text
- One reminder only, a few days later
- Reply to every review, good or bad
`;

const BODY_DENTAL = `## The problem

Escarpment Family Dental had open hygiene slots every week and a waiting list nobody called. New patient enquiries came in through the website at night and got a reply the next afternoon.

## What changed

- Every web enquiry got a text reply within a minute, with real hygiene times
- Cancelled slots triggered a text to the waiting list, first come first served
- Reminders went out the day before, with a one-tap confirm

## The numbers

| Month | Hygiene slots filled | New patients booked |
| --- | --- | --- |
| Before | 81% | 22 |
| Month 1 | 89% | 31 |
| Month 2 | 94% | 37 |

> The waiting list finally works. Cancellations fill themselves.
`;

const BODY_WEBLINE = `## Start with one page that books

A new trades business does not need twenty pages. It needs one page that says what you do, where you do it, and how to book. Everything else can come later.

### What goes on the page

- A headline with your service and your town
- Three reasons to pick you, in plain words
- Reviews, even if you only have a few
- A booking form that asks for the address and the problem
- Your phone number, big, at the top

> [!tip] Put your licence number and insurance on the page. It answers the question people do not ask out loud.
`;

const BODY_NOSHOW = `## Two texts, fewer empty slots

No-shows are rarely rude. People forget. Two short texts fix most of it:

1. The day before: the time, the address, and a one-tap confirm.
2. Two hours before: "See you at 2:00. Reply R to reschedule."

> [!warning] Do not send reminders at night. Pick a time between 9 AM and 7 PM in the customer's time zone.

That is it. Most clinics and trades we work with see no-shows drop within the first month.
`;

const BODY_MEASURE = `## Before you spend another dollar on ads

Write down four numbers from last month: calls, form fills, booked appointments, and jobs won. If you cannot get them, fix that first.

- Calls: from your phone provider
- Form fills: from your website
- Booked appointments: from your calendar
- Jobs won: from your invoices

> [!info] The gap between form fills and booked appointments is usually where the money is.
`;

const BODY_LONG_TITLE = `## Small things add up

A slow page. A form that asks for too much. A phone number that is an image, so it cannot be tapped. A booking link that opens a PDF. None of these feels big, but each one loses a few people.

### The quick audit

- Open your site on your phone, on mobile data, not Wi-Fi
- Try to book an appointment as a customer would
- Count the taps and the fields
- Fix the slowest step first
`;

const BODY_HOLIDAY = `Our office will be closed from December 24 to January 1. Client support stays on for urgent issues through the portal.

Happy holidays from all of us at Tekmadev.
`;

const BODY_FB_FORMS = `## The trade-off

Facebook lead forms are easy to fill in, so you get more leads. Landing pages ask for a bit more effort, so the leads are better.

| | Lead forms | Landing pages |
| --- | --- | --- |
| Cost per lead | Lower | Higher |
| Show-up rate | Lower | Higher |
| Follow-up speed needed | Very fast | Fast |

> [!tip] If you use lead forms, reply within a minute. Those leads cool down fastest.
`;

/* ------------------------------------------------------------------ */
/* Posts                                                                */
/* ------------------------------------------------------------------ */

type Seed = Pick<PostRecord, 'id' | 'title' | 'slug' | 'status' | 'categoryId' | 'bodyMarkdown'> & Partial<PostRecord>;

function post(seed: Seed): PostRecord {
  return {
    featured: false,
    authorId: 'auth_shajeed',
    excerpt: null,
    targetQuery: null,
    metaTitle: null,
    metaDescription: null,
    keywords: [],
    tags: [],
    canonicalUrl: null,
    noindex: false,
    coverImageUrl: null,
    coverImageAlt: null,
    socialImageUrl: null,
    source: 'manual',
    provenance: null,
    faqs: [],
    keyTakeaways: [],
    createdAt: daysAgo(60),
    updatedAt: daysAgo(30),
    publishedAt: null,
    trashedAt: null,
    ...seed,
  };
}

export const blogPosts: PostRecord[] = [
  post({
    id: 'post_aireceptn',
    title: 'What an AI receptionist actually does for a plumbing company',
    slug: 'what-an-ai-receptionist-does-for-a-plumbing-company',
    status: 'published',
    featured: true,
    categoryId: 'bcat_aiauto01',
    excerpt: 'It answers, it asks, it books. Here is what that looks like for a busy plumbing shop, and what it never does.',
    targetQuery: 'ai receptionist for plumbers',
    metaTitle: 'What an AI receptionist does for a plumbing company',
    metaDescription: 'An AI receptionist answers every call, asks the right questions and books visits on your calendar. Here is what it does, and what it never does.',
    keywords: ['ai receptionist', 'plumbing', 'missed calls'],
    tags: ['plumbing', 'ai'],
    canonicalUrl: null,
    coverImageUrl: `${IMG}/plumber-van.jpg`,
    coverImageAlt: 'A plumbing van parked outside a Hamilton home',
    socialImageUrl: `${IMG}/social/ai-receptionist.png`,
    bodyMarkdown: BODY_RECEPTIONIST,
    faqs: [
      { question: 'Does it work after hours?', answer: 'Yes. After-hours calls get a text reply and a booking link for the next open slot.' },
      { question: 'Can customers ask for a person?', answer: 'Always. It hands over with a short summary so nobody has to repeat themselves.' },
    ],
    keyTakeaways: ['It answers every call or message.', 'It books real slots on your calendar.', 'It never quotes prices you have not given it.'],
    createdAt: daysAgo(34),
    updatedAt: daysAgo(3, -2),
    publishedAt: daysAgo(21),
  }),
  post({
    id: 'post_speedlead',
    title: 'Speed to lead: why the first five minutes decide who books the job',
    slug: 'speed-to-lead-first-five-minutes',
    status: 'published',
    featured: true,
    categoryId: 'bcat_booked01',
    excerpt: 'The business that replies first books the job far more often than the business that replies best.',
    targetQuery: 'speed to lead',
    metaTitle: 'Speed to lead for local service businesses',
    metaDescription: 'Why replying in minutes, not hours, decides who books the job, and how to get there without hiring.',
    keywords: ['speed to lead', 'lead response time'],
    tags: ['follow-up'],
    coverImageUrl: `${IMG}/stopwatch.jpg`,
    coverImageAlt: 'A stopwatch on a workbench',
    bodyMarkdown: BODY_SPEED,
    keyTakeaways: ['Reply in under a minute by text.', 'Call back within five minutes during working hours.'],
    createdAt: daysAgo(70),
    updatedAt: daysAgo(9),
    publishedAt: daysAgo(64),
  }),
  post({
    id: 'post_gbpcheck',
    title: 'The Google Business Profile checklist for Hamilton service businesses',
    slug: 'google-business-profile-checklist-hamilton',
    status: 'published',
    categoryId: 'bcat_locseo01',
    excerpt: 'Ten things to check this week, in order of how much they matter.',
    targetQuery: 'google business profile checklist',
    metaTitle: 'Google Business Profile checklist (Hamilton)',
    metaDescription: 'Ten things every Hamilton service business should check on its Google Business Profile this week.',
    keywords: ['google business profile', 'local seo', 'hamilton'],
    tags: ['local-seo', 'hamilton'],
    bodyMarkdown: BODY_GBP,
    createdAt: daysAgo(95),
    updatedAt: daysAgo(40),
    publishedAt: daysAgo(90),
  }),
  post({
    id: 'post_reviewask',
    title: 'How to ask for reviews without sounding desperate',
    slug: 'how-to-ask-for-reviews',
    status: 'published',
    // No category: the list shows "No category".
    categoryId: null,
    excerpt: 'Ask right after the customer says something nice. Then send the link at once.',
    bodyMarkdown: BODY_REVIEWS,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(118),
    publishedAt: daysAgo(118),
  }),
  post({
    id: 'post_dentcase',
    title: 'Case study: how a family dental clinic filled its hygiene schedule',
    slug: 'case-study-family-dental-hygiene-schedule',
    status: 'published',
    categoryId: 'bcat_cases001',
    excerpt: 'Instant replies, a waiting list that texts itself, and reminders with a one-tap confirm.',
    targetQuery: 'dental clinic marketing case study',
    metaTitle: 'Case study: filling a dental hygiene schedule',
    metaDescription: 'How Escarpment Family Dental went from open hygiene slots to a waiting list that fills cancellations on its own.',
    keywords: ['dental marketing', 'case study'],
    tags: ['dental', 'case-study'],
    coverImageUrl: `${IMG}/dental-chair.jpg`,
    coverImageAlt: 'A bright, empty dental chair',
    bodyMarkdown: BODY_DENTAL,
    faqs: [{ question: 'Did the clinic change its booking software?', answer: 'No. Everything connects to the calendar the front desk already used.' }],
    keyTakeaways: ['Reply to web enquiries within a minute.', 'Let cancellations text the waiting list.'],
    createdAt: daysAgo(48),
    updatedAt: daysAgo(15),
    publishedAt: daysAgo(44),
  }),
  post({
    id: 'post_weblinew',
    title: 'Why a one-page website still wins for new trades businesses',
    slug: 'one-page-website-for-trades',
    status: 'published',
    categoryId: 'bcat_websit01',
    excerpt: 'One page that says what you do, where you do it, and how to book.',
    bodyMarkdown: BODY_WEBLINE,
    tags: ['webline'],
    createdAt: daysAgo(80),
    updatedAt: daysAgo(26),
    publishedAt: daysAgo(77),
  }),
  post({
    id: 'post_noshows1',
    title: 'Cutting no-shows with two text messages',
    slug: 'cutting-no-shows-with-two-texts',
    status: 'published',
    authorId: 'auth_team',
    categoryId: 'bcat_booked01',
    excerpt: 'People forget. Two short texts fix most of it.',
    bodyMarkdown: BODY_NOSHOW,
    keyTakeaways: ['Send one reminder the day before and one two hours before.', 'Never send reminders at night.'],
    createdAt: daysAgo(30),
    updatedAt: daysAgo(6, 3),
    publishedAt: daysAgo(28),
  }),
  post({
    id: 'post_aihvac01',
    title: 'AI follow-up for HVAC companies: from missed call to booked visit',
    slug: 'ai-follow-up-for-hvac-companies',
    status: 'draft',
    categoryId: 'bcat_aiauto01',
    excerpt: 'Every missed call gets a text within seconds, two or three questions, and real times from your calendar.',
    targetQuery: 'ai follow up hvac',
    metaTitle: 'AI follow-up for HVAC companies',
    metaDescription: 'How HVAC companies turn missed calls into booked visits with AI follow-up, and what to keep human.',
    keywords: ['hvac marketing', 'missed calls', 'ai follow-up'],
    tags: ['hvac', 'ai', 'missed-calls'],
    coverImageUrl: `${IMG}/hvac-furnace-check.jpg`,
    coverImageAlt: 'A technician checking a furnace',
    source: 'ai_draft',
    provenance: { source: 'video_script', model: 'claude-sonnet-4-5', sourceTitle: 'Shorts script: the missed call that cost a furnace job' },
    bodyMarkdown: BODY_AI_HVAC,
    faqs: [
      { question: 'Does AI follow-up replace my dispatcher?', answer: 'No. It handles the first reply and the booking so your dispatcher can handle the jobs.' },
      { question: 'Is it allowed under CASL?', answer: 'Replying to someone who contacted you is fine. Adding them to marketing messages needs their consent.' },
      { question: 'What if the customer wants to talk to a person?', answer: 'It hands over at once with a summary of what they said.' },
    ],
    keyTakeaways: [
      'Most HVAC shops miss far more calls than they think.',
      'The first reply should go out within seconds, by text.',
      'Automate the triage and the booking, keep pricing human.',
      'After-hours calls are where AI follow-up pays off most.',
    ],
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(20),
  }),
  post({
    id: 'post_aiguide1',
    title: 'The local service business guide to booked appointments with AI',
    slug: 'guide-to-booked-appointments-with-ai',
    status: 'in_review',
    categoryId: 'bcat_booked01',
    excerpt: 'Most local businesses do not have a lead problem. They have a follow-up problem.',
    targetQuery: 'booked appointments ai',
    metaTitle: 'Booked appointments with AI: a guide for local businesses',
    metaDescription: 'Answer fast, ask the right questions, offer real times. A plain guide to booking more appointments with AI.',
    keywords: ['booked appointments', 'ai for local business'],
    tags: ['ai', 'guide'],
    source: 'ai_draft',
    provenance: { source: 'webinar_transcript', model: 'claude-opus-4-1', sourceTitle: 'Live Q&A: AI for local trades' },
    bodyMarkdown: BODY_AI_GUIDE,
    faqs: [{ question: 'Do I need new software?', answer: 'Usually not. It works with a phone number, a calendar and a website.' }],
    keyTakeaways: ['Fix follow-up before buying more leads.', 'Offer real times, not callbacks.'],
    createdAt: daysAgo(4),
    updatedAt: hoursAgo(5),
  }),
  post({
    id: 'post_measure1',
    title: 'What to track before you spend another dollar on ads',
    slug: 'what-to-track-before-ads',
    status: 'draft',
    // Draft with no category and no excerpt yet.
    categoryId: null,
    bodyMarkdown: BODY_MEASURE,
    createdAt: daysAgo(2),
    updatedAt: minutesAgo(48),
  }),
  post({
    id: 'post_longttl1',
    title:
      'The surprisingly long list of small things that quietly stop local customers from booking an appointment with your business online, and how to fix each one',
    slug: 'small-things-that-stop-customers-booking',
    status: 'in_review',
    authorId: 'auth_team',
    categoryId: 'bcat_websit01',
    excerpt: 'A slow page, a form that asks too much, a phone number that cannot be tapped. Each one loses a few people.',
    bodyMarkdown: BODY_LONG_TITLE,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1, 4),
  }),
  post({
    id: 'post_holiday1',
    title: 'Our holiday hours',
    slug: 'holiday-hours',
    status: 'archived',
    authorId: 'auth_team',
    categoryId: null,
    excerpt: 'Office closed December 24 to January 1.',
    noindex: true,
    bodyMarkdown: BODY_HOLIDAY,
    createdAt: daysAgo(290),
    updatedAt: daysAgo(270),
    publishedAt: daysAgo(285),
  }),
  post({
    id: 'post_fbforms1',
    title: 'Facebook lead forms vs landing pages for home services',
    slug: 'facebook-lead-forms-vs-landing-pages',
    status: 'archived',
    categoryId: 'bcat_locseo01',
    excerpt: 'More leads or better leads: the trade-off, and how to handle each.',
    bodyMarkdown: BODY_FB_FORMS,
    createdAt: daysAgo(210),
    updatedAt: daysAgo(55),
    publishedAt: daysAgo(205),
  }),
  post({
    id: 'post_emptydr1',
    title: 'Notes: winter promos for landscapers',
    slug: 'winter-promos-for-landscapers',
    status: 'draft',
    categoryId: null,
    // A brand new draft: empty body, no FAQs, no takeaways.
    bodyMarkdown: '',
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
  }),
  // In the trash: hidden from every list, but its slug stays taken.
  post({
    id: 'post_trashed1',
    title: 'Old checklist: Google Ads for contractors',
    slug: 'google-ads-checklist',
    status: 'draft',
    categoryId: 'bcat_locseo01',
    bodyMarkdown: 'Outdated. Replaced by the speed to lead post.',
    createdAt: daysAgo(400),
    updatedAt: daysAgo(100),
    trashedAt: daysAgo(100),
  }),
];

export const blogRevisions: RevisionRecord[] = blogPosts
  .filter((p) => !p.trashedAt)
  .map((p, i) => ({ id: `rev_seed${i.toString().padStart(4, '0')}`, postId: p.id, at: p.updatedAt, by: 'Shajeed I.', title: p.title, bodyMarkdown: p.bodyMarkdown }));

/* ------------------------------------------------------------------ */
/* Image upload slots (POST /blog/media)                                */
/* ------------------------------------------------------------------ */

/**
 * Where the mock's "public" bucket lives. Nothing is stored there: in mock mode
 * the app skips the storage upload (the token is fake) and previews the file
 * it kept on the phone instead.
 */
export const MOCK_STORAGE_ORIGIN = 'https://mock-project.supabase.co';

/** A signed upload slot handed out by POST /blog/media. */
export type MediaSlotRecord = {
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  fileName: string;
  size: number;
  type: string;
  createdAt: string;
};

/** Every slot handed out, oldest first (tests read it; nothing else does). */
export const blogMediaSlots: MediaSlotRecord[] = [];

/* ------------------------------------------------------------------ */
/* Lookups and serializers                                              */
/* ------------------------------------------------------------------ */

export const findAuthor = (id: string) => BLOG_AUTHORS.find((a) => a.id === id);
export const findCategory = (id: string) => blogCategories.find((c) => c.id === id);
/** Posts the app can see (trash excluded). */
export const livePosts = () => blogPosts.filter((p) => !p.trashedAt);
export const findLivePost = (id: string) => blogPosts.find((p) => p.id === id && !p.trashedAt);

function authorOf(record: PostRecord): Author {
  return findAuthor(record.authorId) ?? BLOG_AUTHORS[0];
}

function categoryRef(record: PostRecord) {
  const category = record.categoryId ? findCategory(record.categoryId) : undefined;
  return category ? { id: category.id, name: category.name } : null;
}

export function toPostRow(record: PostRecord): PostRow {
  const author = authorOf(record);
  return {
    id: record.id,
    title: record.title,
    slug: record.slug,
    status: record.status,
    featured: record.featured,
    category: categoryRef(record),
    author: { id: author.id, name: author.name },
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
    source: record.source,
    excerpt: record.excerpt,
  };
}

export function toPost(record: PostRecord): Post {
  return {
    id: record.id,
    title: record.title,
    slug: record.slug,
    status: record.status,
    author: authorOf(record),
    category: categoryRef(record),
    excerpt: record.excerpt,
    featured: record.featured,
    targetQuery: record.targetQuery,
    metaTitle: record.metaTitle,
    metaDescription: record.metaDescription,
    keywords: [...record.keywords],
    tags: [...record.tags],
    canonicalUrl: record.canonicalUrl,
    noindex: record.noindex,
    coverImageUrl: record.coverImageUrl,
    coverImageAlt: record.coverImageAlt,
    socialImageUrl: record.socialImageUrl,
    source: record.source,
    provenance: record.provenance,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
  };
}

export function toPostDetail(record: PostRecord): PostDetail {
  return {
    post: toPost(record),
    bodyMarkdown: record.bodyMarkdown,
    faqs: record.faqs.map((f) => ({ ...f })),
    keyTakeaways: [...record.keyTakeaways],
    updatedAt: record.updatedAt,
  };
}

export function toCategory(record: CategoryRecord): BlogCategory {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    postCount: livePosts().filter((p) => p.categoryId === record.id).length,
  };
}

/* ------------------------------------------------------------------ */
/* GET /meta                                                            */
/* ------------------------------------------------------------------ */

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture = {
  blogStatuses: [
    { value: 'draft' as const, label: 'Draft', tone: 'muted' as const },
    { value: 'in_review' as const, label: 'In review', tone: 'neutral' as const },
    { value: 'published' as const, label: 'Published', tone: 'gold' as const },
    { value: 'archived' as const, label: 'Archived', tone: 'muted' as const },
  ],
  blogBlockTypes: [
    { value: 'heading' as const, label: 'Heading' },
    { value: 'paragraph' as const, label: 'Paragraph' },
    { value: 'list' as const, label: 'List' },
    { value: 'quote' as const, label: 'Quote' },
    { value: 'callout' as const, label: 'Callout' },
    { value: 'answer' as const, label: 'Short answer' },
    { value: 'image' as const, label: 'Image' },
    { value: 'table' as const, label: 'Table' },
    { value: 'code' as const, label: 'Code' },
    { value: 'cta' as const, label: 'Call to action' },
    { value: 'divider' as const, label: 'Divider' },
  ],
  // The live category list (same array the routes mutate), so meta never lags a rename.
  blogCategories,
};
