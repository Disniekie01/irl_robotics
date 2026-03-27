import { useEffect, useRef } from "react";
import { fetcher } from "@/lib/utils";
import { ServerStatus } from "@/types";
import { useNotifications } from "@/stores/notifications";
import { toast } from "sonner";
import useSWR from "swr";

export function NotificationWatcher() {
  const { data: status } = useSWR<ServerStatus>("/status", fetcher, {
    refreshInterval: 3000,
  });
  const prevRef = useRef<ServerStatus | null>(null);
  const add = useNotifications((s) => s.add);

  useEffect(() => {
    const prev = prevRef.current;
    if (!status || !prev) {
      prevRef.current = status ?? null;
      return;
    }

    // Robot connected / disconnected
    const prevRobots = new Set(prev.robots ?? []);
    const currRobots = new Set(status.robots ?? []);
    for (const r of currRobots) {
      if (!prevRobots.has(r)) {
        add("success", "Robot Connected", `${r} is now online`);
        toast.success(`Robot connected: ${r}`);
      }
    }
    for (const r of prevRobots) {
      if (!currRobots.has(r)) {
        add("error", "Robot Disconnected", `${r} went offline`);
        toast.error(`Robot disconnected: ${r}`);
      }
    }

    // Recording started / stopped
    if (!prev.is_recording && status.is_recording) {
      add("info", "Recording Started", "Episode recording is in progress");
      toast.info("Recording started");
    }
    if (prev.is_recording && !status.is_recording) {
      add("success", "Recording Stopped", "Episode recording saved");
      toast.success("Recording saved");
    }

    // AI status changes
    if (prev.ai_running_status !== status.ai_running_status) {
      if (status.ai_running_status === "running") {
        add("info", "AI Control Active", "AI inference is running");
        toast.info("AI control started");
      } else if (status.ai_running_status === "stopped" && prev.ai_running_status === "running") {
        add("warning", "AI Control Stopped", "AI inference has stopped");
        toast.warning("AI control stopped");
      }
    }

    // Simulation mode change
    if (prev.simulation_only !== status.simulation_only) {
      if (status.simulation_only) {
        add("info", "Simulation Mode", "Switched to simulation-only mode");
      } else {
        add("info", "Hardware Mode", "Switched to hardware mode");
      }
    }

    prevRef.current = status;
  }, [status, add]);

  return null;
}
