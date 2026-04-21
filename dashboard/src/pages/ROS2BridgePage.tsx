import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Play,
  Power,
  PowerOff,
  Radio,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ProcessStatus {
  name: string;
  running: boolean;
  pid: number | null;
}

const PROCESS_LABELS: Record<string, { label: string; description: string }> = {
  http_teleop: {
    label: "HTTP Teleop Node",
    description: "Polls IRL Robotics API and publishes joint states to ROS2",
  },
  relay_joints: {
    label: "Joint States Relay",
    description: "/joint_states → /isaac_joint_command",
  },
  relay_joints_cmd: {
    label: "Joint Command Relay (Isaac default)",
    description: "/joint_states → /joint_command",
  },
  relay_pose: {
    label: "Pose Command Relay",
    description: "/robot/cmd_pose → /isaac_pose_command",
  },
  relay_vel: {
    label: "Velocity Command Relay",
    description: "/robot/cmd_vel → /isaac_vel_command",
  },
  relay_gripper: {
    label: "Gripper Command Relay",
    description: "/robot/gripper → /isaac_gripper_command",
  },
};

export function ROS2BridgePage() {
  const [processes, setProcesses] = useState<ProcessStatus[]>([]);
  const [irlUrl, setIrlUrl] = useState("http://localhost:8020");
  const [flipRotationForIsaac, setFlipRotationForIsaac] = useState(true);
  const [jointOffsets, setJointOffsets] = useState<Record<string, number>>({
    rotation: 0.0,
    pitch: 0.0,
    elbow: 0.0,
    wrist_pitch: 0.0,
    wrist_roll: -2.3562,
    jaw: 0.0,
  });
  const jointOffsetDebounce = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [polling, setPolling] = useState(false);

  const showMessage = (text: string, type: "success" | "error" | "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/ros2/status");
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes);
        // When teleop is running, mirror live ROS param so the switch matches reality (default on server is true).
        if (typeof data.flip_rotation_for_isaac === "boolean") {
          setFlipRotationForIsaac(data.flip_rotation_for_isaac);
        }
      }
    } catch {
      // Server may not be available yet
    }
  }, []);

  // Poll status every 3 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const doAction = async (
    endpoint: string,
    actionLabel: string,
    loadingKey: string,
    body?: Record<string, string>,
  ) => {
    setLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const url = body
        ? `${endpoint}?${new URLSearchParams(body).toString()}`
        : endpoint;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.status === "ok" || data.status === "partial") {
        showMessage(data.message, data.status === "ok" ? "success" : "info");
      } else {
        showMessage(data.message || `Failed: ${actionLabel}`, "error");
      }
      // Refresh status
      await fetchStatus();
    } catch (err) {
      showMessage(`Error: ${err}`, "error");
    } finally {
      setLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const teleopRunning = processes.find((p) => p.name === "http_teleop")?.running;
  const relayNames = [
    "relay_joints",
    "relay_joints_cmd",
    "relay_pose",
    "relay_vel",
    "relay_gripper",
  ];
  const anyRelayRunning = processes.some(
    (p) => relayNames.includes(p.name) && p.running,
  );
  const allRelaysRunning = relayNames.every((name) =>
    processes.find((p) => p.name === name)?.running,
  );
  const anyRunning = processes.some((p) => p.running);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            ROS2 Bridge Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Start and stop the ROS2 teleop node and Isaac Sim topic relays
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPolling(true);
            fetchStatus().finally(() => setPolling(false));
          }}
          disabled={polling}
        >
          {polling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {message && (
        <Alert
          variant={message.type === "error" ? "destructive" : "default"}
          className={
            message.type === "success"
              ? "border-green-500 bg-indigo-500/10"
              : message.type === "info"
                ? "border-blue-500 bg-blue-500/10"
                : ""
          }
        >
          {message.type === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* ── Quick Actions ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Start or stop everything with a single click
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            size="lg"
            className="bg-indigo-600 hover:bg-green-700 text-white"
            onClick={() =>
              doAction(
                "/ros2/start/all",
                "Start All",
                "start_all",
                {
                  irl_url: irlUrl,
                  flip_rotation_for_isaac: String(flipRotationForIsaac),
                  ...Object.fromEntries(
                    Object.entries(jointOffsets).map(([k, v]) => [`isaac_${k}_offset_rad`, String(v)])
                  ),
                },
              )
            }
            disabled={loading["start_all"]}
          >
            {loading["start_all"] ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start All (Teleop + Relays)
          </Button>

          <Button
            size="lg"
            variant="destructive"
            onClick={() => doAction("/ros2/stop/all", "Stop All", "stop_all")}
            disabled={loading["stop_all"] || !anyRunning}
          >
            {loading["stop_all"] ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <PowerOff className="h-4 w-4 mr-2" />
            )}
            Stop All
          </Button>
        </CardContent>
      </Card>

      {/* ── HTTP Teleop Node ──────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Unplug className="h-5 w-5" />
                HTTP Teleop Node
              </CardTitle>
              <CardDescription>
                Bridges IRL Robotics server to ROS2 by polling the HTTP API
              </CardDescription>
            </div>
            <Badge
              variant={teleopRunning ? "default" : "outline"}
              className={
                teleopRunning
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground"
              }
            >
              {teleopRunning ? "Running" : "Stopped"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="irl-url">IRL Robotics Server URL</Label>
              <Input
                id="irl-url"
                value={irlUrl}
                onChange={(e) => setIrlUrl(e.target.value)}
                placeholder="http://localhost:8020"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3 gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="flip-rotation-isaac" className="text-base">
                Negate Rotation in <code className="text-xs">/joint_states</code>
              </Label>
              <p className="text-xs text-muted-foreground">
                Flips only the Rotation value in the JointState published to Isaac (HTTP teleop). Turn off if the sim already matches the arm.
              </p>
            </div>
            <Switch
              id="flip-rotation-isaac"
              checked={flipRotationForIsaac}
              onCheckedChange={(checked) => {
                setFlipRotationForIsaac(checked);
                if (teleopRunning) {
                  fetch(
                    `/ros2/teleop/flip_rotation_for_isaac?value=${checked}`,
                    { method: "POST" },
                  )
                    .then((r) => r.json())
                    .then((d) => {
                      if (d.status === "ok") showMessage(d.message, "success");
                      else showMessage(d.message || "Failed to set flip", "error");
                    })
                    .catch(() =>
                      showMessage("Failed to update flip_rotation_for_isaac", "error"),
                    );
                }
              }}
            />
          </div>
          <div className="space-y-3">
            <Label>Isaac Sim Joint Offsets (rad)</Label>
            <p className="text-xs text-muted-foreground">
              Tune each joint offset so Isaac Sim matches the real robot. Changes apply in realtime when teleop is running.
            </p>
            <div className="grid gap-3">
              {(["rotation", "pitch", "elbow", "wrist_pitch", "wrist_roll", "jaw"] as const).map((joint) => (
                <div key={joint} className="flex items-center gap-3">
                  <span className="text-sm w-28 capitalize">{joint.replace("_", " ")}</span>
                  <Slider
                    min={-3.14}
                    max={3.14}
                    step={0.02}
                    value={[jointOffsets[joint]]}
                    onValueChange={([v]) => {
                      setJointOffsets((prev) => ({ ...prev, [joint]: v }));
                      if (!teleopRunning) return;
                      const key = joint;
                      if (jointOffsetDebounce.current[key]) clearTimeout(jointOffsetDebounce.current[key]!);
                      jointOffsetDebounce.current[key] = setTimeout(() => {
                        fetch(`/ros2/teleop/joint_offset?joint=${key}&value=${v}`, { method: "POST" })
                          .then((r) => r.json())
                          .then((d) => d.status === "ok" && showMessage(d.message, "success"));
                      }, 120);
                    }}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-20 text-right">
                    {jointOffsets[joint].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          <div className="flex gap-3 mt-4">
            <Button
              className="bg-indigo-600 hover:bg-green-700 text-white"
              onClick={() =>
                doAction(
                  "/ros2/start/teleop",
                  "Start Teleop",
                  "start_teleop",
                  {
                    irl_url: irlUrl,
                    flip_rotation_for_isaac: String(flipRotationForIsaac),
                    ...Object.fromEntries(
                      Object.entries(jointOffsets).map(([k, v]) => [`isaac_${k}_offset_rad`, String(v)])
                    ),
                  },
                )
              }
              disabled={loading["start_teleop"] || !!teleopRunning}
            >
              {loading["start_teleop"] ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Teleop
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                doAction("/ros2/stop/teleop", "Stop Teleop", "stop_teleop")
              }
              disabled={loading["stop_teleop"] || !teleopRunning}
            >
              {loading["stop_teleop"] ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <PowerOff className="h-4 w-4 mr-2" />
              )}
              Stop Teleop
            </Button>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Isaac Sim Topic Relays ────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Isaac Sim Topic Relays
              </CardTitle>
              <CardDescription>
                Relay ROS2 topics to Isaac Sim expected topic names
              </CardDescription>
            </div>
            <Badge
              variant={allRelaysRunning ? "default" : "outline"}
              className={
                allRelaysRunning
                  ? "bg-indigo-600 text-white"
                  : anyRelayRunning
                    ? "bg-indigo-600 text-white"
                    : "text-muted-foreground"
              }
            >
              {allRelaysRunning
                ? "All Running"
                : anyRelayRunning
                  ? "Partial"
                  : "Stopped"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              className="bg-indigo-600 hover:bg-green-700 text-white"
              onClick={() =>
                doAction(
                  "/ros2/start/relays",
                  "Start Relays",
                  "start_relays",
                )
              }
              disabled={loading["start_relays"] || allRelaysRunning}
            >
              {loading["start_relays"] ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start All Relays
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                doAction(
                  "/ros2/stop/relays",
                  "Stop Relays",
                  "stop_relays",
                )
              }
              disabled={loading["stop_relays"] || !anyRelayRunning}
            >
              {loading["stop_relays"] ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <PowerOff className="h-4 w-4 mr-2" />
              )}
              Stop All Relays
            </Button>
          </div>

          <Separator />

          {/* Individual relay statuses */}
          <div className="grid gap-3">
            {processes
              .filter((p) => p.name.startsWith("relay_"))
              .map((p) => {
                const info = PROCESS_LABELS[p.name];
                return (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {info?.label ?? p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {info?.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.pid && (
                        <span className="text-xs text-muted-foreground font-mono">
                          PID {p.pid}
                        </span>
                      )}
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          p.running ? "bg-indigo-500" : "bg-gray-400"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* ── Info Card ─────────────────────────── */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-sm">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>HTTP Teleop Node</strong> polls your IRL Robotics server
            (running on the URL above) for joint positions and publishes them to
            the <code>/joint_states</code> ROS2 topic.
          </p>
          <p>
            <strong>Topic Relays</strong> use <code>topic_tools relay</code> to
            copy messages from standard ROS2 topics to Isaac Sim expected topic
            names (e.g. <code>/joint_states</code> →{" "}
            <code>/isaac_joint_command</code>).
          </p>
          <p>
            <strong>Typical startup order:</strong> Start the IRL Robotics
            server first → Start the HTTP Teleop Node → Start the relays →
            Launch Isaac Sim.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
