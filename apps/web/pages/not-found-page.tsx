import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeftIcon,
  CompassIcon,
  FileQuestionIcon,
  HomeIcon,
  LayoutTemplateIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";

export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute -top-40 left-1/2 h-80 w-[36rem] max-w-full -translate-x-1/2 rounded-full blur-3xl" />
        <svg
          className="text-muted-foreground/10 absolute inset-0 h-full w-full opacity-50"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="not-found-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0v40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#not-found-grid)" />
        </svg>
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <Link
          to="/"
          className="bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-8 flex size-11 items-center justify-center rounded-xl text-white shadow-lg shadow-violet-500/25"
          aria-label="Formly home"
        >
          <FileQuestionIcon className="size-5" />
        </Link>

        <p className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-8xl">
          404
        </p>

        <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
          We couldn&apos;t find that page
        </h1>

        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          The link may be broken, or the page may have been moved or deleted.
        </p>

        <code className="bg-muted/60 text-muted-foreground mt-4 block max-w-full truncate rounded-md px-3 py-1.5 font-mono text-xs">
          {pathname}
        </code>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            asChild
            className="bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500"
          >
            <Link to="/">
              <HomeIcon />
              Back to home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              <ArrowLeftIcon />
              Go to dashboard
            </Link>
          </Button>
        </div>

        <div className="mt-8 w-full">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Or try one of these
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              to="/explore"
              className="hover:bg-accent hover:text-accent-foreground flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors"
            >
              <CompassIcon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium">Explore forms</p>
                <p className="text-muted-foreground truncate text-xs">
                  Browse published forms
                </p>
              </div>
            </Link>
            <Link
              to="/templates"
              className="hover:bg-accent hover:text-accent-foreground flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors"
            >
              <LayoutTemplateIcon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium">Templates</p>
                <p className="text-muted-foreground truncate text-xs">
                  Start from a template
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}