import { APP_URL } from '../config/env';

/**
 * Web handoff targets — MTR-R09.5 (matrix #38): the full Workflow editor is a
 * Web responsibility. Mobile does not host an editor; it hands the user to the
 * Web page. Pure URL builders only (no react-native import) so the mapping
 * stays inside the root jest range (M0.0.5 option b).
 *
 * The path mirrors `frontend/pages/console/developer/workflows.tsx`.
 */
export const WORKFLOW_EDITOR_WEB_PATH = '/console/developer/workflows';

function joinWebUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}

/** Absolute URL of the Web Workflow editor for the current environment. */
export function getWorkflowEditorWebUrl(baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, WORKFLOW_EDITOR_WEB_PATH);
}

/**
 * "Bring it home" (Agent import / portability). Matrix row 17 + unified-ux
 * §2.5 / §5.3: only the canonical Web writer scans, plans and commits an
 * import; Mobile is Consent / light review. Until the high-impact
 * confirmations join the Work queue, the phone only opens the one Web
 * entrance (`UnifiedStudio` reads `router.query.panel === 'bring'`).
 */
export const BRING_HOME_WEB_PATH = '/workbench?panel=bring';

export function getBringHomeWebUrl(baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, BRING_HOME_WEB_PATH);
}

/**
 * Agent Passport editing (persona draft / confirm, theme, share grants) is
 * Web-only (integration note §2, §6); Mobile renders the same card read-only
 * and hands the owner here to change it.
 */
export const PASSPORT_EDITOR_WEB_PATH = '/workbench?panel=passport';

export function getPassportEditorWebUrl(baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, PASSPORT_EDITOR_WEB_PATH);
}

/**
 * "My AI twin" (M5.1.1 entrance only, `mobile.twin_surface`). DT-R23 /
 * V7 M5 preface: Web responsive is the primary path for verification,
 * recording, step-up, review and Twin Stop until the identity / body
 * providers are chosen; the phone opens the owner's Web Creator surface
 * (`frontend/pages/agents/[agentId]/twin`), keyed by the account id like the
 * Web console link.
 */
export function getTwinWebPath(agentAccountId: string): string {
  return `/agents/${encodeURIComponent(agentAccountId)}/twin`;
}

export function getTwinWebUrl(agentAccountId: string, baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, getTwinWebPath(agentAccountId));
}
