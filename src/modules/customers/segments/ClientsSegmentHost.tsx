import { router } from 'expo-router';

import type { ClientRow } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { ClientsSegment } from '@/modules/clients/ClientsSegment';
import { toClientsView, type ClientsView } from '@/modules/clients/list/views';
import { LogCallPicker } from '@/modules/clients/LogCallPicker';

import type { SegmentProps } from './types';

const setView = (view: ClientsView | null) => router.setParams({ view: view ?? undefined });
const closePicker = () => router.setParams({ action: undefined });

/** Clear the one-shot action on this (still focused) route first, then open the client's Calls with the log sheet. */
const pickClient = (client: ClientRow) => {
  closePicker();
  router.push({ pathname: '/clients/[id]', params: { id: client.id, section: 'calls', action: 'log-call' } });
};

/**
 * The Clients segment, wired to the Customers route: `view` (Home's "Needs you"
 * quick filter) and `action=log-call` (the "Log a booked call" quick action,
 * which asks for the client first). Both live in the URL, so the picker state
 * is derived from it and closing just clears the param.
 */
export function ClientsSegmentHost({ chrome, params }: SegmentProps) {
  // The quick action is offered only with clients.calls.log; an old link without it just shows the list.
  const canLogCall = useCan('clients.calls.log');
  return (
    <>
      <ClientsSegment chrome={chrome} view={toClientsView(params.view)} onViewChange={setView} />
      <LogCallPicker visible={canLogCall && params.action === 'log-call'} onClose={closePicker} onPick={pickClient} />
    </>
  );
}
