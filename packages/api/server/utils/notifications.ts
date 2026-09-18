import { db, eq } from "@repo/db";
import { usersTable, type SelectForm } from "@repo/db/schema";
import type { Field } from "@repo/validators";
import {
  sendConfirmationEmail,
  sendResponseNotification,
} from "@repo/services/email";

const frontendUrl = () => process.env.FRONTEND_URL ?? "http://localhost:3000";

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const file = value as { name?: unknown; url?: unknown };
    return `${String(file.name ?? "file")}${file.url ? ` (${String(file.url)})` : ""}`;
  }
  return String(value);
}

export interface ResponseNotificationContext {
  form: SelectForm;
  fields: Field[];
  answers: Record<string, unknown>;
  responseId: string;
  submittedAt: string;
}

/**
 * Fire-and-forget emails for a newly submitted response:
 * - confirmation to the respondent (when enabled + an email field exists)
 * - notification to the form owner / configured email (when enabled)
 * Failure to send never affects the stored response.
 */
export async function notifyNewResponse({
  form,
  fields,
  answers,
  submittedAt,
}: ResponseNotificationContext) {
  const settings = form.settings ?? {};

  const sendNext = (promise: Promise<void>) => {
    promise.catch((error: unknown) => {
      console.error("Failed to send response email:", error);
    });
  };

  // Notify the creator (or an explicitly configured email) on new responses.
  if (settings.notifyOnResponse !== false) {
    const recipient =
      settings.notificationEmail?.trim() ||
      (await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, form.ownerId))
        .limit(1)
        .execute()
        .then((rows) => rows[0]?.email ?? null)
        .catch(() => null));

    if (recipient) {
      const answersList = fields
        .filter((f) => f.type !== "page_break")
        .map((field) => ({
          label: field.label,
          value: formatAnswerValue(answers[field.id]),
        }));

      sendNext(
        sendResponseNotification({
          to: recipient,
          formTitle: form.title,
          submittedAt,
          answers: answersList,
          responsesUrl: `${frontendUrl()}/responses/${form.id}`,
        }),
      );
    }
  }

  // Send a confirmation to the respondent using their submitted email.
  if (settings.sendConfirmation) {
    const emailField = settings.confirmationEmailFieldId
      ? fields.find(
          (f) => f.id === settings.confirmationEmailFieldId && f.type === "email",
        )
      : fields.find((f) => f.type === "email");

    const respondentEmail = emailField ? answers[emailField.id] : undefined;
    if (typeof respondentEmail === "string" && respondentEmail.trim()) {
      sendNext(
        sendConfirmationEmail({
          to: respondentEmail.trim(),
          formTitle: form.title,
          thankYouMessage: settings.thankYouMessage,
          formUrl: `${frontendUrl()}/f/${form.slug}`,
        }),
      );
    }
  }
}