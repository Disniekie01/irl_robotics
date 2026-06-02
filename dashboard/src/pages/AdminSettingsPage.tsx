import { HuggingFaceKeyInput } from "@/components/common/huggingface-key";
import { LoadingPage } from "@/components/common/loading";
import { WandBKeyInput } from "@/components/common/wandb-key";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import {
  AdminSettings,
  AdminTokenSettings,
  Go2MarkerTarget,
  Go2SetupConfig,
} from "@/types";
import {
  Camera,
  CircleCheck,
  Database,
  HelpCircle,
  Key,
  Lock,
  Play,
  MapPin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

export function AdminPage() {
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const isInitialMount = useRef(true);
  const { proUser } = useAuth();

  const { data: adminSettings, mutate } = useSWR<AdminSettings>(
    "/admin/settings",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const { data: adminSettingsTokens } = useSWR<AdminTokenSettings>(
    ["/admin/settings/tokens"],
    ([url]) => fetcher(url, "POST"),
  );

  const { data: go2Setup, mutate: mutateGo2Setup } = useSWR<Go2SetupConfig>(
    "/admin/go2-setup",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  // Validation
  const validateDatasetName = (value: string) => {
    const validDatasetPattern = /^[a-zA-Z0-9._-]+$/;
    return validDatasetPattern.test(value)
      ? ""
      : "Dataset name can only contain letters, numbers, ., _, -";
  };
  const validateFrequency = (value: number) =>
    value > 0 ? "" : "Frequency must be greater than 0";
  const validateVideoSize = (w: number, h: number) =>
    w > 0 && h > 0 ? "" : "Video dimensions must be positive numbers";

  // Auto-save on changes
  useEffect(() => {
    if (!adminSettings) return;
    // skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else if (!Object.values(validationErrors).some((e) => e)) {
      fetchWithBaseUrl("/admin/form/usersettings", "POST", adminSettings);
    }
  }, [adminSettings, validationErrors]);

  // Force disable private mode for non-PRO users
  useEffect(() => {
    if (adminSettings && proUser !== true && adminSettings.hf_private_mode) {
      // Directly mutate to avoid circular dependency
      mutate({ ...adminSettings, hf_private_mode: false }, false);
    }
  }, [proUser, adminSettings, mutate]);

  const handleSettingChange = <K extends keyof AdminSettings>(
    key: K,
    value: AdminSettings[K],
  ) => {
    if (!adminSettings) return;
    let error = "";
    let [w, h] = adminSettings.video_size;
    let finalValue = value;

    switch (key) {
      case "dataset_name":
        error = validateDatasetName(value as string);
        break;
      case "freq":
        error = validateFrequency(value as number);
        break;
      case "video_size":
        [w, h] = value as [number, number];
        error = validateVideoSize(w, h);
        break;
      case "hf_private_mode":
        // Enforce PRO requirement for private mode
        if (value === true && proUser !== true) {
          error = "Private mode requires PRO subscription";
          finalValue = false as AdminSettings[K];
        }
        break;
    }

    setValidationErrors((prev) => ({ ...prev, [key]: error }));
    mutate({ ...adminSettings, [key]: finalValue }, false);
  };

  const saveGo2Setup = async (next: Go2SetupConfig) => {
    mutateGo2Setup(next, false);
    const saved = await fetchWithBaseUrl("/admin/go2-setup", "POST", next);
    if (saved) {
      mutateGo2Setup(saved, false);
    }
  };

  const handleGo2SetupChange = <K extends keyof Go2SetupConfig>(
    key: K,
    value: Go2SetupConfig[K],
  ) => {
    if (!go2Setup) return;
    saveGo2Setup({ ...go2Setup, [key]: value }).catch(() =>
      toast.error("Failed to save GO2 setup"),
    );
  };

  const handleGo2TargetChange = (
    targetKey: "position_a" | "position_b",
    field: keyof Go2MarkerTarget,
    value: number,
  ) => {
    if (!go2Setup) return;
    saveGo2Setup({
      ...go2Setup,
      [targetKey]: {
        ...go2Setup[targetKey],
        [field]: value,
      },
    }).catch(() => toast.error("Failed to save GO2 setup"));
  };

  if (!adminSettings) return <LoadingPage />;

  return (
    <div className="mb-8">
      {/* API Keys */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API Key Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-y-8">
          <div className="flex flex-col gap-y-4">
            <HuggingFaceKeyInput />
            {adminSettingsTokens?.huggingface && (
              <div className="flex items-center gap-2 text-xs text-indigo-400">
                <CircleCheck className="h-4 w-4" /> Token set
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hf_private_mode"
                    checked={adminSettings.hf_private_mode}
                    onCheckedChange={(checked) =>
                      handleSettingChange("hf_private_mode", checked as boolean)
                    }
                    disabled={proUser !== true}
                    className={proUser !== true ? "opacity-50" : ""}
                  />
                  <Label
                    htmlFor="hf_private_mode"
                    className={`text-sm ${proUser !== true ? "text-muted-foreground" : ""}`}
                  >
                    <Lock className="inline size-4" />
                    HF Private mode: store datasets as private and enable
                    private training
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          In private mode, all datasets and trained models are
                          created as private under your HuggingFace username.
                        </p>
                        <p>
                          If private mode is disabled, datasets are created as
                          public on your Hugging Face account, and trained
                          models are public under your Hugging Face organization.
                        </p>
                        <p>
                          <b>Requires IRL Robotics Pro</b> subscription to enable.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {proUser !== true && (
                  <a href="https://github.com/Disniekie01/irl_robotics" target="_blank">
                    <Button size="sm" className="text-xs h-8">
                      Get IRL Robotics Pro
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
          <WandBKeyInput />
          {adminSettingsTokens?.wandb && (
            <div className="flex items-center gap-2 text-xs text-indigo-400">
              <CircleCheck className="h-4 w-4" /> Token set
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {/* Recording Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" /> Recording Settings
            </CardTitle>
            <CardDescription>Configure data recording</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-row gap-4 justify-between">
              <div className="space-y-2">
                <Label>Video Size</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Width"
                    value={adminSettings.video_size[0]}
                    onChange={(e) =>
                      handleSettingChange("video_size", [
                        +e.target.value,
                        adminSettings.video_size[1],
                      ])
                    }
                  />
                  <Input
                    placeholder="Height"
                    value={adminSettings.video_size[1]}
                    onChange={(e) =>
                      handleSettingChange("video_size", [
                        adminSettings.video_size[0],
                        +e.target.value,
                      ])
                    }
                  />
                </div>
                {validationErrors.video_size && (
                  <p className="text-red-500 text-sm">
                    {validationErrors.video_size}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="freq">Recording Frequency (Hz)</Label>
                <Input
                  id="freq"
                  type="number"
                  value={adminSettings.freq}
                  onChange={(e) => handleSettingChange("freq", +e.target.value)}
                />
                {validationErrors.freq && (
                  <p className="text-red-500 text-sm">
                    {validationErrors.freq}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-row gap-4 jusitfy-between items-end">
              <div className="space-y-2">
                <Label>Video Codec</Label>
                <Select
                  value={adminSettings.video_codec}
                  onValueChange={(v) => handleSettingChange("video_codec", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select codec" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "mp4v",
                      "avc1",
                      "hev1",
                      "hvc1",
                      "avc3",
                      "av01",
                      "vp09",
                    ].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = "/viz";
                }}
              >
                <Camera className="size-4 mr-2" />
                Camera Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dataset Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Dataset Settings
            </CardTitle>
            <CardDescription>Configure dataset properties</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dataset_name">Dataset Name</Label>
              <Input
                id="dataset_name"
                type="text"
                value={adminSettings.dataset_name}
                onChange={(e) =>
                  handleSettingChange("dataset_name", e.target.value)
                }
              />
              {validationErrors.dataset_name && (
                <p className="text-red-500 text-sm">
                  {validationErrors.dataset_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="task_instruction">Task Instruction</Label>
              <Textarea
                id="task_instruction"
                value={adminSettings.task_instruction}
                onChange={(e) =>
                  handleSettingChange("task_instruction", e.target.value)
                }
                className="min-h-[50px] resize-y"
              />
            </div>
            <div className="flex flex-row gap-4 justify-between">
              <div className="space-y-2">
                <Label>Episode Format</Label>
                <Select
                  value={adminSettings.episode_format}
                  onValueChange={(v) =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    handleSettingChange("episode_format", v as any)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lerobot_v2.1">lerobot_v2.1</SelectItem>
                    <SelectItem value="lerobot_v2">lerobot_v2</SelectItem>
                    <SelectItem value="json">json</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GO2 Setup */}
        {go2Setup && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> GO2 setup
              </CardTitle>
              <CardDescription>
                Configure marker localization targets for Position A/B.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="go2-marker-enabled"
                  checked={go2Setup.enabled}
                  onCheckedChange={(checked) =>
                    handleGo2SetupChange("enabled", checked as boolean)
                  }
                />
                <Label htmlFor="go2-marker-enabled">
                  Enable marker localization for GO2 presets
                </Label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="go2-camera-id">Camera ID</Label>
                  <Input
                    id="go2-camera-id"
                    type="number"
                    value={go2Setup.camera_id}
                    onChange={(e) =>
                      handleGo2SetupChange("camera_id", Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="go2-marker-size">Marker size (m)</Label>
                  <Input
                    id="go2-marker-size"
                    type="number"
                    step="0.01"
                    value={go2Setup.marker_size_m}
                    onChange={(e) =>
                      handleGo2SetupChange("marker_size_m", Number(e.target.value))
                    }
                  />
                </div>
              </div>

              {(["position_a", "position_b"] as const).map((targetKey) => {
                const target = go2Setup[targetKey];
                const label = targetKey === "position_a" ? "Position A" : "Position B";
                return (
                  <div
                    key={targetKey}
                    className="rounded-lg border border-border p-3 space-y-3"
                  >
                    <div className="font-medium text-sm">{label} marker target</div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Marker ID</Label>
                        <Input
                          type="number"
                          value={target.marker_id}
                          onChange={(e) =>
                            handleGo2TargetChange(
                              targetKey,
                              "marker_id",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>X (m)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={target.x_m}
                          onChange={(e) =>
                            handleGo2TargetChange(
                              targetKey,
                              "x_m",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Y (m)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={target.y_m}
                          onChange={(e) =>
                            handleGo2TargetChange(
                              targetKey,
                              "y_m",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Yaw (deg)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={target.yaw_deg}
                          onChange={(e) =>
                            handleGo2TargetChange(
                              targetKey,
                              "yaw_deg",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
