import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CompassIcon, InboxIcon, StarIcon } from "lucide-react";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { Skeleton } from "~/components/ui/skeleton";
import { SiteHeader } from "~/components/marketing/site-header";
import { SiteFooter } from "~/components/marketing/site-footer";
import { cn } from "~/lib/utils";

const CATEGORIES = [
  { value: "movies", label: "Movies" },
  { value: "anime", label: "Anime" },
  { value: "games", label: "Games" },
  { value: "startups", label: "Startups" },
  { value: "tech", label: "Tech" },
  { value: "os", label: "OS" },
  { value: "events", label: "Events" },
  { value: "community", label: "Community" },
] as const;

const PAGE_SIZE = 12;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

export function ExplorePage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [category, setCategory] = useState<CategoryValue | undefined>(undefined);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const exploreQuery = trpc.public.getExploreForms.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: deferredSearch || undefined,
      category,
      featured: featuredOnly || undefined,
    },
    { placeholderData: keepPreviousData },
  );

  const forms = exploreQuery.data?.forms ?? [];
  const total = exploreQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectCategory = (value: CategoryValue | undefined) => {
    setCategory(value);
    setPage(1);
  };

  const toggleFeatured = () => {
    setFeaturedOnly((value) => !value);
    setPage(1);
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
              >
                <CompassIcon className="size-3" />
                Explore
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Find your next form
              </h1>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                Browse real forms built by the community. Search, filter by
                category, and jump straight into filling one out.
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-xl">
              <div className="relative">
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search forms…"
                  className="h-12 rounded-xl bg-card pr-12"
                />
                <span className="text-muted-foreground absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <CategoryChip
                active={category === undefined}
                onClick={() => selectCategory(undefined)}
              >
                All
              </CategoryChip>
              {CATEGORIES.map((item) => (
                <CategoryChip
                  key={item.value}
                  active={category === item.value}
                  onClick={() =>
                    selectCategory(category === item.value ? undefined : item.value)
                  }
                >
                  {item.label}
                </CategoryChip>
              ))}
              <button
                type="button"
                onClick={toggleFeatured}
                className={cn(
                  "text-muted-foreground hover:bg-accent flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  featuredOnly &&
                    "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400",
                )}
              >
                <StarIcon className="size-3.5" />
                Featured
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {exploreQuery.isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full rounded-xl" />
              ))}
            </div>
          ) : exploreQuery.isError ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyTitle>Failed to load forms</EmptyTitle>
                <EmptyDescription>
                  Couldn&apos;t reach the API server. Please try again.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : forms.length === 0 ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyTitle>No forms found</EmptyTitle>
                <EmptyDescription>
                  Try a different search term or category.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {forms.map((form) => (
                  <FormCard
                    key={form.id}
                    title={form.title}
                    description={form.description}
                    slug={form.slug}
                    responseCount={form.responseCount}
                    createdAt={form.createdAt}
                    isFeatured={form.isFeatured}
                    primary={form.colors?.primary}
                    background={form.colors?.background}
                    category={form.themeCategory}
                  />
                ))}
              </div>

              <Pagination className="mt-10">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) setPage(page - 1);
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      Page {page} of {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages) setPage(page + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-accent h-8 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active && "bg-primary text-primary-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function FormCard({
  title,
  description,
  slug,
  responseCount,
  createdAt,
  isFeatured,
  primary,
  background,
  category,
}: {
  title: string;
  description?: string | null;
  slug: string;
  responseCount: number;
  createdAt: string;
  isFeatured: boolean;
  primary?: string | null;
  background?: string | null;
  category?: string | null;
}) {
  const accent = primary ?? "#6d28d9";
  const dark = background ?? "#09090b";

  return (
    <Link to={`/form/${slug}`} className="group block">
      <Card className="bg-card relative flex h-full flex-col overflow-hidden rounded-xl border transition-all group-hover:-translate-y-0.5 group-hover:border-violet-500/40 group-hover:shadow-lg group-hover:shadow-violet-500/10">
        <div
          className="relative h-20 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent}55, ${dark}00), linear-gradient(135deg, ${accent}, ${dark})`,
          }}
        />
        {isFeatured && (
          <Badge className="absolute right-3 top-3 gap-1 bg-amber-500 text-white hover:bg-amber-500">
            <StarIcon className="size-3" />
            Featured
          </Badge>
        )}
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <h3 className="font-semibold leading-snug tracking-tight line-clamp-1">
              {title}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed line-clamp-2">
              {description || "No description provided."}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <InboxIcon className="size-3.5" />
              {responseCount} responses
            </span>
            <span className="flex items-center gap-2 text-muted-foreground capitalize">
              {category && (
                <span className="rounded-full border px-2 py-0.5 text-[10px]">
                  {category}
                </span>
              )}
              <span>{formatDate(createdAt)}</span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}