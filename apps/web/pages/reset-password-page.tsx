import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "~/components/auth/auth-shell";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const linkError = params.get("error");
  const resetPassword = trpc.auth.resetPassword.useMutation();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const invalidLink = !token || Boolean(linkError);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }

    setError("");
    try {
      await resetPassword.mutateAsync({ token, newPassword: password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Couldn't reset your password. Please request a new link.",
      );
    }
  };

  return (
    <AuthShell
      title={invalidLink ? "Reset link expired" : "Choose a new password"}
      description={
        invalidLink
          ? "This password reset link is invalid or has expired."
          : "Enter a new password for your account."
      }
      footer={
        <Link to="/login" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeftIcon className="size-3" />
          Back to sign in
        </Link>
      }
    >
      {invalidLink ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Request a fresh link to continue.</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
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
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10"
              disabled={resetPassword.isPending}
            />
            <p className="text-muted-foreground text-xs">At least 8 characters.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10"
              disabled={resetPassword.isPending}
            />
          </div>

          <Button type="submit" className="h-10 w-full" disabled={resetPassword.isPending}>
            {resetPassword.isPending ? <Spinner /> : <KeyRoundIcon />}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
