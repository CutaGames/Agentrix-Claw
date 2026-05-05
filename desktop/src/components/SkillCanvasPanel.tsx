import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  createWorkflowTemplate,
  getWorkflowInstance,
  installWorkflowTemplate,
  type WorkflowInstance,
  type WorkflowStepKind,
} from "../services/workflowTemplates";

type NodeKind = "input" | "skill" | "review" | "output";

interface CanvasNode {
  id: string;
  label: string;
  note: string;
  kind: NodeKind;
  stepKind: WorkflowStepKind;
  agentRole: string;
  x: number;
  y: number;
}

interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "agentrix_desktop_skill_canvas_v1";
const STEP_KIND_OPTIONS: WorkflowStepKind[] = ["fetch", "compose", "invoke", "sign", "send", "pay"];
const NODE_COLORS: Record<NodeKind, { border: string; glow: string; fill: string }> = {
  input: { border: "#38bdf8", glow: "rgba(56,189,248,0.3)", fill: "rgba(56,189,248,0.12)" },
  skill: { border: "#2dd4bf", glow: "rgba(45,212,191,0.3)", fill: "rgba(45,212,191,0.12)" },
  review: { border: "#f59e0b", glow: "rgba(245,158,11,0.28)", fill: "rgba(245,158,11,0.12)" },
  output: { border: "#c084fc", glow: "rgba(192,132,252,0.3)", fill: "rgba(192,132,252,0.12)" },
};

function defaultStepKind(kind: NodeKind): WorkflowStepKind {
  if (kind === "input") return "fetch";
  if (kind === "review") return "sign";
  if (kind === "output") return "send";
  return "invoke";
}

function isNodeKind(value: unknown): value is NodeKind {
  return value === "input" || value === "skill" || value === "review" || value === "output";
}

function isWorkflowStepKind(value: unknown): value is WorkflowStepKind {
  return value === "fetch" || value === "compose" || value === "send" || value === "sign" || value === "pay" || value === "invoke";
}

function normalizeNode(rawNode: Partial<CanvasNode> | null | undefined, index: number): CanvasNode {
  const kind = isNodeKind(rawNode?.kind) ? rawNode.kind : "skill";
  return {
    id: typeof rawNode?.id === "string" && rawNode.id.trim() ? rawNode.id : `node-${index + 1}`,
    label: typeof rawNode?.label === "string" && rawNode.label.trim() ? rawNode.label : `Step ${index + 1}`,
    note: typeof rawNode?.note === "string" ? rawNode.note : "",
    kind,
    stepKind: isWorkflowStepKind(rawNode?.stepKind) ? rawNode.stepKind : defaultStepKind(kind),
    agentRole: typeof rawNode?.agentRole === "string" ? rawNode.agentRole : "",
    x: Number.isFinite(rawNode?.x) ? Number(rawNode?.x) : 120 + (index % 3) * 180,
    y: Number.isFinite(rawNode?.y) ? Number(rawNode?.y) : 120 + Math.floor(index / 3) * 140,
  };
}

function sortNodesByCanvas(a: CanvasNode, b: CanvasNode) {
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.label.localeCompare(b.label);
}

function orderCanvasNodes(graph: CanvasGraph): CanvasNode[] {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  graph.nodes.forEach((node) => {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  });

  graph.edges.forEach((edge) => {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) return;
    outgoing.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  });

  const queue = graph.nodes.filter((node) => (indegree.get(node.id) || 0) === 0).sort(sortNodesByCanvas);
  const ordered: CanvasNode[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    ordered.push(next);

    for (const childId of outgoing.get(next.id) || []) {
      const nextIndegree = (indegree.get(childId) || 0) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree <= 0) {
        const child = nodeMap.get(childId);
        if (child && !seen.has(child.id)) {
          queue.push(child);
          queue.sort(sortNodesByCanvas);
        }
      }
    }
  }

  if (ordered.length !== graph.nodes.length) {
    ordered.push(...graph.nodes.filter((node) => !seen.has(node.id)).sort(sortNodesByCanvas));
  }

  return ordered;
}

function inferWorkflowName(orderedNodes: CanvasNode[]) {
  const primary = orderedNodes.slice(0, 3).map((node) => node.label.trim()).filter(Boolean).join(" -> ");
  return primary ? `Canvas ${primary}` : `Canvas ${new Date().toLocaleString()}`;
}

function buildWorkflowDescription(graph: CanvasGraph) {
  return `Generated from Skill Canvas with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`;
}

function buildPresetGraph(preset: "research" | "release" | "growth"): CanvasGraph {
  if (preset === "release") {
    return {
      nodes: [
        { id: "release-intake", label: "Release brief", note: "Scope, repo, target platform", kind: "input", stepKind: "fetch", agentRole: "architect", x: 50, y: 90 },
        { id: "release-build", label: "Build chain", note: "Compile and package artifact", kind: "skill", stepKind: "invoke", agentRole: "builder", x: 290, y: 90 },
        { id: "release-qa", label: "QA lane", note: "Smoke checks and rollback notes", kind: "review", stepKind: "sign", agentRole: "qa", x: 530, y: 90 },
        { id: "release-ship", label: "Ship", note: "Tag, push, and communicate release", kind: "output", stepKind: "send", agentRole: "ops", x: 770, y: 90 },
      ],
      edges: [
        { id: "release-edge-1", from: "release-intake", to: "release-build", label: "handoff" },
        { id: "release-edge-2", from: "release-build", to: "release-qa", label: "verify" },
        { id: "release-edge-3", from: "release-qa", to: "release-ship", label: "approve" },
      ],
    };
  }

  if (preset === "growth") {
    return {
      nodes: [
        { id: "growth-signal", label: "Signal", note: "Capture user need or metric drop", kind: "input", stepKind: "fetch", agentRole: "growth", x: 50, y: 90 },
        { id: "growth-copy", label: "Copy craft", note: "Draft landing page or announcement", kind: "skill", stepKind: "compose", agentRole: "media", x: 290, y: 40 },
        { id: "growth-creative", label: "Creative", note: "Assemble asset variants", kind: "skill", stepKind: "invoke", agentRole: "brand", x: 290, y: 180 },
        { id: "growth-review", label: "Review", note: "Score message-market fit", kind: "review", stepKind: "sign", agentRole: "growth", x: 550, y: 110 },
        { id: "growth-launch", label: "Launch", note: "Push experiment live", kind: "output", stepKind: "send", agentRole: "ops", x: 800, y: 110 },
      ],
      edges: [
        { id: "growth-edge-1", from: "growth-signal", to: "growth-copy", label: "brief" },
        { id: "growth-edge-2", from: "growth-signal", to: "growth-creative", label: "assets" },
        { id: "growth-edge-3", from: "growth-copy", to: "growth-review", label: "message" },
        { id: "growth-edge-4", from: "growth-creative", to: "growth-review", label: "visual" },
        { id: "growth-edge-5", from: "growth-review", to: "growth-launch", label: "go live" },
      ],
    };
  }

  return {
    nodes: [
      { id: "research-intake", label: "Intake", note: "Problem framing and constraints", kind: "input", stepKind: "fetch", agentRole: "researcher", x: 50, y: 110 },
      { id: "research-gather", label: "Gather", note: "Search repos, docs, and user context", kind: "skill", stepKind: "fetch", agentRole: "researcher", x: 290, y: 40 },
      { id: "research-synth", label: "Synthesize", note: "Compress findings into plan", kind: "skill", stepKind: "compose", agentRole: "composer", x: 290, y: 200 },
      { id: "research-review", label: "Review", note: "Check risk and missing evidence", kind: "review", stepKind: "sign", agentRole: "reviewer", x: 560, y: 120 },
      { id: "research-output", label: "Deliver", note: "Ship answer or patch set", kind: "output", stepKind: "send", agentRole: "operator", x: 820, y: 120 },
    ],
    edges: [
      { id: "research-edge-1", from: "research-intake", to: "research-gather", label: "query" },
      { id: "research-edge-2", from: "research-intake", to: "research-synth", label: "constraints" },
      { id: "research-edge-3", from: "research-gather", to: "research-review", label: "evidence" },
      { id: "research-edge-4", from: "research-synth", to: "research-review", label: "proposal" },
      { id: "research-edge-5", from: "research-review", to: "research-output", label: "approved" },
    ],
  };
}

function loadGraph(): CanvasGraph {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildPresetGraph("research");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return buildPresetGraph("research");
    }
    return {
      nodes: parsed.nodes.map((node: Partial<CanvasNode>, index: number) => normalizeNode(node, index)),
      edges: parsed.edges
        .filter((edge: Partial<CanvasEdge>) => typeof edge?.id === "string" && typeof edge?.from === "string" && typeof edge?.to === "string")
        .map((edge: CanvasEdge) => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          label: typeof edge.label === "string" ? edge.label : undefined,
        })),
    };
  } catch {
    return buildPresetGraph("research");
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveResultNode(resultStepId: string, orderedNodes: CanvasNode[]) {
  const match = /^s(\d+)$/.exec(resultStepId);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? orderedNodes[index] || null : null;
}

export default function SkillCanvasPanel({ open, onClose }: Props) {
  const [graph, setGraph] = useState<CanvasGraph>(() => loadGraph());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id ?? null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null);
  const [activeInstance, setActiveInstance] = useState<WorkflowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    } catch {
      // Ignore local persistence failures.
    }
  }, [graph]);

  useEffect(() => {
    if (!draggingNodeId) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextX = clamp(event.clientX - rect.left - dragOffsetRef.current.x, 24, rect.width - 180);
      const nextY = clamp(event.clientY - rect.top - dragOffsetRef.current.y, 24, rect.height - 110);
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => node.id === draggingNodeId ? { ...node, x: nextX, y: nextY } : node),
      }));
    };

    const handleMouseUp = () => setDraggingNodeId(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingNodeId]);

  useEffect(() => {
    if (!open || !activeInstance?.id) return;
    if (activeInstance.status === "done" || activeInstance.status === "failed") return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const nextInstance = await getWorkflowInstance(activeInstance.id);
        if (!cancelled) {
          setActiveInstance(nextInstance);
          setWorkflowError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkflowError(error instanceof Error ? error.message : "Failed to refresh workflow instance.");
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeInstance?.id, activeInstance?.status, open]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null;
  const nodeMap = useMemo(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const orderedNodes = useMemo(() => orderCanvasNodes(graph), [graph]);

  if (!open) return null;

  const applyPreset = (preset: "research" | "release" | "growth") => {
    const nextGraph = buildPresetGraph(preset);
    setGraph(nextGraph);
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null);
    setWorkflowError(null);
  };

  const addSkillNode = () => {
    const anchor = selectedNode || graph.nodes[graph.nodes.length - 1] || { x: 120, y: 120, id: "" };
    const id = `node-${Date.now()}`;
    const nextNode: CanvasNode = {
      id,
      label: "Custom skill",
      note: "Describe the tool, prompt, or agent handoff.",
      kind: "skill",
      stepKind: "invoke",
      agentRole: "",
      x: Math.min(anchor.x + 220, 820),
      y: Math.min(anchor.y + 40, 330),
    };
    setGraph((prev) => ({
      nodes: [...prev.nodes, nextNode],
      edges: anchor.id
        ? [...prev.edges, { id: `edge-${Date.now()}`, from: anchor.id, to: id, label: "next" }]
        : prev.edges,
    }));
    setSelectedNodeId(id);
  };

  const updateSelectedNode = (patch: Partial<CanvasNode>) => {
    if (!selectedNodeId) return;
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => node.id === selectedNodeId ? { ...node, ...patch } : node),
    }));
  };

  const removeSelectedNode = () => {
    if (!selectedNodeId) return;
    const nextSelectedId = graph.nodes.find((node) => node.id !== selectedNodeId)?.id ?? null;
    setGraph((prev) => ({
      nodes: prev.nodes.filter((node) => node.id !== selectedNodeId),
      edges: prev.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId),
    }));
    setSelectedNodeId(nextSelectedId);
  };

  const handleNodeMouseDown = (event: ReactMouseEvent<HTMLButtonElement>, node: CanvasNode) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = {
      x: event.clientX - rect.left - node.x,
      y: event.clientY - rect.top - node.y,
    };
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
  };

  const runCanvasWorkflow = async () => {
    if (orderedNodes.length === 0) {
      setWorkflowError("Add at least one node before creating a workflow template.");
      return;
    }

    setWorkflowBusy(true);
    setWorkflowError(null);

    try {
      const template = await createWorkflowTemplate({
        name: inferWorkflowName(orderedNodes),
        description: buildWorkflowDescription(graph),
        category: "productivity",
        visibility: "private",
        required_skills: Array.from(new Set(orderedNodes.map((node) => node.agentRole.trim()).filter(Boolean))),
        steps: orderedNodes.map((node) => ({
          kind: node.stepKind,
          description: node.note.trim() ? `${node.label}: ${node.note.trim()}` : node.label,
          agent_role: node.agentRole.trim() || undefined,
          params: {
            canvas_node_id: node.id,
            canvas_kind: node.kind,
            incoming_nodes: graph.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from),
            outgoing_nodes: graph.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to),
          },
        })),
      });
      const instance = await installWorkflowTemplate(template.id);
      setActiveTemplateId(template.id);
      setActiveTemplateName(template.name);
      setActiveInstance(instance);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "Failed to create workflow template.");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const refreshActiveInstance = async () => {
    if (!activeInstance?.id) return;
    setWorkflowBusy(true);
    try {
      const nextInstance = await getWorkflowInstance(activeInstance.id);
      setActiveInstance(nextInstance);
      setWorkflowError(null);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "Failed to refresh workflow instance.");
    } finally {
      setWorkflowBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={title}>Skill Canvas</div>
            <div style={subtitle}>Arrange tool nodes, reviews, and outputs into a local orchestration map, then execute it through workflow templates.</div>
          </div>
          <button onClick={onClose} style={closeButton}>Close</button>
        </div>

        <div style={body}>
          <div style={sidebar}>
            <div style={sectionTitle}>Presets</div>
            <div style={presetColumn}>
              <button onClick={() => applyPreset("research")} style={presetButton}>Research loop</button>
              <button onClick={() => applyPreset("release")} style={presetButton}>Release lane</button>
              <button onClick={() => applyPreset("growth")} style={presetButton}>Growth sprint</button>
            </div>

            <div style={sectionTitle}>Canvas state</div>
            <div style={summaryBox}>Nodes: {graph.nodes.length} · Edges: {graph.edges.length} · Workflow steps: {orderedNodes.length}</div>
            <button onClick={addSkillNode} style={primaryButton}>Add skill node</button>

            <div style={sectionTitle}>Workflow run</div>
            <div style={summaryBox}>The graph is serialized into a private workflow template, installed immediately, and then polled until the instance settles.</div>
            <button onClick={() => void runCanvasWorkflow()} style={primaryButton} disabled={workflowBusy}>
              {workflowBusy ? "Running workflow..." : "Create + run workflow"}
            </button>
            {activeTemplateId && (
              <div style={instanceCard}>
                <div style={instanceRow}>
                  <span style={fieldLabel}>Template</span>
                  <span style={instanceValue}>{activeTemplateName || activeTemplateId}</span>
                </div>
                <div style={instanceRow}>
                  <span style={fieldLabel}>Instance</span>
                  <span style={instanceValue}>{activeInstance?.id || "Pending"}</span>
                </div>
                <div style={instanceRow}>
                  <span style={fieldLabel}>Status</span>
                  <span style={{ ...statusBadge, ...(activeInstance?.status === "done" ? statusDone : activeInstance?.status === "failed" ? statusFailed : statusRunning) }}>
                    {activeInstance?.status || "queued"}
                  </span>
                </div>
                <button onClick={() => void refreshActiveInstance()} style={secondaryButton} disabled={!activeInstance?.id || workflowBusy}>Refresh instance</button>
              </div>
            )}
            {workflowError && <div style={errorBox}>{workflowError}</div>}

            <div style={sectionTitle}>Selected node</div>
            {selectedNode ? (
              <>
                <label style={fieldLabel}>Label</label>
                <input
                  value={selectedNode.label}
                  onChange={(event) => updateSelectedNode({ label: event.target.value })}
                  style={input}
                />
                <label style={fieldLabel}>Kind</label>
                <select
                  value={selectedNode.kind}
                  onChange={(event) => updateSelectedNode({ kind: event.target.value as NodeKind })}
                  style={input}
                >
                  <option value="input">Input</option>
                  <option value="skill">Skill</option>
                  <option value="review">Review</option>
                  <option value="output">Output</option>
                </select>
                <label style={fieldLabel}>Workflow step kind</label>
                <select
                  value={selectedNode.stepKind}
                  onChange={(event) => updateSelectedNode({ stepKind: event.target.value as WorkflowStepKind })}
                  style={input}
                >
                  {STEP_KIND_OPTIONS.map((stepKind) => (
                    <option key={stepKind} value={stepKind}>{stepKind}</option>
                  ))}
                </select>
                <label style={fieldLabel}>Agent role</label>
                <input
                  value={selectedNode.agentRole}
                  onChange={(event) => updateSelectedNode({ agentRole: event.target.value })}
                  placeholder="researcher / builder / qa"
                  style={input}
                />
                <label style={fieldLabel}>Note</label>
                <textarea
                  value={selectedNode.note}
                  onChange={(event) => updateSelectedNode({ note: event.target.value })}
                  style={textarea}
                />
                <div style={nudgeGrid}>
                  <button onClick={() => updateSelectedNode({ y: selectedNode.y - 16 })} style={secondaryButton}>Move up</button>
                  <button onClick={() => updateSelectedNode({ x: selectedNode.x - 16 })} style={secondaryButton}>Move left</button>
                  <button onClick={() => updateSelectedNode({ x: selectedNode.x + 16 })} style={secondaryButton}>Move right</button>
                  <button onClick={() => updateSelectedNode({ y: selectedNode.y + 16 })} style={secondaryButton}>Move down</button>
                </div>
                <button onClick={removeSelectedNode} style={ghostButton}>Delete node</button>
              </>
            ) : (
              <div style={summaryBox}>Pick a node on the canvas to edit its label, note, workflow kind, and agent handoff.</div>
            )}
          </div>

          <div style={canvasShell}>
            <div style={canvasHeader}>Drag nodes to reshape the flow. The canvas persists locally per desktop device and now emits a real backend workflow run.</div>
            {activeInstance && (
              <div style={resultsCard}>
                <div style={resultsHeaderRow}>
                  <div>
                    <div style={sectionTitle}>Latest instance</div>
                    <div style={canvasHeader}>Current step: {Math.min(activeInstance.currentStep + 1, Math.max(orderedNodes.length, 1))} / {Math.max(orderedNodes.length, 1)}</div>
                  </div>
                  <span style={{ ...statusBadge, ...(activeInstance.status === "done" ? statusDone : activeInstance.status === "failed" ? statusFailed : statusRunning) }}>
                    {activeInstance.status}
                  </span>
                </div>
                {activeInstance.results.length === 0 ? (
                  <div style={summaryBox}>The backend accepted the run. Step output will appear here as the instance progresses.</div>
                ) : (
                  <div style={resultList}>
                    {activeInstance.results.map((result, index) => {
                      const stepNode = resolveResultNode(result.step_id, orderedNodes) || orderedNodes[index] || null;
                      return (
                        <div key={`${result.step_id}:${index}`} style={resultItem}>
                          <div style={resultStep}>{stepNode?.label || result.step_id}</div>
                          <div style={resultNote}>{result.result || result.status}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div ref={canvasRef} style={canvasArea}>
              <svg width="100%" height="100%" style={edgeLayer}>
                {graph.edges.map((edge) => {
                  const from = nodeMap[edge.from];
                  const to = nodeMap[edge.to];
                  if (!from || !to) return null;
                  const startX = from.x + 160;
                  const startY = from.y + 48;
                  const endX = to.x;
                  const endY = to.y + 48;
                  const midX = (startX + endX) / 2;
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke="rgba(148,163,184,0.48)"
                        strokeWidth="2.5"
                        strokeDasharray={edge.label ? "0" : "6 5"}
                      />
                      {edge.label && (
                        <text x={midX} y={(startY + endY) / 2 - 8} fill="#94a3b8" fontSize="11" textAnchor="middle">
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {graph.nodes.map((node) => {
                const color = NODE_COLORS[node.kind];
                const selected = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    onMouseDown={(event) => handleNodeMouseDown(event, node)}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      ...nodeCard,
                      left: node.x,
                      top: node.y,
                      borderColor: selected ? color.border : "rgba(148,163,184,0.18)",
                      background: selected ? color.fill : "rgba(15,23,42,0.88)",
                      boxShadow: selected ? `0 0 0 1px ${color.border}, 0 18px 40px ${color.glow}` : "0 14px 30px rgba(0,0,0,0.22)",
                    }}
                  >
                    <div style={{ ...nodeKindBadge, color: color.border, borderColor: color.border }}>{node.kind}</div>
                    <div style={nodeLabel}>{node.label}</div>
                    <div style={nodeNote}>{node.note}</div>
                    <div style={nodeStepMeta}>{node.stepKind}{node.agentRole ? ` · ${node.agentRole}` : ""}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 12, 20, 0.62)",
  zIndex: 9150,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};
const panel: CSSProperties = {
  width: "min(1180px, 96vw)",
  maxHeight: "88vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  background: "linear-gradient(180deg, rgba(19,24,39,0.98) 0%, rgba(11,15,26,0.98) 100%)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 24,
  boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
};
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  padding: "20px 24px 16px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
};
const title: CSSProperties = { fontSize: 22, fontWeight: 700, color: "#f8fafc" };
const subtitle: CSSProperties = { marginTop: 6, color: "#94a3b8", fontSize: 13 };
const closeButton: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.72)",
  color: "#e2e8f0",
  padding: "8px 14px",
  cursor: "pointer",
};
const body: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 18,
  padding: 24,
  overflow: "auto",
};
const sidebar: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 18,
  borderRadius: 20,
  background: "rgba(15,23,42,0.5)",
  border: "1px solid rgba(148,163,184,0.14)",
};
const sectionTitle: CSSProperties = { fontSize: 14, fontWeight: 700, color: "#f8fafc", marginTop: 4 };
const presetColumn: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const presetButton: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.78)",
  color: "#e2e8f0",
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
};
const summaryBox: CSSProperties = {
  borderRadius: 14,
  padding: "11px 12px",
  background: "rgba(2,8,23,0.52)",
  border: "1px solid rgba(148,163,184,0.12)",
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
};
const instanceCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,8,23,0.56)",
};
const instanceRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const instanceValue: CSSProperties = { fontSize: 12, color: "#e2e8f0", textAlign: "right", wordBreak: "break-word" };
const errorBox: CSSProperties = {
  borderRadius: 14,
  padding: "11px 12px",
  border: "1px solid rgba(248,113,113,0.24)",
  background: "rgba(127,29,29,0.22)",
  color: "#fecaca",
  fontSize: 12,
  lineHeight: 1.5,
};
const primaryButton: CSSProperties = {
  border: "none",
  borderRadius: 14,
  background: "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)",
  color: "#042214",
  fontWeight: 700,
  padding: "11px 14px",
  cursor: "pointer",
};
const secondaryButton: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.76)",
  color: "#cbd5e1",
  padding: "9px 10px",
  cursor: "pointer",
};
const ghostButton: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.2)",
  background: "transparent",
  color: "#fecaca",
  padding: "9px 10px",
  cursor: "pointer",
};
const fieldLabel: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "#94a3b8" };
const input: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.84)",
  color: "#e2e8f0",
  padding: "10px 12px",
  fontSize: 13,
};
const textarea: CSSProperties = { ...input, minHeight: 110, resize: "vertical", fontFamily: "inherit" };
const nudgeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const canvasShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 560,
};
const canvasHeader: CSSProperties = { color: "#94a3b8", fontSize: 12 };
const resultsCard: CSSProperties = {
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(15,23,42,0.48)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const resultsHeaderRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" };
const statusBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 82,
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  border: "1px solid transparent",
};
const statusRunning: CSSProperties = { color: "#bfdbfe", borderColor: "rgba(59,130,246,0.3)", background: "rgba(30,64,175,0.18)" };
const statusDone: CSSProperties = { color: "#bbf7d0", borderColor: "rgba(34,197,94,0.28)", background: "rgba(20,83,45,0.22)" };
const statusFailed: CSSProperties = { color: "#fecaca", borderColor: "rgba(248,113,113,0.28)", background: "rgba(127,29,29,0.22)" };
const resultList: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const resultItem: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,8,23,0.5)",
  padding: "10px 12px",
};
const resultStep: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#f8fafc" };
const resultNote: CSSProperties = { marginTop: 5, fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 };
const canvasArea: CSSProperties = {
  position: "relative",
  minHeight: 560,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.14)",
  background: "radial-gradient(circle at top, rgba(45,212,191,0.08), transparent 44%), repeating-linear-gradient(0deg, rgba(148,163,184,0.08), rgba(148,163,184,0.08) 1px, transparent 1px, transparent 36px), repeating-linear-gradient(90deg, rgba(148,163,184,0.08), rgba(148,163,184,0.08) 1px, transparent 1px, transparent 36px), #0b1120",
};
const edgeLayer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const nodeCard: CSSProperties = {
  position: "absolute",
  width: 160,
  minHeight: 96,
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  padding: 14,
  textAlign: "left",
  cursor: "grab",
  background: "rgba(15,23,42,0.88)",
};
const nodeKindBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid",
  padding: "4px 8px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};
const nodeLabel: CSSProperties = { marginTop: 10, fontSize: 15, fontWeight: 700, color: "#f8fafc" };
const nodeNote: CSSProperties = { marginTop: 8, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 };
const nodeStepMeta: CSSProperties = { marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.4 };
