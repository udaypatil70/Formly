import { Link } from "react-router-dom";
import { ClipboardPenIcon, CompassIcon, HomeIcon } from "lucide-react";

import { Button } from "~/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full blur-3xl" />
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
          aria-label="Formforge home"
        >
          <ClipboardPenIcon className="size-5" />
        </Link>

        <p className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-7xl font-bold tracking-tight text-transparent sm:text-8xl">
          404
        </p>

        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          This page couldn&apos;t be found
        </h1>

        <p className="text-muted-foreground mt-2 text-sm">
          The link you followed may be broken, or the page may have been moved
          or deleted. Try heading back home or browse the Explore page.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500">
            <Link to="/">
              <HomeIcon />
              Back to home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/explore">
              <CompassIcon />
              Explore forms
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}