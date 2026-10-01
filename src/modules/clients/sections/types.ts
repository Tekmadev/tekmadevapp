import type { ClientBundle } from '@/api/schemas/clients';
import type { ClientSection } from '@/lib/deeplinks';

/**
 * Props every Client detail section receives from the screen shell.
 * The shell owns the bundle query (GET /clients/:id); sections run their own
 * mutations and invalidate clientQuery(clientId) (or update it with the
 * returned entity) when they change something.
 */
export type SectionProps = {
  clientId: string;
  bundle: ClientBundle;
  isOwner: boolean;
  /** One-shot action from the route (e.g. 'log-call' opens the Log a booked call sheet). */
  action?: string;
  /** Called once the section has handled `action`, so it is not replayed. */
  onActionHandled?: () => void;
};

export type SectionId = ClientSection;
