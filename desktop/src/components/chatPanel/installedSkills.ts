/** Installed skills of an OpenClaw instance, cached 60 s per instance (moved out of ChatPanelImpl.tsx unchanged). */
import { API_BASE, apiFetch } from "../../services/store";

// Tiny TTL cache so we don't re-hit /openclaw/proxy/:id/skills on every turn.
// Keyed by instance id; cleared every 60s.
const _installedSkillsCache: Map<string, { at: number; skills: Array<{ id?: string; name?: string; version?: string }> }> = new Map();
const INSTALLED_SKILLS_TTL_MS = 60_000;

export async function fetchInstalledSkillsCached(
  instanceId: string,
  token: string,
): Promise<Array<{ id?: string; name?: string; version?: string }> | null> {
  if (!instanceId || !token) return null;
  const hit = _installedSkillsCache.get(instanceId);
  const now = Date.now();
  if (hit && now - hit.at < INSTALLED_SKILLS_TTL_MS) return hit.skills;
  try {
    const res = await apiFetch(`${API_BASE}/openclaw/proxy/${instanceId}/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return hit?.skills || null;
    const data = await res.json();
    const enabled = (Array.isArray(data) ? data : []).filter((s: any) => s.enabled !== false);
    const mapped = enabled.map((s: any) => ({ id: s.id, name: s.name, version: s.version }));
    _installedSkillsCache.set(instanceId, { at: now, skills: mapped });
    return mapped;
  } catch {
    return hit?.skills || null;
  }
}
