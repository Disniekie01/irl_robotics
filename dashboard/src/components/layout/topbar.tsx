import { MobileMenu } from "@/components/common/mobile-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RobotStatusDropdown } from "@/components/common/robot-status-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { fetcher } from "@/lib/utils";
import { ServerStatus } from "@/types";
import {
  BrainCircuit,
  LogOut,
  Mail,
  TestTubeDiagonal,
} from "lucide-react";
import useSWR from "swr";

const routeMap = [
  { path: "/", title: "Dashboard" },
  { path: "/visualizer", title: "3D Visualizer" },
  { path: "/control", title: "Robot Control" },
  { path: "/calibration", title: "Calibration" },
  { path: "/skills", title: "Skill Graph Editor" },
  { path: "/inference", title: "AI Control" },
  { path: "/admin", title: "Admin Configuration" },
  { path: "/docs", title: "Documentation" },
  { path: "/viz", title: "Camera Overview" },
  { path: "/network", title: "Network Management" },
  { path: "/isaacsim", title: "NVIDIA Isaac Sim" },
  {
    path: "/browse",
    title: "Browse Datasets",
    isPrefix: true,
  },
];

function ServerIP() {
  const { data: serverStatus } = useSWR<ServerStatus>(["/status"], ([url]) =>
    fetcher(url),
  );

  if (!serverStatus) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-pointer">
            {serverStatus.server_ip}:{serverStatus.server_port}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{serverStatus.name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RecordingStatus() {
  // Pulsating recording red circle when recording is active
  // Nothing when recording is inactive
  // Tooltip with recording status when hovered
  const { data: serverStatus } = useSWR<ServerStatus>(["/status"], ([url]) =>
    fetcher(url),
  );

  if (!serverStatus) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-pointer">
            {serverStatus.is_recording ? (
              <span className="relative inline-block">
                <span className="animate-ping absolute inline-flex size-3 rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-3 bg-red-500"></span>
              </span>
            ) : (
              <></>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">
            {serverStatus.is_recording ? "Recording" : "Not Recording"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AIControlStatus() {
  // AI Control status badge
  // Display a green pulsating BrainCircuit icon when AI is running. When you click on it, it takes you to the /inference page
  // Tooltip with AI status when hovered
  const { data: serverStatus } = useSWR<ServerStatus>(["/status"], ([url]) =>
    fetcher(url),
  );

  if (!serverStatus) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-pointer">
            {serverStatus.ai_running_status === "running" && (
              // Link to AI Control page
              <a href="/inference">
                <span className="relative inline-block">
                  <span className="animate-ping absolute inline-flex size-5 rounded-full bg-indigo-500 opacity-75"></span>
                  <BrainCircuit className="size-5 text-indigo-400" />
                </span>
              </a>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">
            AI Control status: {serverStatus.ai_running_status}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AccountTopBar() {
  const { session, proUser, logout } = useAuth();

  // Get first letter of email for avatar
  const getInitial = (email: string) => {
    return email ? email.charAt(0).toUpperCase() : "U";
  };

  if (!session) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="relative cursor-pointer pr-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitial(session.user_email)}
            </AvatarFallback>
          </Avatar>
          {/* Badge overlay */}
          <div
            className={`absolute -bottom-2 -right-3 px-1 py-0.5 font-extrabold rounded-sm outline-[0.5px] outline-white font- ${
              proUser
                ? "bg-black text-indigo-400 text-[10px]"
                : "bg-gray-200 text-black text-[10px]"
            }`}
          >
            {proUser ? "PRO" : "FREE"}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="text-sm text-muted-foreground">
          <div className="flex flex-col gap-y-1">
            <div>{session.user_email}</div>
            <div>{proUser ? "Pro User" : "Free User"}</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!proUser && (
          <DropdownMenuItem asChild>
            <a
              href="#"
              className="flex items-center"
              target="_blank"
            >
              <TestTubeDiagonal className="mr-1 size-4 text-indigo-400" />
              Upgrade to Pro
            </a>
          </DropdownMenuItem>
        )}
        {proUser && (
          <DropdownMenuItem asChild>
            <a
              href="#"
              className="flex items-center"
              target="_blank"
            >
              <TestTubeDiagonal className="mr-1 size-4 text-indigo-400" />
              Manage your subscription
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a
            href="mailto:disniekie@irlrobotics.dev"
            className="flex items-center"
            target="_blank"
          >
            <Mail className="mr-1 h-4 w-4" />
            Contact us
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-1 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContentHeader() {
  const currentPath = window.location.pathname;
  const { session } = useAuth();

  const matchedRoute = routeMap.find(({ path, isPrefix }) =>
    isPrefix ? currentPath.startsWith(path) : currentPath === path,
  );

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border shrink-0">
      <div className="md:hidden">
        <MobileMenu />
      </div>
      <h1 className="text-lg font-semibold text-foreground">
        {matchedRoute?.title ?? "Dashboard"}
      </h1>

      <div className="flex-1" />

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-md border border-border text-xs text-muted-foreground hover:bg-accent transition-colors"
      >
        <span>Search</span>
        <kbd className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">Ctrl+K</kbd>
      </button>

      <div className="flex items-center gap-1.5">
        <ServerIP />
        <RecordingStatus />
        <NotificationBell />
        <RobotStatusDropdown />
        <ThemeToggle />
        {session && <AccountTopBar />}
      </div>
    </div>
  );
}

export function TopBar() {
  return <ContentHeader />;
}
