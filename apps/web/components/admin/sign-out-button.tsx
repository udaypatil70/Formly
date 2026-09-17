import { useNavigate } from "react-router-dom";
import { LogOutIcon } from "lucide-react";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";

export function SignOutButton() {
  const navigate = useNavigate();
  const signOut = trpc.auth.signOut.useMutation();

  const handleSignOut = async () => {
    try {
      await signOut.mutateAsync();
    } catch {
      // redirect even if the request fails
    }
    navigate("/login", { replace: true });
  };

  return (
    <Button
      variant="ghost"
      className="text-muted-foreground hover:text-foreground w-full justify-start"
      onClick={() => void handleSignOut()}
      disabled={signOut.isPending}
    >
      <LogOutIcon />
      Sign out
    </Button>
  );
}