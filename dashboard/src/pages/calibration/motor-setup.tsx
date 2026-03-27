import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithBaseUrl } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Plug,
  PlugZap,
  Search,
  Settings,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MOTOR_NAMES = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper",
];

const MOTOR_LABELS: Record<string, string> = {
  shoulder_pan: "Shoulder Pan (ID 1)",
  shoulder_lift: "Shoulder Lift (ID 2)",
  elbow_flex: "Elbow Flex (ID 3)",
  wrist_flex: "Wrist Flex (ID 4)",
  wrist_roll: "Wrist Roll (ID 5)",
  gripper: "Gripper (ID 6)",
};

interface LocalDevice {
  name: string;
  device: string;
  serial_number?: string;
  pid?: number;
}

interface MotorLimit {
  motor_id: number;
  min_angle_limit: number;
  max_angle_limit: number;
}

interface RecordedLimit {
  min: number;
  max: number;
}

export function MotorSetup() {
  // Connection state
  const [ports, setPorts] = useState<LocalDevice[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Scan state
  const [scanFromId, setScanFromId] = useState(0);
  const [scanToId, setScanToId] = useState(10);
  const [foundMotors, setFoundMotors] = useState<number[]>([]);
  const [scanning, setScanning] = useState(false);

  // Set ID state
  const [setIdFrom, setSetIdFrom] = useState(1);
  const [setIdTo, setSetIdTo] = useState(1);
  const [selectedMotorName, setSelectedMotorName] = useState<string>(MOTOR_NAMES[0]);
  const [settingId, setSettingId] = useState(false);

  // EEPROM limits state
  const [eepromLimits, setEepromLimits] = useState<MotorLimit[]>([]);
  const [readingLimits, setReadingLimits] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Interactive limit recording
  const [recording, setRecording] = useState(false);
  const [recordedLimits, setRecordedLimits] = useState<Record<number, RecordedLimit>>({});
  const recordingRef = useRef(false);

  // Status messages
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Fetch available ports
  const fetchPorts = useCallback(async () => {
    const data = await fetchWithBaseUrl("/local/scan-devices", "POST");
    if (data?.devices) {
      setPorts(data.devices);
      if (data.devices.length > 0 && !selectedPort) {
        setSelectedPort(data.devices[0].device);
      }
    }
  }, [selectedPort]);

  useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  const handleConnect = async () => {
    if (!selectedPort) return;
    setConnecting(true);
    setStatusMessage(null);
    const data = await fetchWithBaseUrl("/setup/connect", "POST", { port: selectedPort });
    setConnecting(false);
    if (data?.status === "connected") {
      setIsConnected(true);
      setStatusMessage({ type: "success", text: `Connected to ${selectedPort}` });
    } else {
      setStatusMessage({ type: "error", text: "Failed to connect" });
    }
  };

  const handleDisconnect = async () => {
    await fetchWithBaseUrl("/setup/disconnect", "POST");
    setIsConnected(false);
    setFoundMotors([]);
    setEepromLimits([]);
    setStatusMessage({ type: "info", text: "Disconnected" });
  };

  const handleScan = async () => {
    setScanning(true);
    setStatusMessage(null);
    const data = await fetchWithBaseUrl("/setup/scan", "POST", {
      from_id: scanFromId,
      to_id: scanToId,
    });
    setScanning(false);
    if (data?.found_ids) {
      setFoundMotors(data.found_ids);
      setStatusMessage({
        type: data.found_ids.length > 0 ? "success" : "info",
        text: data.found_ids.length > 0
          ? `Found motors at IDs: ${data.found_ids.join(", ")}`
          : "No motors found in range",
      });
    }
  };

  const handleSetId = async () => {
    setSettingId(true);
    setStatusMessage(null);
    const data = await fetchWithBaseUrl("/setup/set-motor-id", "POST", {
      from_id: setIdFrom,
      to_id: setIdTo,
    });
    setSettingId(false);
    if (data?.status === "ok") {
      setStatusMessage({ type: "success", text: `Motor ID changed: ${data.old_id} → ${data.new_id}` });
    }
  };

  const handleSelectMotor = (name: string) => {
    setSelectedMotorName(name);
    const idx = MOTOR_NAMES.indexOf(name);
    setSetIdTo(idx + 1);
  };

  // EEPROM Limits
  const handleReadLimits = async () => {
    setReadingLimits(true);
    const data = await fetchWithBaseUrl("/setup/read-eeprom-limits", "POST", {
      motor_ids: [1, 2, 3, 4, 5, 6],
    });
    setReadingLimits(false);
    if (data?.limits) {
      setEepromLimits(data.limits);
    }
  };

  const handleUnlockAll = async () => {
    setUnlocking(true);
    setStatusMessage(null);
    const data = await fetchWithBaseUrl("/setup/unlock-all-limits", "POST", {
      motor_ids: [1, 2, 3, 4, 5, 6],
    });
    setUnlocking(false);
    if (data?.results) {
      const ok = data.results.filter((r: { status: string }) => r.status === "ok").length;
      setStatusMessage({
        type: ok === data.results.length ? "success" : "error",
        text: `Unlocked ${ok}/${data.results.length} motors to full range (0-4095)`,
      });
      handleReadLimits();
    }
  };

  // Interactive limit recording
  const handleStartRecording = async () => {
    setStatusMessage(null);
    await fetchWithBaseUrl("/setup/record-limits/start", "POST", {
      motor_ids: [1, 2, 3, 4, 5, 6],
    });
    setRecording(true);
    recordingRef.current = true;
    setRecordedLimits({});
    pollLimits();
  };

  const pollLimits = async () => {
    while (recordingRef.current) {
      const data = await fetchWithBaseUrl("/setup/record-limits/sample", "POST");
      if (data?.limits) {
        setRecordedLimits(data.limits);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const handleStopRecording = async (write: boolean) => {
    recordingRef.current = false;
    setRecording(false);
    const data = await fetchWithBaseUrl(`/setup/record-limits/stop?write=${write}`, "POST");
    if (data?.written) {
      setStatusMessage({ type: "success", text: "Recorded limits written to EEPROM" });
      handleReadLimits();
    } else {
      setStatusMessage({ type: "info", text: "Recording stopped (limits not written)" });
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <Alert variant={statusMessage.type === "error" ? "destructive" : "default"}
          className={statusMessage.type === "success" ? "border-green-500" : ""}>
          {statusMessage.type === "error" && <AlertCircle className="h-4 w-4" />}
          {statusMessage.type === "success" && <CheckCircle className="h-4 w-4" />}
          <AlertDescription>{statusMessage.text}</AlertDescription>
        </Alert>
      )}

      {/* Section 1: Connect to Motor Bus */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Connect to Motor Bus
          </CardTitle>
          <CardDescription>
            Connect to the motor bus via serial. This is independent of the robot connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <Label>Serial Port</Label>
              <Select value={selectedPort} onValueChange={setSelectedPort} disabled={isConnected}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a port" />
                </SelectTrigger>
                <SelectContent>
                  {ports.map((p) => (
                    <SelectItem key={p.device} value={p.device}>
                      {p.device} {p.serial_number ? `(${p.serial_number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={fetchPorts} disabled={isConnected}>
              Refresh
            </Button>
          </div>
          <div className="flex gap-2">
            {!isConnected ? (
              <Button onClick={handleConnect} disabled={connecting || !selectedPort}>
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Motor ID Configuration */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" /> Configure Motor IDs
            </CardTitle>
            <CardDescription>
              Connect each motor individually, scan to find it, then set its ID for the correct joint position.
              New motors default to ID 1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Scan */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Scan for Motors</Label>
              <div className="flex gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From ID</Label>
                  <Input type="number" min={0} max={252} value={scanFromId}
                    onChange={(e) => setScanFromId(Number(e.target.value))} className="w-20" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To ID</Label>
                  <Input type="number" min={0} max={252} value={scanToId}
                    onChange={(e) => setScanToId(Number(e.target.value))} className="w-20" />
                </div>
                <Button onClick={handleScan} disabled={scanning} variant="secondary">
                  {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Scan
                </Button>
              </div>
              {foundMotors.length > 0 && (
                <div className="text-sm">
                  Found: <span className="font-mono font-medium">{foundMotors.join(", ")}</span>
                </div>
              )}
            </div>

            <hr />

            {/* Set Motor ID */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Set Motor ID</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Target Joint</Label>
                  <Select value={selectedMotorName} onValueChange={handleSelectMotor}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTOR_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          {MOTOR_LABELS[name]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Current ID (From)</Label>
                  <Input type="number" min={0} max={252} value={setIdFrom}
                    onChange={(e) => setSetIdFrom(Number(e.target.value))} />
                </div>
                <Button onClick={handleSetId} disabled={settingId}>
                  {settingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Set ID to {setIdTo}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: EEPROM Limits */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" /> EEPROM Angle Limits
            </CardTitle>
            <CardDescription>
              Read and set the hardware angle limits stored in motor EEPROM.
              Full range is 0-4095. Restrictive limits can cause joints to stop mid-range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={handleReadLimits} disabled={readingLimits} variant="secondary">
                {readingLimits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Read Current Limits
              </Button>
              <Button onClick={handleUnlockAll} disabled={unlocking} variant="outline">
                {unlocking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                Unlock All (0-4095)
              </Button>
            </div>

            {eepromLimits.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left">Motor ID</th>
                      <th className="p-2 text-left">Joint</th>
                      <th className="p-2 text-right">Min</th>
                      <th className="p-2 text-right">Max</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eepromLimits.map((lim) => {
                      const isFullRange = lim.min_angle_limit === 0 && lim.max_angle_limit === 4095;
                      const jointName = MOTOR_NAMES[lim.motor_id - 1] || `Motor ${lim.motor_id}`;
                      return (
                        <tr key={lim.motor_id} className="border-b">
                          <td className="p-2 font-mono">{lim.motor_id}</td>
                          <td className="p-2">{jointName}</td>
                          <td className="p-2 text-right font-mono">{lim.min_angle_limit}</td>
                          <td className="p-2 text-right font-mono">{lim.max_angle_limit}</td>
                          <td className="p-2 text-center">
                            {isFullRange ? (
                              <CheckCircle className="h-4 w-4 text-green-500 inline" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500 inline" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <hr />

            {/* Interactive limit recording */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Record Limits Interactively</Label>
              <p className="text-sm text-muted-foreground">
                Move each joint to its minimum and maximum positions while recording.
                The system tracks the range of motion for each motor.
              </p>
              {!recording ? (
                <Button onClick={handleStartRecording} variant="secondary">
                  Start Recording
                </Button>
              ) : (
                <div className="space-y-3">
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Recording...</AlertTitle>
                    <AlertDescription>
                      Move each joint to its min and max positions now.
                    </AlertDescription>
                  </Alert>

                  {Object.keys(recordedLimits).length > 0 && (
                    <div className="rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-2 text-left">Motor ID</th>
                            <th className="p-2 text-left">Joint</th>
                            <th className="p-2 text-right">Min</th>
                            <th className="p-2 text-right">Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(recordedLimits).map(([id, lim]) => {
                            const mid = Number(id);
                            const jointName = MOTOR_NAMES[mid - 1] || `Motor ${mid}`;
                            return (
                              <tr key={id} className="border-b">
                                <td className="p-2 font-mono">{mid}</td>
                                <td className="p-2">{jointName}</td>
                                <td className="p-2 text-right font-mono">{lim.min}</td>
                                <td className="p-2 text-right font-mono">{lim.max}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={() => handleStopRecording(true)}>
                      Stop & Save to EEPROM
                    </Button>
                    <Button variant="outline" onClick={() => handleStopRecording(false)}>
                      Stop (Discard)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
