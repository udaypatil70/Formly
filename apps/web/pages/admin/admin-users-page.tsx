import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  BanIcon,
  BadgeCheckIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const PAGE_SIZE = 15;

const PLANS = ["free", "pro", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

export function AdminUsersPage() {
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingPassword, setPendingPassword] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const usersQuery = trpc.admin.listUsers.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: deferredSearch || undefined,
    },
    { placeholderData: keepPreviousData },
  );

  const setRole = trpc.admin.setUserRole.useMutation();
  const setPlan = trpc.admin.setUserPlan.useMutation();
  const verify = trpc.admin.verifyUser.useMutation();
  const setSuspended = trpc.admin.setUserSuspended.useMutation();
  const resetPassword = trpc.admin.resetUserPassword.useMutation();
  const remove = trpc.admin.deleteUser.useMutation();

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const busy =
    setRole.isPending ||
    setPlan.isPending ||
    verify.isPending ||
    setSuspended.isPending ||
    resetPassword.isPending ||
    remove.isPending;

  /** Runs a mutation then refreshes every list that depends on it. */
  const run = async (
    action: () => Promise<unknown>,
    success: string,
  ) => {
    try {
      await action();
      await Promise.all([
        utils.admin.listUsers.invalidate(),
        utils.admin.getStats.invalidate(),
      ]);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      throw error;
    }
  };

  const changePlan = (id: string, plan: Plan) =>
    run(
      () => setPlan.mutateAsync({ id, plan }),
      `Plan set to ${plan}`,
    ).catch(() => undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every account on the platform.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className="h-9 w-full pl-9"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>Failed to load users</EmptyTitle>
            <EmptyDescription>Please try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : users.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>No users found</EmptyTitle>
            <EmptyDescription>
              {deferredSearch ? "Try a different search term." : "No users yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[30%]">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="text-right">Forms</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Joined</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.name}</p>
                          <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                            {user.email}
                            {user.emailVerified ? null : (
                              <span className="text-amber-500">
                                (unverified)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {user.role === "admin" ? (
                          <Badge className="gap-1 bg-violet-500 text-white hover:bg-violet-500">
                            <ShieldCheckIcon className="size-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">User</Badge>
                        )}
                        {user.roleFromEnv ? (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title="Granted by ADMIN_EMAILS, not by the users table"
                          >
                            env
                          </Badge>
                        ) : null}
                        {user.suspended ? (
                          <Badge className="gap-1 bg-destructive text-white hover:bg-destructive">
                            <BanIcon className="size-3" />
                            Suspended
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Select
                        value={user.plan}
                        onValueChange={(value) =>
                          void changePlan(user.id, value as Plan)
                        }
                        disabled={busy}
                      >
                        <SelectTrigger
                          className="h-8 w-32"
                          aria-label={`Plan for ${user.email}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((plan) => (
                            <SelectItem key={plan} value={plan}>
                              <span className="capitalize">{plan}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.formCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-xs md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 items-center justify-center rounded-md"
                            aria-label={`Actions for ${user.email}`}
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {user.emailVerified ? null : (
                            <DropdownMenuItem
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => verify.mutateAsync({ id: user.id }),
                                  "Email marked as verified",
                                ).catch(() => undefined)
                              }
                            >
                              <BadgeCheckIcon className="size-4" />
                              Verify email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  setRole.mutateAsync({
                                    id: user.id,
                                    role: user.role === "admin" ? "user" : "admin",
                                  }),
                                user.role === "admin"
                                  ? "Admin access revoked"
                                  : "Admin access granted",
                              ).catch(() => undefined)
                            }
                          >
                            <ShieldCheckIcon className="size-4" />
                            {user.role === "admin"
                              ? "Remove admin"
                              : "Make admin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  setSuspended.mutateAsync({
                                    id: user.id,
                                    suspended: !user.suspended,
                                  }),
                                user.suspended
                                  ? "Account restored"
                                  : "Account suspended",
                              ).catch(() => undefined)
                            }
                          >
                            <BanIcon className="size-4" />
                            {user.suspended ? "Restore account" : "Suspend account"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() =>
                              setPendingPassword({
                                id: user.id,
                                name: user.name || user.email,
                              })
                            }
                          >
                            <KeyRoundIcon className="size-4" />
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={busy}
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setPendingDelete({
                                id: user.id,
                                name: user.name || user.email,
                              })
                            }
                          >
                            <Trash2Icon className="size-4" />
                            Delete account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>

          <Pagination className="mt-6">
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? "this account"}?`}
        description="This removes the account along with every form, field and response they own. It cannot be undone."
        confirmLabel="Delete account"
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          const target = pendingDelete;
          if (!target) return;
          void run(
            () => remove.mutateAsync({ id: target.id }),
            "Account deleted",
          )
            .catch(() => undefined)
            .finally(() => setPendingDelete(null));
        }}
      />

      <Dialog
        open={pendingPassword !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPassword(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Sets a new password for {pendingPassword?.name}. Every active
              session for this account is signed out.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="admin-new-password">New password</Label>
            <Input
              id="admin-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="text-muted-foreground text-xs">
              Share it with the user over a channel you trust. Changing it here
              does not notify them.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={resetPassword.isPending}
              onClick={() => {
                setPendingPassword(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={resetPassword.isPending || newPassword.length < 8}
              onClick={() => {
                const target = pendingPassword;
                if (!target) return;
                void run(
                  () =>
                    resetPassword.mutateAsync({
                      id: target.id,
                      password: newPassword,
                    }),
                  "Password reset",
                )
                  .catch(() => undefined)
                  .finally(() => {
                    setPendingPassword(null);
                    setNewPassword("");
                  });
              }}
            >
              {resetPassword.isPending ? <Spinner /> : null}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "FF"
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}