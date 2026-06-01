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

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-click leader–follower: local arm controls the SO-100 on the dog via SSH
          and network follower API.
        </p>
      </div>

      {demoStatus?.leader_follower_active && (
        <Alert>
          <Play className="h-4 w-4" />
          <AlertTitle>Demo running</AlertTitle>
          <AlertDescription>
            Leader robot {demoStatus.leader_robot_id ?? "?"} → follower{" "}
            {demoStatus.remote_follower_robot_id ?? "?"} on {sshHost}:{dogPort}
          </AlertDescription>
        </Alert>
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
            <CardDescription>Run steps individually or start the full demo.</CardDescription>
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
          <CardTitle>Go2 (Unitree)</CardTitle>
          <CardDescription>
            Official URDF from unitree_ros. Connect a Go2 via Robots → Add connection
            (WebRTC) to animate leg joints from lowstate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Go2Visualizer joints={go2Joints?.joints ?? {}} />
          <p className="text-sm text-muted-foreground">
            {go2Joints?.connected
              ? `robot_id=${go2Joints.robot_id ?? "?"} @ ${go2Joints.ip ?? "?"} — ${go2Joints.message}`
              : go2Joints?.message ??
                "No Go2 connected. Joints show at zero until lowstate arrives."}
          </p>
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
