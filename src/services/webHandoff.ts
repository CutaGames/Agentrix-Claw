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
