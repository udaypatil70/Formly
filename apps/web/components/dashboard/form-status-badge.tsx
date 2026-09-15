import { GlobeIcon, Link2Icon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

type FormStatus = "draft" | "published" | "unpublished";
type FormVisibility = "public" | "unlisted";

const statusStyles: Record<FormStatus, string> = {
  published: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  unpublished: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  draft: "border-transparent bg-muted text-muted-foreground",
};

const statusDot: Record<FormStatus, string> = {
  published: "bg-emerald-500",
  unpublished: "bg-amber-500",
  draft: "bg-muted-foreground/60",
};

export function StatusBadge({
  status,
  className,
}: {
  status: FormStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium capitalize", statusStyles[status], className)}
    >
      <span className={cn("size-1.5 rounded-full", statusDot[status])} />
      {status}
    </Badge>
  );
}

export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: FormVisibility;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("text-muted-foreground font-normal", className)}>
      {visibility === "public" ? (
        <GlobeIcon className="size-3" />
      ) : (
        <Link2Icon className="size-3" />
      )}
      {visibility}
    </Badge>
  );
}