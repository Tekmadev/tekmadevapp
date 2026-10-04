import type { ReactNode } from 'react';

import { MESSAGES } from '@/api/errors';

import { useLeaveWhenBlocked } from './RequireCapability';
import { useRole } from './session';

export { RequireCapability, type RequireCapabilityProps } from './RequireCapability';

/**
 * @deprecated Screens are gated by capability now: wrap them in
 * `<RequireCapability cap="...">` (src/auth/RequireCapability.tsx). Kept, with
 * the same behaviour, for screens that only an owner may ever open and for
 * screens not moved over yet: anyone else gets "That section is owner only."
 * and is sent back. Renders nothing until the role is known to be owner.
 */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const role = useRole();
  useLeaveWhenBlocked(role !== null && role !== 'owner', MESSAGES.ownerOnly);
  if (role !== 'owner') return null;
  return <>{children}</>;
}
