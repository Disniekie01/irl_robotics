import { LoadingPage } from "@/components/common/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import type { ServerStatus } from "@/types";
import {
  Circle,
  Loader2,
  Play,
  Repeat,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

interface MacroInfo {
  name: string;
  duration_s: number;
  frame_count: number;
  joint_count: number;
  created_at: number;
  type?: "joint" | "mobile";
}

interface MacroListResponse {
  macros: MacroInfo[];
}

interface MacroStatus {
  recording: boolean;
  playing: boolean;
  recorded_frames: number;
  recording_type?: "joint" | "mobile" | null;
}

export function MacrosControl() {
  const [macroName, setMacroName] = useState("");
  const [playSpeed, setPlaySpeed] = useState(1.0);
  const [robotId, setRobotId] = useState(0);

  const { data: serverStatus } = useSWR<ServerStatus>(["/status"], fetcher, {
    refreshInterval: 5000,
  });

  const {
    data: macroList,
    mutate: mutateMacros,
  } = useSWR<MacroListResponse>(["/macro/list"], ([url]) => fetcher(url), {
    refreshInterval: 3000,
  });

  const { data: macroStatus, mutate: mutateStatus } = useSWR<MacroStatus>(
    ["/macro/status"],
    ([url]) => fetcher(url),
    { refreshInterval: 1000 },
  );

  const robots = serverStatus?.robot_status || [];
  const isRecording = macroStatus?.recording ?? false;
  const isPlaying = macroStatus?.playing ?? false;

  const getRobotIdForMacro = useCallback(
    (macro: MacroInfo) => {
      if (macro.type === "mobile") {
        const mobileRobotId = robots.findIndex(
          (robot) => robot.robot_type === "mobile",
        );
        if (mobileRobotId >= 0) return mobileRobotId;
        toast.error("No Go2/mobile robot is connected.");
        return null;
      }
      return robotId;
    },
    [robots, robotId],
  );

  const startRecording = useCallback(async () => {
    if (!macroName.trim()) {
      toast.error("Enter a name for the macro.");
      return;
    }
    const resp = await fetchWithBaseUrl("/macro/record/start", "POST", {
      name: macroName,
      robot_id: robotId,
      fps: 30,
    });
    if (resp) {
      toast.success(`Recording "${macroName}"...`);
      mutateStatus();
    }
  }, [macroName, robotId, mutateStatus]);

  const stopRecording = useCallback(async () => {
    const nameParam = encodeURIComponent(macroName);
    const resp = await fetchWithBaseUrl(`/macro/record/stop?name=${nameParam}`, "POST");
    if (resp) {
      toast.success(resp.message || "Macro saved.");
      mutateMacros();
      mutateStatus();
    }
  }, [macroName, mutateMacros, mutateStatus]);

  const playMacro = useCallback(
    async (macro: MacroInfo, loop: boolean = false) => {
      const replayRobotId = getRobotIdForMacro(macro);
      if (replayRobotId === null) return;

      const resp = await fetchWithBaseUrl("/macro/play", "POST", {
        name: macro.name,
        robot_id: replayRobotId,
        loop,
        speed: playSpeed,
      });
      if (resp) {
        toast.success(resp.message || `Playing "${macro.name}"`);
        mutateStatus();
      }
    },
    [getRobotIdForMacro, playSpeed, mutateStatus],
  );

  const stopPlayback = useCallback(async () => {
    await fetchWithBaseUrl("/macro/stop", "POST");
    mutateStatus();
  }, [mutateStatus]);

  const deleteMacro = useCallback(
    async (name: string) => {
      const resp = await fetchWithBaseUrl(`/macro/${encodeURIComponent(name)}`, "DELETE");
      if (resp) {
        toast.success(`Deleted "${name}"`);
        mutateMacros();
      }
    },
    [mutateMacros],
  );

  if (!serverStatus) return <LoadingPage />;

  return (
    <div className="space-y-4">
      {/* Record card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record Macro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Macro Name</Label>
              <Input
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                placeholder="e.g. pick-and-place"
                disabled={isRecording}
                className="mt-1"
              />
            </div>
            <div className="w-40">
              <Label>Robot</Label>
              <Select
                value={robotId.toString()}
                onValueChange={(v) => setRobotId(parseInt(v))}
                disabled={isRecording || isPlaying}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {robots.length === 0 && (
                    <SelectItem value="0">No robot</SelectItem>
                  )}
                  {robots.map((robot, index) => (
                    <SelectItem
                      key={robot.device_name || index}
                      value={index.toString()}
                    >
                      {robot.name || `Robot ${index}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                disabled={!macroName.trim() || isPlaying}
                className="flex-1"
              >
                <Circle className="h-4 w-4 mr-2 fill-red-500 text-red-500" />
                Record
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                className="flex-1"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Recording
                {macroStatus && (
                  <span className="ml-2 text-xs opacity-75">
                    ({macroStatus.recorded_frames} frames)
                  </span>
                )}
              </Button>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              Recording... Move the robot to capture the sequence.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Playback settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Playback Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Speed</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {playSpeed.toFixed(1)}x
              </span>
            </div>
            <Slider
              min={0.1}
              max={3.0}
              step={0.1}
              value={[playSpeed]}
              onValueChange={([v]) => setPlaySpeed(v)}
            />
          </div>

          {isPlaying && (
            <Button
              onClick={stopPlayback}
              variant="destructive"
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Playback
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Saved macros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Macros</CardTitle>
        </CardHeader>
        <CardContent>
          {!macroList ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : macroList.macros.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No macros saved yet. Record one above.
            </p>
          ) : (
            <div className="space-y-2">
              {macroList.macros.map((macro) => (
                <div
                  key={macro.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{macro.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {macro.duration_s.toFixed(1)}s | {macro.frame_count}{" "}
                      frames |{" "}
                      {macro.type === "mobile"
                        ? "Go2 movement"
                        : `${macro.joint_count} joints`}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => playMacro(macro, false)}
                      disabled={isRecording || isPlaying}
                      title="Play once"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => playMacro(macro, true)}
                      disabled={isRecording || isPlaying}
                      title="Loop"
                    >
                      <Repeat className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMacro(macro.name)}
                      disabled={isRecording || isPlaying}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
