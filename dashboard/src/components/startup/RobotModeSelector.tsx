import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchWithBaseUrl } from "@/lib/utils";
import { Bot, Cpu, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "robot_mode_chosen";

export function RobotModeSelector() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  const choose = async (mode: "simulation" | "hardware") => {
    setLoading(mode);
    try {
      if (mode === "simulation") {
        await fetchWithBaseUrl("/simulation/toggle", "POST", { enabled: true });
      }
      localStorage.setItem(STORAGE_KEY, mode);
      setOpen(false);
    } catch {
      localStorage.setItem(STORAGE_KEY, mode);
      setOpen(false);
    }
    setLoading(null);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-primary" />
            Welcome to IRL Robotics
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            How would you like to get started?
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => choose("simulation")}
            disabled={loading !== null}
            className="flex flex-col items-center gap-3 p-5 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all group"
          >
            <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <Monitor className="size-6 text-blue-500" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">Simulated Robot</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                No hardware needed. Use a virtual SO-100 arm.
              </div>
            </div>
            {loading === "simulation" && (
              <div className="text-[10px] text-primary animate-pulse">Setting up...</div>
            )}
          </button>
          <button
            onClick={() => choose("hardware")}
            disabled={loading !== null}
            className="flex flex-col items-center gap-3 p-5 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all group"
          >
            <div className="size-12 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
              <Cpu className="size-6 text-green-500" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">Real Robot</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Connect to physical hardware via USB.
              </div>
            </div>
            {loading === "hardware" && (
              <div className="text-[10px] text-primary animate-pulse">Setting up...</div>
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          You can switch modes anytime from the dashboard.
        </p>
      </DialogContent>
    </Dialog>
  );
}
