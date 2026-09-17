import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ClipboardPenIcon, MenuIcon, XIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

const NAV_ITEMS = [
  { label: "Features", href: "/#features" },
  { label: "Explore", href: "/explore" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="bg-gradient-to-br from-violet-500 to-fuchsia-500 flex size-8 items-center justify-center rounded-lg text-white shadow-lg shadow-violet-500/25 [&>svg]:size-4.5">
            <ClipboardPenIcon />
          </span>
          <span className="flex items-baseline gap-1 text-[15px] font-semibold tracking-tight">
            Formforge
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              .
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/#features" ? false : pathname === item.href;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active && "text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500">
            <Link to="/login">Get started free</Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
          className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-md md:hidden"
        >
          {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3">
              <Button variant="outline" asChild>
                <Link to="/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500">
                <Link to="/login" onClick={() => setOpen(false)}>
                  Get started free
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}