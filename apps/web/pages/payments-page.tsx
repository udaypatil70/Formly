import { ArrowLeftIcon, ChartColumnIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { trpc } from "~/trpc/client";
import { PaymentsPanel } from "~/components/payments/payments-panel";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";

export function PaymentsPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();

  const formQuery = trpc.form.getById.useQuery(
    { id: formId ?? "" },
    { enabled: !!formId },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeftIcon />
            Back to forms
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formQuery.isLoading ? (
              <Skeleton className="h-8 w-56" />
            ) : (
              formQuery.data?.form.title ?? "Payments"
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            Track Razorpay orders, search historical payments, and issue full or
            partial refunds.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate(`/analytics/${formId ?? ""}`)}
          disabled={!formId}
        >
          <ChartColumnIcon />
          View analytics
        </Button>
      </div>

      <Separator />

      {formId ? (
        <PaymentsPanel formId={formId} />
      ) : (
        <p className="text-muted-foreground text-sm">Form not found.</p>
      )}
    </div>
  );
}
