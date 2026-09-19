import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOutIcon } from "lucide-react";

import { getAuthEndpoints } from "~/lib/api-origin";
import { Button } from "~/components/ui/button";

export function SignOutButton() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    try {
      await fetch(getAuthEndpoints().signOut, {
        method: "POST",
        credentials: "include",
      });
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
      disabled={pending}
    >
      <LogOutIcon />
      Sign out
    </Button>
  );
}