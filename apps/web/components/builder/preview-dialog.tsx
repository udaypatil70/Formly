import { useRef, useState } from "react";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import { PublicForm } from "~/components/public/public-form";
import type { PublicFormData } from "~/components/public/types";

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: PublicFormData;
}

type Device = "desktop" | "mobile";

export function PreviewDialog({ open, onOpenChange, form }: PreviewDialogProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const [resetKey, setResetKey] = useState(0);
  const testPassed = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Re-arm test-mode indicator for the next open.
      testPassed.current = false;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-w-4xl flex-col overflow-hidden p-0"
        showCloseButton={true}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>Test the form before publishing</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-medium">Preview</p>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {testPassed.current
                ? "Submission recorded — no data saved in test mode"
                : "Test mode — submissions aren't saved"}
            </span>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <DevicesToggle
                device={device}
                onChange={setDevice}
                onReset={() => setResetKey((k) => k + 1)}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-4">
          <div
            className={cn(
              "mx-auto transition-all",
              device === "mobile" ? "w-full max-w-[375px]" : "w-full max-w-3xl",
            )}
          >
            {device === "mobile" ? (
              <div className="rounded-[2rem] border-8 border-zinc-700 bg-background shadow-xl">
                <div className="mx-auto mt-2 h-1.5 w-20 rounded-full bg-zinc-600" />
                <div className="mt-2 overflow-hidden rounded-b-[1.5rem]">
                  <PublicForm
                    key={`${resetKey}-mobile`}
                    form={form}
                    onSubmit={async () => {
                      testPassed.current = true;
                    }}
                    onReset={() => setResetKey((k) => k + 1)}
                  />
                </div>
              </div>
            ) : (
              <PublicForm
                key={`${resetKey}-desktop`}
                form={form}
                onSubmit={async () => {
                  testPassed.current = true;
                }}
                onReset={() => setResetKey((k) => k + 1)}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DevicesToggle({
  device,
  onChange,
  onReset,
}: {
  device: Device;
  onChange: (device: Device) => void;
  onReset?: () => void;
}) {
  const switchTo = (next: Device) => {
    if (next !== device) {
      onChange(next);
      onReset?.();
    }
  };
  return (
    <>
      <Button
        variant={device === "desktop" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => switchTo("desktop")}
        aria-label="Desktop preview"
      >
        <MonitorIcon />
      </Button>
      <Button
        variant={device === "mobile" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => switchTo("mobile")}
        aria-label="Mobile preview"
      >
        <SmartphoneIcon />
      </Button>
    </>
  );
}