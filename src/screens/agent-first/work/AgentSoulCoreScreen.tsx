import React from "react";
import { Text } from "react-native";
import { resolveAgentSoulCoreDestination } from "../../../navigation/agent-first/iaContract";
import { useI18n } from "../../../stores/i18nStore";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";
import {
  OpaqueRefText,
  WorkCard,
  WorkScreenFrame,
  WorkStateNotice,
} from "./WorkReadOnlyViews";

export function AgentSoulCoreScreen({ route }: any) {
  const { t } = useI18n();
  const agentId =
    typeof route?.params?.agentId === "string" ? route.params.agentId : "";
  const destination = resolveAgentSoulCoreDestination(agentId);
  const directory = useMobileAgentDirectory(agentId);
  const agent = directory.model.agents.find((item) => item.agentId === agentId);
  return (
    <WorkScreenFrame
      eyebrow="AGENT"
      title={t({ en: "Agent Soul Core", zh: "Agent Soul Core" })}
      testID="agent-soul-core-screen"
    >
      <WorkCard title={t({ en: "Identity continuity", zh: "身份连续性" })}>
        <OpaqueRefText label="agentId" value={agentId || undefined} />
        <OpaqueRefText label="soulCoreId" value={agent?.soulCoreId} />
        {!agent || agent.canonicalMapping !== "ready" ? (
          <WorkStateNotice
            state={{
              kind: "unavailable",
              capability: "agent.soul_core_mapping_v1",
              reason: "canonical_mapping_missing",
            }}
          />
        ) : (
          <Text>
            {t({ en: "Canonical active mapping", zh: "Canonical active 映射" })}
          </Text>
        )}
      </WorkCard>
      <WorkCard
        title={t({ en: "Ownership & Authority", zh: "所有权与 Authority" })}
      >
        <WorkStateNotice
          state={{
            kind: "unavailable",
            capability: "agent.soul_core_authority_v1",
            reason: "canonical_projection_required",
          }}
        />
      </WorkCard>
      <WorkCard title={t({ en: "Recovery & assurance", zh: "恢复与保障机制" })}>
        <WorkStateNotice
          state={{
            kind: "unavailable",
            capability: "agent.soul_core_recovery_v1",
            reason: "canonical_projection_required",
          }}
        />
      </WorkCard>
      <WorkCard title={t({ en: "Navigation boundary", zh: "导航边界" })}>
        <Text testID="agent-soul-core-tab">{destination.tab}</Text>
        <Text testID="agent-soul-core-screen-name">{destination.screen}</Text>
        <Text>
          {t({
            en: "This stays on the Agent stack. It does not redirect to My, wallet, or a hardware-only path.",
            zh: "该页留在 Agent 栈，不跳转到 My、钱包或仅硬件路径。",
          })}
        </Text>
      </WorkCard>
    </WorkScreenFrame>
  );
}
