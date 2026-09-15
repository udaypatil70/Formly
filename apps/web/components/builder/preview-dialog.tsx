import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { PublicForm } from "~/components/public/public-form";
import type { PublicFormData } from "~/components/public/types";

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: PublicFormData;
}

export function PreviewDialog({ open, onOpenChange, form }: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl overflow-y-auto p-0"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>Live preview of the public form</DialogDescription>
        </DialogHeader>
        <div className="min-h-[70vh]">
          <PublicForm form={form} onSubmit={async () => undefined} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
