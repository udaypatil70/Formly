import { useState } from "react";
import { HistoryIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  /** Called after a version is restored so the builder can reload fresh data. */
  onRestored: () => void;
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  formId,
  onRestored,
}: VersionHistoryDialogProps) {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; version: number } | null>(null);

  const versionsQuery = trpc.form.versionsList.useQuery(
    { id: formId },
    { enabled: open },
  );
  const saveMutation = trpc.form.versionsSave.useMutation();
  const restoreMutation = trpc.form.versionsRestore.useMutation();

  const handleSave = async () => {
    try {
      const created = await saveMutation.mutateAsync({ formId, label });
      toast.success(`Saved version ${created.version}`);
      setLabel("");
      await utils.form.versionsList.invalidate({ id: formId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save version");
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreMutation.mutateAsync({ id: restoreTarget.id });
      toast.success(`Restored version ${restoreTarget.version}`);
      setRestoreTarget(null);
      onRestored();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore version");
    }
  };

  const versions = versionsQuery.data ?? [];
  const busy = restoreMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80svh] flex-col gap-0 sm:max-w-lg">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4" />
              Version history
            </DialogTitle>
            <DialogDescription>
              Save snapshots of your form and restore any of them at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-6 py-4">
            <div className="flex gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Version label (optional)"
                className="h-9"
                disabled={saveMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
              />
              <Button
                onClick={() => void handleSave()}
                disabled={saveMutation.isPending}
                className="shrink-0"
              >
                <SaveIcon />
                Save
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Snapshots capture the title, description, settings, theme and every
              field. The builder autosaves as you type — save a version before
              making large changes.
            </p>
          </div>

          <Separator />

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 p-3">
              {versionsQuery.isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : versionsQuery.isError ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyTitle>Failed to load versions</EmptyTitle>
                    <EmptyDescription>Please try again.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : versions.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyTitle>No versions saved yet</EmptyTitle>
                    <EmptyDescription>
                      Save your first snapshot above to start a history.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className="hover:bg-accent flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {version.label || version.title}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        v{version.version} ·{" "}
                        {formatDateTime(version.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setRestoreTarget({ id: version.id, version: version.version })
                      }
                    >
                      <RotateCcwIcon />
                      <span className="hidden sm:inline">Restore</span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title={`Restore version ${restoreTarget?.version}?`}
        description="The current form — including all fields, settings and theme — will be replaced with this snapshot. This cannot be undone."
        confirmLabel="Restore"
        destructive
        busy={busy}
        onConfirm={() => void handleRestore()}
      />
    </>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}