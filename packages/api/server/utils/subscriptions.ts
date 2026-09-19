import { db, eq, or } from "@repo/db";
import { usersTable } from "@repo/db/schema";

export type UserPlan = "free" | "pro" | "enterprise";

/** Subscription statuses that mean the user has an active Pro subscription. */
const PAID_STATUSES = new Set(["active", "authenticated"]);

/** Subscription statuses that terminate the plan. */
const ENDED_STATUSES = new Set(["cancelled", "completed", "halted", "paused"]);

function statusToPlan(status?: string | null): UserPlan | null {
  if (!status) return null;
  if (PAID_STATUSES.has(status)) return "pro";
  if (ENDED_STATUSES.has(status)) return "free";
  return null;
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

  const byUserId = entity.notes?.userId
    ? eq(usersTable.id, entity.notes.userId)
    : undefined;
  const bySubscription = eq(usersTable.subscriptionId, entity.id);
  const where = byUserId ? or(byUserId, bySubscription) : bySubscription;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(where)
    .limit(1)
    .execute();

  if (!user) return { handled: false };

  const nextPlan = statusToPlan(entity.status);
  const change: {
    subscriptionStatus?: string;
    plan?: UserPlan;
    planUpdatedAt?: Date;
  } = {};

  if (entity.status) change.subscriptionStatus = entity.status;
  if (nextPlan) {
    change.plan = nextPlan;
    change.planUpdatedAt = new Date();
  }

  if (Object.keys(change).length === 0) return { handled: false };

  await db
    .update(usersTable)
    .set(change)
    .where(eq(usersTable.id, user.id))
    .execute();

  return { handled: true };
}

/** Whether a stored Razorpay subscription status means "currently paid". */
export function isPaidStatus(status?: string | null): boolean {
  return Boolean(status && PAID_STATUSES.has(status));
}