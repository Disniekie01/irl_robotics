import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import {
  Brain,
  Camera,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Clock,
  Copy,
  Download,
  GitBranch,
  GitFork,
  GitMerge,
  Hand,
  Home,
  LayoutGrid,
  Link2,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Redo2,
  Repeat,
  Save,
  Square,
  Target,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import type { ServerStatus } from "@/types";

// ── Types ────────────────────────────────────────────────────────────

interface BaseNodeData {
  label: string;
  nodeType: string;
  onError?: "continue" | "abort" | "retry";
  _execState?: "running" | "completed" | "error";
  _errorMessage?: string;
  [key: string]: unknown;
}

interface MacroNodeData extends BaseNodeData { nodeType: "macro"; macroName: string; speed: number; loops: number }
interface DelayNodeData extends BaseNodeData { nodeType: "delay"; seconds: number }
interface GripperNodeData extends BaseNodeData { nodeType: "gripper"; action: "open" | "close" }
interface MoveToNodeData extends BaseNodeData { nodeType: "moveTo"; angles: number[] }
interface ConditionalNodeData extends BaseNodeData { nodeType: "conditional"; conditionType: string; threshold: number }
interface LoopNodeData extends BaseNodeData { nodeType: "loop"; count: number }
interface AIInferenceNodeData extends BaseNodeData { nodeType: "aiInference"; steps: number; speed: number }
interface WaitInputNodeData extends BaseNodeData { nodeType: "waitInput"; message: string }
interface RecordSnapshotNodeData extends BaseNodeData { nodeType: "recordSnapshot"; poseName: string }
interface LeaderFollowerNodeData extends BaseNodeData { nodeType: "leaderFollower"; action: "start" | "stop" }

interface MacroInfo { name: string; duration_s: number; frame_count: number }
interface GraphInfo { name: string; node_count: number; edge_count: number }
interface ExecStatus {
  executing: boolean;
  paused: boolean;
  current_node: string | null;
  completed_nodes: string[];
  error_nodes: Record<string, string>;
}
interface LogEntry { timestamp: number; node_id: string; node_type: string; status: string; message: string }

// ── Colours & icons ──────────────────────────────────────────────────

const NC: Record<string, string> = {
  macro: "#6366f1", delay: "#f59e0b", home: "#10b981", gripper: "#ec4899",
  moveTo: "#3b82f6", conditional: "#8b5cf6", loop: "#f97316",
  parallel: "#06b6d4", join: "#14b8a6", aiInference: "#a855f7",
  waitInput: "#eab308", recordSnapshot: "#ef4444", leaderFollower: "#22c55e",
  group: "#64748b",
};

// ── Custom nodes ─────────────────────────────────────────────────────

function BNode({
  children, color, icon: Icon, title, execState,
}: {
  children?: React.ReactNode;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  execState?: string;
}) {
  const border =
    execState === "running" ? { borderColor: "#22c55e", boxShadow: "0 0 10px #22c55e" }
    : execState === "completed" ? { borderColor: "#22c55e80" }
    : execState === "error" ? { borderColor: "#ef4444", boxShadow: "0 0 10px #ef4444" }
    : { borderColor: color };
  return (
    <div
      className={`rounded-lg border-2 shadow-md min-w-[180px] text-xs ${execState === "running" ? "animate-pulse" : ""}`}
      style={{ ...border, background: "var(--card)", color: "var(--card-foreground)" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg font-semibold text-white text-[11px]" style={{ background: color }}>
        <Icon className="size-3" />{title}
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2.5 !h-2.5" />
    </div>
  );
}

function MacroNode({ data }: NodeProps<Node<MacroNodeData>>) {
  return (
    <BNode color={NC.macro} icon={Clapperboard} title="Macro" execState={data._execState}>
      <div className="text-muted-foreground"><span className="font-mono text-foreground">{data.macroName || "—"}</span></div>
      <div className="flex gap-2 text-[10px] text-muted-foreground"><span>Speed: {data.speed}x</span><span>Loops: {data.loops}</span></div>
    </BNode>
  );
}
function DelayNode({ data }: NodeProps<Node<DelayNodeData>>) {
  return <BNode color={NC.delay} icon={Clock} title="Delay" execState={data._execState}><div className="text-muted-foreground">Wait <span className="font-mono text-foreground">{data.seconds}s</span></div></BNode>;
}
function HomeNode({ data }: NodeProps<Node<BaseNodeData>>) {
  return <BNode color={NC.home} icon={Home} title="Go Home" execState={data._execState}><div className="text-[10px] text-muted-foreground">Move all joints to zero</div></BNode>;
}
function GripperNode({ data }: NodeProps<Node<GripperNodeData>>) {
  return <BNode color={NC.gripper} icon={Hand} title="Gripper" execState={data._execState}><div className="text-muted-foreground">Action: <span className="font-mono text-foreground capitalize">{data.action}</span></div></BNode>;
}
function MoveToNode({ data }: NodeProps<Node<MoveToNodeData>>) {
  return <BNode color={NC.moveTo} icon={Target} title="Move To" execState={data._execState}><div className="font-mono text-[10px] text-muted-foreground">[{(data.angles || []).map((a) => a.toFixed(1)).join(", ")}]</div></BNode>;
}

function ConditionalNode({ data }: NodeProps<Node<ConditionalNodeData>>) {
  return (
    <div className={`rounded-lg border-2 shadow-md min-w-[180px] text-xs ${data._execState === "running" ? "animate-pulse" : ""}`}
      style={{
        borderColor: data._execState === "running" ? "#22c55e" : data._execState === "error" ? "#ef4444" : NC.conditional,
        background: "var(--card)", color: "var(--card-foreground)",
        ...(data._execState === "running" ? { boxShadow: "0 0 10px #22c55e" } : {}),
      }}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg font-semibold text-white text-[11px]" style={{ background: NC.conditional }}>
        <GitBranch className="size-3" />If / Else
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="text-muted-foreground text-[10px]">{data.conditionType || "gripperTorque"}</div>
        <div className="flex justify-between text-[10px]">
          <span className="text-green-500 font-semibold">True ↙</span>
          <span className="text-red-500 font-semibold">↘ False</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-500 !w-2.5 !h-2.5" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-2.5 !h-2.5" style={{ left: "70%" }} />
    </div>
  );
}

function LoopNode({ data }: NodeProps<Node<LoopNodeData>>) {
  return (
    <div className={`rounded-lg border-2 shadow-md min-w-[180px] text-xs ${data._execState === "running" ? "animate-pulse" : ""}`}
      style={{
        borderColor: data._execState === "running" ? "#22c55e" : data._execState === "error" ? "#ef4444" : NC.loop,
        background: "var(--card)", color: "var(--card-foreground)",
        ...(data._execState === "running" ? { boxShadow: "0 0 10px #22c55e" } : {}),
      }}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg font-semibold text-white text-[11px]" style={{ background: NC.loop }}>
        <Repeat className="size-3" />Loop
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="text-muted-foreground">Repeat <span className="font-mono text-foreground">{data.count}x</span></div>
        <div className="flex justify-between text-[10px]">
          <span className="text-orange-400 font-semibold">Body ↙</span>
          <span className="text-emerald-400 font-semibold">↘ Done</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="loop" className="!bg-orange-400 !w-2.5 !h-2.5" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="done" className="!bg-emerald-400 !w-2.5 !h-2.5" style={{ left: "70%" }} />
    </div>
  );
}

function ParallelNode({ data }: NodeProps<Node<BaseNodeData>>) {
  return <BNode color={NC.parallel} icon={GitFork} title="Parallel" execState={data._execState}><div className="text-[10px] text-muted-foreground">Fork: run children concurrently</div></BNode>;
}
function JoinNode({ data }: NodeProps<Node<BaseNodeData>>) {
  return <BNode color={NC.join} icon={GitMerge} title="Join" execState={data._execState}><div className="text-[10px] text-muted-foreground">Wait for all branches</div></BNode>;
}
function AIInferenceNode({ data }: NodeProps<Node<AIInferenceNodeData>>) {
  return <BNode color={NC.aiInference} icon={Brain} title="AI Inference" execState={data._execState}><div className="text-muted-foreground"><span className="font-mono text-foreground">{data.steps}</span> steps</div></BNode>;
}
function WaitInputNode({ data }: NodeProps<Node<WaitInputNodeData>>) {
  return <BNode color={NC.waitInput} icon={MessageSquare} title="Wait Input" execState={data._execState}><div className="text-[10px] text-muted-foreground">{data.message || "Waiting..."}</div></BNode>;
}
function RecordSnapshotNode({ data }: NodeProps<Node<RecordSnapshotNodeData>>) {
  return <BNode color={NC.recordSnapshot} icon={Camera} title="Snapshot" execState={data._execState}><div className="font-mono text-[10px] text-muted-foreground">{data.poseName || "unnamed"}</div></BNode>;
}
function LeaderFollowerNode({ data }: NodeProps<Node<LeaderFollowerNodeData>>) {
  return <BNode color={NC.leaderFollower} icon={Link2} title="Leader-Follower" execState={data._execState}><div className="text-muted-foreground capitalize">{data.action}</div></BNode>;
}
function GroupNode({ data }: NodeProps<Node<BaseNodeData>>) {
  return <BNode color={NC.group} icon={LayoutGrid} title="Group" execState={data._execState}><div className="text-[10px] text-muted-foreground">{data.label}</div></BNode>;
}

const nodeTypes = {
  macro: MacroNode, delay: DelayNode, home: HomeNode, gripper: GripperNode,
  moveTo: MoveToNode, conditional: ConditionalNode, loop: LoopNode,
  parallel: ParallelNode, join: JoinNode, aiInference: AIInferenceNode,
  waitInput: WaitInputNode, recordSnapshot: RecordSnapshotNode,
  leaderFollower: LeaderFollowerNode, group: GroupNode,
};

// ── Helpers ──────────────────────────────────────────────────────────

let _nid = 1;
const newId = () => `node_${Date.now()}_${_nid++}`;

const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  macro: () => ({ label: "Macro", nodeType: "macro", macroName: "", speed: 1, loops: 1 }),
  delay: () => ({ label: "Delay", nodeType: "delay", seconds: 1 }),
  home: () => ({ label: "Go Home", nodeType: "home" }),
  gripper: () => ({ label: "Gripper", nodeType: "gripper", action: "close" }),
  moveTo: () => ({ label: "Move To", nodeType: "moveTo", angles: [0, 0, 0, 0, 0, 0] }),
  conditional: () => ({ label: "If/Else", nodeType: "conditional", conditionType: "gripperTorque", threshold: 50 }),
  loop: () => ({ label: "Loop", nodeType: "loop", count: 3 }),
  parallel: () => ({ label: "Parallel", nodeType: "parallel" }),
  join: () => ({ label: "Join", nodeType: "join" }),
  aiInference: () => ({ label: "AI Inference", nodeType: "aiInference", steps: 10, speed: 1 }),
  waitInput: () => ({ label: "Wait Input", nodeType: "waitInput", message: "Click continue..." }),
  recordSnapshot: () => ({ label: "Snapshot", nodeType: "recordSnapshot", poseName: "" }),
  leaderFollower: () => ({ label: "Leader-Follower", nodeType: "leaderFollower", action: "start" }),
  group: () => ({ label: "Group", nodeType: "group" }),
};

function makeNode(type: string, x: number, y: number): Node {
  return { id: newId(), position: { x, y }, type, data: (DEFAULTS[type] || DEFAULTS.home)() };
}

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const adj: Record<string, string[]> = {};
  const inDeg: Record<string, number> = {};
  for (const n of nodes) { adj[n.id] = []; inDeg[n.id] = 0; }
  for (const e of edges) {
    adj[e.source]?.push(e.target);
    inDeg[e.target] = (inDeg[e.target] || 0) + 1;
  }
  const levels: Record<string, number> = {};
  const queue = nodes.filter((n) => !inDeg[n.id]).map((n) => n.id);
  for (const id of queue) levels[id] = 0;
  let i = 0;
  while (i < queue.length) {
    const id = queue[i++];
    for (const next of adj[id] || []) {
      levels[next] = Math.max(levels[next] || 0, (levels[id] || 0) + 1);
      if (--inDeg[next] === 0) queue.push(next);
    }
  }
  for (const n of nodes) if (!(n.id in levels)) levels[n.id] = (Math.max(0, ...Object.values(levels)) + 1);
  const byLevel: Record<number, string[]> = {};
  for (const [id, lv] of Object.entries(levels)) (byLevel[lv] ||= []).push(id);
  const GX = 230, GY = 130;
  return nodes.map((n) => {
    const lv = levels[n.id] || 0;
    const siblings = byLevel[lv] || [];
    const col = siblings.indexOf(n.id);
    return { ...n, position: { x: col * GX - ((siblings.length - 1) * GX) / 2 + 300, y: lv * GY + 60 } };
  });
}

function exportGraph(name: string, nodes: Node[], edges: Edge[]) {
  const blob = new Blob([JSON.stringify({ name, nodes, edges, exported_at: Date.now() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name || "graph"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Palette ──────────────────────────────────────────────────────────

const PALETTE = [
  { type: "macro", label: "Macro", icon: Clapperboard, desc: "Play a recorded macro" },
  { type: "delay", label: "Delay", icon: Clock, desc: "Wait N seconds" },
  { type: "home", label: "Home", icon: Home, desc: "Move to home position" },
  { type: "gripper", label: "Gripper", icon: Hand, desc: "Open/close gripper" },
  { type: "moveTo", label: "Move To", icon: Target, desc: "Move to joint angles" },
  { type: "conditional", label: "If / Else", icon: GitBranch, desc: "Branch on condition" },
  { type: "loop", label: "Loop", icon: Repeat, desc: "Repeat N times" },
  { type: "parallel", label: "Parallel", icon: GitFork, desc: "Run branches concurrently" },
  { type: "join", label: "Join", icon: GitMerge, desc: "Wait for all branches" },
  { type: "aiInference", label: "AI Inference", icon: Brain, desc: "Run trained model" },
  { type: "waitInput", label: "Wait Input", icon: MessageSquare, desc: "Wait for user" },
  { type: "recordSnapshot", label: "Snapshot", icon: Camera, desc: "Save joint pose" },
  { type: "leaderFollower", label: "Leader-Follower", icon: Link2, desc: "Start/stop teleop" },
  { type: "group", label: "Group", icon: LayoutGrid, desc: "Visual grouping" },
];

// ── Undo / Redo hook ─────────────────────────────────────────────────

const MAX_HIST = 50;

function useUndoRedo() {
  const hist = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const ptr = useRef(-1);
  const save = useCallback((nodes: Node[], edges: Edge[]) => {
    hist.current.splice(ptr.current + 1);
    hist.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    if (hist.current.length > MAX_HIST) hist.current.shift();
    ptr.current = hist.current.length - 1;
  }, []);
  const undo = useCallback(() => {
    if (ptr.current <= 0) return null;
    return structuredClone(hist.current[--ptr.current]);
  }, []);
  const redo = useCallback(() => {
    if (ptr.current >= hist.current.length - 1) return null;
    return structuredClone(hist.current[++ptr.current]);
  }, []);
  const canUndo = useCallback(() => ptr.current > 0, []);
  const canRedo = useCallback(() => ptr.current < hist.current.length - 1, []);
  return { save, undo, redo, canUndo, canRedo };
}

// ── Main component ───────────────────────────────────────────────────

export function SkillGraphPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphName, setGraphName] = useState("untitled");
  const [selectedRobotId, setSelectedRobotId] = useState<string>("0");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [executing, setExecuting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [execLog, setExecLog] = useState<LogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<Node | null>(null);
  const { save: saveHistory, undo, redo, canUndo, canRedo } = useUndoRedo();

  const { data: macroList } = useSWR<{ macros: MacroInfo[] }>("/macro/list", fetcher);
  const { data: graphList, mutate: mutateGraphs } = useSWR<{ graphs: GraphInfo[] }>("/skillgraph/list", fetcher);
  const { data: serverStatus } = useSWR<ServerStatus>("/status", fetcher, { refreshInterval: 5000 });

  useEffect(() => {
    const robots = serverStatus?.robot_status ?? [];
    if (!robots.length) return;
    const idx = Number(selectedRobotId);
    if (Number.isNaN(idx) || idx < 0 || idx >= robots.length) setSelectedRobotId("0");
  }, [serverStatus, selectedRobotId]);

  // Live execution polling
  const { data: execStatus } = useSWR<ExecStatus>(
    executing ? "/skillgraph/execution-status" : null,
    fetcher,
    { refreshInterval: 400 },
  );

  useEffect(() => {
    if (!execStatus) return;
    setExecuting(execStatus.executing);
    setPaused(execStatus.paused);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _execState: execStatus.current_node === n.id ? "running"
            : execStatus.completed_nodes.includes(n.id) ? "completed"
            : execStatus.error_nodes[n.id] ? "error"
            : undefined,
          _errorMessage: execStatus.error_nodes[n.id] || undefined,
        },
      })),
    );
    if (!execStatus.executing && executing) {
      fetchWithBaseUrl("/skillgraph/execution-log", "GET").then((r) => {
        if (r?.log) setExecLog(r.log);
      });
    }
  }, [execStatus, executing, setNodes]);

  const snap = useCallback(() => saveHistory(nodes, edges), [nodes, edges, saveHistory]);

  const onConnect = useCallback(
    (conn: Connection) => {
      snap();
      setEdges((eds) =>
        addEdge(
          { ...conn, animated: true, style: { stroke: "var(--border)" }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" } },
          eds,
        ),
      );
    },
    [setEdges, snap],
  );

  const addNode = useCallback(
    (type: string) => {
      snap();
      const x = 100 + Math.random() * 200;
      const y = 100 + nodes.length * 80;
      setNodes((nds) => [...nds, makeNode(type, x, y)]);
    },
    [nodes.length, setNodes, snap],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNode) return;
    snap();
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges, snap]);

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
      setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...patch } } : prev));
    },
    [setNodes],
  );

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    const s = undo();
    if (s) { setNodes(s.nodes); setEdges(s.edges); }
  }, [undo, setNodes, setEdges]);
  const handleRedo = useCallback(() => {
    const s = redo();
    if (s) { setNodes(s.nodes); setEdges(s.edges); }
  }, [redo, setNodes, setEdges]);

  // Copy / Paste
  const handleCopy = useCallback(() => {
    if (selectedNode) { clipboardRef.current = structuredClone(selectedNode); toast.success("Copied"); }
  }, [selectedNode]);
  const handlePaste = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) return;
    snap();
    const n = { ...structuredClone(src), id: newId(), position: { x: src.position.x + 40, y: src.position.y + 40 } };
    setNodes((nds) => [...nds, n]);
  }, [setNodes, snap]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && e.shiftKey) { handleRedo(); e.preventDefault(); }
      else if (e.key === "z") { handleUndo(); e.preventDefault(); }
      else if (e.key === "c") handleCopy();
      else if (e.key === "v") { handlePaste(); e.preventDefault(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleUndo, handleRedo, handleCopy, handlePaste]);

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    snap();
    setNodes((nds) => autoLayout(nds, edges));
  }, [setNodes, edges, snap]);

  // Save / Load / Delete / Execute / Stop / Pause / Resume
  async function handleSave() {
    if (!graphName.trim()) { toast.error("Enter a graph name"); return; }
    setSaving(true);
    try {
      const res = await fetchWithBaseUrl("/skillgraph/save", "POST", {
        name: graphName,
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
      });
      if (res?.status === "ok") { toast.success(res.message); mutateGraphs(); }
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  }

  async function handleLoad(name: string) {
    try {
      const res = await fetchWithBaseUrl(`/skillgraph/load/${name}`, "GET");
      if (res?.nodes) {
        const loadedEdges = (res.edges || []).map((e: Edge) => ({
          ...e, animated: true, style: { stroke: "var(--border)" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
        }));
        setNodes(res.nodes);
        setEdges(loadedEdges);
        setGraphName(res.name || name);
        setSelectedNode(null);
        saveHistory(res.nodes, loadedEdges);
        toast.success(`Loaded "${name}"`);
      }
    } catch { toast.error("Failed to load graph"); }
  }

  async function handleDeleteGraph(name: string) {
    try { await fetchWithBaseUrl(`/skillgraph/delete/${name}`, "DELETE"); toast.success(`Deleted "${name}"`); mutateGraphs(); }
    catch { toast.error("Failed to delete"); }
  }

  async function handleExecute() {
    if (!graphName.trim()) return;
    const robot_id = Number(selectedRobotId) || 0;
    setExecuting(true);
    setExecLog([]);
    try {
      await handleSave();
      const res = await fetchWithBaseUrl("/skillgraph/execute", "POST", { name: graphName, robot_id });
      if (res?.status === "ok") toast.success(res.message);
    } catch { toast.error("Execution failed"); setExecuting(false); }
  }

  async function handleStop() {
    try { await fetchWithBaseUrl("/skillgraph/stop", "POST", {}); toast.success("Stopped"); }
    catch { toast.error("Failed to stop"); }
    setExecuting(false);
  }

  async function handlePause() {
    try { await fetchWithBaseUrl("/skillgraph/pause", "POST", {}); setPaused(true); }
    catch { toast.error("Failed to pause"); }
  }

  async function handleResume() {
    try { await fetchWithBaseUrl("/skillgraph/resume", "POST", {}); setPaused(false); }
    catch { toast.error("Failed to resume"); }
  }

  async function handleContinueWait() {
    try { await fetchWithBaseUrl("/skillgraph/continue", "POST", {}); toast.success("Continuing"); }
    catch { toast.error("Failed"); }
  }

  // Import
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes) {
          snap();
          const loadedEdges = (data.edges || []).map((ed: Edge) => ({
            ...ed, animated: true, style: { stroke: "var(--border)" },
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
          }));
          setNodes(data.nodes);
          setEdges(loadedEdges);
          if (data.name) setGraphName(data.name);
          toast.success("Graph imported");
        }
      } catch { toast.error("Invalid JSON file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const waitingForInput = execStatus?.current_node && nodes.find(
    (n) => n.id === execStatus.current_node && (n.data as BaseNodeData).nodeType === "waitInput",
  );

  return (
    <div className="flex h-[calc(100vh-64px)] -mx-6 -my-5">
      {/* ── Left panel ── */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-border">
          <div className="text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground/50 mb-2">Add Nodes</div>
          <div className="space-y-0.5">
            {PALETTE.map((t) => (
              <button key={t.type} onClick={() => addNode(t.type)}
                className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                <div className="size-5 rounded flex items-center justify-center" style={{ background: NC[t.type] }}>
                  <t.icon className="size-3 text-white" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-foreground leading-tight">{t.label}</div>
                  <div className="text-[9px] text-muted-foreground leading-tight">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="p-3 flex-1">
          <div className="text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground/50 mb-2">Saved Graphs</div>
          {graphList?.graphs?.length ? (
            <div className="space-y-1">
              {graphList.graphs.map((g) => (
                <div key={g.name} className="flex items-center gap-1 group">
                  <button onClick={() => handleLoad(g.name)}
                    className="flex-1 text-left px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors truncate">
                    {g.name}<span className="text-[10px] text-muted-foreground/50 ml-1">({g.node_count}n)</span>
                  </button>
                  <button onClick={() => handleDeleteGraph(g.name)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 transition-all">
                    <Trash2 className="size-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          ) : (<p className="text-[10px] text-muted-foreground/50">No saved graphs</p>)}
        </div>
      </div>

      {/* ── Center ── */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border shrink-0 flex-wrap">
          <Input value={graphName} onChange={(e) => setGraphName(e.target.value)} className="w-36 h-7 text-xs font-mono" placeholder="Graph name" />
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Robot</Label>
            <Select
              value={selectedRobotId}
              onValueChange={setSelectedRobotId}
              disabled={!serverStatus?.robot_status?.length}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="Select robot" />
              </SelectTrigger>
              <SelectContent>
                {(serverStatus?.robot_status ?? []).map((robot, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {robot.name}{robot.device_name ? ` (${robot.device_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-7 text-xs">
            {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}Save
          </Button>
          {executing ? (
            <>
              {paused ? (
                <Button size="sm" onClick={handleResume} className="h-7 text-xs"><Play className="size-3 mr-1" />Resume</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handlePause} className="h-7 text-xs"><Pause className="size-3 mr-1" />Pause</Button>
              )}
              <Button size="sm" variant="destructive" onClick={handleStop} className="h-7 text-xs"><Square className="size-3 mr-1" />Stop</Button>
              {waitingForInput && (
                <Button size="sm" onClick={handleContinueWait} className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700"><Play className="size-3 mr-1" />Continue</Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={nodes.length === 0 || !(serverStatus?.robot_status?.length)}
              className="h-7 text-xs"
            >
              <Play className="size-3 mr-1" />Execute
            </Button>
          )}
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="sm" variant="ghost" onClick={handleUndo} disabled={!canUndo()} className="h-7 w-7 p-0" title="Undo (Ctrl+Z)"><Undo2 className="size-3" /></Button>
          <Button size="sm" variant="ghost" onClick={handleRedo} disabled={!canRedo()} className="h-7 w-7 p-0" title="Redo (Ctrl+Shift+Z)"><Redo2 className="size-3" /></Button>
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!selectedNode} className="h-7 w-7 p-0" title="Copy (Ctrl+C)"><Copy className="size-3" /></Button>
          <Button size="sm" variant="ghost" onClick={handleAutoLayout} disabled={nodes.length === 0} className="h-7 w-7 p-0" title="Auto-layout"><LayoutGrid className="size-3" /></Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="sm" variant="ghost" onClick={() => exportGraph(graphName, nodes, edges)} disabled={nodes.length === 0} className="h-7 w-7 p-0" title="Export"><Download className="size-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} className="h-7 w-7 p-0" title="Import"><Upload className="size-3" /></Button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          {selectedNode && (
            <Button size="sm" variant="ghost" onClick={deleteSelected} className="h-7 text-xs text-destructive ml-auto"><Trash2 className="size-3 mr-1" />Delete</Button>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick} nodeTypes={nodeTypes} fitView
            className="bg-background" defaultEdgeOptions={{ animated: true, style: { stroke: "var(--border)" } }}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
            <Controls className="!bg-card !border-border !shadow-md [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground [&_button:hover]:!bg-accent" />
            <MiniMap
              nodeColor={(n) => NC[(n.data as BaseNodeData)?.nodeType] || "#666"}
              maskColor="rgba(0,0,0,0.15)"
              className="!bg-card !border-border"
            />
          </ReactFlow>
        </div>

        {/* Execution log panel */}
        {execLog.length > 0 && (
          <div className="border-t border-border">
            <button onClick={() => setLogOpen(!logOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 w-full text-xs text-muted-foreground hover:text-foreground">
              {logOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              Execution Log ({execLog.length} entries)
            </button>
            {logOpen && (
              <div className="max-h-40 overflow-y-auto px-3 pb-2 space-y-0.5">
                {execLog.map((e, i) => (
                  <div key={i} className="flex gap-2 text-[10px] font-mono">
                    <span className={e.status === "error" ? "text-red-500" : e.status === "completed" ? "text-green-500" : "text-muted-foreground"}>
                      [{e.status}]
                    </span>
                    <span className="text-muted-foreground">{e.node_type}</span>
                    {e.message && <span className="text-foreground/70">{e.message}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="w-60 shrink-0 border-l border-border overflow-y-auto">
        <div className="p-3">
          <div className="text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground/50 mb-3">Properties</div>
          {selectedNode ? (
            <NodeProperties node={selectedNode} macros={macroList?.macros || []} onUpdate={(p) => updateNodeData(selectedNode.id, p)} />
          ) : (
            <p className="text-xs text-muted-foreground/50">Select a node to edit its properties. Drag connections between nodes to define execution order.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Node Properties ──────────────────────────────────────────────────

function NodeProperties({ node, macros, onUpdate }: { node: Node; macros: MacroInfo[]; onUpdate: (p: Record<string, unknown>) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = node.data as Record<string, any>;
  const t = d.nodeType || node.type;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="size-4 rounded" style={{ background: NC[t] || "#666" }} />
        <span className="text-sm font-medium capitalize">{t}</span>
      </div>

      {/* Error policy (all nodes) */}
      <div className="space-y-1">
        <Label className="text-[11px]">On Error</Label>
        <Select value={d.onError || "continue"} onValueChange={(v) => onUpdate({ onError: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="continue" className="text-xs">Continue</SelectItem>
            <SelectItem value="abort" className="text-xs">Abort</SelectItem>
            <SelectItem value="retry" className="text-xs">Retry</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {t === "macro" && (
        <>
          <div className="space-y-1">
            <Label className="text-[11px]">Macro</Label>
            <Select value={d.macroName || ""} onValueChange={(v) => onUpdate({ macroName: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select macro" /></SelectTrigger>
              <SelectContent>{macros.map((m) => (<SelectItem key={m.name} value={m.name} className="text-xs">{m.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-[11px]">Speed</Label><Input type="number" step={0.25} min={0.25} max={4} value={d.speed ?? 1} onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) || 1 })} className="h-7 text-xs" /></div>
          <div className="space-y-1"><Label className="text-[11px]">Loops</Label><Input type="number" min={1} max={100} value={d.loops ?? 1} onChange={(e) => onUpdate({ loops: parseInt(e.target.value) || 1 })} className="h-7 text-xs" /></div>
        </>
      )}

      {t === "delay" && (
        <div className="space-y-1"><Label className="text-[11px]">Seconds</Label><Input type="number" step={0.5} min={0.1} max={60} value={d.seconds ?? 1} onChange={(e) => onUpdate({ seconds: parseFloat(e.target.value) || 1 })} className="h-7 text-xs" /></div>
      )}

      {t === "gripper" && (
        <div className="space-y-1">
          <Label className="text-[11px]">Action</Label>
          <Select value={d.action || "close"} onValueChange={(v) => onUpdate({ action: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="open" className="text-xs">Open</SelectItem><SelectItem value="close" className="text-xs">Close</SelectItem></SelectContent>
          </Select>
        </div>
      )}

      {t === "moveTo" && (
        <div className="space-y-1">
          <Label className="text-[11px]">Joint Angles (rad)</Label>
          {["Rotation", "Pitch", "Elbow", "W.Pitch", "W.Roll", "Jaw"].map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">{name}</span>
              <Input type="number" step={0.1} value={(d.angles || [])[i] ?? 0}
                onChange={(e) => { const a = [...(d.angles || [0, 0, 0, 0, 0, 0])]; a[i] = parseFloat(e.target.value) || 0; onUpdate({ angles: a }); }}
                className="h-6 text-[10px] font-mono" />
            </div>
          ))}
        </div>
      )}

      {t === "conditional" && (
        <>
          <div className="space-y-1">
            <Label className="text-[11px]">Condition</Label>
            <Select value={d.conditionType || "gripperTorque"} onValueChange={(v) => onUpdate({ conditionType: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gripperTorque" className="text-xs">Gripper Torque</SelectItem>
                <SelectItem value="isGripping" className="text-xs">Is Gripping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {d.conditionType === "gripperTorque" && (
            <div className="space-y-1"><Label className="text-[11px]">Threshold</Label><Input type="number" min={0} max={200} value={d.threshold ?? 50} onChange={(e) => onUpdate({ threshold: parseInt(e.target.value) || 50 })} className="h-7 text-xs" /></div>
          )}
          <p className="text-[10px] text-muted-foreground">Connect the green handle (True) and red handle (False) to different paths.</p>
        </>
      )}

      {t === "loop" && (
        <>
          <div className="space-y-1"><Label className="text-[11px]">Iterations</Label><Input type="number" min={1} max={1000} value={d.count ?? 3} onChange={(e) => onUpdate({ count: parseInt(e.target.value) || 1 })} className="h-7 text-xs" /></div>
          <p className="text-[10px] text-muted-foreground">Orange handle = loop body, green handle = after loop.</p>
        </>
      )}

      {t === "aiInference" && (
        <>
          <div className="space-y-1"><Label className="text-[11px]">Steps</Label><Input type="number" min={1} max={1000} value={d.steps ?? 10} onChange={(e) => onUpdate({ steps: parseInt(e.target.value) || 10 })} className="h-7 text-xs" /></div>
          <div className="space-y-1"><Label className="text-[11px]">Speed</Label><Input type="number" step={0.25} min={0.25} max={4} value={d.speed ?? 1} onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) || 1 })} className="h-7 text-xs" /></div>
        </>
      )}

      {t === "waitInput" && (
        <div className="space-y-1"><Label className="text-[11px]">Message</Label><Input value={d.message || ""} onChange={(e) => onUpdate({ message: e.target.value })} className="h-7 text-xs" placeholder="Waiting..." /></div>
      )}

      {t === "recordSnapshot" && (
        <div className="space-y-1"><Label className="text-[11px]">Pose Name</Label><Input value={d.poseName || ""} onChange={(e) => onUpdate({ poseName: e.target.value })} className="h-7 text-xs" placeholder="snapshot_1" /></div>
      )}

      {t === "leaderFollower" && (
        <div className="space-y-1">
          <Label className="text-[11px]">Action</Label>
          <Select value={d.action || "start"} onValueChange={(v) => onUpdate({ action: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="start" className="text-xs">Start</SelectItem><SelectItem value="stop" className="text-xs">Stop</SelectItem></SelectContent>
          </Select>
        </div>
      )}

      {t === "group" && (
        <div className="space-y-1"><Label className="text-[11px]">Label</Label><Input value={d.label || ""} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs" placeholder="Group name" /></div>
      )}

      {(t === "home" || t === "parallel" || t === "join") && (
        <p className="text-[11px] text-muted-foreground">No configuration needed.</p>
      )}
    </div>
  );
}
