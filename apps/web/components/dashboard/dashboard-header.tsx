import { useNavigate } from "react-router-dom";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  PlusIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { SidebarTrigger } from "~/components/ui/sidebar";

interface DashboardHeaderProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FF";
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const signOut = trpc.auth.signOut.useMutation();

  const handleSignOut = async () => {
    try {
      await signOut.mutateAsync();
    } catch {
      // continue to redirect even if the request fails
    }
    navigate("/login", { replace: true });
  };

  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Formforge</span>
          <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
            <span className="text-muted-foreground/50">/</span> My Forms
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            size="sm"
            onClick={() => navigate("/builder")}
          >
            <PlusIcon />
            <span className="hidden sm:inline">New Form</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 gap-2 px-2 data-[state=open]:bg-accent"
              >
                <Avatar className="size-6 rounded-full">
                  {user.image ? (
                    <AvatarImage src={user.image} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                  {user.name}
                </span>
                <ChevronsUpDownIcon className="text-muted-foreground hidden size-3.5 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-muted-foreground text-xs">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => toast.info(`Signed in as ${user.email}`)}
              >
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleSignOut()}
                disabled={signOut.isPending}
              >
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}