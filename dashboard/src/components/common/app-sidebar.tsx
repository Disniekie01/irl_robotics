import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Camera,
  FileCog,
  FolderOpen,
  Home,
  Network,
  Play,
  Radio,
  Sliders,
} from "lucide-react";
import { useLocation, Link } from "react-router-dom";

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <Sidebar className="border-r border-border pt-12 bg-sidebar [&_[data-sidebar=group-label]]:font-mono [&_[data-sidebar=group-label]]:text-[10px] [&_[data-sidebar=group-label]]:uppercase [&_[data-sidebar=group-label]]:tracking-widest [&_[data-sidebar=group-label]]:text-muted-foreground/50 [&_[data-sidebar=group-label]]:font-medium">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={currentPath === "/"}>
                  <Link to="/">
                    <Home className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Control & Record</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/control"}
                >
                  <Link to="/control">
                    <Play className="h-5 w-5 text-indigo-400" />
                    <span>Control Robot</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath.startsWith("/browse")}
                >
                  <Link to="/browse">
                    <FolderOpen className="h-5 w-5" />
                    <span>Browse Datasets</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/calibration"}
                >
                  <Link to="/calibration">
                    <Sliders className="h-5 w-5" />
                    <span>Calibration</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Advanced Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={currentPath === "/admin"}>
                  <Link to="/admin">
                    <FileCog className="h-5 w-5" />
                    <span>Admin Configuration</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={currentPath === "/viz"}>
                  <Link to="/viz">
                    <Camera className="h-5 w-5" />
                    <span>Camera Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/network"}
                >
                  <Link to="/network">
                    <Network className="h-5 w-5" />
                    <span>Network Management</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>ROS2 & Simulation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/ros2"}
                >
                  <Link to="/ros2">
                    <Radio className="h-5 w-5 text-orange-500" />
                    <span>ROS2 Bridge</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
