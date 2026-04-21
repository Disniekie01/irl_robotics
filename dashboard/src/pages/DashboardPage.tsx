import { AIControlDisclaimer } from "@/components/common/ai-control-disclaimer";
import { HuggingFaceKeyInput } from "@/components/common/huggingface-key";
import { RobotVisualizer } from "@/components/visualizer/RobotVisualizer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import { AdminTokenSettings, ServerStatus } from "@/types";
import {
  AlertTriangle,
  BicepsFlexed,
  Bot,
  BrainCircuit,
  Camera,
  Clock,
  Clapperboard,
  Cpu,
  Database,
  Dumbbell,
  FolderOpen,
  GripVertical,
  HardDrive,
  Keyboard,
  Loader2,
  Lock,
  Monitor,
  Pencil,
  Play,
  Plus,
  Sliders,
  SlidersHorizontal,
  Radio,
  Square,
  Thermometer,
  Trash2,
  Workflow,
  Activity,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import useSWR from "swr";
import { KeyboardControl } from "@/pages/control/KeyboardControlPage";
import { LeaderArmControl } from "@/pages/control/LeaderArmControlPage";
import { SlidersControl } from "@/pages/control/SlidersControlPage";
import { MacrosControl } from "@/pages/control/MacrosPage";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

// --- Types ---

interface DatasetStats {
  total_local: number;
  total_episodes: number;
  disk_usage_mb: number;
}

interface DashboardStats {
  uptime_s: number;
  dataset_stats: DatasetStats;
  macro_stats: { total: number };
  skill_graph_stats: { total: number };
  recent_activity: { timestamp: number; event: string; detail: string }[];
}

// --- Widget Registry ---

type WidgetId =
  | "stats-uptime"
  | "stats-datasets"
  | "stats-disk"
  | "stats-macros"
  | "gpu-monitor"
  | "quick-actions"
  | "ai-training"
  | "activity-feed"
  | "robot-3d"
  | "robot-status"
  | "camera-preview"
  | "joint-health"
  | "ctrl-keyboard"
  | "ctrl-leader"
  | "ctrl-sliders"
  | "ctrl-macros"
  | "launch-ros2"
  | "launch-isaac"
  | "skill-graph";

interface WidgetDef {
  id: WidgetId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultLayout: { w: number; h: number; minW?: number; minH?: number };
}

const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "stats-uptime", label: "Uptime", icon: Clock, defaultLayout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: "stats-datasets", label: "Datasets", icon: Database, defaultLayout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: "stats-disk", label: "Disk Usage", icon: HardDrive, defaultLayout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: "stats-macros", label: "Macros", icon: Clapperboard, defaultLayout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: "gpu-monitor", label: "GPU Monitor", icon: Cpu, defaultLayout: { w: 4, h: 5, minW: 3, minH: 3 } },
  { id: "quick-actions", label: "Quick Actions", icon: Play, defaultLayout: { w: 6, h: 4, minW: 3, minH: 3 } },
  { id: "ai-training", label: "AI Training", icon: BrainCircuit, defaultLayout: { w: 6, h: 4, minW: 3, minH: 3 } },
  { id: "activity-feed", label: "Activity Feed", icon: Activity, defaultLayout: { w: 12, h: 4, minW: 4, minH: 3 } },
  { id: "robot-3d", label: "3D Visualizer", icon: Bot, defaultLayout: { w: 6, h: 8, minW: 4, minH: 4 } },
  { id: "robot-status", label: "Robot Status", icon: Monitor, defaultLayout: { w: 4, h: 3, minW: 3, minH: 2 } },
  { id: "camera-preview", label: "Camera Feed", icon: Camera, defaultLayout: { w: 6, h: 6, minW: 3, minH: 3 } },
  { id: "ctrl-keyboard", label: "Keyboard Control", icon: Keyboard, defaultLayout: { w: 6, h: 10, minW: 4, minH: 5 } },
  { id: "ctrl-leader", label: "Leader Follower", icon: BicepsFlexed, defaultLayout: { w: 6, h: 8, minW: 4, minH: 4 } },
  { id: "ctrl-sliders", label: "Slider Control", icon: SlidersHorizontal, defaultLayout: { w: 6, h: 8, minW: 4, minH: 4 } },
  { id: "ctrl-macros", label: "Macros", icon: Clapperboard, defaultLayout: { w: 6, h: 8, minW: 4, minH: 4 } },
  { id: "launch-ros2", label: "ROS2 Bridge", icon: Radio, defaultLayout: { w: 3, h: 4, minW: 2, minH: 3 } },
  { id: "launch-isaac", label: "Isaac Sim", icon: Cpu, defaultLayout: { w: 3, h: 4, minW: 2, minH: 3 } },
  { id: "joint-health", label: "Joint Health", icon: Thermometer, defaultLayout: { w: 6, h: 5, minW: 4, minH: 3 } },
  { id: "skill-graph", label: "Run Skill Graph", icon: Workflow, defaultLayout: { w: 4, h: 4, minW: 3, minH: 3 } },
];

const DEFAULT_LAYOUTS: LayoutItem[] = [
  { i: "stats-uptime", x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "stats-datasets", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "stats-disk", x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "stats-macros", x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "quick-actions", x: 0, y: 2, w: 6, h: 4, minW: 3, minH: 3 },
  { i: "ai-training", x: 6, y: 2, w: 6, h: 4, minW: 3, minH: 3 },
  { i: "activity-feed", x: 0, y: 6, w: 12, h: 4, minW: 4, minH: 3 },
];

const DEFAULT_ACTIVE: WidgetId[] = [
  "stats-uptime", "stats-datasets", "stats-disk", "stats-macros",
  "quick-actions", "ai-training", "activity-feed",
];

const STORAGE_KEY = "dashboard_layout";
const ACTIVE_KEY = "dashboard_active_widgets";

function loadLayouts(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt localStorage */ }
  return DEFAULT_LAYOUTS;
}

function loadActiveWidgets(): WidgetId[] {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt localStorage */ }
  return DEFAULT_ACTIVE;
}

// --- Helpers ---

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// --- Individual Widget Components ---

function StatWidget({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
  href,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 h-full">
      <div
        className="size-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${iconColor || "#6366f1"}20` }}
      >
        <Icon className="size-4" style={{ color: iconColor || "#6366f1" }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-lg font-bold text-foreground leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
  if (href) return <Link to={href} className="block h-full">{inner}</Link>;
  return inner;
}

function QuickActionsWidget() {
  return (
    <div className="space-y-2 h-full">
      <div className="text-xs font-semibold">Quick Actions</div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { to: "/control", icon: Play, label: "Control", color: "text-indigo-400" },
          { to: "/browse", icon: FolderOpen, label: "Datasets", color: "" },
          { to: "/calibration", icon: Sliders, label: "Calibrate", color: "" },
          { to: "/visualizer", icon: Bot, label: "3D View", color: "text-indigo-400" },
          { to: "/skills", icon: Workflow, label: "Skills", color: "text-purple-400" },
          { to: "/viz", icon: Camera, label: "Cameras", color: "" },
        ].map((a) => (
          <Button key={a.to} asChild variant="outline" size="sm" className="text-[11px] justify-start h-7 px-2">
            <Link to={a.to}>
              <a.icon className={`size-3 mr-1 ${a.color}`} />
              {a.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function AITrainingWidget() {
  const [showWarning, setShowWarning] = useState(false);
  const navigate = useNavigate();
  const { data: tokens, isLoading } = useSWR<AdminTokenSettings>(
    ["/admin/settings/tokens"],
    ([url]) => fetcher(url, "POST"),
  );

  return (
    <>
      <div className="space-y-2 h-full">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <BrainCircuit className="size-3.5 text-indigo-400" />
          AI Training
        </div>
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
          <p className="text-[10px] font-semibold text-amber-400">Coming Soon</p>
        </div>
        {!isLoading && !tokens?.huggingface && (
          <div className="mb-1"><HuggingFaceKeyInput /></div>
        )}
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1 text-[10px] h-7" onClick={() => navigate("/train")} disabled={!tokens?.huggingface}>
            <Dumbbell className="size-3 mr-1" /> Train
          </Button>
          <Button size="sm" className="flex-1 text-[10px] h-7" onClick={() => {
            if (localStorage.getItem("disclaimer_accepted") === "true") { navigate("/inference"); return; }
            setShowWarning(true);
          }} disabled={!tokens?.huggingface}>
            <BrainCircuit className="size-3 mr-1" /> AI Control
          </Button>
        </div>
      </div>
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="sm:max-w-md border-amber-300 border">
          <DialogHeader className="bg-amber-50 dark:bg-amber-950/20 p-4 -m-4 rounded-t-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="size-10 text-red-500" />
              <DialogTitle>Surrendering control to AI</DialogTitle>
            </div>
          </DialogHeader>
          <AIControlDisclaimer />
          <DialogFooter className="gap-x-2 mt-2">
            <Button variant="outline" onClick={() => setShowWarning(false)}>Cancel</Button>
            <Button onClick={() => { setShowWarning(false); localStorage.setItem("disclaimer_accepted", "true"); navigate("/inference"); }}>
              I Understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActivityFeedWidget({ stats }: { stats?: DashboardStats }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Activity className="size-3.5 text-muted-foreground" />
        Recent Activity
      </div>
      {stats?.recent_activity && stats.recent_activity.length > 0 ? (
        <div className="space-y-1 overflow-y-auto flex-1">
          {stats.recent_activity.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] py-0.5 border-b border-border/50 last:border-0">
              <div className="size-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-foreground font-medium">{item.event}</span>
              {item.detail && <span className="text-muted-foreground truncate">{item.detail}</span>}
              <span className="text-muted-foreground/50 ml-auto shrink-0 text-[10px]">{timeAgo(item.timestamp)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/50">No recent activity yet.</p>
      )}
    </div>
  );
}

function Robot3DWidget() {
  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold mb-1">3D Visualizer</div>
      <div className="flex-1 rounded-lg overflow-hidden border border-border min-h-0">
        <RobotVisualizer className="w-full h-full" />
      </div>
    </div>
  );
}

function RobotStatusWidget({
  serverStatus,
  isLoading,
  robotConnected,
  isSimMode,
  onToggleSim,
  simToggling,
}: {
  serverStatus?: ServerStatus;
  isLoading: boolean;
  robotConnected: boolean;
  isSimMode: boolean;
  onToggleSim: () => void;
  simToggling: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-2 h-full">
      <div className="text-xs font-semibold">Robot Status</div>
      <div className="flex items-center gap-2">
        <div className={`size-2.5 rounded-full ${isLoading ? "bg-muted-foreground animate-pulse" : robotConnected ? "bg-green-400" : "bg-amber-400"}`} />
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : robotConnected ? `Connected: ${serverStatus?.robots?.join(", ")}` : "No robot"}
        </span>
      </div>
      {isSimMode && (
        <div className="rounded border border-blue-500/30 bg-blue-500/10 p-1.5 text-[10px] text-blue-400">
          Simulation Mode
        </div>
      )}
      <div className="flex gap-1.5">
        {robotConnected && (
          <Button size="sm" className="text-[10px] h-6 flex-1" onClick={() => navigate("/control")}>
            <Play className="size-3 mr-1" /> Control
          </Button>
        )}
        <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1" onClick={onToggleSim} disabled={simToggling}>
          {isSimMode ? "Hardware" : "Simulate"}
        </Button>
      </div>
    </div>
  );
}

function CameraPreviewWidget() {
  const { data: serverStatus } = useSWR<ServerStatus>(["/status"], ([url]) => fetcher(url), { refreshInterval: 5000 });
  const cams = serverStatus?.cameras?.cameras_status ?? [];
  const activeCam = cams.find((c) => c.is_active);

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold mb-1">Camera Feed</div>
      {activeCam ? (
        <div className="flex-1 rounded-lg overflow-hidden border border-border bg-black min-h-0">
          <img
            src={`/cameras/preview?camera_id=${activeCam.camera_id}&t=${Date.now()}`}
            alt="Camera"
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50 border border-border rounded-lg">
          No camera connected
        </div>
      )}
    </div>
  );
}

// --- GPU Widget ---

interface GpuInfo {
  index: number;
  name: string;
  temperature_c: number | null;
  utilization_pct: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  memory_pct: number | null;
  power_draw_w: number | null;
  driver_version: string | null;
  cuda_version: string | null;
}

function GpuBar({ label, value, max, unit, color }: { label: string; value: number | null; max?: number; unit: string; color: string }) {
  const pct = value !== null && max ? Math.min(100, (value / max) * 100) : (value ?? 0);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value !== null ? `${Math.round(value)}${unit}` : "--"}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function GpuMonitorWidget() {
  const { data } = useSWR<{ available: boolean; gpus: GpuInfo[] }>("/gpu/status", fetcher, { refreshInterval: 2000 });

  if (!data?.available || !data.gpus.length) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
          <Cpu className="size-3.5 text-green-400" />
          GPU Monitor
        </div>
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground/50">
          No NVIDIA GPU detected
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Cpu className="size-3.5 text-green-400" />
        GPU Monitor
      </div>
      {data.gpus.map((gpu) => (
        <div key={gpu.index} className="space-y-1.5 mb-3 last:mb-0">
          <div className="text-[11px] font-medium text-foreground truncate">{gpu.name}</div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {gpu.driver_version && <span>Driver: {gpu.driver_version}</span>}
            {gpu.cuda_version && <span>CUDA: {gpu.cuda_version}</span>}
          </div>
          <div className="space-y-1.5">
            <GpuBar label="Utilization" value={gpu.utilization_pct} max={100} unit="%" color="#6366f1" />
            <GpuBar
              label={`VRAM ${gpu.memory_used_mb !== null && gpu.memory_total_mb ? `${(gpu.memory_used_mb / 1024).toFixed(1)}/${(gpu.memory_total_mb / 1024).toFixed(0)} GB` : ""}`}
              value={gpu.memory_pct}
              max={100}
              unit="%"
              color="#10b981"
            />
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <Thermometer className="size-3 text-amber-400" />
                <span className="text-muted-foreground">{gpu.temperature_c !== null ? `${gpu.temperature_c}°C` : "--"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="size-3 text-yellow-400" />
                <span className="text-muted-foreground">{gpu.power_draw_w !== null ? `${gpu.power_draw_w.toFixed(0)}W` : "--"}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Control Widgets ---

function KeyboardControlWidget() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Keyboard className="size-3.5 text-indigo-400" />
        Keyboard Control
      </div>
      <div className="flex-1 min-h-0 [&_.card]:border-0 [&_.card]:shadow-none [&_.card]:p-0">
        <KeyboardControl />
      </div>
    </div>
  );
}

function LeaderArmWidget() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <BicepsFlexed className="size-3.5 text-amber-400" />
        Leader Follower
      </div>
      <div className="flex-1 min-h-0">
        <LeaderArmControl />
      </div>
    </div>
  );
}

function SlidersControlWidget() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <SlidersHorizontal className="size-3.5 text-green-400" />
        Slider Control
      </div>
      <div className="flex-1 min-h-0">
        <SlidersControl />
      </div>
    </div>
  );
}

function MacrosControlWidget() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Clapperboard className="size-3.5 text-pink-400" />
        Macros
      </div>
      <div className="flex-1 min-h-0">
        <MacrosControl />
      </div>
    </div>
  );
}

// --- Launcher Widgets ---

function ROS2LaunchWidget() {
  const [processes, setProcesses] = useState<{ name: string; running: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/ros2/status");
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes ?? []);
      }
    } catch { /* network error */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const anyRunning = processes.some((p) => p.running);
  const runCount = processes.filter((p) => p.running).length;

  const doAction = async (endpoint: string) => {
    setLoading(true);
    try {
      await fetch(endpoint, { method: "POST" });
      await fetchStatus();
    } catch { /* network error */ }
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Radio className="size-3.5 text-blue-400" />
        ROS2 Bridge
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <div className={`size-2 rounded-full ${anyRunning ? "bg-green-400" : "bg-muted-foreground/30"}`} />
        <span className="text-muted-foreground">{anyRunning ? `${runCount} node${runCount > 1 ? "s" : ""} running` : "Stopped"}</span>
      </div>
      <div className="flex gap-1.5 mt-auto">
        <Button size="sm" className="flex-1 text-[10px] h-6" onClick={() => doAction("/ros2/start/all")} disabled={loading || anyRunning}>
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 mr-1" />}
          Start
        </Button>
        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-6" onClick={() => doAction("/ros2/stop/all")} disabled={loading || !anyRunning}>
          <Square className="size-3 mr-1" /> Stop
        </Button>
      </div>
      <Link to="/ros2" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
        Open full page →
      </Link>
    </div>
  );
}

function IsaacSimLaunchWidget() {
  const { data } = useSWR<{ configured: boolean; running: boolean; isaac_sim_exists: boolean }>(
    "/isaacsim/config", fetcher, { refreshInterval: 3000 },
  );
  const [loading, setLoading] = useState(false);

  const handleLaunch = async () => {
    setLoading(true);
    try {
      await fetchWithBaseUrl("/isaacsim/launch", "POST", {});
      toast.success("Isaac Sim launched");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to launch";
      toast.error(msg);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetchWithBaseUrl("/isaacsim/stop", "POST", {});
      toast.success("Isaac Sim stopped");
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Cpu className="size-3.5 text-green-400" />
        Isaac Sim
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <div className={`size-2 rounded-full ${data?.running ? "bg-green-400" : "bg-muted-foreground/30"}`} />
        <span className="text-muted-foreground">{data?.running ? "Running" : "Stopped"}</span>
      </div>
      <div className="flex gap-1.5 mt-auto">
        {data?.running ? (
          <Button size="sm" variant="destructive" className="flex-1 text-[10px] h-6" onClick={handleStop} disabled={loading}>
            {loading ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3 mr-1" />}
            Stop
          </Button>
        ) : (
          <Button size="sm" className="flex-1 text-[10px] h-6" onClick={handleLaunch} disabled={loading || !data?.isaac_sim_exists}>
            {loading ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 mr-1" />}
            Launch
          </Button>
        )}
      </div>
      <Link to="/isaacsim" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
        Open full page →
      </Link>
    </div>
  );
}

// --- Joint Health Widget ---

function JointHealthWidget() {
  const [torques, setTorques] = useState<number[] | null>(null);
  const [temps, setTemps] = useState<{ current: number | null; max: number | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const [torqueRes, tempRes] = await Promise.all([
          fetch("/torque/read?robot_id=0", { method: "POST" }),
          fetch("/temperature/read?robot_id=0", { method: "POST" }),
        ]);
        if (!active) return;
        if (torqueRes.ok) {
          const t = await torqueRes.json();
          setTorques(t.current_torque ?? null);
        }
        if (tempRes.ok) {
          const t = await tempRes.json();
          setTemps(t.current_max_Temperature ?? null);
        }
        setError(null);
      } catch {
        if (active) setError("No robot connected");
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
          <Thermometer className="size-3.5 text-orange-400" />
          Joint Health
        </div>
        <div className="text-[11px] text-muted-foreground">{error}</div>
      </div>
    );
  }

  const jointNames = ["Base", "Shoulder", "Elbow", "Wrist 1", "Wrist 2", "Gripper"];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Thermometer className="size-3.5 text-orange-400" />
        Joint Health
      </div>
      <div className="flex-1 overflow-auto space-y-1.5">
        {jointNames.map((name, i) => {
          const torque = torques?.[i];
          const temp = temps?.[i];
          const tempVal = temp?.current;
          const tempMax = temp?.max ?? 70;
          const isHot = tempVal !== null && tempVal !== undefined && tempVal >= tempMax - 10;
          return (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-16 text-muted-foreground truncate">{name}</span>
              <div className="flex-1 flex items-center gap-2">
                <span className="w-12 text-right font-mono">
                  {torque !== null && torque !== undefined ? torque.toFixed(0) : "--"}
                </span>
                <span className="text-muted-foreground text-[9px]">T</span>
                <span className={`w-12 text-right font-mono ${isHot ? "text-red-400 font-bold" : ""}`}>
                  {tempVal !== null && tempVal !== undefined ? `${tempVal}°` : "--"}
                </span>
                <span className="text-muted-foreground text-[9px]">°C</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Skill Graph Widget ---

function SkillGraphWidget({ serverStatus }: { serverStatus?: ServerStatus }) {
  const { data: graphList } = useSWR<{ graphs: { name: string; node_count: number }[] }>("/skillgraph/list", fetcher);
  const [selected, setSelected] = useState("");
  const [robotId, setRobotId] = useState<number>(0);
  const [running, setRunning] = useState(false);

  const robots = serverStatus?.robot_status ?? [];
  useEffect(() => {
    if (!robots.length) return;
    if (robotId < 0 || robotId >= robots.length) setRobotId(0);
  }, [robots.length, robotId]);

  const handleRun = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const res = await fetchWithBaseUrl("/skillgraph/execute", "POST", { name: selected, robot_id: robotId });
      if (res?.status === "ok") toast.success(res.message);
    } catch { toast.error("Execution failed"); }
    setRunning(false);
  };

  const handleStop = async () => {
    try { await fetchWithBaseUrl("/skillgraph/stop", "POST", {}); toast.success("Stopped"); }
    catch { toast.error("Failed to stop"); }
    setRunning(false);
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Workflow className="size-3.5 text-purple-400" />
        Run Skill Graph
      </div>
      {graphList?.graphs?.length ? (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-7 rounded border border-border bg-background text-xs px-2"
          >
            <option value="">Select graph...</option>
            {graphList.graphs.map((g) => (
              <option key={g.name} value={g.name}>{g.name} ({g.node_count}n)</option>
            ))}
          </select>
          <select
            value={robotId}
            onChange={(e) => setRobotId(Number(e.target.value))}
            disabled={!robots.length}
            className="h-7 rounded border border-border bg-background text-xs px-2"
          >
            {robots.length ? (
              robots.map((r, i) => (
                <option key={i} value={i}>
                  {r.name}{r.device_name ? ` (${r.device_name})` : ""}
                </option>
              ))
            ) : (
              <option value={0}>No robots connected</option>
            )}
          </select>
          <div className="flex gap-1.5">
            {running ? (
              <Button size="sm" variant="destructive" className="flex-1 text-[10px] h-6" onClick={handleStop}>
                <Square className="size-3 mr-1" />Stop
              </Button>
            ) : (
              <Button size="sm" className="flex-1 text-[10px] h-6" onClick={handleRun} disabled={!selected || !robots.length}>
                <Play className="size-3 mr-1" />Run
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground/50">No saved graphs</p>
      )}
      <Link to="/skills" className="text-[10px] text-muted-foreground hover:text-primary transition-colors mt-auto">
        Open Skill Graph Editor →
      </Link>
    </div>
  );
}

// --- Widget Add Menu ---

function WidgetPicker({
  activeWidgets,
  onAdd,
  onClose,
}: {
  activeWidgets: WidgetId[];
  onAdd: (id: WidgetId) => void;
  onClose: () => void;
}) {
  const available = WIDGET_REGISTRY.filter((w) => !activeWidgets.includes(w.id));
  if (available.length === 0) {
    return (
      <div className="absolute top-12 right-0 z-50 bg-popover border border-border rounded-lg shadow-xl p-3 w-56">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">Add Widget</span>
          <button onClick={onClose}><X className="size-3.5 text-muted-foreground" /></button>
        </div>
        <p className="text-[11px] text-muted-foreground">All widgets are already added.</p>
      </div>
    );
  }
  return (
    <div className="absolute top-12 right-0 z-50 bg-popover border border-border rounded-lg shadow-xl p-3 w-56">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold">Add Widget</span>
        <button onClick={onClose}><X className="size-3.5 text-muted-foreground" /></button>
      </div>
      <div className="space-y-1">
        {available.map((w) => (
          <button
            key={w.id}
            onClick={() => { onAdd(w.id); onClose(); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <w.icon className="size-3.5" />
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Main Dashboard ---

export function DashboardPage() {
  const [simToggling, setSimToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [layouts, setLayouts] = useState<LayoutItem[]>(loadLayouts);
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>(loadActiveWidgets);

  const { data: serverStatus, isLoading, mutate: mutateStatus } = useSWR<ServerStatus>(
    ["/status"], ([url]) => fetcher(url), { refreshInterval: 5000 },
  );
  const { data: stats } = useSWR<DashboardStats>("/dash/stats", fetcher, { refreshInterval: 10000 });

  const isSimMode = serverStatus?.simulation_only ?? false;
  const robotConnected = serverStatus !== undefined && serverStatus.robots && serverStatus.robots.length > 0;

  const toggleSimMode = useCallback(async () => {
    setSimToggling(true);
    try {
      const resp = await fetchWithBaseUrl("/simulation/toggle", "POST", { enabled: !isSimMode });
      if (resp) {
        toast.success(resp.simulation_only ? "Simulation Mode" : "Hardware Mode");
        mutateStatus();
      }
    } finally { setSimToggling(false); }
  }, [isSimMode, mutateStatus]);

  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; }, []);

  const onLayoutChange = useCallback((newLayout: LayoutItem[]) => {
    if (!mountedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
  }, []);

  const addWidget = useCallback((id: WidgetId) => {
    const def = WIDGET_REGISTRY.find((w) => w.id === id);
    if (!def) return;
    const newActive = [...activeWidgets, id];
    setActiveWidgets(newActive);
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(newActive));
    const maxY = layouts.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const newLayout: LayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      ...def.defaultLayout,
    };
    const updated = [...layouts, newLayout];
    setLayouts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [activeWidgets, layouts]);

  const removeWidget = useCallback((id: WidgetId) => {
    const newActive = activeWidgets.filter((w) => w !== id);
    setActiveWidgets(newActive);
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(newActive));
    const newLayouts = layouts.filter((l) => l.i !== id);
    setLayouts(newLayouts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
  }, [activeWidgets, layouts]);

  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    setActiveWidgets(DEFAULT_ACTIVE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LAYOUTS));
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(DEFAULT_ACTIVE));
    toast.success("Layout reset to default");
  }, []);

  // Filter layouts to only include active widgets
  const filteredLayouts = useMemo(
    () => layouts.filter((l) => activeWidgets.includes(l.i as WidgetId)),
    [layouts, activeWidgets],
  );

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "stats-uptime":
        return <StatWidget icon={Clock} label="Uptime" value={stats ? formatUptime(stats.uptime_s) : "--"} iconColor="#6366f1" />;
      case "stats-datasets":
        return <StatWidget icon={Database} label="Datasets" value={stats?.dataset_stats.total_local ?? 0} sub={`${stats?.dataset_stats.total_episodes ?? 0} episodes`} iconColor="#10b981" href="/browse" />;
      case "stats-disk":
        return <StatWidget icon={HardDrive} label="Disk Usage" value={stats ? `${stats.dataset_stats.disk_usage_mb} MB` : "--"} sub="Dataset storage" iconColor="#f59e0b" />;
      case "stats-macros":
        return <StatWidget icon={Clapperboard} label="Macros" value={stats?.macro_stats.total ?? 0} sub={`${stats?.skill_graph_stats.total ?? 0} skill graphs`} iconColor="#ec4899" href="/control?tab=macros" />;
      case "gpu-monitor":
        return <GpuMonitorWidget />;
      case "quick-actions":
        return <QuickActionsWidget />;
      case "ai-training":
        return <AITrainingWidget />;
      case "activity-feed":
        return <ActivityFeedWidget stats={stats} />;
      case "robot-3d":
        return <Robot3DWidget />;
      case "robot-status":
        return <RobotStatusWidget serverStatus={serverStatus} isLoading={isLoading} robotConnected={robotConnected} isSimMode={isSimMode} onToggleSim={toggleSimMode} simToggling={simToggling} />;
      case "camera-preview":
        return <CameraPreviewWidget />;
      case "ctrl-keyboard":
        return <KeyboardControlWidget />;
      case "ctrl-leader":
        return <LeaderArmWidget />;
      case "ctrl-sliders":
        return <SlidersControlWidget />;
      case "ctrl-macros":
        return <MacrosControlWidget />;
      case "launch-ros2":
        return <ROS2LaunchWidget />;
      case "launch-isaac":
        return <IsaacSimLaunchWidget />;
      case "joint-health":
        return <JointHealthWidget />;
      case "skill-graph":
        return <SkillGraphWidget serverStatus={serverStatus} />;
      default:
        return <div className="text-xs text-muted-foreground">Unknown widget</div>;
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
            <p className="text-[11px] text-muted-foreground">
              {editing ? "Drag widgets to rearrange. Resize from corners." : "Your customizable workspace."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${isLoading ? "bg-muted-foreground animate-pulse" : robotConnected ? "bg-green-400" : "bg-amber-400"}`} />
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : robotConnected ? "Robot Connected" : "No robot"}
            </span>
            {!robotConnected && !isSimMode && (
              <Button size="sm" variant="outline" className="text-[10px] h-6 ml-1" onClick={toggleSimMode} disabled={simToggling}>
                <Monitor className="size-3 mr-1" />
                {simToggling ? "Switching..." : "Use Simulated Robot"}
              </Button>
            )}
            {isSimMode && (
              <Button size="sm" variant="outline" className="text-[10px] h-6 ml-1" onClick={toggleSimMode} disabled={simToggling}>
                {simToggling ? "Switching..." : "Switch to Hardware"}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 relative">
          {editing && (
            <>
              <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={resetLayout}>
                Reset
              </Button>
              <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => setShowPicker(!showPicker)}>
                <Plus className="size-3 mr-1" />
                Add Widget
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            className="text-[10px] h-7"
            onClick={() => { setEditing(!editing); setShowPicker(false); }}
          >
            {editing ? <><Lock className="size-3 mr-1" /> Lock</> : <><Pencil className="size-3 mr-1" /> Customize</>}
          </Button>
          {showPicker && (
            <WidgetPicker
              activeWidgets={activeWidgets}
              onAdd={addWidget}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      </div>

      {/* Grid */}
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: filteredLayouts }}
        breakpoints={{ lg: 1200, md: 900, sm: 600, xs: 0 }}
        cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
        rowHeight={32}
        isDraggable={true}
        isResizable={editing}
        onLayoutChange={onLayoutChange}
        draggableHandle=".drag-handle"
        compactType="vertical"
        margin={[12, 12]}
      >
        {activeWidgets.map((id) => (
          <div key={id}>
            <Card className={`h-full overflow-hidden ${editing ? "ring-1 ring-primary/20" : ""}`}>
              <CardContent className="h-full p-3 flex flex-col">
                <div className="flex items-center justify-between mb-1 -mt-0.5">
                  <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 opacity-30 hover:opacity-100 transition-opacity">
                    <GripVertical className="size-3 text-muted-foreground" />
                  </div>
                  {editing && (
                    <button onClick={() => removeWidget(id)} className="p-0.5 rounded hover:bg-destructive/20 transition-colors">
                      <Trash2 className="size-3 text-destructive/60" />
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  {renderWidget(id)}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
