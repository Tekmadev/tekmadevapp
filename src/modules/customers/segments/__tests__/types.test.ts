import { can, type Capability } from '@/auth/capabilities';
import type { Role } from '@/api/types';

import { CUSTOMER_SEGMENTS, SEGMENT_LABELS, toSegment, visibleSegments } from '../types';

const as = (role: Role) => (cap: Capability) => can(role, cap);

describe('Customers sections by role (owner decision 2026-10-03)', () => {
  it('shows Subscriptions only with billing.view and Free tools only with tools.view', () => {
    expect(visibleSegments(as('owner'))).toEqual(['clients', 'leads', 'demos', 'tools', 'subscriptions']);
    expect(visibleSegments(as('manager'))).toEqual(['clients', 'leads', 'demos', 'tools', 'subscriptions']);
    expect(visibleSegments(as('staff'))).toEqual(['clients', 'leads', 'demos', 'tools']);
    const noTools = { role: 'manager' as const, capabilities: ['clients.view', 'leads.view', 'billing.view'] };
    expect(visibleSegments((cap) => can(noTools, cap))).toEqual(['clients', 'leads', 'subscriptions']);
  });

  it('puts Demos right after Leads, for anyone with demos.view (2026-10-05)', () => {
    expect(SEGMENT_LABELS.demos).toBe('Demos');
    const demosOnly = { role: 'staff' as const, capabilities: ['leads.view', 'demos.view'] };
    expect(visibleSegments((cap) => can(demosOnly, cap))).toEqual(['leads', 'demos']);
    expect(toSegment('demos', visibleSegments(as('staff')))).toBe('demos');
    expect(toSegment('demos', ['clients', 'leads'])).toBe('clients');
  });

  it('opens the asked section only when it is visible, else the first visible one', () => {
    const staff = visibleSegments(as('staff'));
    expect(toSegment('leads', staff)).toBe('leads');
    // An old link to Subscriptions opens Clients for staff.
    expect(toSegment('subscriptions', staff)).toBe('clients');
    expect(toSegment('subscriptions', CUSTOMER_SEGMENTS)).toBe('subscriptions');
    expect(toSegment('nope', staff)).toBe('clients');
    expect(toSegment(undefined)).toBe('clients');
    expect(toSegment('tools', ['leads', 'tools'])).toBe('tools');
    expect(toSegment('clients', ['leads', 'tools'])).toBe('leads');
    expect(toSegment('clients', [])).toBe('clients');
  });
});
