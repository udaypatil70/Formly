import { Link, NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeftIcon,
  ClipboardPenIcon,
  LayoutDashboardIcon,
  FilesIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { SignOutButton } from "~/components/admin/sign-out-button";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboardIcon, end: true },
  { to: "/admin/users", label: "Users", icon: UsersIcon, end: false },
  { to: "/admin/forms", label: "Forms", icon: FilesIcon, end: false },
];

export function AdminShell() {
  return (
    <SidebarProvider>
      <aside className="bg-card flex w-64 shrink-0 flex-col border-r">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="bg-primary flex size-8 items-center justify-center rounded-md text-primary-foreground [&>svg]:size-4">
            <ShieldCheckIcon />
          </span>
          <div className="grid leading-tight">
            <span className="truncate text-sm font-semibold">Admin</span>
            <span className="text-muted-foreground text-xs">Formforge console</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent text-foreground" : ""
                }`
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}

          <div className="pt-3">
            <Link
              to="/dashboard"
              className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              <ArrowLeftIcon className="size-4" />
              Back to app
            </Link>
          </div>
        </nav>

        <div className="border-t p-3">
          <SignOutButton />
        </div>
      </aside>

      <SidebarInset className="overflow-hidden">
        <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-6 backdrop-blur-md">
          <span className="bg-gradient-to-br from-violet-500 to-fuchsia-500 flex size-7 items-center justify-center rounded-md text-white [&>svg]:size-3.5">
            <ClipboardPenIcon />
          </span>
          <span className="text-sm font-medium">Formforge Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}