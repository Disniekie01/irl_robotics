import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  Camera,
  FileCog,
  FolderOpen,
  Home,
  Keyboard,
  Moon,
  Network,
  Play,
  Presentation,
  Radio,
  Sliders,
  Sun,
  Gamepad2,
  BicepsFlexed,
  SlidersHorizontal,
  Clapperboard,
  Search,
  Box,
  BookOpen,
  Cpu,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  action: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
      setSearch("");
    },
    [navigate],
  );

  const items: CommandItem[] = [
    { id: "home", label: "Dashboard", icon: Home, group: "Pages", action: () => go("/"), keywords: "home overview" },
    { id: "visualizer", label: "3D Visualizer", icon: Box, group: "Pages", action: () => go("/visualizer"), keywords: "3d robot arm three" },
    { id: "control", label: "Control Robot", icon: Play, group: "Pages", action: () => go("/control"), keywords: "teleop move" },
    { id: "demo", label: "Demo", icon: Presentation, group: "Pages", action: () => go("/demo"), keywords: "dog leader follower ssh unitree" },
    { id: "browse", label: "Browse Datasets", icon: FolderOpen, group: "Pages", action: () => go("/browse"), keywords: "data recordings" },
    { id: "calibration", label: "Calibration", icon: Sliders, group: "Pages", action: () => go("/calibration"), keywords: "calibrate servo" },
    { id: "admin", label: "Admin Configuration", icon: FileCog, group: "Pages", action: () => go("/admin"), keywords: "settings config" },
    { id: "cameras", label: "Camera Overview", icon: Camera, group: "Pages", action: () => go("/viz"), keywords: "video stream" },
    { id: "network", label: "Network Management", icon: Network, group: "Pages", action: () => go("/network"), keywords: "wifi ip" },
    { id: "ros2", label: "ROS2 Bridge", icon: Radio, group: "Pages", action: () => go("/ros2"), keywords: "simulation" },
    { id: "isaacsim", label: "NVIDIA Isaac Sim", icon: Cpu, group: "Pages", action: () => go("/isaacsim"), keywords: "nvidia simulation usd launch" },
    { id: "skills", label: "Skill Graph Editor", icon: Workflow, group: "Pages", action: () => go("/skills"), keywords: "node blueprint visual sequence chain" },
    { id: "docs", label: "Documentation", icon: BookOpen, group: "Pages", action: () => go("/docs"), keywords: "help guide api reference" },

    { id: "ctrl-keyboard", label: "Keyboard Control", icon: Keyboard, group: "Control Modes", action: () => go("/control?tab=keyboard") },
    { id: "ctrl-gamepad", label: "Gamepad Control", icon: Gamepad2, group: "Control Modes", action: () => go("/control?tab=gamepad") },
    { id: "ctrl-leader", label: "Leader Arm Control", icon: BicepsFlexed, group: "Control Modes", action: () => go("/control?tab=leader") },
    { id: "ctrl-sliders", label: "Slider Control", icon: SlidersHorizontal, group: "Control Modes", action: () => go("/control?tab=sliders") },
    { id: "ctrl-macros", label: "Macros", icon: Clapperboard, group: "Control Modes", action: () => go("/control?tab=macros"), keywords: "record playback" },

    {
      id: "theme-dark",
      label: "Switch to Dark Mode",
      icon: Moon,
      group: "Actions",
      action: () => { setTheme("dark"); setOpen(false); },
    },
    {
      id: "theme-light",
      label: "Switch to Light Mode",
      icon: Sun,
      group: "Actions",
      action: () => { setTheme("light"); setOpen(false); },
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command
          className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden"
          shouldFilter={true}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            <kbd className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            {["Pages", "Control Modes", "Actions"].map((group) => {
              const groupItems = items.filter((i) => i.group === group);
              if (groupItems.length === 0) return null;
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/50"
                >
                  {groupItems.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.keywords ?? ""}`}
                      onSelect={item.action}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer text-muted-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>
              <kbd className="font-mono bg-muted px-1 py-0.5 rounded">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono bg-muted px-1 py-0.5 rounded">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono bg-muted px-1 py-0.5 rounded">esc</kbd> close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
