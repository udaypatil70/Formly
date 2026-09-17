import { Navigate } from "react-router-dom";
import { Loader2Icon } from "lucide-react";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";

/**
 * Blocks non-admins from the entire admin section. A regular user is
 * redirected away from /admin — the same check also runs server-side on every
 * admin procedure, so this is just the UI gate.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const session = trpc.auth.getSession.useQuery();

  if (session.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
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

  if (user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}