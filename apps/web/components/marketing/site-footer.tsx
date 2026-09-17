import { Link } from "react-router-dom";
import { ClipboardPenIcon } from "lucide-react";

import { getApiOrigin } from "~/lib/api-origin";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/docs" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API Reference", href: "/docs#api-reference" },
      { label: "OpenAPI spec", href: `${getApiOrigin()}/openapi.json` },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Sign in", href: "/login" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="bg-gradient-to-br from-violet-500 to-fuchsia-500 flex size-8 items-center justify-center rounded-lg text-white shadow-lg shadow-violet-500/25 [&>svg]:size-4.5">
                <ClipboardPenIcon />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                Formforge
              </span>
            </Link>
            <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
              Build beautiful forms in minutes. Collect answers, analyze responses,
              and never touch spreadsheet forms again.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-foreground mb-3 text-sm font-semibold">
                {column.title}
              </h3>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-muted-foreground mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm sm:flex-row">
          <p>© {new Date().getFullYear()} Formforge. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Built for makers who ship.
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text font-medium text-transparent">
              Formforge
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}