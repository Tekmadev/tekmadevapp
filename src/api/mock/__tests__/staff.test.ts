import { api, setAuthBridge } from '@/api/client';
import { createClient, getClientCredits, getClient, saveClientCredits } from '@/api/endpoints/clients';
import { createLead, updateLead } from '@/api/endpoints/leads';
import { getMe } from '@/api/endpoints/session';
import { getCommissionSplit, saveCommissionSplit } from '@/api/endpoints/settings';
import { getMyActivity, getTeam, getTeamActivity, updateTeamMember } from '@/api/endpoints/team';
import { ApiError } from '@/api/errors';
import { leadsDb } from '@/api/mock/fixtures/leads';
import { zClientBundle, zClientCredits } from '@/api/schemas/clients';
import { zLead } from '@/api/schemas/leads';
import { zStaffActivity, zTeamMember } from '@/api/schemas/team';

/**
 * Staff management and commission credit through the real mock transport
 * (the website's docs/admin-api/staff.md): role changes and pausing with the
 * server's rules and codes, a paused person answered 403 `paused`
 * everywhere, the activity board, lead credit, client credits and the
 * default split.
 */

let token: string | null = null;
const as = (userId: string) => {
  token = `mock.${userId}.${Date.now() + 3_600_000}`;
};
const asOwner = () => as('usr_owner01');
const asManager = () => as('usr_mgr01');
const asStaff = () => as('usr_staff01');

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, refresh: async () => null });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

let keys = 0;
const key = () => `staff-test-${++keys}`;

describe('PATCH /team/:email', () => {
  it('lets an owner change a role, and answers the member', async () => {
    const updated = await updateTeamMember('alexandra@tekmadev.test', { role: 'staff' });
    expect(zTeamMember.safeParse(updated).success).toBe(true);
    expect(updated).toMatchObject({ email: 'alexandra@tekmadev.test', role: 'staff', paused: false });
    await updateTeamMember('alexandra@tekmadev.test', { role: 'manager' });
  });

  it('keeps the rules, in the server order', async () => {
    const locked = await apiError(updateTeamMember('owner@tekmadev.test', { paused: true }));
    expect([locked.status, locked.code, locked.message]).toEqual([422, 'locked', 'This owner is locked. Nobody can change their role or pause them.']);
    const missing = await apiError(updateTeamMember('nobody@tekmadev.test', { role: 'staff' }));
    expect([missing.status, missing.message]).toEqual([404, 'That team member no longer exists.']);
    const badRole = await apiError(api.patch('/team/staff%40tekmadev.test', { role: 'boss' }));
    expect([badRole.status, badRole.code, badRole.message]).toEqual([400, 'role', 'Pick Owner, Manager or Staff.']);
    const badPaused = await apiError(api.patch('/team/staff%40tekmadev.test', { paused: 'yes' }));
    expect([badPaused.code, badPaused.message]).toEqual(['paused', 'Send paused as true or false.']);

    asManager();
    const self = await apiError(updateTeamMember('manager@tekmadev.test', { paused: true }));
    expect([self.status, self.code, self.message]).toEqual([422, 'self', 'You cannot pause yourself.']);
    const selfRole = await apiError(updateTeamMember('manager@tekmadev.test', { role: 'staff' }));
    expect(selfRole.message).toBe('You cannot change your own role.');
    const makeOwner = await apiError(updateTeamMember('staff@tekmadev.test', { role: 'owner' }));
    expect([makeOwner.status, makeOwner.code]).toEqual([403, 'owner_only']);

    asStaff();
    const staff = await apiError(updateTeamMember('alexandra@tekmadev.test', { paused: true }));
    expect([staff.status, staff.code, staff.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
  });

  it('pauses: every request answers 403 paused until someone resumes', async () => {
    asManager();
    const paused = await updateTeamMember('staff@tekmadev.test', { paused: true });
    expect(paused).toMatchObject({ paused: true, pausedBy: { email: 'manager@tekmadev.test', name: 'Maya Chen' } });
    expect(paused.pausedAt).toEqual(expect.any(String));
    // Pausing again keeps the first time.
    const again = await updateTeamMember('staff@tekmadev.test', { paused: true });
    expect(again.pausedAt).toBe(paused.pausedAt);

    asStaff();
    const blocked = await apiError(getMe({ rawAuthErrors: true }));
    expect([blocked.status, blocked.code, blocked.message, blocked.isPaused]).toEqual([403, 'paused', 'Your access is paused. Ask an owner or manager.', true]);

    asOwner();
    expect((await getTeam()).find((m) => m.email === 'staff@tekmadev.test')?.paused).toBe(true);
    const resumed = await updateTeamMember('staff@tekmadev.test', { paused: false });
    expect([resumed.paused, resumed.pausedAt, resumed.pausedBy]).toEqual([false, null, null]);
    asStaff();
    expect((await getMe()).role).toBe('staff');
  });
});

describe('the activity board', () => {
  it('gives owners and managers everyone, staff only their own row', async () => {
    const board = await getTeamActivity('30d');
    expect(zStaffActivity.safeParse(board).success).toBe(true);
    expect(board.range).toBe('30d');
    expect(board.since).toEqual(expect.any(String));
    expect(board.rows.map((r) => r.email)).toEqual(expect.arrayContaining(['owner@tekmadev.test', 'manager@tekmadev.test', 'staff@tekmadev.test']));

    asStaff();
    const denied = await apiError(getTeamActivity('7d'));
    expect([denied.status, denied.code]).toEqual([403, 'forbidden']);
    const mine = await getMyActivity('30d');
    expect(mine.rows).toHaveLength(1);
    const noah = mine.rows[0];
    expect(noah.email).toBe('staff@tekmadev.test');
    // Seeded: half of Dundas Electric, all of Steeltown Physio, 60% of Nepean Orthodontics.
    expect(noah.clientsWon).toBeCloseTo(2.1, 5);
    expect(noah.leadsFound).toBeGreaterThan(2);
    expect(noah.touches.total).toBe(noah.touches.call + noah.touches.email + noah.touches.dm + noah.touches.meeting + noah.touches.other);
    expect(noah.callsBooked).toBeGreaterThan(0);
    expect(noah.clientsHelped).toBeGreaterThan(0);
    expect(noah.followUps.overdue).toBeGreaterThan(0);
  });

  it('counts all time from the start, and refuses an unknown range', async () => {
    const all = await getTeamActivity('all');
    expect(all.since).toBeNull();
    const week = await getTeamActivity('7d');
    const noahAll = all.rows.find((r) => r.email === 'staff@tekmadev.test');
    const noahWeek = week.rows.find((r) => r.email === 'staff@tekmadev.test');
    expect(noahAll && noahWeek && noahAll.clientsWon >= noahWeek.clientsWon).toBe(true);
    const bad = await apiError(api.get('/team/activity', { query: { range: '90d' } }));
    expect([bad.status, bad.code, bad.message]).toEqual([400, 'range', 'Pick 7d, 30d or all.']);
  });
});

describe('lead credit', () => {
  it('records who found a lead added by hand, and the first person to book it', async () => {
    asStaff();
    const lead = await createLead({ name: 'Credit Test', phone: '905 555 0999' }, key());
    expect(zLead.safeParse(lead).success).toBe(true);
    expect(lead.foundBy).toEqual({ email: 'staff@tekmadev.test', name: 'Noah Lavoie' });
    expect(lead.bookedBy).toBeNull();
    const booked = await updateLead(lead.id, { status: 'booked' });
    expect(booked.bookedBy?.email).toBe('staff@tekmadev.test');
    asManager();
    const later = await updateLead(lead.id, { status: 'booked' });
    expect(later.bookedBy?.email).toBe('staff@tekmadev.test');
  });
});

describe('client credits', () => {
  it('copies the lead finder and booker to a new client with the default split', async () => {
    asStaff();
    const lead = await createLead({ name: 'Split Co', business: 'Split Co', email: 'owner@splitco.test' }, key());
    asManager();
    await updateLead(lead.id, { status: 'booked' });
    const result = await createClient({ businessName: 'Split Co', email: 'owner@splitco.test', sendInvite: false, leadId: lead.id }, key());
    const credits = await getClientCredits(result.client.id);
    expect(zClientCredits.safeParse(credits).success).toBe(true);
    expect([credits.scope, credits.leadId]).toEqual(['all', lead.id]);
    expect(credits.credits.map((c) => [c.email, c.role, c.share])).toEqual([
      ['staff@tekmadev.test', 'finder', 50],
      ['manager@tekmadev.test', 'booker', 50],
    ]);
    expect(leadsDb.find((l) => l.id === lead.id)?.convertedClientId).toBe(result.client.id);

    // Staff see only their own row, in the bundle too, and no credit activity.
    asStaff();
    const own = await getClientCredits(result.client.id);
    expect([own.scope, own.credits.map((c) => c.email)]).toEqual(['own', ['staff@tekmadev.test']]);
    const bundle = await getClient(result.client.id);
    expect(zClientBundle.safeParse(bundle).success).toBe(true);
    expect(bundle.credits?.map((c) => c.email)).toEqual(['staff@tekmadev.test']);
    expect(bundle.activity.items.some((a) => a.event.startsWith('credits.'))).toBe(false);
  });

  it('gives whoever adds a client by hand, not from a lead, full credit: finder and booker, 100% (owner decision 2026-10-05)', async () => {
    const total = (list: { share: number }[]) => list.reduce((sum, c) => sum + c.share, 0);

    asManager();
    const byManager = await createClient({ businessName: 'Hand Made Signs', email: 'hello@handmadesigns.test', sendInvite: false }, key());
    asOwner();
    const managerRows = (await getClientCredits(byManager.client.id)).credits;
    expect(managerRows.map((c) => [c.email, c.role, c.share])).toEqual([
      ['manager@tekmadev.test', 'finder', 50],
      ['manager@tekmadev.test', 'booker', 50],
    ]);
    expect(total(managerRows)).toBe(100);
    expect((await getClientCredits(byManager.client.id)).leadId).toBeNull();
    const ownerBundle = await getClient(byManager.client.id);
    expect(ownerBundle.activity.items.some((a) => a.event === 'credits.created')).toBe(true);

    asOwner();
    const byOwner = await createClient({ businessName: 'Owner Found Co', email: 'hi@ownerfound.test', sendInvite: false }, key());
    expect((await getClientCredits(byOwner.client.id)).credits.map((c) => [c.email, c.share])).toEqual([
      ['owner@tekmadev.test', 50],
      ['owner@tekmadev.test', 50],
    ]);

    // Staff see it as their own credit: every row is theirs, 100% in all.
    asStaff();
    const byStaff = await createClient({ businessName: 'Staff Found Bakery', email: 'hi@stafffoundbakery.test', sendInvite: false }, key());
    const own = await getClientCredits(byStaff.client.id);
    expect(own.scope).toBe('own');
    expect(own.credits.map((c) => [c.email, c.role])).toEqual([
      ['staff@tekmadev.test', 'finder'],
      ['staff@tekmadev.test', 'booker'],
    ]);
    expect(total(own.credits)).toBe(100);
    expect((await getClient(byStaff.client.id)).credits?.every((c) => c.email === 'staff@tekmadev.test')).toBe(true);
    asOwner();
    expect((await getClientCredits(byStaff.client.id)).credits.every((c) => c.email === 'staff@tekmadev.test')).toBe(true);
  });

  it('keeps the credits of an existing client added again by hand (reused, not created)', async () => {
    asManager();
    const first = await createClient({ businessName: 'Twice Added Co', email: 'hi@twiceadded.test', sendInvite: false }, key());
    asStaff();
    const again = await createClient({ businessName: 'Twice Added Co', email: 'hi@twiceadded.test', sendInvite: false }, key());
    expect(again).toMatchObject({ reused: true, client: { id: first.client.id } });
    asOwner();
    expect((await getClientCredits(first.client.id)).credits.map((c) => c.email)).toEqual(['manager@tekmadev.test', 'manager@tekmadev.test']);
  });

  it('refuses a lead that is gone or already another client', async () => {
    asManager();
    const gone = await apiError(createClient({ businessName: 'Gone', email: 'gone@x.test', sendInvite: false, leadId: 'ld_nope' }, key()));
    expect([gone.status, gone.code, gone.fields]).toEqual([400, 'lead_id', { leadId: 'That lead no longer exists.' }]);
    const won = leadsDb.find((l) => l.convertedClientId === 'cl_dundaselec');
    const taken = await apiError(createClient({ businessName: 'Other', email: 'other@x.test', sendInvite: false, leadId: won?.id }, key()));
    expect([taken.status, taken.code, taken.message]).toEqual([409, 'lead_converted', 'That lead is already a client. Open it from the lead.']);
  });

  it('edits credits: team members, shares adding up to 100, and a note', async () => {
    asManager();
    const total = await apiError(
      saveClientCredits('cl_steeltownph', { credits: [{ email: 'staff@tekmadev.test', role: 'booker', share: 60 }], note: 'x' }),
    );
    expect([total.code, total.message, total.fields]).toEqual(['total', 'Shares must add up to 100.', { credits: 'Shares must add up to 100.' }]);
    const stranger = await apiError(saveClientCredits('cl_steeltownph', { credits: [{ email: 'who@x.test', role: 'finder', share: 100 }], note: 'x' }));
    expect(stranger.message).toBe('Pick someone on the team.');
    const noNote = await apiError(saveClientCredits('cl_steeltownph', { credits: [], note: ' ' }));
    expect([noNote.code, noNote.message]).toEqual(['note', 'Add a note saying why.']);

    const saved = await saveClientCredits('cl_steeltownph', {
      credits: [
        { email: 'staff@tekmadev.test', role: 'booker', share: 66.67 },
        { email: 'manager@tekmadev.test', role: 'other', share: 33.33 },
      ],
      note: 'Maya helped on the call.',
    });
    expect(saved.credits.map((c) => c.share)).toEqual([66.67, 33.33]);
    const bundle = await getClient('cl_steeltownph');
    expect(bundle.activity.items[0].event).toBe('credits.updated');

    asStaff();
    const denied = await apiError(saveClientCredits('cl_steeltownph', { credits: [], note: 'x' }));
    expect([denied.status, denied.code]).toEqual([403, 'forbidden']);
  });
});

describe('the default split', () => {
  it('lets managers read it and only owners change it', async () => {
    asManager();
    expect(await getCommissionSplit()).toEqual({ finder: 50, booker: 50 });
    const denied = await apiError(saveCommissionSplit({ finder: 60, booker: 40 }));
    expect([denied.status, denied.code]).toEqual([403, 'owner_only']);

    asOwner();
    const split = await apiError(saveCommissionSplit({ finder: 60, booker: 50 }));
    expect([split.code, split.message]).toEqual(['split', 'Finder and booker must add up to 100.']);
    const range = await apiError(saveCommissionSplit({ finder: 10.555, booker: 89.445 }));
    expect([range.code, range.fields]).toEqual(['finder', { finder: 'Enter a number from 0 to 100, with at most two decimals.', booker: 'Enter a number from 0 to 100, with at most two decimals.' }]);
    expect(await saveCommissionSplit({ finder: 60, booker: 40 })).toEqual({ finder: 60, booker: 40 });

    asStaff();
    const staff = await apiError(getCommissionSplit());
    expect([staff.status, staff.code]).toEqual([403, 'forbidden']);
  });
});
