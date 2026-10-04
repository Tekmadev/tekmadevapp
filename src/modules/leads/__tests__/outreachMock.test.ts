import { api, setAuthBridge } from '@/api/client';
import { createLead, getAssignees, getLeads, getTouches, logTouch, updateLead } from '@/api/endpoints/leads';
import { ApiError } from '@/api/errors';
import { leadsDb } from '@/api/mock/fixtures/leads';
import { zLead, zLogTouchResult, zTouchPage } from '@/api/schemas/leads';

/**
 * The outreach endpoints through the real mock transport, as staff (the
 * website's docs/admin-api/outreach.md): the same rules, codes and messages
 * the screens rely on.
 */

let token = '';
// expo-crypto has no native random UUID under Jest: a counter gives each intent its own key.
let keys = 0;
const newIdempotencyKey = () => `outreach-test-${++keys}`;
const as = (id: string) => {
  token = `mock.${id}.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(() => as('usr_staff01'));

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

describe('POST /leads', () => {
  it('needs a name or a business, and an email or a phone', async () => {
    const e = await apiError(createLead({}, newIdempotencyKey()));
    expect([e.status, e.code, e.message]).toEqual([400, 'name', 'Enter a name or a business.']);
    expect(e.fields).toEqual({ name: 'Enter a name or a business.', email: 'Enter an email or a phone number.' });
    const phone = await apiError(createLead({ name: 'Dana', phone: '12' }, newIdempotencyKey()));
    expect([phone.code, phone.fields]).toEqual(['phone', { phone: 'Enter a valid phone number.' }]);
  });

  it('checks both rules alongside a field that is the right type but invalid, like the server', async () => {
    const long = await apiError(createLead({ name: 'x'.repeat(121) }, newIdempotencyKey()));
    expect([long.code, long.fields]).toEqual([
      'name',
      { name: 'Keep the name to 120 characters or fewer.', email: 'Enter an email or a phone number.' },
    ]);
    // A malformed email still counts as given, so only the name rule adds an error.
    const bad = await apiError(createLead({ email: 'not-an-email' }, newIdempotencyKey()));
    expect([bad.code, bad.fields]).toEqual(['email', { email: 'Enter a valid email.', name: 'Enter a name or a business.' }]);
    // An unknown enum value stops there (zod skips the cross-field rules).
    const need = await apiError(createLead({ need: 'nope' as never }, newIdempotencyKey()));
    expect([need.code, need.fields]).toEqual(['need', { need: 'Unknown lead need.' }]);
  });

  it('adds a lead by hand, assigned to whoever adds it, once per key', async () => {
    const key = newIdempotencyKey();
    const lead = await createLead({ business: 'Hamilton Hot Tubs', phone: '905 555 0142' }, key);
    expect(zLead.safeParse(lead).success).toBe(true);
    expect(lead).toMatchObject({ source: 'outreach', status: 'new', email: '', name: null, business: 'Hamilton Hot Tubs' });
    expect(lead.assignedTo).toEqual({ email: 'staff@tekmadev.test', name: 'Noah Lavoie' });
    expect(lead.addedBy).toEqual(lead.assignedTo);
    const again = await createLead({ business: 'Hamilton Hot Tubs', phone: '905 555 0142' }, key);
    expect(again.id).toBe(lead.id);
    expect(leadsDb.filter((l) => l.business === 'Hamilton Hot Tubs')).toHaveLength(1);
    // Newest first: it tops the list.
    expect((await getLeads({})).items[0].id).toBe(lead.id);
  });

  it('refuses an email that is already a lead, any casing', async () => {
    const taken = leadsDb.find((l) => l.email)?.email ?? '';
    const e = await apiError(createLead({ name: 'Copy', email: taken.toUpperCase() }, newIdempotencyKey()));
    expect([e.status, e.code, e.fields?.email]).toEqual([409, 'duplicate', 'That email is already a lead. Find it in Leads and log the touch there.']);
  });
});

describe('PATCH /leads/:id and touches', () => {
  it('sets a follow-up and an owner, and refuses calendar statuses', async () => {
    const lead = await createLead({ name: 'Patch Me', email: 'patch.me@example.test' }, newIdempotencyKey());
    const booked = await apiError(api.patch(`/leads/${lead.id}`, { status: 'booked' }));
    expect([booked.code, booked.message]).toEqual(['status', 'Booked and cancelled come from the booking calendar. Pick another status.']);
    const nobody = await apiError(updateLead(lead.id, { assignedTo: 'stranger@example.test' }));
    expect([nobody.code, nobody.fields]).toEqual(['assigned_to', { assignedTo: 'Pick someone on the team.' }]);
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const updated = await updateLead(lead.id, { followUpAt: at, assignedTo: 'manager@tekmadev.test', status: 'qualified' });
    expect(updated).toMatchObject({ followUpAt: at, status: 'qualified', assignedTo: { email: 'manager@tekmadev.test', name: 'Maya Chen' } });
    const cleared = await updateLead(lead.id, { followUpAt: null, assignedTo: null });
    expect([cleared.followUpAt, cleared.assignedTo, cleared.status]).toEqual([null, null, 'qualified']);
    const late = await apiError(updateLead(lead.id, { followUpAt: '2019-12-31T12:00:00Z' }));
    expect([late.code, late.message]).toEqual(['follow_up_at', 'Enter a valid follow-up time.']);
  });

  it('logs a call: a new lead becomes contacted, other leaves it, and a retry logs once', async () => {
    const lead = await createLead({ name: 'Call Me', phone: '613 555 0101' }, newIdempotencyKey());
    const key = newIdempotencyKey();
    const result = await logTouch(lead.id, { kind: 'call', outcome: 'Left a voicemail' }, key);
    expect(zLogTouchResult.safeParse(result).success).toBe(true);
    expect(result.lead.status).toBe('contacted');
    expect(result.touch).toMatchObject({ kind: 'call', outcome: 'Left a voicemail', by: { email: 'staff@tekmadev.test' } });
    await logTouch(lead.id, { kind: 'call', outcome: 'Left a voicemail' }, key);
    const page = await getTouches(lead.id, null);
    expect(zTouchPage.safeParse(page).success).toBe(true);
    expect(page.items).toHaveLength(1);

    const other = await createLead({ name: 'Other One', phone: '613 555 0102' }, newIdempotencyKey());
    expect((await logTouch(other.id, { kind: 'other' }, newIdempotencyKey())).lead.status).toBe('new');
    const future = await apiError(logTouch(other.id, { kind: 'call', at: new Date(Date.now() + 3_600_000).toISOString() }, newIdempotencyKey()));
    expect([future.code, future.message]).toEqual(['at', 'That time is in the future.']);
    const kind = await apiError(api.post(`/leads/${other.id}/touches`, { kind: 'fax' }, { idempotencyKey: newIdempotencyKey() }));
    expect([kind.code, kind.message]).toEqual(['kind', 'Pick a call, email, DM, meeting or other.']);
  });

  it('answers 404 for a lead that is gone', async () => {
    const e = await apiError(getTouches('ld_nope', null));
    expect([e.status, e.message]).toEqual([404, 'That lead no longer exists.']);
  });
});

describe('GET /leads follow-up queue and assignees', () => {
  it('sorts the queue soonest first and keeps its own cursors', async () => {
    const page = await getLeads({ followUp: 'any', limit: 3 });
    const times = page.items.map((l) => Date.parse(l.followUpAt ?? ''));
    expect(times.every((t, i) => i === 0 || times[i - 1] <= t)).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    const e = await apiError(getLeads({ cursor: page.nextCursor }));
    expect([e.status, e.code]).toEqual([400, 'cursor']);
    const due = await getLeads({ followUp: 'due', limit: 100 });
    expect(due.items.length).toBeGreaterThan(0);
    expect(due.items.every((l) => Date.parse(l.followUpAt ?? '') <= Date.now())).toBe(true);
    const bad = await apiError(api.get('/leads', { query: { followUp: 'soon' } }));
    expect([bad.code, bad.message]).toEqual(['follow_up', 'Unknown follow-up filter.']);
  });

  it('filters by owner and lists the team', async () => {
    const mine = await getLeads({ assigned: 'me', limit: 100 });
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((l) => l.assignedTo?.email === 'staff@tekmadev.test')).toBe(true);
    const team = await getAssignees();
    expect(team.map((m) => m.email)).toEqual(expect.arrayContaining(['owner@tekmadev.test', 'manager@tekmadev.test', 'staff@tekmadev.test']));
    expect(team.map((m) => m.name ?? m.email)).toEqual([...team.map((m) => m.name ?? m.email)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });
});
