import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import {
  CheckCircle,
  File,
  FolderOpen,
  Loader2,
  Play,
  Save,
  Square,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

interface IsaacSimStatus {
  configured: boolean;
  isaac_sim_path: string | null;
  usd_scene_path: string | null;
  isaac_sim_exists: boolean;
  usd_scene_exists: boolean;
  running: boolean;
}

export function IsaacSimPage() {
  const { data, mutate } = useSWR<IsaacSimStatus>(
    "/isaacsim/config",
    fetcher,
    { refreshInterval: 3000 }
  );

  const [isaacPath, setIsaacPath] = useState<string | null>(null);
  const [usdPath, setUsdPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  const currentIsaacPath = isaacPath ?? data?.isaac_sim_path ?? "";
  const currentUsdPath = usdPath ?? data?.usd_scene_path ?? "";
  const isDirty =
    (isaacPath !== null && isaacPath !== (data?.isaac_sim_path ?? "")) ||
    (usdPath !== null && usdPath !== (data?.usd_scene_path ?? ""));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetchWithBaseUrl("/isaacsim/config", "POST", {
        isaac_sim_path: currentIsaacPath || null,
        usd_scene_path: currentUsdPath || null,
      });
      if (res?.status === "ok") {
        toast.success(res.message || "Configuration saved");
        setIsaacPath(null);
        setUsdPath(null);
        mutate();
      }
    } catch (e: unknown) {
      const detail = e instanceof Object && "detail" in e ? (e as { detail: string }).detail : "Failed to save configuration";
      toast.error(detail);
    }
    setSaving(false);
  }

  async function handleLaunch() {
    setLaunching(true);
    try {
      const res = await fetchWithBaseUrl("/isaacsim/launch", "POST", {});
      if (res?.status === "ok") {
        toast.success(res.message || "Isaac Sim launched");
        mutate();
      }
    } catch (e: unknown) {
      const detail = e instanceof Object && "detail" in e ? (e as { detail: string }).detail : "Failed to launch Isaac Sim";
      toast.error(detail);
    }
    setLaunching(false);
  }

  async function handleStop() {
    try {
      const res = await fetchWithBaseUrl("/isaacsim/stop", "POST", {});
      if (res?.status === "ok") {
        toast.success(res.message || "Isaac Sim stopped");
        mutate();
      }
    } catch (e: unknown) {
      const detail = e instanceof Object && "detail" in e ? (e as { detail: string }).detail : "Failed to stop Isaac Sim";
      toast.error(detail);
    }
  }

  async function handleOpenFolder() {
    try {
      const res = await fetchWithBaseUrl("/isaacsim/open-scene-folder", "POST", {});
      if (res?.status === "ok") {
        toast.success("Opened scene folder");
      }
    } catch (e: unknown) {
      const detail = e instanceof Object && "detail" in e ? (e as { detail: string }).detail : "Failed to open folder";
      toast.error(detail);
    }
  }

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Isaac Sim Configuration</CardTitle>
          <p className="text-xs text-muted-foreground">
            Set your NVIDIA Isaac Sim installation directory and USD scene folder.
            These paths are saved and persist across sessions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Isaac Sim Installation Directory</Label>
            <div className="flex items-center gap-2">
              <Input
                value={currentIsaacPath}
                onChange={(e) => setIsaacPath(e.target.value)}
                placeholder="e.g. C:\Users\you\AppData\Local\ov\pkg\isaac-sim-4.2.0"
                className="font-mono text-xs"
              />
              {data?.isaac_sim_exists ? (
                <CheckCircle className="size-4 text-green-400 shrink-0" />
              ) : currentIsaacPath ? (
                <XCircle className="size-4 text-red-400 shrink-0" />
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The root folder containing the Isaac Sim executable (isaac-sim.bat / isaac-sim.sh)
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">USD Scene Folder</Label>
            <div className="flex items-center gap-2">
              <Input
                value={currentUsdPath}
                onChange={(e) => setUsdPath(e.target.value)}
                placeholder="e.g. D:\IsaacSim\scenes\so100"
                className="font-mono text-xs"
              />
              {data?.usd_scene_exists ? (
                <CheckCircle className="size-4 text-green-400 shrink-0" />
              ) : currentUsdPath ? (
                <XCircle className="size-4 text-red-400 shrink-0" />
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The folder where your USD scene files are stored
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            size="sm"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="size-3.5 mr-1.5" />
            )}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Launch & Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {data?.running ? (
              <Button onClick={handleStop} variant="destructive" size="sm">
                <Square className="size-3.5 mr-1.5" />
                Stop Isaac Sim
              </Button>
            ) : (
              <Button
                onClick={handleLaunch}
                disabled={launching || !data?.isaac_sim_exists}
                size="sm"
              >
                {launching ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Play className="size-3.5 mr-1.5" />
                )}
                Launch Isaac Sim
              </Button>
            )}

            <Button
              onClick={handleOpenFolder}
              disabled={!data?.usd_scene_exists}
              variant="outline"
              size="sm"
            >
              <FolderOpen className="size-3.5 mr-1.5" />
              Open Scene Folder
            </Button>
          </div>

          {/* Status */}
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div
                className={`size-2 rounded-full ${
                  data?.running ? "bg-green-400" : "bg-muted-foreground/30"
                }`}
              />
              <span>{data?.running ? "Isaac Sim Running" : "Not Running"}</span>
            </div>
            {!data?.configured && (
              <span className="text-amber-400">
                Configure paths above to get started
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      {/* USD Scene Browser */}
      <UsdSceneBrowser
        configured={data?.usd_scene_exists ?? false}
        running={data?.running ?? false}
        onLaunchWithScene={async (scenePath: string) => {
          setLaunching(true);
          try {
            const res = await fetchWithBaseUrl("/isaacsim/launch-scene", "POST", { scene_path: scenePath });
            if (res?.status === "ok") {
              toast.success(res.message || "Launched with scene");
              mutate();
            }
          } catch (e: unknown) {
            const detail = e instanceof Object && "detail" in e ? (e as { detail: string }).detail : "Failed to launch";
            toast.error(detail);
          }
          setLaunching(false);
        }}
      />
    </div>
  );
}

// --- USD Scene Browser ---

interface UsdFile {
  name: string;
  path: string;
  size_mb: number;
  modified: number;
}

function UsdSceneBrowser({
  configured,
  running,
  onLaunchWithScene,
}: {
  configured: boolean;
  running: boolean;
  onLaunchWithScene: (path: string) => void;
}) {
  const { data } = useSWR<{ files: UsdFile[]; directory: string }>(
    configured ? "/isaacsim/scenes" : null,
    fetcher,
    { refreshInterval: 10000 },
  );

  if (!configured) return null;

  const files = data?.files ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">USD Scene Browser</CardTitle>
        <p className="text-xs text-muted-foreground">
          {data?.directory && <>Browsing: <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{data.directory}</code></>}
        </p>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No USD files found in the scene folder.</p>
        ) : (
          <div className="space-y-1">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-accent/50 transition-colors group"
              >
                <File className="size-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {f.size_mb} MB · {new Date(f.modified * 1000).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onLaunchWithScene(f.path)}
                  disabled={running}
                >
                  <Play className="size-3 mr-1" />
                  Open in Isaac Sim
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
