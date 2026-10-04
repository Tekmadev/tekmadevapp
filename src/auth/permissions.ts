import { useSession } from './session';
import { can, canAll, canAny, capabilitiesOf, type Capability } from './capabilities';

/**
 * Permissions for screens and components. Everything in capabilities.ts is
 * re-exported here, so app code imports from '@/auth/permissions' only.
 *
 *   const canWrite = useCan('blog.write');
 *   const seesMoney = useCanAny('clients.billing', 'billing.view');
 *   <RequireCapability cap="team.view">...</RequireCapability>   (src/auth/RequireCapability.tsx)
 *
 * Hiding is a courtesy: the server enforces every capability with a 403.
 */

export {
  CAPABILITIES,
  CAPABILITY_ROLES,
  FORBIDDEN_MESSAGE,
  ROLE_CAPABILITIES,
  ROLE_COPY,
  ROLES,
  can,
  canAll,
  canAny,
  capabilitiesOf,
  deniedMessage,
  isCapability,
  isOwnerOnlyCapability,
  roleCopy,
  type Capability,
  type CapabilityHolder,
  type CapabilitySource,
} from './capabilities';

/** The signed-in person's capabilities (empty when signed out). Stable for the same profile. */
export function useCapabilities(): readonly Capability[] {
  return useSession((s) => capabilitiesOf(s.me));
}

/** Whether the signed-in person holds a capability (false while signed out). */
export function useCan(cap: Capability): boolean {
  return useSession((s) => can(s.me, cap));
}

/** Whether the signed-in person holds at least one of these capabilities. */
export function useCanAny(...caps: Capability[]): boolean {
  return useSession((s) => canAny(s.me, ...caps));
}

/** Whether the signed-in person holds every one of these capabilities. */
export function useCanAll(...caps: Capability[]): boolean {
  return useSession((s) => canAll(s.me, ...caps));
}

/** Outside React (stores, event handlers that run later): whether the signed-in person holds a capability now. */
export function canNow(cap: Capability): boolean {
  return can(useSession.getState().me, cap);
}
