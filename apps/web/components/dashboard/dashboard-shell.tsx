import { Navigate, Outlet } from "react-router-dom";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/dashboard/app-sidebar";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";

export function DashboardShell() {
  const session = trpc.auth.getSession.useQuery();

  if (session.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (session.isError || !session.data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted-foreground">
          Couldn&apos;t verify your session. Make sure the API server is running.
        </p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const user = session.data.user;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <DashboardHeader user={user} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}