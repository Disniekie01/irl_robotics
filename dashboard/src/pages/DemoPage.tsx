import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Go2Visualizer } from "@/components/visualizer/Go2Visualizer";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Radar,
  Square,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type ElementState = "ok" | "warn" | "error" | "pending" | "unknown";

interface DemoElementStatus {
  id: string;
  label: string;
  state: ElementState;
  message: string;
  detail?: string | null;
}

interface DemoStatusResponse {
  elements: DemoElementStatus[];
  config: {
    ssh_host: string;
    ssh_user: string;
    dog_api_port: number;
    preferred_leader_serial?: string | null;
    has_password: boolean;
  };
  leader_follower_active: boolean;
  remote_follower_robot_id?: number | null;
  leader_robot_id?: number | null;
}

interface DemoGo2JointsResponse {
  connected: boolean;
  robot_id?: number | null;
  ip?: string | null;
  joints: Record<string, number>;
  message: string;
}

const ARM_MOUNT_STORAGE_KEY = "irl-demo-arm-mount-v1";
const DEFAULT_ARM_MOUNT_POSITION: [number, number, number] = [0.19, 0.43, 0.02];
const DEFAULT_ARM_MOUNT_ROTATION: [number, number, number] = [
  Math.PI / 2,
  Math.PI / 2,
  -Math.PI / 2,
];

function loadArmMount(): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  try {
    const raw = window.localStorage.getItem(ARM_MOUNT_STORAGE_KEY);
    if (!raw) {
      return {
        position: DEFAULT_ARM_MOUNT_POSITION,
        rotation: DEFAULT_ARM_MOUNT_ROTATION,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      position: Array.isArray(parsed.position)
        ? (parsed.position.slice(0, 3) as [number, number, number])
        : DEFAULT_ARM_MOUNT_POSITION,
      rotation: Array.isArray(parsed.rotation)
        ? (parsed.rotation.slice(0, 3) as [number, number, number])
        : DEFAULT_ARM_MOUNT_ROTATION,
    };
  } catch {
    return {
      position: DEFAULT_ARM_MOUNT_POSITION,
      rotation: DEFAULT_ARM_MOUNT_ROTATION,
    };
  }
}

function stateBadgeVariant(
  state: ElementState,
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "ok":
      return "default";
    case "error":
      return "destructive";
    case "warn":
      return "secondary";
    default:
      return "outline";
  }
}

function StatusIcon({ state }: { state: ElementState }) {
  if (state === "ok") return <CheckCircle2 className="size-4 text-green-500" />;
  if (state === "error") return <AlertCircle className="size-4 text-destructive" />;
  if (state === "pending" || state === "warn")
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  return <Wifi className="size-4 text-muted-foreground" />;
}

export function DemoPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [sshHost, setSshHost] = useState("10.105.9.173");
  const [sshUser, setSshUser] = useState("unitree");
  const [sshPassword, setSshPassword] = useState("");
  const [dogPort, setDogPort] = useState("8020");
  const [preferredSerial, setPreferredSerial] = useState("");
  const [leaderRobotId, setLeaderRobotId] = useState<string>("");
  const [{ position: armMountPosition, rotation: armMountRotation }, setArmMount] =
    useState(loadArmMount);
  const [lastArmJointAt, setLastArmJointAt] = useState<number | null>(null);

  const {
    data: demoStatus,
    mutate: refreshDemo,
    isLoading,
  } = useSWR<DemoStatusResponse>(["/demo/status"], fetcher, {
    refreshInterval: 3000,
  });

  const { data: go2Joints } = useSWR<DemoGo2JointsResponse>(
    ["/demo/go2-joints"],
    fetcher,
    { refreshInterval: 200 },
  );

  const [armJointAngles, setArmJointAngles] = useState<number[]>([
    0, 0, 0, 0, 0, 0,
  ]);

  const armRobotId =
    demoStatus?.remote_follower_robot_id ??
    demoStatus?.leader_robot_id ??
    (leaderRobotId !== "" ? Number(leaderRobotId) : 0);

  useEffect(() => {
    let cancelled = false;
    const pollArm = async () => {
      try {
        const res = await fetchWithBaseUrl(
          `/joints/read?robot_id=${armRobotId}`,
          "POST",
          { unit: "rad", joints_ids: null, source: "robot" },
        );
        if (!cancelled && res?.angles && Array.isArray(res.angles)) {
          setArmJointAngles(res.angles.map((a: number | null) => a ?? 0));
          setLastArmJointAt(Date.now());
        }
      } catch {
        /* follower/leader may be offline */
      }
    };
    pollArm();
    const id = setInterval(pollArm, 50);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [armRobotId]);

  useEffect(() => {
    if (!demoStatus?.config) return;
    setSshHost(demoStatus.config.ssh_host || "10.105.9.173");
    setSshUser(demoStatus.config.ssh_user || "unitree");
    setDogPort(String(demoStatus.config.dog_api_port ?? 8020));
    if (demoStatus.config.preferred_leader_serial) {
      setPreferredSerial(demoStatus.config.preferred_leader_serial);
    }
    if (demoStatus.leader_robot_id != null) {
      setLeaderRobotId(String(demoStatus.leader_robot_id));
    }
  }, [demoStatus]);

  useEffect(() => {
    window.localStorage.setItem(
      ARM_MOUNT_STORAGE_KEY,
      JSON.stringify({ position: armMountPosition, rotation: armMountRotation }),
    );
  }, [armMountPosition, armMountRotation]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      try {
        await fn();
        await refreshDemo();
      } finally {
        setBusy(null);
      }
    },
    [refreshDemo],
  );

  const saveCredentials = () =>
    runAction("credentials", async () => {
      if (!sshPassword.trim()) {
        toast.error("Enter the dog SSH password");
        return;
      }
      const res = await fetchWithBaseUrl("/demo/credentials", "POST", {
        ssh_host: sshHost.trim(),
        ssh_user: sshUser.trim(),
        ssh_password: sshPassword,
        dog_api_port: Number(dogPort) || 8020,
        preferred_leader_serial: preferredSerial.trim() || null,
      });
      if (res) toast.success(res.message || "Credentials saved");
    });

  const discover = () =>
    runAction("discover", async () => {
      const res = await fetchWithBaseUrl("/demo/discover", "POST", {});
      if (res) {
        toast.success(
          res.dog_api_reachable
            ? `Dog API reachable at ${res.dog_ip}`
            : `Discovery complete (${res.local_usb_devices?.length ?? 0} USB bus(es))`,
        );
        if (res.suggested_leader_robot_id != null) {
          setLeaderRobotId(String(res.suggested_leader_robot_id));
        }
      }
    });

  const startDogServer = () =>
    runAction("dog", async () => {
      const res = await fetchWithBaseUrl("/demo/start-dog-server", "POST", {});
      if (res) toast.success(res.message || "Dog server started");
    });

  const connectRemote = () =>
    runAction("remote", async () => {
      const res = await fetchWithBaseUrl("/demo/connect-remote-follower", "POST", {});
      if (res) toast.success(res.message || "Remote follower connected");
    });

  const startDemo = () =>
    runAction("start", async () => {
      const res = await fetchWithBaseUrl("/demo/start", "POST", {
        leader_robot_id: leaderRobotId ? Number(leaderRobotId) : null,
        invert_controls: false,
      });
      if (res) toast.success(res.message || "Demo started");
    });

  const stopDemo = () =>
    runAction("stop", async () => {
      const res = await fetchWithBaseUrl("/demo/stop", "POST", {});
      if (res) toast.success(res.message || "Demo stopped");
    });

  const elements = demoStatus?.elements ?? [];
  const blockingElements = elements.filter((el) => el.state === "error");
  const warnElements = elements.filter((el) => el.state === "warn");
  const readinessState: ElementState = demoStatus?.leader_follower_active
    ? "ok"
    : blockingElements.length > 0
      ? "error"
      : warnElements.length > 0
        ? "warn"
        : elements.length > 0
          ? "ok"
          : "unknown";
  const readinessTitle = demoStatus?.leader_follower_active
    ? "Demo running"
    : readinessState === "ok"
      ? "Ready to start"
      : readinessState === "warn"
        ? "Almost ready"
        : readinessState === "error"
          ? "Not ready"
          : "Waiting for status";
  const readinessMessage =
    blockingElements[0]?.message ??
    warnElements[0]?.message ??
    "Relative start is enabled: follower arms stay where they are and only follow leader movement deltas.";
  const armStreamFresh =
    lastArmJointAt != null && Date.now() - lastArmJointAt < 1500;
  const go2JointCount = Object.keys(go2Joints?.joints ?? {}).length;

  const nudgeMount = (
    key: "position" | "rotation",
    index: 0 | 1 | 2,
    delta: number,
  ) => {
    setArmMount((current) => {
      const next = {
        position: [...current.position] as [number, number, number],
        rotation: [...current.rotation] as [number, number, number],
      };
      next[key][index] = Number((next[key][index] + delta).toFixed(4));
      return next;
    });
  };

  const resetMount = () =>
    setArmMount({
      position: DEFAULT_ARM_MOUNT_POSITION,
      rotation: DEFAULT_ARM_MOUNT_ROTATION,
    });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-click leader–follower: local arm controls the SO-100 on the dog via SSH
          and network follower API.
        </p>
      </div>

      <Alert>
        <StatusIcon state={readinessState} />
        <AlertTitle className="flex items-center gap-2">
          {readinessTitle}
          <Badge variant={stateBadgeVariant(readinessState)}>{readinessState}</Badge>
          <Badge variant="outline">No-jump relative start</Badge>
        </AlertTitle>
        <AlertDescription>
          {demoStatus?.leader_follower_active
            ? `Leader robot ${demoStatus.leader_robot_id ?? "?"} -> follower ${
                demoStatus.remote_follower_robot_id ?? "?"
              } on ${sshHost}:${dogPort}`
            : readinessMessage}
        </AlertDescription>
      </Alert>

      {demoStatus?.leader_follower_active && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(360px,calc(100vw-3rem))] rounded-2xl border-2 border-red-500 bg-red-950/95 p-4 shadow-2xl shadow-red-950/60 ring-4 ring-red-500/25">
          <div className="mb-3 flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-red-500 p-2 text-white shadow-lg">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <div className="text-lg font-black uppercase tracking-wide text-white">
                Emergency Stop
              </div>
              <p className="text-xs text-red-100">
                Demo is running. Stop leader-follower immediately.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={stopDemo}
            disabled={busy !== null}
            className="h-14 w-full border border-red-300 bg-red-600 text-base font-black uppercase tracking-wide text-white shadow-lg hover:bg-red-700"
          >
            {busy === "stop" ? (
              <Loader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <Square className="mr-2 size-5" />
            )}
            Stop Demo Now
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dog connection</CardTitle>
            <CardDescription>
              Credentials are saved locally on this machine (demo_config.json, not
              committed to git).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ssh-host">Dog IP</Label>
                <Input
                  id="ssh-host"
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  placeholder="10.105.9.173"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dog-port">Follower API port</Label>
                <Input
                  id="dog-port"
                  value={dogPort}
                  onChange={(e) => setDogPort(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-user">SSH user</Label>
                <Input
                  id="ssh-user"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-pass">SSH password</Label>
                <Input
                  id="ssh-pass"
                  type="password"
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  placeholder={
                    demoStatus?.config.has_password ? "•••••••• (saved)" : "Required"
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="leader-serial">Preferred leader serial (optional)</Label>
                <Input
                  id="leader-serial"
                  value={preferredSerial}
                  onChange={(e) => setPreferredSerial(e.target.value)}
                  placeholder="USB adapter serial"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="leader-id">Leader robot_id (auto if empty)</Label>
                <Input
                  id="leader-id"
                  value={leaderRobotId}
                  onChange={(e) => setLeaderRobotId(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={saveCredentials}
              disabled={busy !== null}
            >
              {busy === "credentials" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save credentials
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              Run steps individually or start the full demo. Relative start is always on,
              so the follower will not snap to calibration zero.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" onClick={discover} disabled={busy !== null}>
              {busy === "discover" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Radar className="mr-2 size-4" />
              )}
              Discover arms & dog
            </Button>
            <Button variant="outline" onClick={startDogServer} disabled={busy !== null}>
              {busy === "dog" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Start dog follower server (SSH)
            </Button>
            <Button variant="outline" onClick={connectRemote} disabled={busy !== null}>
              {busy === "remote" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Connect remote follower
            </Button>
            <Button onClick={startDemo} disabled={busy !== null}>
              {busy === "start" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Start full demo
            </Button>
            <Button variant="destructive" onClick={stopDemo} disabled={busy !== null}>
              {busy === "stop" && <Loader2 className="mr-2 size-4 animate-spin" />}
              <Square className="mr-2 size-4" />
              Stop demo
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dog + mounted arm</CardTitle>
          <CardDescription>
            Go2 URDF (legs from WebRTC lowstate when connected) plus the existing SO-100 STL
            arm on the back. Arm joints poll from dog follower if connected, else local leader.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Go2Visualizer
            joints={go2Joints?.joints ?? {}}
            armJointAngles={armJointAngles}
            armMountPosition={armMountPosition}
            armMountRotation={armMountRotation}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Go2 lowstate</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Badge variant={go2JointCount > 0 ? "default" : "outline"}>
                  {go2JointCount > 0 ? "streaming" : "offline"}
                </Badge>
                <span>{go2JointCount}/12 joints</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Mounted arm joints</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Badge variant={armStreamFresh ? "default" : "outline"}>
                  {armStreamFresh ? "streaming" : "stale"}
                </Badge>
                <span>robot_id={armRobotId}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">No-jump teleop</div>
              <div className="mt-1 text-sm">Relative start enabled</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {go2Joints?.connected
              ? `robot_id=${go2Joints.robot_id ?? "?"} @ ${go2Joints.ip ?? "?"} - ${go2Joints.message}`
              : go2Joints?.message ??
                "No Go2 connected. Joints show at zero until lowstate arrives."}
          </p>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Arm mount alignment</div>
                <p className="text-xs text-muted-foreground">
                  Tune the visual SO-100 mount live. Saved in this browser.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetMount}>
                Reset
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Position [forward, height, side]
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["forward", "height", "side"] as const).map((label, index) => (
                    <div key={label} className="space-y-1">
                      <div className="text-xs text-center">{label}</div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => nudgeMount("position", index as 0 | 1 | 2, -0.01)}
                        >
                          -
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => nudgeMount("position", index as 0 | 1 | 2, 0.01)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-[10px] text-center font-mono text-muted-foreground">
                        {armMountPosition[index].toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Rotation [tilt, yaw, roll]
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["tilt", "yaw", "roll"] as const).map((label, index) => (
                    <div key={label} className="space-y-1">
                      <div className="text-xs text-center">{label}</div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            nudgeMount("rotation", index as 0 | 1 | 2, -Math.PI / 18)
                          }
                        >
                          -
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            nudgeMount("rotation", index as 0 | 1 | 2, Math.PI / 18)
                          }
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-[10px] text-center font-mono text-muted-foreground">
                        {Math.round((armMountRotation[index] * 180) / Math.PI)}deg
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {isLoading ? "Refreshing…" : "Live checks every 3s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {elements.length === 0 && (
            <p className="text-sm text-muted-foreground">No status yet. Save credentials and discover.</p>
          )}
          {elements.map((el) => (
            <div
              key={el.id}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <StatusIcon state={el.state} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{el.label}</span>
                  <Badge variant={stateBadgeVariant(el.state)}>{el.state}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{el.message}</p>
                {el.detail && (
                  <p className="text-xs text-muted-foreground/80 mt-1 font-mono break-all">
                    {el.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
