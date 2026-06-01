import React, { Suspense, lazy } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/layout";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { NotificationWatcher } from "@/components/notifications/NotificationWatcher";
import { RobotModeSelector } from "@/components/startup/RobotModeSelector";
import { DemoPage } from "@/pages/DemoPage";

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-muted-foreground">
          <p>Something went wrong loading this page.</p>
          <button
            className="px-4 py-2 text-sm rounded-md border border-input hover:bg-accent"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ControlPage = lazy(() => import("@/pages/control/ControlPage").then((m) => ({ default: m.ControlPage })));
const VisualizerPage = lazy(() => import("@/pages/VisualizerPage").then((m) => ({ default: m.VisualizerPage })));
const MobileControlPage = lazy(() => import("@/pages/control/MobileControlPage").then((m) => ({ default: m.MobileControlPage })));
const BrowsePage = lazy(() => import("@/pages/BrowsePage").then((m) => ({ default: m.BrowsePage })));
const AdminPage = lazy(() => import("@/pages/AdminSettingsPage").then((m) => ({ default: m.AdminPage })));
const CalibrationPage = lazy(() => import("@/pages/calibration/CalibrationPage").then((m) => ({ default: m.CalibrationPage })));
const NetworkPage = lazy(() => import("@/pages/NetworkPage").then((m) => ({ default: m.NetworkPage })));
const ROS2BridgePage = lazy(() => import("@/pages/ROS2BridgePage").then((m) => ({ default: m.ROS2BridgePage })));
const IsaacSimPage = lazy(() => import("@/pages/IsaacSimPage").then((m) => ({ default: m.IsaacSimPage })));
const SkillGraphPage = lazy(() => import("@/pages/SkillGraphPage").then((m) => ({ default: m.SkillGraphPage })));
const ViewVideoPage = lazy(() => import("@/pages/ViewVideoPage").then((m) => ({ default: m.ViewVideoPage })));
const DocsPage = lazy(() => import("@/pages/docs/DocsPage").then((m) => ({ default: m.DocsPage })));
const AuthForm = lazy(() => import("@/pages/auth/AuthForm").then((m) => ({ default: m.AuthForm })));
const ConfirmCode = lazy(() => import("@/pages/auth/ConfirmCode").then((m) => ({ default: m.ConfirmCode })));
const ConfirmEmail = lazy(() => import("@/pages/auth/ConfirmEmail").then((m) => ({ default: m.ConfirmEmail })));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword").then((m) => ({ default: m.ResetPassword })));

function App() {
  return (
    <Router>
      <CommandPalette />
      <NotificationWatcher />
      <RobotModeSelector />
      <RouteErrorBoundary>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/visualizer" element={<VisualizerPage />} />
            <Route path="/mobile" element={<MobileControlPage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/browse/:path" element={<BrowsePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/calibration" element={<CalibrationPage />} />
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/ros2" element={<ROS2BridgePage />} />
            <Route path="/isaacsim" element={<IsaacSimPage />} />
            <Route path="/skills" element={<SkillGraphPage />} />
            <Route path="/viz" element={<ViewVideoPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/dashboard/demo" element={<DemoPage />} />
            <Route path="/auth" element={<AuthForm />} />
            <Route path="/sign-in" element={<AuthForm />} />
            <Route path="/sign-up" element={<AuthForm />} />
            <Route path="/sign-up/confirm" element={<ConfirmCode />} />
            <Route path="/auth/confirm" element={<ConfirmEmail />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
          </Route>
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </Router>
  );
}

export default App;
