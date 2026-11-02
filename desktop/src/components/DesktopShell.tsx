/**
 * DesktopShell — 桌面 D1：主窗口六区外壳（产品文档 6.4）。
 *
 * 左栏：伙伴 / 事项 / 分身 / 我的 AI 们 / 这台电脑 / 我的。
 * "伙伴"就是现有的聊天面板（children），切到别的区时保持挂载、只是隐藏，
 * 这样正在进行的对话和流式输出不会中断。其他区列出旧浮层的新入口；
 * "这台电脑"直接嵌入执行安全、算力节点和自带订阅。
 *
 * 小窗（快问浮窗，宽度小于 COMPACT_WIDTH）只显示伙伴，不显示左栏；树结构不变，
 * 所以窗口在大小之间切换时聊天面板不会重新挂载。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import ExecutionSafetySection from "./ExecutionSafetySection";
import RuntimeSection from "./RuntimeSection";
import LocalBridgeNotice, { useLocalBridge } from "./LocalBridgeNotice";
import DeviceBindingSection from "./DeviceBindingSection";
import OrderDeskSection from "./OrderDeskSection";
import SkillDraftsSection from "./SkillDraftsSection";
import { skillDraftsEnabled } from "../services/skillDrafts";
import RelationshipBookSection from "./RelationshipBookSection";
import { relationshipBookEnabled } from "../services/relationshipBook";
import ActionReceiptsSection from "./ActionReceiptsSection";
import AgentGuardSection from "./AgentGuardSection";
import ContextMemorySection from "./ContextMemorySection";
import ApprovalInboxSection from "./ApprovalInboxSection";
import ComputeNodeSection from "./ComputeNodeSection";
import NodeAllowlistSection from "./NodeAllowlistSection";
import RentalRulesSection from "./RentalRulesSection";
import ByoProvidersSection from "./ByoProvidersSection";
import DeviceAssetRecordCard from "./DeviceAssetRecordCard";
import { deviceAssetRecordEnabled } from "../services/deviceAssetRecord";
import { useI18n } from "../i18n/I18nProvider";
import {
  DESKTOP_ZONES,
  desktopZoneLabel,
  isDesktopZoneId,
  openDesktopPanel,
  OPEN_ZONE_EVENT,
  ZONE_SECTIONS,
  type DesktopZoneId,
  type ZoneEntry,
} from "../services/desktopNavigation";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import { getExecutionJournal, type JournalEntry } from "../services/executionJournal";
import { desktopRentalWorkerDeps, startRentalJobLoop } from "../services/rentalJobWorker";
import { desktopCapabilityLoopDeps, startCapabilityUploadLoop } from "../services/deviceCapabilityUpload";

export const COMPACT_WIDTH = 640;

function useCompactWindow(): boolean {
  const read = () => (typeof window !== "undefined" ? window.innerWidth < COMPACT_WIDTH : false);
  const [compact, setCompact] = useState(read);
  useEffect(() => {
    const onResize = () => setCompact(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return compact;
}

async function openExternal(href: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

async function minimizeWindow() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {
    /* browser preview */
  }
}

export default function DesktopShell({
  children,
  onClose,
}: {
  children: ReactNode;
  /** 与聊天面板相同的关窗逻辑；非伙伴区也能关窗口。 */
  onClose?: () => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [zone, setZone] = useState<DesktopZoneId>("companion");
  const [killSwitchEngaged, setKillSwitchEngaged] = useState(() => getKillSwitchState().engaged);
  const compact = useCompactWindow();
  const activeZone: DesktopZoneId = compact ? "companion" : zone;

  useEffect(() => {
    const onOpenZone = (event: Event) => {
      const next = (event as CustomEvent).detail?.zone;
      if (isDesktopZoneId(next)) setZone(next);
    };
    window.addEventListener(OPEN_ZONE_EVENT, onOpenZone);
    const offKill = onKillSwitchChange((state) => setKillSwitchEngaged(state.engaged));
    return () => {
      window.removeEventListener(OPEN_ZONE_EVENT, onOpenZone);
      offKill();
    };
  }, []);
  // L5 B4 rented jobs: a no-op unless VITE_DEVICE_RENTAL_ENABLED=1 (rentalJobWorker.ts).
  useEffect(() => startRentalJobLoop(desktopRentalWorkerDeps()), []);
  // L5 B2: this computer's capability declaration every 5 minutes; a no-op unless VITE_DEVICE_MESH_ENABLED=1.
  useEffect(() => startCapabilityUploadLoop(desktopCapabilityLoopDeps()), []);

  return (
    <div style={shell} data-testid="desktop-shell">
      <nav aria-label={t("shell.nav")} hidden={compact} style={compact ? { ...rail, display: "none" } : rail}>
        <div data-tauri-drag-region style={railDrag} />
        {DESKTOP_ZONES.map((item) => {
          const active = item.id === activeZone;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`zone-${item.id}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setZone(item.id)}
              style={active ? { ...railButton, ...railButtonActive } : railButton}
            >
              <span aria-hidden="true" style={{ fontSize: 18, position: "relative" }}>
                {item.icon}
                {item.id === "this-computer" && killSwitchEngaged && <span style={alertDot} />}
              </span>
              <span style={railLabel}>{desktopZoneLabel(item, locale)}</span>
              {item.id === "this-computer" && killSwitchEngaged && <span style={srOnly}>{t("shell.estopOn")}</span>}
            </button>
          );
        })}
      </nav>
      <main style={content}>
        <div
          data-testid="zone-panel-companion"
          hidden={activeZone !== "companion"}
          style={{ ...fill, display: activeZone === "companion" ? "block" : "none" }}
        >
          {children}
        </div>
        {activeZone !== "companion" && <ZonePage zone={activeZone} killSwitchEngaged={killSwitchEngaged} onClose={onClose} />}
      </main>
    </div>
  );
}

function ZonePage({
  zone,
  killSwitchEngaged,
  onClose,
}: {
  zone: Exclude<DesktopZoneId, "companion">;
  killSwitchEngaged: boolean;
  onClose?: () => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const meta = DESKTOP_ZONES.find((item) => item.id === zone)!;
  const sections = ZONE_SECTIONS[zone];
  return (
    <section data-testid={`zone-panel-${zone}`} aria-labelledby={`zone-title-${zone}`} style={page}>
      <header data-tauri-drag-region style={pageHeader}>
        <h1 id={`zone-title-${zone}`} data-tauri-drag-region style={pageTitle}>{desktopZoneLabel(meta, locale)}</h1>
        <div style={windowControls}>
          <button type="button" aria-label={t("shell.minimizeWindow")} title={t("shell.minimize")} style={windowButton} onClick={() => void minimizeWindow()}>—</button>
          {onClose && (
            <button type="button" aria-label={t("shell.closeWindow")} title={t("common.close")} style={windowButton} onClick={() => void onClose()}>✕</button>
          )}
        </div>
      </header>
      {zone === "this-computer" && <ThisComputerBody killSwitchEngaged={killSwitchEngaged} />}
      {zone === "matters" && <ApprovalInboxSection />}
      {zone === "matters" && <InterruptedActions />}
      {zone === "my-ais" && <AgentGuardSection />}
      {zone === "my-ais" && (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_CONTEXT_MEMORY_MCP_ENABLED === "1" && <ContextMemorySection />}
      {zone === "twin" && <OrderDeskSection />}
      {zone === "twin" && skillDraftsEnabled() && <SkillDraftsSection />}
      {zone === "twin" && relationshipBookEnabled() && <RelationshipBookSection />}
      {sections.map((sectionItem) => (
        <div key={sectionItem.key} style={sectionBox}>
          <h2 style={sectionTitle}>{t(`zone.section.${sectionItem.key}`)}</h2>
          <EntryList entries={sectionItem.entries} />
        </div>
      ))}
      {zone === "matters" && <ActionReceiptsSection />}
    </section>
  );
}

function ThisComputerBody({ killSwitchEngaged }: { killSwitchEngaged: boolean }) {
  const { t } = useI18n();
  const bridge = useLocalBridge();
  const bridgeMissing = bridge.state === "absent" || bridge.state === "retrying";
  return (
    <>
      {killSwitchEngaged && (
        <div role="status" style={killBanner}>{t("shell.killBanner")}</div>
      )}
      {/* Local bridge not connected: one plain empty state instead of several blocks with nothing in them (polish P3). */}
      {bridgeMissing && <LocalBridgeNotice checking={bridge.state === "retrying"} onRetry={bridge.retry} />}
      <ExecutionSafetySection />
      <DeviceBindingSection />
      <ByoProvidersSection />
      {/* L9 S17 (L2): this computer's signed record for My things, only with VITE_DEVICE_ASSET_RECORD_ENABLED=1. */}
      {deviceAssetRecordEnabled() ? <DeviceAssetRecordCard /> : null}
      {/* Developer and diagnostic parts stay folded until the owner opens them (T7 r2, 10-16). */}
      <details style={advancedBox} data-testid="this-computer-advanced">
        <summary style={advancedSummary}>{t("common.advanced")}</summary>
        {!bridgeMissing && <RuntimeSection />}
        <ComputeNodeSection />
        <NodeAllowlistSection />
        <RentalRulesSection />
      </details>
      <EntryList entries={[{ key: "workspace", label: "工作区文件夹与本机模型", description: "在设置里选择 AI 可以访问的文件夹和本机模型", panel: "settings" }]} />
    </>
  );
}

/**
 * Desktop D2 — actions that were in flight when the app last quit. Their
 * outcome is unknown; they are never retried automatically. The owner looks
 * and marks them handled.
 */
function InterruptedActions() {
  const { t } = useI18n();
  const journal = getExecutionJournal();
  const [items, setItems] = useState<JournalEntry[]>(() => journal.listReconcile());
  useEffect(() => journal.subscribe(() => setItems(journal.listReconcile())), [journal]);
  if (items.length === 0) return null;
  return (
    <div style={sectionBox} data-testid="interrupted-actions">
      <h2 style={sectionTitle}>{t("shell.interrupted.title")}</h2>
      <ul style={list}>
        {items.map((item) => (
          <li key={item.journalRef} style={{ ...entryButton, cursor: "default" }}>
            <span style={entryLabel}>{item.title || item.kind}</span>
            <span style={entryDescription}>
              {new Date(item.reservedAt).toLocaleString()} · {t("shell.interrupted.source")}{t(`shell.interrupted.source.${item.source}`) === `shell.interrupted.source.${item.source}` ? item.source : t(`shell.interrupted.source.${item.source}`)}
              {item.note ? ` · ${item.note}` : ""}
            </span>
            <button type="button" style={ackButton} onClick={() => journal.acknowledge(item.journalRef)}>
              {t("shell.interrupted.ack")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryList({ entries }: { entries: ZoneEntry[] }) {
  const { t } = useI18n();
  return (
    <ul style={list}>
      {entries.map((entry) => {
        const actionable = Boolean(entry.panel || entry.href);
        const body = (
          <>
            <span style={entryLabel}>{t(`zone.entry.${entry.key}.label`)}</span>
            {entry.description && <span style={entryDescription}>{t(`zone.entry.${entry.key}.desc`)}</span>}
          </>
        );
        return (
          <li key={entry.key}>
            {actionable ? (
              <button
                type="button"
                style={entryButton}
                onClick={() => {
                  if (entry.panel) openDesktopPanel(entry.panel);
                  else if (entry.href) void openExternal(entry.href);
                }}
              >
                {body}
                {entry.href && <span style={entryDescription}>{t("shell.openInBrowser")}</span>}
              </button>
            ) : (
              <div style={{ ...entryButton, cursor: "default", opacity: 0.7 }} aria-disabled="true">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const shell: CSSProperties = { display: "flex", width: "100%", height: "100%", background: "var(--bg-dark, var(--bg-panel))" };
const rail: CSSProperties = {
  width: 68,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 2,
  padding: "0 4px 8px",
  borderRight: "1px solid var(--border)",
  background: "var(--bg-panel)",
};
const railDrag: CSSProperties = { height: 28, flexShrink: 0 };
const railButton: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "8px 2px",
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
};
const railButtonActive: CSSProperties = { background: "var(--bg-overlay-light, rgba(127,127,127,0.12))", color: "var(--text)", fontWeight: 600 };
const railLabel: CSSProperties = { fontSize: 11, lineHeight: 1.2, textAlign: "center" };
const alertDot: CSSProperties = {
  position: "absolute",
  top: -2,
  right: -6,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#dc2626",
};
const srOnly: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" };
const content: CSSProperties = { flex: 1, minWidth: 0, height: "100%", position: "relative", overflow: "hidden" };
const fill: CSSProperties = { width: "100%", height: "100%" };
const page: CSSProperties = { height: "100%", overflowY: "auto", padding: "0 20px 24px", color: "var(--text)" };
const pageHeader: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const pageTitle: CSSProperties = { fontSize: 18, fontWeight: 700, margin: 0, padding: "14px 0 10px" };
const windowControls: CSSProperties = { display: "flex", gap: 4, flexShrink: 0 };
const windowButton: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 13,
};
const advancedBox: CSSProperties = { padding: "10px 0", borderBottom: "1px solid var(--border)" };
const advancedSummary: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-dim)", cursor: "pointer" };
const sectionBox: CSSProperties = { padding: "10px 0", borderTop: "1px solid var(--border)" };
const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 8px" };
const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 };
const entryButton: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-card, transparent)",
  color: "var(--text)",
  textAlign: "left",
  cursor: "pointer",
};
const entryLabel: CSSProperties = { fontSize: 13, fontWeight: 600 };
const entryDescription: CSSProperties = { fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 };
const ackButton: CSSProperties = {
  marginTop: 6,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
const killBanner: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #dc2626",
  background: "rgba(220, 38, 38, 0.08)",
  fontSize: 12,
  marginBottom: 8,
};
