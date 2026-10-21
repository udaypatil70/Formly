import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";

export function SignOutButton() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const signOut = trpc.auth.signOut.useMutation();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    try {
      await signOut.mutateAsync();
      utils.auth.getSession.setData(undefined, { user: null, session: null });
      navigate("/login", { replace: true });
    } catch {
      toast.error("Couldn't sign out. Please try again.");
      setPending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      className="text-muted-foreground hover:text-foreground w-full justify-start"
      onClick={() => void handleSignOut()}
      disabled={pending}
    >
      <LogOutIcon />
      Sign out
    </Button>
  );
}
