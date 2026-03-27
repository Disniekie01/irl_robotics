import { LoadingPage } from "@/components/common/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Hand, HandMetal, Smartphone, Wifi, WifiOff } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";

const WS_SEND_INTERVAL_MS = 16; // ~60 Hz

interface Vec2 {
  x: number;
  y: number;
}

function clampMagnitude(v: Vec2, max: number): Vec2 {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  if (mag <= max) return v;
  const s = max / mag;
  return { x: v.x * s, y: v.y * s };
}

// Virtual joystick component
function Joystick({
  label,
  size = 140,
  onChange,
  onRelease,
}: {
  label: string;
  size?: number;
  onChange: (v: Vec2) => void;
  onRelease: () => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Vec2>({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const radius = size / 2;
  const knobRadius = 24;

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!outerRef.current) return;
      const rect = outerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const raw: Vec2 = {
        x: (clientX - cx) / (radius - knobRadius),
        y: -(clientY - cy) / (radius - knobRadius),
      };
      const clamped = clampMagnitude(raw, 1);
      setPos(clamped);
      onChange(clamped);
    },
    [radius, onChange],
  );

  const handleEnd = useCallback(() => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    onRelease();
  }, [onRelease]);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: globalThis.PointerEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };
    const onUp = () => handleEnd();
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, handleMove, handleEnd]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setActive(true);
    handleMove(e.clientX, e.clientY);
  };

  const pixelX = pos.x * (radius - knobRadius);
  const pixelY = -pos.y * (radius - knobRadius);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div
        ref={outerRef}
        onPointerDown={onPointerDown}
        className="relative rounded-full border-2 border-muted-foreground/30 bg-muted/40 touch-none select-none"
        style={{ width: size, height: size }}
      >
        {/* Cross-hair lines */}
        <div className="absolute left-1/2 top-2 bottom-2 w-px bg-muted-foreground/15 -translate-x-1/2" />
        <div className="absolute top-1/2 left-2 right-2 h-px bg-muted-foreground/15 -translate-y-1/2" />
        {/* Knob */}
        <div
          className={`absolute rounded-full transition-colors ${
            active
              ? "bg-primary shadow-lg shadow-primary/30"
              : "bg-muted-foreground/60"
          }`}
          style={{
            width: knobRadius * 2,
            height: knobRadius * 2,
            left: `calc(50% + ${pixelX}px - ${knobRadius}px)`,
            top: `calc(50% + ${pixelY}px - ${knobRadius}px)`,
            transition: active ? "none" : "all 0.15s ease-out",
          }}
        />
      </div>
    </div>
  );
}

// Repeating button: fires continuously while held
function HoldButton({
  children,
  onAction,
  intervalMs = 100,
  ...props
}: {
  children: React.ReactNode;
  onAction: () => void;
  intervalMs?: number;
} & Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    onAction();
    intervalRef.current = setInterval(onAction, intervalMs);
  };
  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <Button
      {...props}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </Button>
  );
}

export function MobileControlPage() {
  const { data: serverStatus, error: serverError } = useSWR<ServerStatus>(
    ["/status"],
    fetcher,
    { refreshInterval: 5000 },
  );

  const [selectedRobotName, setSelectedRobotName] = useState<string | null>(
    null,
  );
  const [speed, setSpeed] = useState(1.0);
  const [wsConnected, setWsConnected] = useState(false);
  const [gyroActive, setGyroActive] = useState(false);
  const [gyroError, setGyroError] = useState<string | null>(null);
  const [tiltDisplay, setTiltDisplay] = useState<{ beta: number; gamma: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Joystick state refs (updated at pointer rate, read at send rate)
  const moveJoy = useRef<Vec2>({ x: 0, y: 0 });
  const rotJoy = useRef<Vec2>({ x: 0, y: 0 });
  const gripperRef = useRef<number>(1); // 1 = open

  // Gyro state ref (updated by deviceorientation, read by send loop)
  const gyroRef = useRef<{ beta: number; gamma: number }>({ beta: 0, gamma: 0 });
  const gyroActiveRef = useRef(false);
  const GYRO_DEAD_ZONE = 8; // degrees
  const GYRO_SCALE = 0.02; // cm per degree beyond dead zone per tick

  const robotIDFromName = (name: string | null | undefined) => {
    if (name == null || !serverStatus?.robot_status) return 0;
    const match = name.match(/^robot-(\d+)$/);
    if (match) return parseInt(match[1], 10);
    const index = serverStatus.robot_status.findIndex(
      (robot) => robot.device_name === name,
    );
    return index === -1 ? 0 : index;
  };

  // Gyro permission + activation
  const requestGyro = useCallback(async () => {
    setGyroError(null);
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const state = await DOE.requestPermission();
        if (state !== "granted") {
          setGyroError("Permission denied. Enable motion access in Settings.");
          return;
        }
      } catch (e) {
        setGyroError(e instanceof Error ? e.message : "Permission error");
        return;
      }
    }
    setGyroActive(true);
    gyroActiveRef.current = true;
  }, []);

  const stopGyro = useCallback(() => {
    setGyroActive(false);
    gyroActiveRef.current = false;
    gyroRef.current = { beta: 0, gamma: 0 };
    setTiltDisplay(null);
  }, []);

  // Gyro listener
  useEffect(() => {
    if (!gyroActive) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      gyroRef.current = { beta, gamma };
      setTiltDisplay({ beta, gamma });
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [gyroActive]);

  // WebSocket connection
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const wsUrl = `ws://${window.location.hostname}:${window.location.port}/move/teleop/ws`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    wsRef.current = ws;
  }, []);

  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsConnected(false);
  }, []);

  // Send loop: runs at ~60Hz, sends current joystick state
  useEffect(() => {
    if (!wsConnected || !selectedRobotName) {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
      return;
    }

    sendIntervalRef.current = setInterval(() => {
      const m = moveJoy.current;
      const r = rotJoy.current;

      // Gyro contribution
      let gx = 0;
      let gy = 0;
      if (gyroActiveRef.current) {
        const { beta, gamma } = gyroRef.current;
        const absBeta = Math.abs(beta);
        const absGamma = Math.abs(gamma);
        if (absBeta > GYRO_DEAD_ZONE)
          gx = (beta > 0 ? 1 : -1) * (absBeta - GYRO_DEAD_ZONE) * GYRO_SCALE * speed;
        if (absGamma > GYRO_DEAD_ZONE)
          gy = -(gamma > 0 ? 1 : -1) * (absGamma - GYRO_DEAD_ZONE) * GYRO_SCALE * speed;
      }

      const isIdle =
        Math.abs(m.x) < 0.05 &&
        Math.abs(m.y) < 0.05 &&
        Math.abs(r.x) < 0.05 &&
        Math.abs(r.y) < 0.05 &&
        Math.abs(gx) < 0.01 &&
        Math.abs(gy) < 0.01;
      if (isIdle) return;

      const scaledSpeed = speed * 2;
      const rotSpeed = speed * 5;

      const data = {
        x: m.y * scaledSpeed + gx, // forward/back + gyro
        y: -m.x * scaledSpeed + gy, // left/right + gyro
        z: r.y * scaledSpeed, // up/down (right stick Y)
        rx: 0,
        ry: 0,
        rz: -r.x * rotSpeed, // rotation (right stick X)
        open: gripperRef.current,
        source: "right",
        timestamp: Date.now() / 1000.0,
        direction_x: 0,
        direction_y: 0,
      };

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    }, WS_SEND_INTERVAL_MS);

    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
    };
  }, [wsConnected, selectedRobotName, speed]);

  // Cleanup on unmount
  useEffect(() => () => disconnectWs(), [disconnectWs]);

  // Fallback HTTP POST for single-step actions
  const sendMoveHttp = useCallback(
    async (payload: Record<string, number>) => {
      if (!selectedRobotName) return;
      try {
        const robotId = robotIDFromName(selectedRobotName);
        await fetch(
          `http://${window.location.hostname}:${window.location.port}/move/relative?robot_id=${robotId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
      } catch (e) {
        console.error("Move failed:", e);
      }
    },
    [selectedRobotName, serverStatus],
  );

  if (serverError) {
    return (
      <div className="p-4 text-destructive">
        Failed to connect. Make sure the server is running.
      </div>
    );
  }
  if (!serverStatus) return <LoadingPage />;

  const robots = serverStatus.robot_status || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-4">
          {/* Robot selector + connection */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Robot</Label>
              <Select
                value={selectedRobotName ?? ""}
                onValueChange={(v) => setSelectedRobotName(v || null)}
              >
                <SelectTrigger className="h-12 text-base mt-1">
                  <SelectValue placeholder="Select robot" />
                </SelectTrigger>
                <SelectContent>
                  {robots.map((robot, index) => (
                    <SelectItem
                      key={robot.device_name || `robot-${index}`}
                      value={robot.device_name || `robot-${index}`}
                    >
                      {robot.name} ({robot.device_name || "-"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={wsConnected ? "destructive" : "default"}
              size="lg"
              className="h-12"
              disabled={!selectedRobotName}
              onClick={wsConnected ? disconnectWs : connectWs}
            >
              {wsConnected ? (
                <>
                  <WifiOff className="h-4 w-4 mr-2" />
                  Disconnect
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${wsConnected ? "bg-indigo-500" : "bg-gray-400"}`}
            />
            <span className="text-muted-foreground">
              {wsConnected
                ? "Connected via WebSocket (60 Hz)"
                : "Disconnected - tap Connect for smooth control"}
            </span>
          </div>

          {/* Speed slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Speed</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {speed.toFixed(1)}x
              </span>
            </div>
            <Slider
              min={0.1}
              max={3.0}
              step={0.1}
              value={[speed]}
              onValueChange={([v]) => setSpeed(v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Joysticks */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-center gap-8 flex-wrap">
            <Joystick
              label="Move (X / Y)"
              onChange={(v) => {
                moveJoy.current = v;
              }}
              onRelease={() => {
                moveJoy.current = { x: 0, y: 0 };
              }}
            />
            <Joystick
              label="Z / Rotate"
              onChange={(v) => {
                rotJoy.current = v;
              }}
              onRelease={() => {
                rotJoy.current = { x: 0, y: 0 };
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Left stick: forward/back + left/right. Right stick: up/down +
            rotation.
          </p>
        </CardContent>
      </Card>

      {/* Gyro / Tilt control */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <Label>Gyro / Tilt Control</Label>
            </div>
            <Button
              size="sm"
              variant={gyroActive ? "destructive" : "outline"}
              onClick={gyroActive ? stopGyro : requestGyro}
              disabled={!selectedRobotName || !wsConnected}
            >
              {gyroActive ? "Disable Gyro" : "Enable Gyro"}
            </Button>
          </div>
          {gyroError && (
            <p className="text-sm text-destructive">{gyroError}</p>
          )}
          {gyroActive && tiltDisplay && (
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground font-mono">
                Tilt: {tiltDisplay.beta.toFixed(0)} fwd/back | {tiltDisplay.gamma.toFixed(0)} left/right
              </p>
              <div
                className="mx-auto w-24 h-24 rounded-full border-2 border-muted-foreground/30 bg-muted/30 relative"
              >
                <div
                  className="absolute w-4 h-4 rounded-full bg-primary"
                  style={{
                    left: `calc(50% + ${Math.max(-40, Math.min(40, tiltDisplay.gamma))}% - 8px)`,
                    top: `calc(50% + ${Math.max(-40, Math.min(40, tiltDisplay.beta))}% - 8px)`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Tilt phone to move X/Y. Use right joystick for Z and rotation.
              </p>
            </div>
          )}
          {!gyroActive && (
            <p className="text-xs text-muted-foreground">
              {!wsConnected
                ? "Connect via WebSocket first, then enable gyro."
                : "Tilt your phone to move the robot on X/Y axes. Works alongside joysticks."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gripper + step buttons */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-3">
            <Button
              size="lg"
              variant={gripperRef.current === 1 ? "default" : "outline"}
              className="flex-1 h-14 text-base touch-manipulation"
              disabled={!selectedRobotName}
              onClick={() => {
                gripperRef.current = 1;
                if (!wsConnected) sendMoveHttp({ open: 1 });
              }}
            >
              <Hand className="h-5 w-5 mr-2" />
              Open
            </Button>
            <Button
              size="lg"
              variant={gripperRef.current === 0 ? "default" : "outline"}
              className="flex-1 h-14 text-base touch-manipulation"
              disabled={!selectedRobotName}
              onClick={() => {
                gripperRef.current = 0;
                if (!wsConnected) sendMoveHttp({ open: 0 });
              }}
            >
              <HandMetal className="h-5 w-5 mr-2" />
              Close
            </Button>
          </div>

          {/* Step buttons (fallback when not using joysticks) */}
          <div className="grid grid-cols-3 gap-2">
            <HoldButton
              size="lg"
              variant="outline"
              className="h-12 touch-manipulation"
              disabled={!selectedRobotName}
              onAction={() => sendMoveHttp({ z: speed })}
            >
              Z+
            </HoldButton>
            <HoldButton
              size="lg"
              variant="outline"
              className="h-12 touch-manipulation"
              disabled={!selectedRobotName}
              onAction={() => sendMoveHttp({ z: -speed })}
            >
              Z-
            </HoldButton>
            <HoldButton
              size="lg"
              variant="outline"
              className="h-12 touch-manipulation"
              disabled={!selectedRobotName}
              onAction={() => sendMoveHttp({ rz: speed * 5 })}
            >
              Rot
            </HoldButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
