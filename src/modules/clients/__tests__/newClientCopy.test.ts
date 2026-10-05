import { CREATOR_CREDIT_HINT, FROM_LEAD_NOTE, newClientNotes, REUSE_NOTE } from '../newClientCopy';

describe('New client credit lines (owner decision 2026-10-05)', () => {
  it('tells whoever adds a client by hand that the credit is theirs', () => {
    expect(newClientNotes(false)).toEqual({ note: REUSE_NOTE, creditHint: 'You get the credit for this client.' });
    expect(CREATOR_CREDIT_HINT).toBe('You get the credit for this client.');
  });

  it("keeps the lead's finder and booker line from a lead, with no creator hint", () => {
    const notes = newClientNotes(true);
    expect(notes.creditHint).toBeNull();
    expect(notes.note).toBe(`${FROM_LEAD_NOTE} ${REUSE_NOTE}`);
    expect(notes.note).toContain('the people who found it and booked the call get credit');
  });
});
