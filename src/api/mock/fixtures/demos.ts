import type { DemoBusiness, DemoEvent, DemoStatus } from '../../schemas/demos';
import { daysAgo, hoursAgo, minutesAgo, torontoDate } from '../router';
import { MOCK_ACCOUNTS } from './staff';
import { hexId } from './tools';

/**
 * Demo requests (contract "Demo requests: API contract v1", 2026-10-05):
 * Webline-style local businesses in Ontario, some asked for from a lead, some
 * from a client, in every status. Noah (staff) found most of them; Shajeed and
 * Maya build. Names shown on a request (client, lead, requester) are looked up
 * when it is read (routes/demos.ts), so they follow renames like the server's.
 *
 * Lead conversion: when a lead becomes a client its requests get that clientId
 * and keep their leadId (linkLeadDemosToClient, called by POST /clients).
 */

export type DemoRecord = {
  id: string;
  status: DemoStatus;
  clientId: string | null;
  leadId: string | null;
  business: DemoBusiness;
  wants: string | null;
  neededBy: string | null;
  demoUrl: string | null;
  builderEmail: string | null;
  builderNote: string | null;
  /** Lowercased email of the team member who asked. */
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  shownAt: string | null;
  cancelledAt: string | null;
  /** Oldest first. */
  events: DemoEvent[];
};

const account = (id: string) => {
  const found = MOCK_ACCOUNTS.find((a) => a.id === id);
  if (!found) throw new Error(`demos fixture: unknown staff ${id}`);
  return { email: found.email, name: found.name };
};
const OWNER = account('usr_owner01');
const MANAGER = account('usr_mgr01');
const STAFF = account('usr_staff01');

type Who = { email: string; name: string | null };
const event = (at: string, who: Who, type: DemoEvent['type'], from: string | null = null, to: string | null = null): DemoEvent => ({
  at,
  by: who.email,
  byName: who.name,
  type,
  from,
  to,
});

/** Fixed ids, so tests and deep links can name them. */
export const DEMO_IDS = {
  capitalWindows: '3f6c2b1e-8a4d-4c7e-9b12-5d0e7a1c4f01',
  pelletier: '9a2d7e44-1c3b-4f8a-a6e5-2b7c9d0e1f02',
  orleansAuto: 'c4e81f20-6b5a-4d39-8e7f-0a1b2c3d4e03',
  steeltownPhysio: '5b7d9e31-2f4a-4c6b-8d1e-3a5c7e9f0b04',
  waterdownDriving: 'e1a3c5d7-9b2f-4e6a-8c0d-1f3b5d7e9a05',
  dogGrooming: '7d9f1b3e-5a7c-4e2b-9d4f-6b8e0a2c4e06',
  stoneyTutoring: '2c4e6a8b-0d1f-4a3c-8e5b-7d9f1b3d5f07',
} as const;

const LEAD_CAPITAL_WINDOWS = hexId('ld', 201);
const LEAD_PELLETIER = hexId('ld', 111);
const LEAD_ORLEANS = hexId('ld', 716);
const LEAD_DOG_GROOMING = hexId('ld', 212);
const LEAD_STONEY_TUTORING = hexId('ld', 213);

function demos(): DemoRecord[] {
  /* Requested 2 hours ago from a lead by Noah: nobody has picked it up yet. */
  const capitalAt = hoursAgo(2);
  const capital: DemoRecord = {
    id: DEMO_IDS.capitalWindows,
    status: 'requested',
    clientId: null,
    leadId: LEAD_CAPITAL_WINDOWS,
    business: {
      name: 'Capital Window Cleaning',
      type: 'Window cleaning',
      area: 'Ottawa, Kanata and Orleans',
      offer: 'Residential window cleaning, storefront windows on a monthly route, and eavestrough cleaning in the fall.',
      website: 'Only a Facebook page and Instagram @capitalwindowsott',
      brand: 'Navy and white. Logo is a squeegee in a circle (they will send the file).',
      customers: 'Homeowners in the suburbs and small shops along Bank Street.',
    },
    wants: 'A one page site with a quote form and before and after photos. It has to look good on a phone: he showed me his old site on his phone and it was tiny.',
    neededBy: torontoDate(4),
    demoUrl: null,
    builderEmail: null,
    builderNote: null,
    requestedBy: STAFF.email,
    createdAt: capitalAt,
    updatedAt: capitalAt,
    readyAt: null,
    shownAt: null,
    cancelledAt: null,
    events: [event(capitalAt, STAFF, 'created', null, 'requested')],
  };

  /* Requested 3 days ago by Maya from a Webline ad lead; Shajeed is building it. */
  const pelletierAt = daysAgo(3, -2);
  const pelletierBuilding = daysAgo(2, -1);
  const pelletier: DemoRecord = {
    id: DEMO_IDS.pelletier,
    status: 'building',
    clientId: null,
    leadId: LEAD_PELLETIER,
    business: {
      name: 'Pelletier Plumbing',
      type: 'Plumber',
      area: 'Hamilton, Stoney Creek and Grimsby',
      offer: 'Drain cleaning, water heater installs, sump pumps and 24/7 emergency calls.',
      website: 'pelletierplumbing.ca (built in 2014, not mobile friendly)',
      brand: 'Red and grey van wrap. No logo file, only the van photo.',
      customers: 'Homeowners, and a few property managers with rental units.',
    },
    wants: 'Show the emergency number big at the top and a "Book a plumber" button. He wants it to feel local, with Hamilton photos.',
    neededBy: torontoDate(2),
    demoUrl: null,
    builderEmail: OWNER.email,
    builderNote: null,
    requestedBy: MANAGER.email,
    createdAt: pelletierAt,
    updatedAt: pelletierBuilding,
    readyAt: null,
    shownAt: null,
    cancelledAt: null,
    events: [
      event(pelletierAt, MANAGER, 'created', null, 'requested'),
      event(pelletierBuilding, OWNER, 'builder', null, OWNER.email),
      event(pelletierBuilding, OWNER, 'status', 'requested', 'building'),
    ],
  };

  /* Ready since this morning: a portal sign-up that became a client while the demo was asked for. */
  const orleansAt = daysAgo(4, -3);
  const orleansBuilding = daysAgo(3);
  const orleansReady = hoursAgo(5);
  const orleansUrl = 'https://demos.tekmadev.test/orleans-auto-detailing';
  const orleans: DemoRecord = {
    id: DEMO_IDS.orleansAuto,
    status: 'ready',
    clientId: 'cl_orleansauto',
    leadId: LEAD_ORLEANS,
    business: {
      name: 'Orleans Auto Detailing',
      type: 'Auto detailing',
      area: 'Orleans and east Ottawa',
      offer: 'Interior and exterior detailing, ceramic coating, and winter salt packages.',
      website: 'Instagram @orleansautodetail',
      brand: 'Black and electric blue, matches the shop sign.',
      customers: 'Car owners who care about their car, plus two local dealerships.',
    },
    wants: 'Packages with prices he can change himself, and a gallery. Samir wants to see it on his phone before he decides.',
    neededBy: torontoDate(1),
    demoUrl: orleansUrl,
    builderEmail: MANAGER.email,
    builderNote: 'The booking button goes to a placeholder form for now. Prices are from his Instagram, so check them with him.',
    requestedBy: STAFF.email,
    createdAt: orleansAt,
    updatedAt: orleansReady,
    readyAt: orleansReady,
    shownAt: null,
    cancelledAt: null,
    events: [
      event(orleansAt, STAFF, 'created', null, 'requested'),
      event(orleansBuilding, MANAGER, 'builder', null, MANAGER.email),
      event(orleansBuilding, MANAGER, 'status', 'requested', 'building'),
      event(orleansReady, MANAGER, 'link', null, orleansUrl),
      event(orleansReady, MANAGER, 'status', 'building', 'ready'),
    ],
  };

  /* Shown and won: Steeltown Physio bought Webline after seeing it. */
  const physioAt = daysAgo(16, -4);
  const physioBuilding = daysAgo(15);
  const physioReady = daysAgo(13, -2);
  const physioShown = daysAgo(11, -6);
  const physioUrl = 'https://demos.tekmadev.test/steeltown-physio';
  const physio: DemoRecord = {
    id: DEMO_IDS.steeltownPhysio,
    status: 'shown',
    clientId: 'cl_steeltownph',
    leadId: null,
    business: {
      name: 'Steeltown Physio',
      type: 'Physiotherapy clinic',
      area: 'Hamilton (Westdale and Kirkendall)',
      offer: 'Physiotherapy, massage therapy and sports injury rehab. Direct billing to most insurers.',
      website: 'steeltownphysio.ca on a free site builder',
      brand: 'Teal and warm grey. Logo file attached to the intake.',
      customers: 'Runners, desk workers with back pain, and people sent by their family doctor.',
    },
    wants: 'Online booking and a page per service. Aisha liked the clinic sites with real team photos.',
    neededBy: torontoDate(-11),
    demoUrl: physioUrl,
    builderEmail: OWNER.email,
    builderNote: 'Used stock photos for the team until she sends hers.',
    requestedBy: STAFF.email,
    createdAt: physioAt,
    updatedAt: physioShown,
    readyAt: physioReady,
    shownAt: physioShown,
    cancelledAt: null,
    events: [
      event(physioAt, STAFF, 'created', null, 'requested'),
      event(physioBuilding, OWNER, 'builder', null, OWNER.email),
      event(physioBuilding, OWNER, 'status', 'requested', 'building'),
      event(physioReady, OWNER, 'link', null, physioUrl),
      event(physioReady, OWNER, 'status', 'building', 'ready'),
      event(physioShown, STAFF, 'status', 'ready', 'shown'),
    ],
  };

  /* Cancelled by Noah the next day: the owner went with his nephew's site. */
  const drivingAt = daysAgo(6, -5);
  const drivingCancelled = daysAgo(5, -2);
  const driving: DemoRecord = {
    id: DEMO_IDS.waterdownDriving,
    status: 'cancelled',
    clientId: 'cl_waterdown_d',
    leadId: null,
    business: {
      name: 'Waterdown Driving School',
      type: 'Driving school',
      area: 'Waterdown, Flamborough and Burlington',
      offer: 'G2 and G lessons, MTO approved beginner course, and road test car rental.',
      website: null,
      brand: null,
      customers: 'Teenagers and their parents, and newcomers to Canada.',
    },
    wants: null,
    neededBy: null,
    demoUrl: null,
    builderEmail: null,
    builderNote: null,
    requestedBy: STAFF.email,
    createdAt: drivingAt,
    updatedAt: drivingCancelled,
    readyAt: null,
    shownAt: null,
    cancelledAt: drivingCancelled,
    events: [event(drivingAt, STAFF, 'created', null, 'requested'), event(drivingCancelled, STAFF, 'status', 'requested', 'cancelled')],
  };

  /* Ready since yesterday: Shajeed asked for it himself after a call. */
  const groomingAt = daysAgo(2, 1);
  const groomingBuilding = daysAgo(2, -2);
  const groomingReady = daysAgo(1, 3);
  const groomingUrl = 'https://demos.tekmadev.test/hamilton-mobile-dog-grooming';
  const grooming: DemoRecord = {
    id: DEMO_IDS.dogGrooming,
    status: 'ready',
    clientId: null,
    leadId: LEAD_DOG_GROOMING,
    business: {
      name: 'Hamilton Mobile Dog Grooming',
      type: 'Mobile dog grooming',
      area: 'Hamilton Mountain and Ancaster',
      offer: 'Full grooms, bath and tidy, and nail trims in a fully equipped van at your door.',
      website: 'Instagram @hamiltonmobilegroom',
      brand: 'Bright yellow van, paw print logo.',
      customers: 'Busy families and older dog owners who cannot drive to a groomer.',
    },
    wants: 'A booking request form with the dog size and the address, and a map of the area they cover.',
    neededBy: torontoDate(0),
    demoUrl: groomingUrl,
    builderEmail: MANAGER.email,
    builderNote: null,
    requestedBy: OWNER.email,
    createdAt: groomingAt,
    updatedAt: groomingReady,
    readyAt: groomingReady,
    shownAt: null,
    cancelledAt: null,
    events: [
      event(groomingAt, OWNER, 'created', null, 'requested'),
      event(groomingBuilding, MANAGER, 'builder', null, MANAGER.email),
      event(groomingBuilding, MANAGER, 'status', 'requested', 'building'),
      event(groomingReady, MANAGER, 'link', null, groomingUrl),
      event(groomingReady, MANAGER, 'status', 'building', 'ready'),
    ],
  };

  /* Requested yesterday with only the required fields. */
  const tutoringAt = minutesAgo(26 * 60 + 14);
  const tutoring: DemoRecord = {
    id: DEMO_IDS.stoneyTutoring,
    status: 'requested',
    clientId: null,
    leadId: LEAD_STONEY_TUTORING,
    business: {
      name: 'Stoney Creek Tutoring Centre',
      type: 'Tutoring centre',
      area: 'Stoney Creek',
      offer: 'Math and reading tutoring for grades 1 to 12, small groups after school.',
      website: null,
      brand: null,
      customers: null,
    },
    wants: null,
    neededBy: null,
    demoUrl: null,
    builderEmail: null,
    builderNote: null,
    requestedBy: STAFF.email,
    createdAt: tutoringAt,
    updatedAt: tutoringAt,
    readyAt: null,
    shownAt: null,
    cancelledAt: null,
    events: [event(tutoringAt, STAFF, 'created', null, 'requested')],
  };

  return [capital, pelletier, orleans, physio, driving, grooming, tutoring].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every demo request, newest first (new ones are added at the front). */
export const demosDb: DemoRecord[] = demos();

export function findDemo(id: string | undefined): DemoRecord | undefined {
  return id ? demosDb.find((d) => d.id === id) : undefined;
}

/**
 * A lead became a client: its demo requests get that clientId, and keep their
 * leadId (the contract's lead conversion rule). A request already linked to a
 * client keeps it. Returns how many changed.
 */
export function linkLeadDemosToClient(leadId: string, clientId: string): number {
  let changed = 0;
  for (const d of demosDb) {
    if (d.leadId === leadId && !d.clientId) {
      d.clientId = clientId;
      changed += 1;
    }
  }
  return changed;
}
