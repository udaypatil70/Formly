import { and, db, eq, isNull } from "@repo/db";
import { usersTable } from "@repo/db/schema";

import { fetchRazorpaySubscription, razorpayConfigured } from "./razorpay";

export type UserPlan = "free" | "pro" | "enterprise";

/** Subscription statuses that mean the user has an active Pro subscription. */
const PAID_STATUSES = new Set(["active", "authenticated"]);

/** Subscription statuses that terminate the plan. */
const ENDED_STATUSES = new Set(["cancelled", "completed", "halted", "paused"]);

/**
 * How long a persisted subscription status is trusted without checking
 * Razorpay. Webhooks normally keep this fresh; the window only bounds how
 * often a page view may fall back to the provider when a webhook was missed.
 */
const STALE_AFTER_MS = Number(
  process.env.SUBSCRIPTION_SYNC_STALE_MS ?? 5 * 60_000,
);

/** Maps a Razorpay subscription status to the plan it grants. */
export function planForSubscriptionStatus(
  status?: string | null,
): UserPlan | null {
  if (!status) return null;
  if (PAID_STATUSES.has(status)) return "pro";
  if (ENDED_STATUSES.has(status)) return "free";
  return null;
}

/** True when the status means the subscription has ended for good. */
export function isEndedStatus(status?: string | null): boolean {
  return Boolean(status && ENDED_STATUSES.has(status));
}

/**
 * Applies a verified Razorpay subscription webhook event to the matching
 * user. The user is located either through the `userId` note we attach when
 * creating the subscription or by their stored `subscriptionId`.
 */
export async function applyRazorpaySubscriptionEvent(payload: {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        status?: string;
        notes?: Record<string, string> | null;
      };
    };
  };
}): Promise<{ handled: boolean }> {
  const event = payload.event ?? "";
  if (!event.startsWith("subscription.")) return { handled: false };

  const entity = payload.payload?.subscription?.entity;
  if (!entity?.id) return { handled: false };

  // Match the stored subscription id first: it is authoritative and avoids a
  // stale `notes.userId` on an old subscription hijacking another account.
  let [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.subscriptionId, entity.id))
    .limit(1)
    .execute();

  if (!user && entity.notes?.userId) {
    // Fallback for the brief window before Checkout stores the new id. Never
    // adopt a subscription for a user who already has a different one.
    [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, entity.notes.userId),
          isNull(usersTable.subscriptionId),
        ),
      )
      .limit(1)
      .execute();
  }

  if (!user) return { handled: false };

  const nextPlan = planForSubscriptionStatus(entity.status);
  const change: {
    subscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionSyncedAt?: Date;
    plan?: UserPlan;
    planUpdatedAt?: Date;
  } = {
    subscriptionId: entity.id,
    subscriptionSyncedAt: new Date(),
  };

  if (entity.status) change.subscriptionStatus = entity.status;
  if (nextPlan) {
    change.plan = nextPlan;
    change.planUpdatedAt = new Date();
  }

  await db
    .update(usersTable)
    .set(change)
    .where(eq(usersTable.id, user.id))
    .execute();

  return { handled: true };
}

export type ReconcileSubscriptionOptions = {
  /** Bypass the staleness window (manual "Sync now" / checkout completion). */
  force?: boolean;
};

/**
 * Reconciles a user's stored plan with Razorpay when the local state is stale.
 *
 * This is the safety net for a missed webhook: without it a subscription could
 * stay on the wrong plan forever. Provider failures are swallowed because a
 * transient Razorpay outage must not make the profile page unusable; the next
 * call simply tries again.
 */
export async function reconcileUserSubscription(
  userId: string,
  options: ReconcileSubscriptionOptions = {},
): Promise<void> {
  const [row] = await db
    .select({
      plan: usersTable.plan,
      subscriptionId: usersTable.subscriptionId,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionSyncedAt: usersTable.subscriptionSyncedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .execute();

  if (!row?.subscriptionId) return;
  if (!razorpayConfigured()) return;

  const lastSyncedAt = row.subscriptionSyncedAt?.getTime() ?? 0;
  const stale = Date.now() - lastSyncedAt > STALE_AFTER_MS;
  if (!options.force && !stale) return;

  let subscription;
  try {
    subscription = await fetchRazorpaySubscription(row.subscriptionId);
  } catch {
    // Leave the existing state and timestamp alone so a later call retries.
    return;
  }

  const nextPlan = planForSubscriptionStatus(subscription.status);
  const change: {
    subscriptionStatus?: string;
    subscriptionSyncedAt: Date;
    plan?: UserPlan;
    planUpdatedAt?: Date;
  } = { subscriptionSyncedAt: new Date() };

  if (subscription.status) change.subscriptionStatus = subscription.status;
  if (nextPlan && nextPlan !== row.plan) {
    change.plan = nextPlan;
    change.planUpdatedAt = new Date();
  }

  await db
    .update(usersTable)
    .set(change)
    .where(eq(usersTable.id, userId))
    .execute();
}

/** Whether a stored Razorpay subscription status means "currently paid". */
export function isPaidStatus(status?: string | null): boolean {
  return Boolean(status && PAID_STATUSES.has(status));
}