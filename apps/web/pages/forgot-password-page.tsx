import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, MailCheckIcon, SendIcon } from "lucide-react";

import { AuthShell } from "~/components/auth/auth-shell";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

export function ForgotPasswordPage() {
  const config = trpc.auth.getConfig.useQuery();
  const requestReset = trpc.auth.requestPasswordReset.useMutation();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const enabled = config.data?.forgotPasswordEnabled ?? false;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter the email address for your account.");
      return;
    }

    setError("");
    try {
      await requestReset.mutateAsync({ email: trimmed });
      setSent(true);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Couldn't send the reset email. Please try again.",
      );
    }
  };

  return (
    <AuthShell
      title={sent ? "Check your inbox" : "Forgot your password?"}
      description={
        sent
          ? "If an account exists for that email, a reset link is on its way."
          : "Enter your email and we'll send you a link to reset your password."
      }
      footer={
        <Link to="/login" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeftIcon className="size-3" />
          Back to sign in
        </Link>
      }
    >
      {config.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="text-muted-foreground size-5" />
        </div>
      ) : !enabled ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Password reset isn&apos;t available on this server. Contact an administrator if you need
            help accessing your account.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
            <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Reset email sent</p>
              <p className="text-muted-foreground">
                The link expires in 1 hour. Check your spam folder if it doesn&apos;t arrive.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSent(false);
              setError("");
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="h-10"
              disabled={requestReset.isPending}
            />
          </div>

          <Button type="submit" className="h-10 w-full" disabled={requestReset.isPending}>
            {requestReset.isPending ? <Spinner /> : <SendIcon />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
