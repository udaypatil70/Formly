import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2Icon,
  BriefcaseIcon,
  CheckIcon,
  CreditCardIcon,
  LaptopIcon,
  MailCheckIcon,
  MailWarningIcon,
  RefreshCwIcon,
  RocketIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { loadRazorpayCheckout } from "~/lib/razorpay";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_DESCRIPTION: Record<string, string> = {
  free: "You're on the free plan. Upgrade to Pro for unlimited forms, all themes and advanced analytics.",
  pro: "You have an active Pro plan. Enjoy unlimited forms and advanced features.",
  enterprise: "Enterprise pricing is custom. Contact our team to get started.",
};

export function ProfilePage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const session = trpc.auth.getSession.useQuery();
  const config = trpc.auth.getConfig.useQuery();
  const subscription = trpc.subscription.getMySubscription.useQuery();

  const user = session.data?.user;

  const sessions = trpc.auth.listSessions.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const updateProfile = trpc.subscription.updateProfile.useMutation();
  const createPro = trpc.subscription.createProSubscription.useMutation();
  const verifyPayment = trpc.subscription.verifySubscriptionPayment.useMutation();
  const cancelSub = trpc.subscription.cancelSubscription.useMutation();
  const syncSub = trpc.subscription.syncSubscription.useMutation();
  const sendVerification = trpc.auth.sendVerificationEmail.useMutation();
  const revokeSession = trpc.auth.revokeSession.useMutation();
  const revokeOthers = trpc.auth.revokeOtherSessions.useMutation();
  const deleteAccount = trpc.auth.deleteAccount.useMutation();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRevokeOthers, setConfirmRevokeOthers] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setCompany(user.company ?? "");
      setJobTitle(user.jobTitle ?? "");
    }
  }, [user]);

  const plan = subscription.data?.plan ?? user?.plan ?? "free";
  const canUpgrade = subscription.data?.razorpayConfigured && subscription.data?.proPlanConfigured;

  const handleUpgrade = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await createPro.mutateAsync();
      const Razorpay = await loadRazorpayCheckout();
      const checkout = new Razorpay({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: "Formly",
        description: "Pro plan subscription",
        prefill: { name: res.name, email: res.email },
        theme: { color: "#6d28d9" },
        handler: async (response) => {
          try {
            const result = await verifyPayment.mutateAsync({
              subscriptionId: response.razorpay_subscription_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            toast.success(
              result.activated
                ? "Welcome to Pro!"
                : "Payment received — Razorpay is still confirming it. Use “Sync status” in a moment.",
            );
          } catch {
            toast.success("Payment received — your plan is being activated.");
          }
          await Promise.all([session.refetch(), subscription.refetch()]);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Couldn't start the upgrade");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSub.mutateAsync();
      toast.success("Subscription cancelled");
      setConfirmCancel(false);
      await Promise.all([session.refetch(), subscription.refetch()]);
    } catch {
      toast.error("Couldn't cancel the subscription");
    }
  };

  const handleSync = async () => {
    try {
      await syncSub.mutateAsync();
      await Promise.all([
        subscription.refetch(),
        session.refetch(),
        utils.subscription.getMySubscription.invalidate(),
      ]);
      toast.success("Subscription synced with Razorpay");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't sync subscription");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        name: name.trim() || user?.name || "User",
        company: company.trim() || null,
        jobTitle: jobTitle.trim() || null,
      });
      toast.success("Profile updated");
      await Promise.all([session.refetch(), subscription.refetch()]);
    } catch {
      toast.error("Couldn't save your profile");
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendVerification.mutateAsync();
      toast.success("Verification email sent. Check your inbox.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the verification email");
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const result = await revokeSession.mutateAsync({ sessionId });
      if (result.signedOut) {
        await session.refetch();
        navigate("/login", { replace: true });
        return;
      }
      toast.success("Session revoked");
      await sessions.refetch();
    } catch {
      toast.error("Couldn't revoke that session");
    }
  };

  const handleRevokeOtherSessions = async () => {
    try {
      await revokeOthers.mutateAsync();
      toast.success("Other sessions signed out");
      setConfirmRevokeOthers(false);
      await sessions.refetch();
    } catch {
      toast.error("Couldn't sign out the other sessions");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount.mutateAsync({
        password: deletePassword.trim() || undefined,
      });
      toast.success("Your account has been deleted");
      setDeleteOpen(false);
      setDeletePassword("");
      await session.refetch();
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete your account");
    }
  };

  if (subscription.isLoading || session.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your plan, subscription and account details.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserIcon className="text-muted-foreground size-4" />
              Account details
            </CardTitle>
            <CardDescription>Your email is used for sign-in and notifications.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" value={user?.email ?? ""} disabled className="h-10" />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span className="flex items-center gap-2 text-xs">
                    {user?.emailVerified ? (
                      <>
                        <MailCheckIcon className="size-4 text-emerald-500" />
                        Email verified
                      </>
                    ) : (
                      <>
                        <MailWarningIcon className="text-muted-foreground size-4" />
                        Email not verified
                      </>
                    )}
                  </span>
                  {!user?.emailVerified && config.data?.emailVerificationEnabled ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => void handleResendVerification()}
                      disabled={sendVerification.isPending}
                    >
                      {sendVerification.isPending ? <Spinner /> : null}
                      Resend verification
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-company">Company</Label>
                  <div className="relative">
                    <Building2Icon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="profile-company"
                      placeholder="Acme Inc."
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="h-10 pl-9"
                      maxLength={120}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-job-title">Job title</Label>
                  <div className="relative">
                    <BriefcaseIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="profile-job-title"
                      placeholder="Product Manager"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="h-10 pl-9"
                      maxLength={120}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? <Spinner /> : null}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCardIcon className="text-muted-foreground size-4" />
              Plan &amp; billing
            </CardTitle>
            <CardDescription>Your current Formly plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current plan</span>
              <Badge
                variant={plan === "pro" ? "default" : "secondary"}
                className={plan === "pro" ? "bg-primary text-primary-foreground" : undefined}
              >
                <RocketIcon className="mr-1 size-3" />
                {PLAN_LABEL[plan] ?? plan}
              </Badge>
            </div>

            {plan === "pro" && (
              <div className="text-muted-foreground flex flex-col gap-1 rounded-md border px-3 py-2 text-xs">
                <p className="flex items-center gap-2">
                  <CheckIcon className="size-4 shrink-0 text-emerald-500" />
                  Subscription{" "}
                  <span className="text-foreground font-medium">
                    {subscription.data?.subscriptionStatus ?? "active"}
                  </span>
                </p>
                <p className="truncate font-mono">
                  {subscription.data?.subscriptionId ?? "syncing"}
                </p>
                <p>
                  Last synced{" "}
                  {subscription.data?.subscriptionSyncedAt
                    ? new Date(subscription.data.subscriptionSyncedAt).toLocaleString()
                    : "never"}
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-sm">
              {PLAN_DESCRIPTION[plan] ?? "Upgrade to unlock more features."}
            </p>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            {plan === "free" ? (
              <>
                <Button
                  onClick={() => void handleUpgrade()}
                  disabled={busy || createPro.isPending || !canUpgrade}
                  className="w-full"
                >
                  {busy || createPro.isPending ? <Spinner /> : <RocketIcon />}
                  {canUpgrade ? "Upgrade to Pro" : "Pro plan not available yet"}
                </Button>
                {!canUpgrade && (
                  <p className="text-muted-foreground text-center text-xs">
                    Payments aren&apos;t configured on this server yet.
                  </p>
                )}
              </>
            ) : plan === "pro" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleSync()}
                  disabled={syncSub.isPending || cancelSub.isPending}
                  className="w-full"
                >
                  {syncSub.isPending ? <Spinner /> : <RefreshCwIcon />}
                  Sync status
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmCancel(true)}
                  disabled={cancelSub.isPending || syncSub.isPending}
                  className="text-muted-foreground w-full"
                >
                  {cancelSub.isPending ? <Spinner /> : null}
                  Cancel subscription
                </Button>
              </>
            ) : (
              <Button asChild className="w-full">
                <a
                  href={
                    user?.company
                      ? `mailto:sales@formly.example?subject=Enterprise plan inquiry — ${encodeURIComponent(user.company)}`
                      : "mailto:sales@formly.example?subject=Enterprise plan inquiry"
                  }
                >
                  Contact sales
                </a>
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LaptopIcon className="text-muted-foreground size-4" />
            Active sessions
          </CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner className="text-muted-foreground size-5" />
            </div>
          ) : sessions.data?.length ? (
            sessions.data.map((activeSession) => (
              <div
                key={activeSession.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {describeSession(activeSession.userAgent)}
                    {activeSession.current ? (
                      <Badge variant="secondary" className="text-[10px]">
                        This device
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    IP {activeSession.ipAddress ?? "unknown"} &middot; Last active{" "}
                    {new Date(activeSession.updatedAt).toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Expires {new Date(activeSession.expiresAt).toLocaleString()}
                  </p>
                </div>
                {!activeSession.current ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRevokeSession(activeSession.id)}
                    disabled={revokeSession.isPending}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No active sessions found.</p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmRevokeOthers(true)}
            disabled={
              revokeOthers.isPending ||
              !sessions.data ||
              sessions.data.filter((item) => !item.current).length === 0
            }
          >
            Sign out other sessions
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2Icon className="text-destructive size-4" />
            Delete account
          </CardTitle>
          <CardDescription>
            Permanently remove your account, forms and responses. An active Pro subscription is
            cancelled first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">This action cannot be undone.</p>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Delete account
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel Pro subscription?"
        description="You'll lose Pro features at the end of the current billing cycle. This cannot be undone from this page."
        confirmLabel="Cancel subscription"
        destructive
        busy={cancelSub.isPending}
        onConfirm={() => void handleCancel()}
      />

      <ConfirmDialog
        open={confirmRevokeOthers}
        onOpenChange={setConfirmRevokeOthers}
        title="Sign out other sessions?"
        description="Every other device will need to sign in again. This device stays signed in."
        confirmLabel="Sign out other sessions"
        busy={revokeOthers.isPending}
        onConfirm={() => void handleRevokeOtherSessions()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletePassword("");
        }}
        title="Delete your account permanently?"
        description="This removes your forms, responses and billing records. It cannot be undone."
        confirmLabel="Delete account"
        destructive
        busy={deleteAccount.isPending}
        onConfirm={() => void handleDeleteAccount()}
      >
        <div className="space-y-2">
          <Label htmlFor="delete-password">Password</Label>
          <Input
            id="delete-password"
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Required for email/password accounts"
          />
          <p className="text-muted-foreground text-xs">
            Leave blank if you only sign in with Google.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function describeSession(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Chrome\//i.test(userAgent)
      ? "Chrome"
      : /Firefox\//i.test(userAgent)
        ? "Firefox"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Browser";

  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /Android/i.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? "iOS"
        : /Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";

  return `${browser} on ${os}`;
}
