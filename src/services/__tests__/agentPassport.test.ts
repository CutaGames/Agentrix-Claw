/**
 * Agent Passport v4 on Mobile — secondary / view-only renderer
 * (`docs/alignment/agent-passport-v4-cross-platform-integration-2026-09-16.md`
 * §3 / §5.4): same projection ⇒ same six stamps, same `AGX-` number, same
 * hero as Web; share = the Web public page with the `agentRef` slug; no
 * writes from the phone. The Web pages the handoffs point at
 * (`/workbench?panel=bring|passport`, `/agents/:id/twin`, `/share/agent/:ref`)
 * live on integration (T `e56c9edd6`), not on this branch's stale
 * `frontend/`, so their existence is checked there by hand, not here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { HttpTransportV1 } from "../../../shared/client";
import {
  PASSPORT_FACT_ORDER,
  buildAgentPassportCard,
  decodePassportShare,
  type PublicPassportShareV3,
} from "../../../shared/types/agent-passport-card";
import {
  passportNumber,
  type AgentPassportProjectionV1,
} from "../../../shared/types/agent-passport";
import {
  AGENT_PASSPORT_CAPABILITY,
  agentPassportPath,
  buildMobileAgentPassportCard,
  fetchAgentPassportProjection,
  getAgentPassportShareText,
  getAgentPassportShareUrl,
  normalizeAgentPassportProjection,
  passportShareSlug,
  unavailablePassportCredentialsOwner,
} from "../agentPassport";
import {
  BRING_HOME_WEB_PATH,
  PASSPORT_EDITOR_WEB_PATH,
  getBringHomeWebUrl,
  getPassportEditorWebUrl,
  getTwinWebPath,
  getTwinWebUrl,
} from "../webHandoff";

const ROOT = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const ACCOUNT_ID = "75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a";
const AGENT_REF = "AGT-1789570903709-0bp0l1i7";

/** One owner projection, exactly as `GET /agent-accounts/:id/passport` returns it (slice 1–2 shape, no credentials block yet). */
const FIXTURE: AgentPassportProjectionV1 = {
  schemaVersion: 1,
  agentAccountId: ACCOUNT_ID,
  agentRef: AGENT_REF,
  name: "QA Agent",
  issuedOn: "2026-09-01",
  description: null,
  persona: {
    status: "confirmed",
    tagline: "替你盯审批的助手",
    tags: ["审批", "回执"],
    source: "owner",
  },
  skills: {
    state: "available",
    items: [
      { id: "s1", name: "Review approvals" },
      { id: "s2", name: "Write receipts" },
    ],
    total: 5,
  },
  track: {
    state: "available",
    tasksCompleted: 12,
    partners: 3,
    since: "2026-08-22",
    tasksBucket: 10,
    partnersBucket: 1,
  },
  authority: { approvalRequired: true, limits: { daily: 20, currency: "USDC" } },
  credentials: unavailablePassportCredentialsOwner(),
};

function transportReturning(status: number, body: unknown): HttpTransportV1 & { calls: Array<{ path: string; headers?: Record<string, string> }> } {
  const calls: Array<{ path: string; headers?: Record<string, string> }> = [];
  return {
    calls,
    async request(request) {
      calls.push({ path: request.path, headers: request.headers });
      return { status, headers: {}, body };
    },
  };
}

describe("agentPassport — projection intake", () => {
  it("addresses the owner projection by account id", () => {
    expect(agentPassportPath("a b/c")).toBe("/agent-accounts/a%20b%2Fc/passport");
  });

  it("reads the {success, data} envelope and a bare projection alike", () => {
    expect(normalizeAgentPassportProjection({ success: true, data: FIXTURE })).toEqual(FIXTURE);
    expect(normalizeAgentPassportProjection(FIXTURE)).toEqual(FIXTURE);
  });

  it("treats a missing credentials block (pre-3.1 backend) as unavailable, never as zero verified", () => {
    const { credentials: _omitted, ...withoutCredentials } = FIXTURE;
    const projection = normalizeAgentPassportProjection({ success: true, data: withoutCredentials });
    expect(projection?.credentials).toEqual(unavailablePassportCredentialsOwner());
    expect(projection?.credentials.state).toBe("unavailable");
  });

  it("refuses payloads that are not a v1 projection", () => {
    expect(normalizeAgentPassportProjection(null)).toBeNull();
    expect(normalizeAgentPassportProjection("AGX-0000-0000")).toBeNull();
    expect(normalizeAgentPassportProjection({ success: true, data: {} })).toBeNull();
    expect(normalizeAgentPassportProjection({ ...FIXTURE, schemaVersion: 2 })).toBeNull();
    expect(normalizeAgentPassportProjection({ ...FIXTURE, agentRef: "" })).toBeNull();
    expect(normalizeAgentPassportProjection({ ...FIXTURE, persona: null })).toBeNull();
  });
});

describe("agentPassport — the phone prints the same card as Web (§3.2, §5.4)", () => {
  it("yields word-for-word the same six stamps, number and hero as the shared builder on the same projection", () => {
    const mobile = buildMobileAgentPassportCard({
      name: "directory name is ignored when the projection is readable",
      agentAccountId: ACCOUNT_ID,
      passport: FIXTURE,
    });
    const web = buildAgentPassportCard({
      name: FIXTURE.name,
      agentAccountId: ACCOUNT_ID,
      passport: FIXTURE,
      calendarConnected: null,
      deviceCount: null,
    });
    expect(mobile.facts).toEqual(web.facts);
    expect(mobile.number).toBe(web.number);
    expect(mobile.hero).toEqual(web.hero);
    expect(mobile.stage).toEqual(web.stage);
    expect(mobile.share).toEqual(web.share);
    expect(mobile.name).toBe("QA Agent");
  });

  it("derives the number from the account id hash and keeps the fact order of the shared contract", () => {
    const card = buildMobileAgentPassportCard({ name: "", agentAccountId: ACCOUNT_ID, passport: FIXTURE });
    expect(card.number).toBe(passportNumber(ACCOUNT_ID));
    expect(card.number).toMatch(/^AGX-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(card.facts.map((fact) => fact.id)).toEqual([...PASSPORT_FACT_ORDER]);
  });

  it("prints the contract's own words for every stamp", () => {
    const card = buildMobileAgentPassportCard({ name: "", agentAccountId: ACCOUNT_ID, passport: FIXTURE });
    const byId = Object.fromEntries(card.facts.map((fact) => [fact.id, fact]));
    // The owner-confirmed introduction wins the hero line and the persona stamp.
    expect(card.hero.zh).toBe("替你盯审批的助手");
    expect(byId.persona.value.zh).toBe("替你盯审批的助手");
    expect(byId.persona.why.zh).toBe("审批 · 回执");
    expect(byId.persona.tone).toBe("ready");
    // Three names max, "+N" for the rest of `total`; no calendar / devices on the phone.
    expect(byId.skills.value.en).toBe("Review approvals · Write receipts (+3)");
    expect(byId.skills.tone).toBe("ready");
    // Public ranges only, never 12 / 3.
    expect(byId.track.value.zh).toBe("10+ 单 · 1–9 个伙伴 · 2026-08 起");
    expect(byId.track.value.zh).not.toContain("12");
    // Authority floor from the projection's own limits.
    expect(byId.authority.value.zh).toBe("花钱先问主人 · 每天最多 20 USDC");
    expect(byId.identity.value.zh).toBe("2026-09-01 在 Agentrix 安家");
    // Mobile has no vault / experience projection → recovery stays unconfirmed, not a claim.
    expect(byId.recovery.tone).toBe("unknown");
    expect(byId.recovery.value.zh).toBe("恢复尚未确认，可随时带走");
    expect(card.readyCount).toBe(5);
    expect(card.stage.zh).toBe("家已成形");
  });

  it("says 'unconfirmed' — not 'nothing' — when the projection is not readable", () => {
    const card = buildMobileAgentPassportCard({ name: "QA Agent", agentAccountId: ACCOUNT_ID, passport: null });
    const byId = Object.fromEntries(card.facts.map((fact) => [fact.id, fact]));
    expect(card.name).toBe("QA Agent");
    expect(card.number).toBe(passportNumber(ACCOUNT_ID));
    expect(byId.persona.value.zh).toBe("自我介绍尚未确认");
    expect(byId.skills.value.zh).toBe("技能尚未确认");
    expect(byId.track.value.zh).toBe("履历尚未确认");
    expect(byId.skills.tone).toBe("unknown");
    expect(byId.track.tone).toBe("unknown");
    // A directory-named agent is still "at home"; nothing else is stamped.
    expect(byId.identity.tone).toBe("ready");
    expect(card.readyCount).toBe(2);
  });
});

describe("agentPassport — share link (§3.3, R7)", () => {
  const card = buildMobileAgentPassportCard({ name: "", agentAccountId: ACCOUNT_ID, passport: FIXTURE });

  it("uses the agentRef slug on the Web public page and carries the v3 payload", () => {
    const url = getAgentPassportShareUrl(card, FIXTURE.agentRef, "https://www.agentrix.top/");
    expect(url.startsWith(`https://www.agentrix.top/share/agent/${AGENT_REF}?c=`)).toBe(true);
    const encoded = url.split("?c=")[1];
    const share = decodePassportShare(encoded) as PublicPassportShareV3;
    expect(share.v).toBe(3);
    expect(share.name).toBe("QA Agent");
    expect(share.n).toBe(card.number);
    expect(share.p).toEqual({ t: "替你盯审批的助手", g: ["审批", "回执"] });
    expect(share.sk).toEqual(["Review approvals", "Write receipts"]);
    expect(share.sm).toBe(3);
    expect(share.tr).toEqual({ c: 10, p: 1, s: "2026-08" });
  });

  it("never lets the account UUID or exact counts into the public URL", () => {
    const url = getAgentPassportShareUrl(card, FIXTURE.agentRef, "https://www.agentrix.top");
    expect(url).not.toContain(ACCOUNT_ID);
    const decoded = JSON.stringify(decodePassportShare(url.split("?c=")[1]));
    expect(decoded).not.toContain(ACCOUNT_ID);
    expect(decoded).not.toContain("tasksCompleted");
    expect(decoded).not.toContain('"partners"');
  });

  it("refuses a UUID as slug and falls back to the neutral segment", () => {
    expect(passportShareSlug(AGENT_REF)).toBe(AGENT_REF);
    expect(passportShareSlug(`  ${AGENT_REF} `)).toBe(AGENT_REF);
    expect(passportShareSlug(ACCOUNT_ID)).toBeNull();
    expect(passportShareSlug("")).toBeNull();
    expect(passportShareSlug(undefined)).toBeNull();
    expect(getAgentPassportShareUrl(card, ACCOUNT_ID, "https://x.test")).toMatch(/^https:\/\/x\.test\/share\/agent\/card\?c=/);
    expect(getAgentPassportShareUrl(card, null, "https://x.test")).toMatch(/^https:\/\/x\.test\/share\/agent\/card\?c=/);
  });

  it("share text is the shared formatter: six stamps and the link as the last line", () => {
    const href = getAgentPassportShareUrl(card, FIXTURE.agentRef, "https://www.agentrix.top");
    const text = getAgentPassportShareText(card, "zh", href);
    const lines = text.split("\n");
    expect(lines[0]).toBe("QA Agent");
    expect(lines[1]).toBe("替你盯审批的助手");
    expect(lines[2]).toBe("5/6 项已盖章 · 家已成形");
    expect(lines[lines.length - 1]).toBe(href);
    for (const fact of card.facts) expect(text).toContain(`${fact.label.zh}：${fact.value.zh}`);
  });
});

describe("agentPassport — read states from the owner endpoint", () => {
  const base = { baseUrl: "https://api.test/api", token: "jwt" };

  it("reads a 200 envelope into a ready state with a Bearer request on the passport path", async () => {
    const transport = transportReturning(200, { success: true, data: FIXTURE });
    const state = await fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport, now: () => "2026-09-18T12:00:00.000Z" });
    expect(state).toEqual({ kind: "ready", data: FIXTURE, capturedAt: "2026-09-18T12:00:00.000Z" });
    expect(transport.calls).toEqual([
      {
        path: `https://api.test/api/agent-accounts/${ACCOUNT_ID}/passport`,
        headers: { Authorization: "Bearer jwt", "X-Agentrix-Surface": "mobile" },
      },
    ]);
  });

  it("maps 401 / 403 / 404 / 5xx to their own read states instead of a generic error", async () => {
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport: transportReturning(401, {}) })).resolves.toEqual({
      kind: "unauthorized",
      reason: "authentication_required",
    });
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport: transportReturning(403, {}) })).resolves.toEqual({
      kind: "forbidden",
      reason: "agent_not_owned",
    });
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport: transportReturning(404, {}) })).resolves.toEqual({
      kind: "unavailable",
      capability: AGENT_PASSPORT_CAPABILITY,
      reason: "not_found",
    });
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport: transportReturning(503, {}) })).resolves.toEqual({
      kind: "error",
      retryable: true,
      reason: "http_503",
    });
  });

  it("does not call the network without a token or an agent, and keeps a malformed 200 out of the card", async () => {
    const transport = transportReturning(200, { success: true, data: { hello: "world" } });
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, token: "", transport })).resolves.toEqual({
      kind: "unauthorized",
      reason: "authentication_required",
    });
    await expect(fetchAgentPassportProjection("", { ...base, transport })).resolves.toEqual({
      kind: "unavailable",
      capability: AGENT_PASSPORT_CAPABILITY,
      reason: "agent_account_required",
    });
    expect(transport.calls).toHaveLength(0);
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport })).resolves.toEqual({
      kind: "unavailable",
      capability: AGENT_PASSPORT_CAPABILITY,
      reason: "projection_malformed",
    });
    const failing: HttpTransportV1 = { request: async () => { throw new Error("Network request failed"); } };
    await expect(fetchAgentPassportProjection(ACCOUNT_ID, { ...base, transport: failing })).resolves.toEqual({
      kind: "error",
      retryable: true,
      reason: "network",
    });
  });
});

describe("webHandoff — bring home / passport editor / twin open on Web", () => {
  it("points at the Web entrances", () => {
    expect(BRING_HOME_WEB_PATH).toBe("/workbench?panel=bring");
    expect(PASSPORT_EDITOR_WEB_PATH).toBe("/workbench?panel=passport");
    expect(getBringHomeWebUrl("https://www.agentrix.top/")).toBe("https://www.agentrix.top/workbench?panel=bring");
    expect(getPassportEditorWebUrl("https://www.agentrix.top")).toBe("https://www.agentrix.top/workbench?panel=passport");
    expect(getTwinWebPath("a/b")).toBe("/agents/a%2Fb/twin");
    expect(getTwinWebUrl(ACCOUNT_ID, "https://www.agentrix.top")).toBe(`https://www.agentrix.top/agents/${ACCOUNT_ID}/twin`);
  });
});

describe("agentPassport — source-level guards", () => {
  const home = read("src/screens/agent-first/work/AgentHomeScreen.tsx");
  const screen = read("src/screens/agent-first/work/AgentPassportScreen.tsx");
  const navigator = read("src/navigation/agent-first/AgentFirstTabNavigator.tsx");
  const linking = read("src/app/linking.ts");
  const iaContract = read("src/navigation/agent-first/iaContract.ts");
  const flow90 = read(".maestro/90-v7-agent-first-4tab-smoke.yaml");

  it("hangs the three entries off the Agent home, the twin one behind mobile.twin_surface", () => {
    for (const testId of ["agent-home-identity-entries", "agent-open-passport", "agent-bring-home-web", "agent-twin-web"]) {
      expect(home).toContain(`"${testId}"`);
    }
    expect(home).toContain("isTwinSurfaceEnabled()");
    expect(home).toContain('entry === "TwinWeb" && !twinSurfaceEnabled');
    expect(home).toContain("getBringHomeWebUrl()");
    expect(home).toContain("getTwinWebUrl(selected.agentId)");
    expect(home).toContain('navigate("AgentPassport", { agentId: selected.agentId })');
    expect(iaContract).toContain('"AgentPassport",');
  });

  it("registers the read-only passport screen on the Agent stack with a deep link", () => {
    expect(navigator).toMatch(/<AgentStack\.Screen name="AgentPassport" component=\{AgentPassportScreen\}/);
    expect(linking).toContain("AgentPassport: 'agents/:agentId/passport'");
    expect(screen).toContain('testID="agent-passport-screen"');
    for (const testId of ["agent-passport-card", "agent-passport-number", "agent-passport-hero", "agent-passport-facts", "agent-passport-share", "agent-passport-edit-web"]) {
      expect(screen).toContain(`"${testId}"`);
    }
    expect(screen).toContain("getPassportEditorWebUrl()");
  });

  it("renders only shared words: the screen imports the shared card model and no frontend copy", () => {
    expect(screen).toContain("buildMobileAgentPassportCard(");
    expect(screen).not.toMatch(/frontend\/lib/);
    // Spec vocabulary stays out of user-facing copy (V7 M5.1.4).
    expect(home).not.toMatch(/mandate|facet/i);
    expect(screen).not.toMatch(/mandate|facet/i);
  });

  it("never writes the passport from the phone (persona draft / confirm, grants are Web-only)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === "__tests__" || entry === "__mocks__") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          const source = readFileSync(full, "utf8");
          if (/passport\/persona|passport\/shares/.test(source)) offenders.push(full);
        }
      }
    };
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("is smoke-tested by Maestro 90 (entry visible on Agent home, screen reachable)", () => {
    expect(flow90).toContain('id: "agent-open-passport"');
    expect(flow90).toContain('id: "agent-passport-screen"');
    expect(flow90).toContain('id: "agent-passport-number"');
  });
});
