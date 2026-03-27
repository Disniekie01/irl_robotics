import { ErrorBoundary } from "@/components/common/error";
import { Sidebar } from "@/components/layout/sidebar";
import { ContentHeader } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ContentHeader />
        <main className="flex-1 overflow-y-auto px-6 py-5 flex flex-col">
          <div className="flex-1">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
          <Footer />
        </main>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}
