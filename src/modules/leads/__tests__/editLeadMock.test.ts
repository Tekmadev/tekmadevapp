import { api, setAuthBridge } from '@/api/client';
import { createLead, getLead, getLeads, logTouch, updateLead } from '@/api/endpoints/leads';
import { ApiError } from '@/api/errors';
import { mockTransport } from '@/api/mock';
import { findLead, leadsDb } from '@/api/mock/fixtures/leads';
import { hexId } from '@/api/mock/fixtures/tools';
import { zLead } from '@/api/schemas/leads';

/**
 * Edit lead through the real mock transport (the website's
 * docs/admin-api/outreach.md section 4): `canEdit` per caller on every lead
 * answered, who may edit the details, the two rules on the whole lead, one
 * email per lead, the order of the checks, and nothing written on a failure.
 */

let token = '';
// expo-crypto has no native random UUID under Jest: a counter gives each intent its own key.
let keys = 0;
const newKey = () => `edit-lead-test-${++keys}`;
const as = (id: string) => {
  token = `mock.${id}.${Date.now() + 3_600_000}`;
};
const asOwner = () => as('usr_owner01');
const asManager = () => as('usr_mgr01');
const asStaff = () => as('usr_staff01');

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asStaff);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

const NOT_YOURS = 'You can only edit leads you found or that are assigned to you.';
const DUPLICATE = 'That email is already a lead. Find it in Leads and log the touch there.';

/** A lead the manager added: assigned to and found by the manager, so not staff's to edit. */
async function managersLead(name: string, email: string) {
  asManager();
  const lead = await createLead({ name, email }, newKey());
  asStaff();
  return lead;
}

describe('canEdit on the leads the API answers', () => {
  it('owners and managers on any lead; staff on a lead they found or that is assigned to them', async () => {
    // Assigned to Noah (staff).
    expect((await getLead(hexId('ld', 201))).canEdit).toBe(true);
    // A lead form owned by Maya (manager).
    expect((await getLead(hexId('ld', 213))).canEdit).toBe(false);
    // Noah found it, Shajeed took it over: still Noah's to edit.
    const handedOver = await getLead(hexId('ld', 802));
    expect(handedOver).toMatchObject({ foundBy: { email: 'staff@tekmadev.test' }, assignedTo: { email: 'owner@tekmadev.test' }, canEdit: true });
    asManager();
    expect((await getLead(hexId('ld', 213))).canEdit).toBe(true);
    expect((await getLead(hexId('ld', 100))).canEdit).toBe(true);
    asOwner();
    const page = await getLeads({ limit: 100 });
    expect(page.items.every((l) => l.canEdit === true)).toBe(true);
  });

  it('comes with POST /leads, PATCH /leads/:id and a logged touch, and follows the owner', async () => {
    const mine = await createLead({ name: 'Can Edit', phone: '905 555 0181' }, newKey());
    expect(mine.canEdit).toBe(true);
    expect((await logTouch(mine.id, { kind: 'call' }, newKey())).lead.canEdit).toBe(true);

    const theirs = await managersLead('Not Yet Mine', 'not.yet.mine@example.test');
    expect((await getLead(theirs.id)).canEdit).toBe(false);
    // Staff who take a lead may then edit it, and not once it is handed back.
    const taken = await updateLead(theirs.id, { assignedTo: 'staff@tekmadev.test' });
    expect(zLead.safeParse(taken).success).toBe(true);
    expect(taken.canEdit).toBe(true);
    expect((await updateLead(theirs.id, { assignedTo: 'manager@tekmadev.test' })).canEdit).toBe(false);
  });
});

describe('PATCH /leads/:id: the details', () => {
  it('edits them: trimmed, a cleared field as null, the email lowercased', async () => {
    const lead = await createLead({ name: 'Edit Me', business: 'Old Name Paving', email: 'edit.me@example.test', phone: '905 555 0182' }, newKey());
    const updated = await updateLead(lead.id, {
      name: '  Edit Me Again ',
      business: null,
      website: ' instagram.com/editme ',
      need: 'website',
      message: 'Met at the home show.\nCall after 4. ',
    });
    expect(zLead.safeParse(updated).success).toBe(true);
    expect(updated).toMatchObject({
      name: 'Edit Me Again',
      business: null,
      email: 'edit.me@example.test',
      website: 'instagram.com/editme',
      need: 'website',
      message: 'Met at the home show.\nCall after 4.',
      status: 'new',
      canEdit: true,
    });
    // The same lead in the list.
    expect(findLead(lead.id)?.name).toBe('Edit Me Again');

    // Its own email in another casing is not a change (and no 409); a new one is stored lowercased.
    expect((await updateLead(lead.id, { email: 'EDIT.ME@example.test' })).email).toBe('edit.me@example.test');
    expect((await updateLead(lead.id, { email: ' New.Address@Example.test ' })).email).toBe('new.address@example.test');
    // Blank clears: a lead with no email shows "".
    expect((await updateLead(lead.id, { email: '   ' })).email).toBe('');
    expect((await updateLead(lead.id, { need: null })).need).toBeNull();
  });

  it('keeps a name or a business, and an email or a phone, with the POST /leads codes and copy', async () => {
    const lead = await createLead({ name: 'Rule Check', email: 'rule.check@example.test' }, newKey());
    const name = await apiError(updateLead(lead.id, { name: null }));
    expect([name.status, name.code, name.message, name.fields]).toEqual([400, 'name', 'Enter a name or a business.', { name: 'Enter a name or a business.' }]);
    const email = await apiError(updateLead(lead.id, { email: '' }));
    expect([email.status, email.code, email.message, email.fields]).toEqual([
      400,
      'email',
      'Enter an email or a phone number.',
      { email: 'Enter an email or a phone number.' },
    ]);
    const both = await apiError(updateLead(lead.id, { name: ' ', email: null }));
    expect([both.code, both.message, both.fields]).toEqual([
      'name',
      'Enter a name or a business.',
      { name: 'Enter a name or a business.', email: 'Enter an email or a phone number.' },
    ]);
    expect(findLead(lead.id)).toMatchObject({ name: 'Rule Check', email: 'rule.check@example.test' });
    // A key not sent keeps what the lead shows: with a business, the name may go.
    await updateLead(lead.id, { business: 'Rule Check Roofing' });
    expect((await updateLead(lead.id, { name: null })).name).toBeNull();
  });

  it('answers 409 duplicate for another lead email, any casing, and writes nothing', async () => {
    const lead = await createLead({ name: 'Dupe Check', phone: '905 555 0183' }, newKey());
    const taken = leadsDb.find((l) => l.id !== lead.id && l.email)?.email ?? '';
    const e = await apiError(updateLead(lead.id, { name: 'Renamed', email: taken.toUpperCase() }));
    expect([e.status, e.code, e.message, e.fields]).toEqual([409, 'duplicate', DUPLICATE, { email: DUPLICATE }]);
    expect(findLead(lead.id)).toMatchObject({ name: 'Dupe Check', email: '' });
  });

  it('lets staff edit only their own leads: 403 with nothing written, while status stays open to them', async () => {
    const theirs = await managersLead('Maya Lead', 'maya.lead@example.test');
    const e = await apiError(updateLead(theirs.id, { name: 'Taken Over', status: 'contacted' }));
    // The client shows its own role copy for every 403 forbidden (the sheet says NOT_YOURS itself).
    expect([e.status, e.code, e.fields]).toEqual([403, 'forbidden', undefined]);
    // What the mock answers, like the server: the edit copy and no fields.
    const raw = await mockTransport({
      method: 'PATCH',
      path: `/leads/${theirs.id}`,
      body: { phone: '905 555 0199' },
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 10_000,
    });
    expect(raw).toEqual({ status: 403, body: { ok: false, error: { code: 'forbidden', message: NOT_YOURS } } });
    expect(findLead(theirs.id)).toMatchObject({ name: 'Maya Lead', status: 'new' });
    // Status, follow-up and owner keep their rule: any leads.update caller.
    expect((await updateLead(theirs.id, { status: 'contacted' })).status).toBe('contacted');
    // A lead Noah found but Shajeed owns now.
    expect((await updateLead(hexId('ld', 802), { phone: '905 555 0393' })).phone).toBe('905 555 0393');
    // Owners and managers edit any lead, whatever its source; a booked call keeps its status and booking.
    asOwner();
    const booked = findLead(hexId('ld', 100));
    const bookingAt = booked?.bookingAt;
    const edited = await updateLead(hexId('ld', 100), { phone: '613 555 0100', message: null });
    expect(edited).toMatchObject({ source: 'cal_booking', status: 'booked', bookingAt, phone: '613 555 0100', message: null });
  });

  it('checks in the server order: format, 404, 403, the two rules, the calendar, 409, the team', async () => {
    // Every format problem in one 400, the first as the code and message.
    const format = await apiError(api.patch(`/leads/${hexId('ld', 201)}`, { name: 'x'.repeat(121), phone: '12', need: 'nope' }));
    expect([format.status, format.code, format.message]).toEqual([400, 'name', 'Keep the name to 120 characters or fewer.']);
    expect(format.fields).toEqual({ name: 'Keep the name to 120 characters or fewer.', phone: 'Enter a valid phone number.', need: 'Unknown lead need.' });
    // The format before 404, 404 before 403.
    const badEmail = await apiError(updateLead('ld_nope', { email: 'not-an-email' }));
    expect([badEmail.status, badEmail.code, badEmail.message]).toEqual([400, 'email', 'Enter a valid email.']);
    const gone = await apiError(updateLead('ld_nope', { name: 'Ghost' }));
    expect([gone.status, gone.code, gone.message]).toEqual([404, 'not_found', 'That lead no longer exists.']);
    // 403 before the rules on the whole lead.
    const theirs = await managersLead('Order Check', 'order.check@example.test');
    expect((await apiError(updateLead(theirs.id, { name: null }))).status).toBe(403);

    asOwner();
    const calendar = leadsDb.find((l) => l.source === 'cal_booking' && l.status !== 'booked' && l.email);
    if (!calendar) throw new Error('no calendar lead to test with');
    const before = { name: calendar.name, email: calendar.email, status: calendar.status };
    const taken = leadsDb.find((l) => l.id !== calendar.id && l.email)?.email ?? '';
    // The two rules before the calendar's status.
    const rule = await apiError(updateLead(calendar.id, { name: null, business: null, status: 'booked' }));
    expect(rule.code).toBe('name');
    // The calendar's status before the duplicate.
    const status = await apiError(updateLead(calendar.id, { email: taken, status: 'booked' }));
    expect(status.code).toBe('status');
    // The duplicate before someone not on the team.
    const dupe = await apiError(updateLead(calendar.id, { email: taken, assignedTo: 'stranger@example.test' }));
    expect(dupe.code).toBe('duplicate');
    const team = await apiError(updateLead(calendar.id, { name: 'Fine', assignedTo: 'stranger@example.test' }));
    expect([team.code, team.fields]).toEqual(['assigned_to', { assignedTo: 'Pick someone on the team.' }]);
    // None of it was written.
    expect(findLead(calendar.id)).toMatchObject(before);
  });
});
