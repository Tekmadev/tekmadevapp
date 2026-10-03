import {
  channelIdFor,
  deviceLabel,
  foregroundBehavior,
  needsRegistration,
  parsePushPayload,
  parseRegistration,
  permissionAction,
  PUSH_CHANNELS,
  pushRoute,
  registrationIsCurrent,
  registrationSignature,
  rememberTap,
  REREGISTER_AFTER_MS,
  responseKey,
  retriesWhenOnline,
  rowIdOf,
  SETUP_MESSAGES,
  shouldOfferPush,
  toastMessage,
  toastTone,
  tokenErrorMessage,
  type PushRegistration,
} from '../logic';

describe('channels', () => {
  it('picks the category channel, or its critical variant', () => {
    expect(channelIdFor('leads', 'info')).toBe('leads');
    expect(channelIdFor('leads', 'success')).toBe('leads');
    expect(channelIdFor('billing', 'warning')).toBe('billing');
    expect(channelIdFor('billing', 'critical')).toBe('billing-critical');
  });

  it('has one channel per category plus a critical variant each, with unique ids', () => {
    expect(PUSH_CHANNELS).toHaveLength(14);
    expect(new Set(PUSH_CHANNELS.map((c) => c.id)).size).toBe(14);
    expect(PUSH_CHANNELS.filter((c) => c.critical).map((c) => c.id)).toEqual([
      'leads-critical',
      'sales-critical',
      'billing-critical',
      'clients-critical',
      'audience-critical',
      'team-critical',
      'system-critical',
    ]);
    expect(PUSH_CHANNELS[0]).toMatchObject({ id: 'leads', name: 'Leads', critical: false });
    expect(PUSH_CHANNELS[1]).toMatchObject({ id: 'leads-critical', name: 'Leads (critical)', critical: true });
  });

  it('every channel a payload can pick exists', () => {
    const ids = new Set(PUSH_CHANNELS.map((c) => c.id));
    for (const c of PUSH_CHANNELS) {
      expect(ids.has(channelIdFor(c.category, 'info'))).toBe(true);
      expect(ids.has(channelIdFor(c.category, 'critical'))).toBe(true);
    }
  });
});

describe('parsePushPayload', () => {
  it('reads the brief payload', () => {
    expect(parsePushPayload({ notificationId: 'ntf_1', url: '/admin/leads', category: 'leads', severity: 'success' })).toEqual({
      notificationId: 'ntf_1',
      url: '/admin/leads',
      category: 'leads',
      severity: 'success',
    });
  });

  it('treats empty and missing links as none, and trims', () => {
    expect(parsePushPayload({ notificationId: ' ntf_2 ', url: '', category: 'sales', severity: 'info' })).toMatchObject({
      notificationId: 'ntf_2',
      url: null,
    });
    expect(parsePushPayload({ notificationId: 'ntf_3', category: 'sales', severity: 'info' })?.url).toBeNull();
    expect(parsePushPayload({ notificationId: 'ntf_3', url: null, category: 'sales', severity: 'info' })?.url).toBeNull();
  });

  it('falls back for unknown categories and severities', () => {
    expect(parsePushPayload({ notificationId: 'x', category: 'automations', severity: 'loud' })).toMatchObject({
      category: 'system',
      severity: 'info',
    });
  });

  it('accepts a numeric id', () => {
    expect(parsePushPayload({ notificationId: 42 })?.notificationId).toBe('42');
  });

  it('ignores what is not ours', () => {
    expect(parsePushPayload(undefined)).toBeNull();
    expect(parsePushPayload(null)).toBeNull();
    expect(parsePushPayload('ntf_1')).toBeNull();
    expect(parsePushPayload([])).toBeNull();
    expect(parsePushPayload({ category: 'leads' })).toBeNull();
  });

  it('keeps a link without an id', () => {
    expect(parsePushPayload({ url: '/admin/clients' })).toEqual({ notificationId: null, url: '/admin/clients', category: 'system', severity: 'info' });
  });
});

describe('rowIdOf', () => {
  it('has no row for a test push or a missing id', () => {
    expect(rowIdOf({ notificationId: 'test', url: null, category: 'system', severity: 'info' })).toBeNull();
    expect(rowIdOf({ notificationId: null, url: '/admin', category: 'system', severity: 'info' })).toBeNull();
    expect(rowIdOf({ notificationId: 'ntf_9', url: null, category: 'system', severity: 'info' })).toBe('ntf_9');
  });
});

describe('pushRoute', () => {
  const base = { notificationId: 'ntf_1', category: 'clients', severity: 'info' } as const;

  it('opens the mapped screen', () => {
    expect(pushRoute({ ...base, url: '/admin/clients/c_1#calls' }, 'owner')).toEqual({
      kind: 'screen',
      link: { pathname: '/clients/[id]', params: { id: 'c_1', section: 'calls' } },
    });
    expect(pushRoute({ ...base, url: '/admin/leads' }, 'manager')).toEqual({
      kind: 'screen',
      link: { pathname: '/customers', params: { segment: 'leads' } },
    });
  });

  it('opens the Inbox with the detail sheet when there is no link', () => {
    expect(pushRoute({ ...base, url: null }, 'owner')).toEqual({ kind: 'inbox', link: { pathname: '/inbox' }, detailId: 'ntf_1' });
  });

  it('opens the Inbox with the detail sheet for an owner-only link sent to a manager', () => {
    expect(pushRoute({ ...base, url: '/admin/pricing' }, 'manager')).toEqual({ kind: 'inbox', link: { pathname: '/inbox' }, detailId: 'ntf_1' });
    expect(pushRoute({ ...base, url: '/admin/pricing' }, 'owner').kind).toBe('screen');
  });

  it('keeps the Inbox filter and has no detail for a test push', () => {
    expect(pushRoute({ notificationId: 'test', url: '/admin/notifications?filter=action', category: 'system', severity: 'info' }, 'owner')).toEqual({
      kind: 'inbox',
      link: { pathname: '/inbox', params: { filter: 'action' } },
      detailId: null,
    });
  });

  it('sends unknown links to the Inbox', () => {
    expect(pushRoute({ ...base, url: 'https://evil.example/admin' }, 'owner')).toMatchObject({ kind: 'inbox', detailId: 'ntf_1' });
  });
});

describe('responseKey', () => {
  it('differs for a bump of the same notification', () => {
    expect(responseKey('ntf_1', 1000, 'tap')).not.toBe(responseKey('ntf_1', 2000, 'tap'));
    expect(responseKey('ntf_1', 1000, 'tap')).toBe(responseKey('ntf_1', 1000, 'tap'));
  });
});

describe('rememberTap', () => {
  it('keeps the newest keys last, without repeats, up to the limit', () => {
    expect(rememberTap([], 'a')).toEqual(['a']);
    expect(rememberTap(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(rememberTap(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    expect(rememberTap(Array.from({ length: 40 }, (_, i) => `k${i}`), 'new')).toHaveLength(30);
  });
});

describe('foreground', () => {
  it('shows a toast instead of the system notification', () => {
    expect(foregroundBehavior({ locked: false, localTest: false })).toEqual({ system: false, toast: true });
  });

  it('lets the system show it while the app is locked', () => {
    expect(foregroundBehavior({ locked: true, localTest: false })).toEqual({ system: true, toast: false });
    expect(foregroundBehavior({ locked: true, localTest: true })).toEqual({ system: true, toast: false });
  });

  it('shows both for the local test', () => {
    expect(foregroundBehavior({ locked: false, localTest: true })).toEqual({ system: true, toast: true });
  });

  it('writes the toast from title and body', () => {
    expect(toastMessage('New lead', 'Jane from Acme')).toBe('New lead\nJane from Acme');
    expect(toastMessage('New lead', '  ')).toBe('New lead');
    expect(toastMessage(null, 'Body only')).toBe('Body only');
    expect(toastMessage(undefined, null)).toBe('New notification');
  });

  it('uses the error toast for critical pushes only', () => {
    expect(toastTone('critical')).toBe('err');
    expect(toastTone('warning')).toBe('ok');
    expect(toastTone('info')).toBe('ok');
  });
});

describe('permission', () => {
  it('asks while the system still asks, else opens settings', () => {
    expect(permissionAction({ status: 'granted', canAskAgain: true })).toBe('none');
    expect(permissionAction({ status: 'undetermined', canAskAgain: true })).toBe('ask');
    expect(permissionAction({ status: 'denied', canAskAgain: true })).toBe('ask');
    expect(permissionAction({ status: 'denied', canAskAgain: false })).toBe('settings');
  });

  const calm = {
    freshSignIn: true,
    offered: false,
    justSignedIn: false,
    locked: false,
    sheetOpen: false,
    permission: { status: 'undetermined', canAskAgain: true },
  } as const;

  it('offers once, right after a sign-in, at a calm moment', () => {
    expect(shouldOfferPush(calm)).toBe(true);
    expect(shouldOfferPush({ ...calm, freshSignIn: false })).toBe(false);
    expect(shouldOfferPush({ ...calm, offered: true })).toBe(false);
    expect(shouldOfferPush({ ...calm, justSignedIn: true })).toBe(false);
    expect(shouldOfferPush({ ...calm, locked: true })).toBe(false);
    expect(shouldOfferPush({ ...calm, sheetOpen: true })).toBe(false);
  });

  it('offers while the system would still ask (Android 13 reads "denied" before the first prompt)', () => {
    expect(shouldOfferPush({ ...calm, permission: { status: 'denied', canAskAgain: true } })).toBe(true);
  });

  it('does not offer when the answer is already known', () => {
    expect(shouldOfferPush({ ...calm, permission: null })).toBe(false);
    expect(shouldOfferPush({ ...calm, permission: { status: 'granted', canAskAgain: true } })).toBe(false);
    expect(shouldOfferPush({ ...calm, permission: { status: 'denied', canAskAgain: false } })).toBe(false);
    expect(shouldOfferPush({ ...calm, permission: { status: 'undetermined', canAskAgain: false } })).toBe(false);
  });
});

describe('registration', () => {
  const now = 1_800_000_000_000;
  const record: PushRegistration = {
    deviceId: 'dev_1',
    token: 'ExponentPushToken[abc]',
    userId: 'usr_1',
    appVersion: '0.2.0',
    platform: 'android',
    registeredAt: now - 1000,
  };
  const current = { userId: 'usr_1', appVersion: '0.2.0', platform: 'android', now };

  it('is current for the same person, version and platform within a week', () => {
    expect(registrationIsCurrent(record, current)).toBe(true);
    expect(registrationIsCurrent(null, current)).toBe(false);
    expect(registrationIsCurrent(record, { ...current, userId: 'usr_2' })).toBe(false);
    expect(registrationIsCurrent(record, { ...current, appVersion: '0.3.0' })).toBe(false);
    expect(registrationIsCurrent(record, { ...current, platform: 'ios' })).toBe(false);
    expect(registrationIsCurrent({ ...record, registeredAt: now - REREGISTER_AFTER_MS }, current)).toBe(false);
    // The clock moved backwards: register again.
    expect(registrationIsCurrent({ ...record, registeredAt: now + 60_000 }, current)).toBe(false);
  });

  it('needs POST /devices when the token changed', () => {
    expect(needsRegistration(record, { ...current, token: 'ExponentPushToken[abc]' })).toBe(false);
    expect(needsRegistration(record, { ...current, token: 'ExponentPushToken[new]' })).toBe(true);
    expect(needsRegistration(null, { ...current, token: 'ExponentPushToken[abc]' })).toBe(true);
  });

  it('keys an intent by person, token, version and platform', () => {
    const a = registrationSignature({ userId: 'u', token: 't', appVersion: '1', platform: 'android' });
    expect(a).toBe(registrationSignature({ userId: 'u', token: 't', appVersion: '1', platform: 'android' }));
    expect(a).not.toBe(registrationSignature({ userId: 'u', token: 't2', appVersion: '1', platform: 'android' }));
  });

  it('reads only a complete stored record', () => {
    expect(parseRegistration(record)).toEqual(record);
    expect(parseRegistration({ ...record, deviceId: '' })).toBeNull();
    expect(parseRegistration({ ...record, registeredAt: 'yesterday' })).toBeNull();
    expect(parseRegistration(null)).toBeNull();
    expect(parseRegistration('dev_1')).toBeNull();
  });

  it('names the device by its own name, else its model, within 80 characters', () => {
    expect(deviceLabel('Shop phone', 'Pixel 9')).toBe('Shop phone');
    expect(deviceLabel('  ', 'Pixel 9')).toBe('Pixel 9');
    expect(deviceLabel(null, null)).toBe('');
    expect(deviceLabel('x'.repeat(100), null)).toHaveLength(80);
  });
});

describe('tokenErrorMessage', () => {
  const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

  it('says offline plainly when there is no connection', () => {
    expect(tokenErrorMessage(coded('E_REGISTRATION_FAILED', 'SERVICE_NOT_AVAILABLE'), false)).toEqual({
      message: SETUP_MESSAGES.offline,
      detail: null,
    });
  });

  it('maps the known codes and keeps the technical reason as detail', () => {
    expect(tokenErrorMessage(coded('E_REGISTRATION_FAILED', 'Fetching the token failed: SERVICE_NOT_AVAILABLE'), true)).toEqual({
      message: SETUP_MESSAGES.token,
      detail: 'Fetching the token failed: SERVICE_NOT_AVAILABLE',
    });
    expect(tokenErrorMessage(coded('ERR_NOTIFICATIONS_NETWORK_ERROR', 'x'), true).message).toBe(SETUP_MESSAGES.network);
    expect(tokenErrorMessage(coded('ERR_NOTIFICATIONS_SERVER_ERROR', 'x'), true).message).toBe(SETUP_MESSAGES.service);
    expect(tokenErrorMessage(coded('ERR_NOTIFICATIONS_NO_EXPERIENCE_ID', 'x'), true).message).toBe(SETUP_MESSAGES.project);
    expect(tokenErrorMessage(new Error('boom'), true)).toEqual({ message: SETUP_MESSAGES.generic, detail: 'boom' });
    expect(tokenErrorMessage('weird', true)).toEqual({ message: SETUP_MESSAGES.generic, detail: 'weird' });
  });

  it('shortens a long reason', () => {
    const detail = tokenErrorMessage(new Error('a'.repeat(400)), true).detail ?? '';
    expect(Array.from(detail)).toHaveLength(160);
  });

  it('retries by itself only for connection problems', () => {
    expect(retriesWhenOnline({ message: SETUP_MESSAGES.offline, detail: null })).toBe(true);
    expect(retriesWhenOnline({ message: SETUP_MESSAGES.network, detail: null })).toBe(true);
    expect(retriesWhenOnline({ message: SETUP_MESSAGES.token, detail: null })).toBe(false);
    expect(retriesWhenOnline(null)).toBe(false);
  });
});
