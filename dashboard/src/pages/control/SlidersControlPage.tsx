import { LoadingPage } from "@/components/common/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { fetcher } from "@/lib/utils";
import type { ServerStatus } from "@/types";
import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

const BASE_URL = `http://${window.location.hostname}:${window.location.port}/`;

// Slider ranges: position in cm, rotation in degrees, gripper 0–1
const POSITION_CM = { min: -3, max: 3, step: 0.5 };
const ROTATION_DEG = { min: -15, max: 15, step: 1 };
const GRIPPER = { min: 0, max: 1, step: 0.1 };

export function SlidersControl() {
  const { data: serverStatus, error: serverError } = useSWR<ServerStatus>(
    ["/status"],
    fetcher,
    { refreshInterval: 5000 },
  );

  const [selectedRobotName, setSelectedRobotName] = useState<string | null>(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [z, setZ] = useState(0);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const [rz, setRz] = useState(0);
  const [open, setOpen] = useState(0.5);
  const [sending, setSending] = useState(false);

  const robotIDFromName = (name: string | null | undefined) => {
    if (name == null || !serverStatus?.robot_status) return 0;
    // value may be "robot-0" style if device_name was empty
    const match = name.match(/^robot-(\d+)$/);
    if (match) return parseInt(match[1], 10);
    const index = serverStatus.robot_status.findIndex(
      (robot) => robot.device_name === name,
    );
    return index === -1 ? 0 : index;
  };

  const handleSendMove = async () => {
    if (!selectedRobotName) return;
    setSending(true);
    try {
      const robotId = robotIDFromName(selectedRobotName);
      const response = await fetch(
        `${BASE_URL}move/relative?robot_id=${robotId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: x !== 0 ? x : undefined,
            y: y !== 0 ? y : undefined,
            z: z !== 0 ? z : undefined,
            rx: rx !== 0 ? rx : undefined,
            ry: ry !== 0 ? ry : undefined,
            rz: rz !== 0 ? rz : undefined,
            open: open,
          }),
        },
      );
      if (!response.ok) throw new Error(response.statusText);
    } catch (e) {
      console.error("Sliders move failed:", e);
    } finally {
      setSending(false);
    }
  };

  if (serverError) return <div>Failed to load server status.</div>;
  if (!serverStatus) return <LoadingPage />;

  const robots = serverStatus.robot_status || [];

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Sliders control</CardTitle>
          <CardDescription>
            Set relative position and orientation (cm, degrees), then send one move. Gripper 0 = closed, 1 = open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Robot</Label>
            <Select
              value={selectedRobotName ?? ""}
              onValueChange={(v) => setSelectedRobotName(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select robot" />
              </SelectTrigger>
              <SelectContent>
                {robots.map((robot, index) => (
                  <SelectItem
                    key={robot.device_name || `robot-${index}`}
                    value={robot.device_name || `robot-${index}`}
                  >
                    {robot.name} ({robot.device_name || "—"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {[
            { label: "X (cm)", value: x, set: setX, ...POSITION_CM },
            { label: "Y (cm)", value: y, set: setY, ...POSITION_CM },
            { label: "Z (cm)", value: z, set: setZ, ...POSITION_CM },
            { label: "Pitch rx (°)", value: rx, set: setRx, ...ROTATION_DEG },
            { label: "Yaw ry (°)", value: ry, set: setRy, ...ROTATION_DEG },
            { label: "Roll rz (°)", value: rz, set: setRz, ...ROTATION_DEG },
          ].map(({ label, value, set, min, max, step }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>{label}</Label>
                <span className="text-muted-foreground">{value}</span>
              </div>
              <Slider
                value={[value]}
                onValueChange={([v]) => set(v)}
                min={min}
                max={max}
                step={step}
              />
            </div>
          ))}

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Gripper (0=closed, 1=open)</Label>
              <span className="text-muted-foreground">{open.toFixed(1)}</span>
            </div>
            <Slider
              value={[open]}
              onValueChange={([v]) => setOpen(v)}
              min={GRIPPER.min}
              max={GRIPPER.max}
              step={GRIPPER.step}
            />
          </div>

          <Button
            onClick={handleSendMove}
            disabled={!selectedRobotName || sending}
            className="w-full"
          >
            <SendHorizontal className="mr-2 h-4 w-4" />
            {sending ? "Sending…" : "Send move"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
