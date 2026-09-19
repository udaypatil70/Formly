import { Link, useLocation } from "react-router-dom";
import {
  ClipboardPenIcon,
  FolderIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

export function AppSidebar() {
  const { pathname } = useLocation();
  const session = trpc.auth.getSession.useQuery();
  const isAdmin = session.data?.user?.role === "admin";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="group-data-[collapsible=icon]:justify-center">
              <Link to="/dashboard">
                <span className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-md text-primary-foreground [&>svg]:size-4">
                  <ClipboardPenIcon />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Formly</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Form builder
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip="My Forms"
                >
                  <Link to="/dashboard">
                    <FolderIcon />
                    <span>My Forms</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="New Form">
                  <Link to="/builder" className={cn("text-emerald-500 dark:text-emerald-400")}>
                    <PlusIcon />
                    <span>New Form</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/admin")}
                    tooltip="Admin Panel"
                  >
                    <Link to="/admin">
                      <ShieldCheckIcon />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}