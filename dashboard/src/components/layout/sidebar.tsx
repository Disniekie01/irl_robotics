import {
  BookOpen,
  Box,
  Camera,
  Cpu,
  FileCog,
  FolderOpen,
  Home,
  Network,
  Play,
  Radio,
  Sliders,
  Workflow,
} from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavItemDef {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  exact?: boolean;
  prefix?: boolean;
  iconClass?: string;
}

const navGroups: { label: string; items: NavItemDef[] }[] = [
  {
    label: "Navigation",
    items: [
      { path: "/", icon: Home, label: "Dashboard", exact: true },
      { path: "/visualizer", icon: Box, label: "3D Visualizer", iconClass: "text-indigo-400" },
    ],
  },
  {
    label: "Control & Record",
    items: [
      { path: "/control", icon: Play, label: "Control Robot", iconClass: "text-indigo-400" },
      { path: "/browse", icon: FolderOpen, label: "Datasets", prefix: true },
      { path: "/calibration", icon: Sliders, label: "Calibration" },
      { path: "/skills", icon: Workflow, label: "Skill Graph", iconClass: "text-purple-400" },
    ],
  },
  {
    label: "Settings",
    items: [
      { path: "/admin", icon: FileCog, label: "Admin" },
      { path: "/viz", icon: Camera, label: "Cameras" },
      { path: "/network", icon: Network, label: "Network" },
    ],
  },
  {
    label: "Simulation",
    items: [
      { path: "/ros2", icon: Radio, label: "ROS2 Bridge", iconClass: "text-orange-500" },
      { path: "/isaacsim", icon: Cpu, label: "Isaac Sim", iconClass: "text-green-400" },
    ],
  },
  {
    label: "Help",
    items: [
      { path: "/docs", icon: BookOpen, label: "Documentation" },
    ],
  },
];

function NavItem({
  path,
  icon: Icon,
  label,
  isActive,
  iconClass,
}: {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  iconClass?: string;
}) {
  return (
    <Link
      to={path}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors",
        isActive
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
    >
      <Icon className={cn("size-4 shrink-0", iconClass)} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-sidebar border-r border-border h-screen">
      <div className="px-4 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="text-base font-bold tracking-tight text-primary font-mono">
            IRL
          </span>
          <span className="text-sm font-medium text-foreground/60">
            Robotics
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground/50">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.exact
                  ? currentPath === item.path
                  : item.prefix
                  ? currentPath.startsWith(item.path)
                  : currentPath === item.path;
                return (
                  <NavItem
                    key={item.path}
                    path={item.path}
                    icon={item.icon}
                    label={item.label}
                    isActive={isActive}
                    iconClass={item.iconClass}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
