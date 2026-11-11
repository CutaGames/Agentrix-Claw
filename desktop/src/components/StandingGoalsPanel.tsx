import { useEffect, useMemo, useState } from "react";
import { STANDING_GOAL_NOTES_V1, describeStandingGoalV1, standingGoalActionsV1, type StandingGoalViewV1 } from "../../../shared/types/standing-goal";
import { DESKTOP_GOAL_FAILURE_TEXT, createDesktopStandingGoalsClient, standingGoalsEnabled, type DesktopGoalFailure } from "../services/standingGoals";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";

const box = { marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const heading = { fontWeight: 600, marginBottom: 6 } as const;
const hint = { fontSize: 12, opacity: 0.7 } as const;
const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" } as const;

type GoalClient = ReturnType<typeof createDesktopStandingGoalsClient>;

/** L8 C1: the goals your Agent works on in the background: progress, what it is waiting for, pause, continue, end, and the one-key stop. Renders nothing while the server switch is off. */
export function StandingGoalsPanel({ client }: { client?: GoalClient }) {
  const api = useMemo(() => client ?? createDesktopStandingGoalsClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }), [client]);
  const [goals, setGoals] = useState<StandingGoalViewV1[] | null>(null);
  const [failure, setFailure] = useState<DesktopGoalFailure | null>(null);

  const reload = async () => {
    const result = await api.list();
    if (result.ok) { setGoals(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failure === "closed") return null;

  const act = async (action: "pause" | "resume" | "end", goal: StandingGoalViewV1) => {
    const result = await api[action](goal.goalRef);
    if (!result.ok) setFailure(result.failure);
    await reload();
  };
  const stopAll = async () => {
    const result = await api.emergencyStop();
    if (!result.ok) setFailure(result.failure);
    await reload();
  };

  return (
    <div data-testid="standing-goals-panel" style={box}>
      <div style={heading}>Background goals · 后台目标</div>
      <div style={hint}>Your Agent moves these forward in the background and stops to ask you when something is beyond your limits. 你的 Agent 隔一段时间替你推进一步，超出你设的边界或需要你判断时会停下来问你。</div>
      {/* L8-8 UI-3 and L7: the same three notes as the web and the phone (this panel shows both languages, like the rest of it). */}
      {STANDING_GOAL_NOTES_V1.en.map((en, index) => (
        <div key={en} style={hint} data-testid="standing-goals-note">{`· ${en} ${STANDING_GOAL_NOTES_V1.zh[index]}`}</div>
      ))}
      {goals && goals.length === 0 ? <div style={hint}>No background goals yet. 还没有后台目标。</div> : null}
      {goals?.map((goal) => {
        const actions = standingGoalActionsV1(goal);
        return (
          <div key={goal.goalRef} style={{ marginTop: 8 }} data-testid="standing-goal-item">
            <div style={row}><strong>{goal.title}</strong></div>
            <div style={hint}>{`${describeStandingGoalV1(goal, "en")} · ${describeStandingGoalV1(goal, "zh")}`}</div>
            {goal.lastSummary ? <div style={hint}>{goal.lastSummary}</div> : null}
            <div style={row}>
              {actions.pause ? <button type="button" onClick={() => void act("pause", goal)}>Pause · 暂停</button> : null}
              {actions.resume ? <button type="button" onClick={() => void act("resume", goal)}>Continue · 继续</button> : null}
              {actions.end ? <button type="button" onClick={() => void act("end", goal)}>End · 结束</button> : null}
            </div>
          </div>
        );
      })}
      {goals && goals.length > 0 ? <div style={{ marginTop: 8 }}><button type="button" onClick={() => void stopAll()}>Emergency stop all · 全部紧急停止</button></div> : null}
      {failure && DESKTOP_GOAL_FAILURE_TEXT[failure] ? <div role="status" style={hint}>{DESKTOP_GOAL_FAILURE_TEXT[failure]}</div> : null}
    </div>
  );
}

/** Settings entry, behind its own build switch. */
export default function StandingGoalsSection() {
  return standingGoalsEnabled() ? <StandingGoalsPanel /> : null;
}
