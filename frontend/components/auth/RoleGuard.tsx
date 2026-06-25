import React from 'react';

/**
 * RoleGuard + useRole — minimal RBAC façade (R1-4 of WEB_REMEDIATION_PLAN).
 *
 * Reads the role list from the cached profile in localStorage. This is a
 * pragmatic client-side gate; server endpoints remain the source of truth
 * for any privileged action.
 */

export type AppRole = 'user' | 'family_owner' | 'merchant' | 'developer' | 'admin';

const ROLE_KEY = 'user_roles';

function readRoles(): AppRole[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((r): r is AppRole => typeof r === 'string') as AppRole[];
    }
    // Fall back to inferring admin from the legacy admin-token presence.
    if (localStorage.getItem('admin_access_token')) return ['admin', 'user'];
    if (localStorage.getItem('access_token')) return ['user'];
  } catch {
    // ignore
  }
  return [];
}

export function useRole(): { roles: AppRole[]; has: (role: AppRole | AppRole[]) => boolean } {
  const [roles, setRoles] = React.useState<AppRole[]>(() => readRoles());
  React.useEffect(() => {
    setRoles(readRoles());
    const onStorage = (e: StorageEvent): void => {
      if (e.key === ROLE_KEY || e.key === 'access_token' || e.key === 'admin_access_token') {
        setRoles(readRoles());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const has = React.useCallback(
    (role: AppRole | AppRole[]): boolean => {
      const required = Array.isArray(role) ? role : [role];
      return required.some((r) => roles.includes(r));
    },
    [roles],
  );
  return { roles, has };
}

interface RoleGuardProps {
  role: AppRole | AppRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGuard({ role, fallback, children }: RoleGuardProps): React.ReactElement | null {
  const { has } = useRole();
  if (has(role)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return (
    <div style={{ padding: 24, color: '#9aa3b2', fontSize: 14 }}>
      该板块需要 <strong style={{ color: '#22D3FF' }}>{Array.isArray(role) ? role.join(' / ') : role}</strong> 角色权限。
    </div>
  );
}

export default RoleGuard;
