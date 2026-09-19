import { Link, NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeftIcon,
  ClipboardPenIcon,
  LayoutDashboardIcon,
  FilesIcon,
  MenuIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { SignOutButton } from "~/components/admin/sign-out-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboardIcon, end: true },
  { to: "/admin/users", label: "Users", icon: UsersIcon, end: false },
  { to: "/admin/forms", label: "Forms", icon: FilesIcon, end: false },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
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
          onClick={onNavigate}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        >
          <ArrowLeftIcon className="size-4" />
          Back to app
        </Link>
      </div>
    </nav>
  );
}

export function AdminShell() {
  return (
    <SidebarProvider>
      {/* Desktop sidebar */}
      <aside className="bg-card hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="bg-primary flex size-8 items-center justify-center rounded-md text-primary-foreground [&>svg]:size-4">
            <ShieldCheckIcon />
          </span>
          <div className="grid leading-tight">
            <span className="truncate text-sm font-semibold">Admin</span>
            <span className="text-muted-foreground text-xs">Formly console</span>
          </div>
        </div>

        <NavLinks />

        <div className="border-t p-3">
          <SignOutButton />
        </div>
      </aside>

      <SidebarInset className="overflow-hidden">
        <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:px-6">
          {/* Mobile nav trigger */}
          <Sheet>
            <SheetTrigger className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 items-center justify-center rounded-md lg:hidden">
              <MenuIcon className="size-4.5" />
              <span className="sr-only">Open admin menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col gap-0 p-0">
              <SheetHeader className="flex h-14 flex-row items-center gap-2 border-b px-4">
                <span className="bg-primary flex size-8 items-center justify-center rounded-md text-primary-foreground [&>svg]:size-4">
                  <ShieldCheckIcon />
                </span>
                <SheetTitle className="text-sm font-semibold">Formly Admin</SheetTitle>
              </SheetHeader>
              <NavLinks />
              <div className="border-t p-3">
                <SignOutButton />
              </div>
            </SheetContent>
          </Sheet>

          <span className="bg-gradient-to-br from-violet-500 to-fuchsia-500 hidden size-7 items-center justify-center rounded-md text-white [&>svg]:size-3.5 sm:flex">
            <ClipboardPenIcon />
          </span>
          <span className="hidden text-sm font-medium sm:inline">Formly Admin</span>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
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