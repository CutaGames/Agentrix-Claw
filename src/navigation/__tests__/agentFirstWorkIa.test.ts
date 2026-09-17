import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_FIRST_DEFERRED_LIVE_CAPABILITIES,
  AGENT_FIRST_DEFAULT_TAB,
  AGENT_FIRST_HIDDEN_ROLLBACK_TABS,
  AGENT_FIRST_VISIBLE_TABS,
  AGENT_HOME_DEFAULT_SURFACES,
  AGENT_STACK_DEFAULT_ROUTE,
  AGENT_STACK_REGULATED_EXCLUDED,
  AGENT_STACK_ROUTES,
  ECONOMY_STACK_SELLER_ROUTES,
  WORK_STACK_ACTION_ROUTES,
  WORK_STACK_REMOTE_WORKSPACE_ROUTES,
  agentSoulCoreStaysOnAgent,
  isRegulatedSecondarySurface,
  resolveAgentSoulCoreDestination,
} from "../agent-first/iaContract";

describe("Agent-first Work/Economy IA", () => {
  it("makes Agent / Work / Economy / My the visible flag-on tabs", () => {
    expect(AGENT_FIRST_VISIBLE_TABS).toEqual([
      "Agent",
      "Work",
      "Economy",
      "My",
    ]);
    expect(AGENT_FIRST_DEFAULT_TAB).toBe("Agent");
    expect(AGENT_FIRST_HIDDEN_ROLLBACK_TABS).toEqual(
      expect.arrayContaining(["Actions", "Creation", "Prediction", "Lsm"]),
    );
  });

  it("keeps Action under Work and Creation under Economy/Seller", () => {
    expect(WORK_STACK_ACTION_ROUTES).toEqual(
      expect.arrayContaining(["ActionsHome"]),
    );
    expect(ECONOMY_STACK_SELLER_ROUTES).toEqual(
      expect.arrayContaining(["CreationHome"]),
    );
  });

  // 2026-09-16 decision d-50 deliberately flipped this block: M2 (the DRW
  // remote workspace) is in this wave, so `developer_remote_workspace` left the
  // deferred list and the Work tab MUST be wired to the live hook. Economy
  // stays untouched.
  it("keeps only the agent economy outside this release (d-50 brought the remote workspace in)", () => {
    expect(AGENT_FIRST_DEFERRED_LIVE_CAPABILITIES).toEqual(["agent_economy_live"]);
    expect(AGENT_FIRST_DEFERRED_LIVE_CAPABILITIES).not.toContain("developer_remote_workspace");
    expect(WORK_STACK_REMOTE_WORKSPACE_ROUTES).toEqual([
      "WorkMachines",
      "WorkSessions",
      "WorkApprovals",
      "WorkReceipts",
      "WorkHandoffs",
    ]);
  });

  it("wires the four-tab shell with the remote workspace under Work only (d-50)", () => {
    const navigator = readFileSync(
      resolve(__dirname, "../agent-first/AgentFirstTabNavigator.tsx"),
      "utf8",
    );
    const workHome = readFileSync(
      resolve(__dirname, "../../screens/agent-first/work/WorkHomeScreen.tsx"),
      "utf8",
    );
    const economyHome = readFileSync(
      resolve(__dirname, "../../screens/agent-first/work/EconomyHomeScreen.tsx"),
      "utf8",
    );
    const linking = readFileSync(resolve(__dirname, "../../app/linking.ts"), "utf8");

    expect(navigator).toContain('tabBarButtonTestID: \'tab-work\'');
    expect(navigator).toContain('tabBarButtonTestID: \'tab-economy\'');
    expect(workHome).toContain('testID="work-home-screen"');
    expect(economyHome).toContain('testID="economy-home-screen"');

    // WorkHome is wired through the live hook and keeps the M1.2.1 card + testIDs.
    expect(workHome).toContain("useDeveloperWorkspaceLive(");
    expect(workHome).toContain("buildDeveloperWorkHomeModel(");
    expect(workHome).toContain("<WorkReadStateCard");
    for (const testId of [
      "work-release-boundary",
      "work-feature-unavailable",
      "work-desktop-boundary",
      "work-workflow-web-handoff",
    ]) {
      expect(workHome).toContain(`"${testId}"`);
    }

    // The five DRW faces are Work-stack routes, components taken verbatim from f9076d9d5.
    for (const route of WORK_STACK_REMOTE_WORKSPACE_ROUTES) {
      expect(navigator).toMatch(new RegExp(`<WorkStack\\.Screen name="${route}" component=\\{${route}Screen\\}`));
      expect(linking).toContain(`${route}: WORK_ROUTE_PATHS.${route}`);
    }
    expect(navigator).toContain("from '../../screens/agent-first/work/WorkDetailScreens'");

    // Economy still does not import the developer workspace.
    expect(economyHome).not.toMatch(
      /developerWorkspace|developer-remote-workspace|useDeveloperWorkspace/,
    );
  });

  it("injects the developer workspace flag in the production Agent-first profile (d-50, A5)", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../.github/workflows/build-apk.yml"),
      "utf8",
    );
    const eas = JSON.parse(readFileSync(resolve(__dirname, "../../../eas.json"), "utf8"));
    expect(workflow).toContain("EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED: '1'");
    expect(eas.build.production.env.EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED).toBe("1");
  });

  it("gates the APK on the Work approval inbox flow in fixture mode (d-50, M2.2 / B4)", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../.github/workflows/build-apk.yml"),
      "utf8",
    );
    const flow = readFileSync(
      resolve(__dirname, "../../../.maestro/91-v7-work-remote-workspace.yaml"),
      "utf8",
    );
    const flagOff = readFileSync(
      resolve(__dirname, "../../../.maestro/92-v7-work-remote-workspace-flag-off.yaml"),
      "utf8",
    );
    expect(workflow).toContain('name "91-v7-work-remote-workspace.yaml"');
    // 92 needs a flag=0 build and must stay out of the flag=1 CI list.
    expect(workflow).not.toContain('name "92-v7-work-remote-workspace-flag-off.yaml"');
    // The flow walks Work → approval → decision → read-back on fixture routes only.
    expect(flow).toContain("fixture=1");
    expect(flow).toContain('id: "developer-reject-cta"');
    expect(flow).toContain('id: "work-approval-readback"');
    expect(flow).toContain("source=push");
    // Fixture never shows an approved decision.
    expect(flow).not.toContain('id: "work-approval-readback-approved"');
    expect(flagOff).toContain('id: "work-feature-unavailable"');
    expect(flagOff).toContain("feature_disabled");
  });

  it("builds and tests the production Agent-first profile", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../.github/workflows/build-apk.yml"),
      "utf8",
    );
    const maestro = readFileSync(
      resolve(
        __dirname,
        "../../../.maestro/51-baseline-agent-first-soul-core.yaml",
      ),
      "utf8",
    );

    expect(workflow).toContain("EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1'");
    expect(workflow).toContain(
      'name "51-baseline-agent-first-soul-core.yaml"',
    );
    expect(workflow).toContain("shard: [0]");
    expect(workflow).toContain(
      "Production signingConfig is the only release signer",
    );
    expect(workflow).toContain(
      "aad75099b847b182d4eb326a3e9fc41ae986659f0183177d4ecba2b74407f993",
    );
    expect(workflow).toContain("Production signing certificate verified");
    expect(workflow).toContain(
      "Signer #[0-9]+|V[0-9]+ Signer:) certificate SHA-256 digest:",
    );
    expect(workflow).toContain("sort -u");
    expect(workflow).toContain(
      "ERROR: expected exactly one unique Android signing certificate digest",
    );
    expect(workflow).toContain("ERROR: empty or multiple certificate digests");
    expect(workflow).toContain("ERROR: unexpected Android signing certificate");
    expect(workflow).toContain("ERROR: public APK is debug signed");
    expect(workflow).not.toContain(
      "No ANDROID_KEYSTORE_BASE64 secret — building unsigned APK",
    );
    expect(workflow).not.toContain(
      "sed -n 's/^Signer #1 certificate SHA-256 digest: //p'",
    );
    expect(maestro).toContain('id: "tab-work"');
    expect(maestro).toContain('id: "tab-economy"');
    expect(maestro).toContain('id: "work-home-screen"');
    expect(maestro).toContain('id: "economy-home-screen"');
    expect(maestro).not.toContain('id: "tab-actions"');
    expect(maestro).not.toContain('id: "tab-creation"');
  });

  it("does not publish the download server before Maestro 51", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require("js-yaml") as {
      load: (input: string) => Record<string, any>;
    };
    const workflow = readFileSync(
      resolve(__dirname, "../../../.github/workflows/build-apk.yml"),
      "utf8",
    );
    const trigger = readFileSync(
      resolve(__dirname, "../../../.github/workflows/build-apk-trigger.yml"),
      "utf8",
    );
    const publicTrigger = readFileSync(
      resolve(
        __dirname,
        "../../../.github/public-workflows/build-apk-trigger.yml",
      ),
      "utf8",
    );
    const parsed = yaml.load(workflow);
    const jobs = parsed.jobs as Record<string, any>;
    const dispatchInput =
      parsed.on?.workflow_dispatch?.inputs?.deploy_download ??
      parsed.on?.true?.inputs?.deploy_download;
    const callInput = parsed.on?.workflow_call?.inputs?.deploy_download;

    expect(jobs.build).toBeDefined();
    expect(jobs["ui-test"]).toBeDefined();
    expect(jobs.deploy).toBeDefined();
    expect(jobs.build.steps.map((step: { name?: string }) => step.name)).not.toEqual(
      expect.arrayContaining(["Upload APK to download server"]),
    );
    expect(JSON.stringify(jobs.build)).not.toContain("47.130.176.148");
    expect(JSON.stringify(jobs.build)).not.toContain("clawlink-agent.apk");
    expect(jobs["ui-test"].needs).toEqual("build");
    expect(jobs.deploy.needs).toEqual(["build", "ui-test"]);
    expect(String(jobs.deploy.if)).toContain("inputs.deploy_download");
    expect(String(jobs.deploy.if)).toContain("needs.ui-test.result");
    expect(dispatchInput?.default).toBe(false);
    expect(callInput?.default).toBe(false);
    expect(JSON.stringify(jobs.deploy)).toContain("Upload APK to download server");
    expect(workflow).not.toMatch(
      /Upload APK to download server[\s\S]*name: 🤖 UI Automation/,
    );
    expect(trigger).toContain("deploy_download: ${{ inputs.deploy_download }}");
    expect(publicTrigger).toContain("deploy_download: ${{ inputs.deploy_download || false }}");
  });

  it("accepts both apksigner digest lines and fails closed on empty/multiple/unexpected", () => {
    const expected =
      "aad75099b847b182d4eb326a3e9fc41ae986659f0183177d4ecba2b74407f993";
    const digestLine =
      /^(?:Signer #\d+|V\d+ Signer:) certificate SHA-256 digest:\s*(.+)$/i;

    const uniqueDigests = (signature: string): string[] =>
      [
        ...new Set(
          signature
            .split(/\r?\n/)
            .map((line) => {
              const match = line.match(digestLine);
              return match?.[1]?.trim().toLowerCase() ?? "";
            })
            .filter(Boolean),
        ),
      ].sort();

    const verify = (
      signature: string,
    ): { ok: true } | { ok: false; reason: string } => {
      if (/Android Debug/i.test(signature)) {
        return { ok: false, reason: "debug" };
      }
      const digests = uniqueDigests(signature);
      if (digests.length !== 1) {
        return { ok: false, reason: "empty-or-multiple" };
      }
      if (digests[0] !== expected) {
        return { ok: false, reason: "unexpected" };
      }
      return { ok: true };
    };

    expect(
      verify(`V2 Signer: certificate SHA-256 digest: ${expected.toUpperCase()}`),
    ).toEqual({ ok: true });
    expect(
      verify(`Signer #1 certificate SHA-256 digest: ${expected}`),
    ).toEqual({ ok: true });
    expect(
      verify(
        [
          `V2 Signer: certificate SHA-256 digest: ${expected}`,
          `V3 Signer: certificate SHA-256 digest: ${expected.toUpperCase()}`,
        ].join("\n"),
      ),
    ).toEqual({ ok: true });
    expect(verify("Verified using v2 scheme")).toEqual({
      ok: false,
      reason: "empty-or-multiple",
    });
    expect(
      verify(
        [
          `V2 Signer: certificate SHA-256 digest: ${expected}`,
          "Signer #1 certificate SHA-256 digest: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        ].join("\n"),
      ),
    ).toEqual({ ok: false, reason: "empty-or-multiple" });
    expect(
      verify(
        "V2 Signer: certificate SHA-256 digest: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      ),
    ).toEqual({ ok: false, reason: "unexpected" });
    expect(
      verify(
        `Signer #1 certificate SHA-256 digest: ${expected}\nAndroid Debug`,
      ),
    ).toEqual({ ok: false, reason: "debug" });
  });

  it("keeps the native and Expo release versions aligned", () => {
    const appConfig = JSON.parse(
      readFileSync(resolve(__dirname, "../../../app.json"), "utf8"),
    ).expo;
    const androidBuild = readFileSync(
      resolve(__dirname, "../../../android/app/build.gradle"),
      "utf8",
    );

    expect(appConfig.version).toBe("1.2.0");
    expect(appConfig.runtimeVersion).toBe("1.2.0");
    expect(appConfig.android.versionCode).toBe(2);
    expect(androidBuild).toContain("versionCode 2");
    expect(androidBuild).toContain('versionName "1.2.0"');
  });

  it("keeps Prediction/LSM out of the Agent default stack", () => {
    expect(AGENT_STACK_DEFAULT_ROUTE).toBe("AgentHome");
    expect(AGENT_STACK_REGULATED_EXCLUDED).toEqual(["Prediction", "Lsm"]);
    expect(isRegulatedSecondarySurface("Prediction")).toBe(true);
    expect(AGENT_STACK_ROUTES).not.toContain("Prediction");
    expect(AGENT_STACK_ROUTES).not.toContain("Lsm");
    expect(AGENT_STACK_ROUTES).toContain("AgentSoulCore");
  });

  it("keeps Prediction/LSM off the Agent Home default surfaces", () => {
    expect(AGENT_HOME_DEFAULT_SURFACES).toEqual([
      "Companion",
      "HardwareAssurance",
    ]);
    expect(AGENT_HOME_DEFAULT_SURFACES).not.toContain("Prediction");
    expect(AGENT_HOME_DEFAULT_SURFACES).not.toContain("Lsm");
  });

  it("keeps AgentSoulCore on the Agent stack instead of redirecting to My", () => {
    const destination = resolveAgentSoulCoreDestination("agent-1");
    expect(destination).toEqual({
      tab: "Agent",
      screen: "AgentSoulCore",
      params: { agentId: "agent-1" },
    });
    expect(agentSoulCoreStaysOnAgent(destination)).toBe(true);
    expect(destination.tab).not.toBe("My");
  });
});
