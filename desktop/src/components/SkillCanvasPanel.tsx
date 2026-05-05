import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

type NodeKind = "input" | "skill" | "review" | "output";

interface CanvasNode {
  id: string;
  label: string;
  note: string;
  kind: NodeKind;
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
const NODE_COLORS: Record<NodeKind, { border: string; glow: string; fill: string }> = {
  input: { border: "#38bdf8", glow: "rgba(56,189,248,0.3)", fill: "rgba(56,189,248,0.12)" },
  skill: { border: "#2dd4bf", glow: "rgba(45,212,191,0.3)", fill: "rgba(45,212,191,0.12)" },
  review: { border: "#f59e0b", glow: "rgba(245,158,11,0.28)", fill: "rgba(245,158,11,0.12)" },
  output: { border: "#c084fc", glow: "rgba(192,132,252,0.3)", fill: "rgba(192,132,252,0.12)" },
};

function buildPresetGraph(preset: "research" | "release" | "growth"): CanvasGraph {
  if (preset === "release") {
    return {
      nodes: [
        { id: "release-intake", label: "Release brief", note: "Scope, repo, target platform", kind: "input", x: 50, y: 90 },
        { id: "release-build", label: "Build chain", note: "Compile and package artifact", kind: "skill", x: 290, y: 90 },
        { id: "release-qa", label: "QA lane", note: "Smoke checks and rollback notes", kind: "review", x: 530, y: 90 },
        { id: "release-ship", label: "Ship", note: "Tag, push, and communicate release", kind: "output", x: 770, y: 90 },
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
        { id: "growth-signal", label: "Signal", note: "Capture user need or metric drop", kind: "input", x: 50, y: 90 },
        { id: "growth-copy", label: "Copy craft", note: "Draft landing page or announcement", kind: "skill", x: 290, y: 40 },
        { id: "growth-creative", label: "Creative", note: "Assemble asset variants", kind: "skill", x: 290, y: 180 },
        { id: "growth-review", label: "Review", note: "Score message-market fit", kind: "review", x: 550, y: 110 },
        { id: "growth-launch", label: "Launch", note: "Push experiment live", kind: "output", x: 800, y: 110 },
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
      { id: "research-intake", label: "Intake", note: "Problem framing and constraints", kind: "input", x: 50, y: 110 },
      { id: "research-gather", label: "Gather", note: "Search repos, docs, and user context", kind: "skill", x: 290, y: 40 },
      { id: "research-synth", label: "Synthesize", note: "Compress findings into plan", kind: "skill", x: 290, y: 200 },
      { id: "research-review", label: "Review", note: "Check risk and missing evidence", kind: "review", x: 560, y: 120 },
      { id: "research-output", label: "Deliver", note: "Ship answer or patch set", kind: "output", x: 820, y: 120 },
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
    return parsed;
  } catch {
    return buildPresetGraph("research");
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function SkillCanvasPanel({ open, onClose }: Props) {
  const [graph, setGraph] = useState<CanvasGraph>(() => loadGraph());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id ?? null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    } catch {}
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

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null;
  const nodeMap = useMemo(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  if (!open) return null;

  const applyPreset = (preset: "research" | "release" | "growth") => {
    const nextGraph = buildPresetGraph(preset);
    setGraph(nextGraph);
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null);
  };

  const addSkillNode = () => {
    const anchor = selectedNode || graph.nodes[graph.nodes.length - 1] || { x: 120, y: 120, id: "" };
    const id = `node-${Date.now()}`;
    const nextNode: CanvasNode = {
      id,
      label: "Custom skill",
      note: "Describe the tool, prompt, or agent handoff.",
      kind: "skill",
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
    setGraph((prev) => ({
      nodes: prev.nodes.filter((node) => node.id !== selectedNodeId),
      edges: prev.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId),
    }));
    setSelectedNodeId((prev) => prev === selectedNodeId ? graph.nodes.find((node) => node.id !== selectedNodeId)?.id ?? null : prev);
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

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={title}>Skill Canvas</div>
            <div style={subtitle}>Arrange tool nodes, reviews, and outputs into a local orchestration map.</div>
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
            <div style={summaryBox}>Nodes: {graph.nodes.length} · Edges: {graph.edges.length}</div>
            <button onClick={addSkillNode} style={primaryButton}>Add skill node</button>

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
              <div style={summaryBox}>Pick a node on the canvas to edit its label, note, and placement.</div>
            )}
          </div>

          <div style={canvasShell}>
            <div style={canvasHeader}>Drag nodes to reshape the flow. The canvas persists locally per desktop device.</div>
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
                        <text
                          x={midX}
                          y={(startY + endY) / 2 - 8}
                          fill="#94a3b8"
                          fontSize="11"
                          textAnchor="middle"
                        >
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
