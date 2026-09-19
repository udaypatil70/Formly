import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@repo/logger";
import { env } from "./env";

interface BaseEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

/** Emails are disabled until an SMTP host is configured. */
export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

function fromAddress(): string {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  if (env.SMTP_USER?.includes("@")) return env.SMTP_USER;
  return "Formly <noreply@formly.app>";
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" }
        : undefined,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, text, html }: BaseEmail) {
  if (!isEmailConfigured()) {
    logger.warn(`Email not sent (SMTP not configured): "${subject}" -> ${to}`);
    return;
  }

  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
    });
    logger.debug(`Email sent: "${subject}" -> ${to}`);
  } catch (error) {
    logger.error(`Failed to send email "${subject}" -> ${to}`, { error });
  }
}

// ─── Templates ─────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:28px 32px;border-bottom:1px solid #e4e4e7;">
                <h1 style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#3f3f46;font-size:15px;line-height:1.6;">${body}</td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;">
                Sent by Formly
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface ResponseAnswerItem {
  label: string;
  value: string;
}

/** Confirmation email sent to the respondent after a successful submission. */
export async function sendConfirmationEmail({
  to,
  formTitle,
  thankYouMessage,
  formUrl,
}: {
  to: string;
  formTitle: string;
  thankYouMessage?: string | null;
  formUrl?: string;
}) {
  const friendlyThankYou =
    thankYouMessage?.trim() || "Thanks for submitting your response.";

  const body = `
    <p style="margin:0 0 16px;">Your response to <strong>${formTitle}</strong> was received successfully.</p>
    <p style="margin:0 0 16px;">${friendlyThankYou}</p>
    ${
      formUrl
        ? `<a href="${formUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background-color:#6d28d9;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;">View form</a>`
        : ""
    }
  `;

  await sendEmail({
    to,
    subject: `We received your response to "${formTitle}"`,
    text: `Your response to "${formTitle}" was received successfully. ${friendlyThankYou}`,
    html: layout(`Response received`, body),
  });
}

/** Notification sent to the form creator when a new response arrives. */
export async function sendResponseNotification({
  to,
  formTitle,
  submittedAt,
  answers,
  responsesUrl,
}: {
  to: string;
  formTitle: string;
  submittedAt: string;
  answers: ResponseAnswerItem[];
  responsesUrl: string;
}) {
  const rows = answers
    .map(
      (answer) => `<tr>
        <td style="padding:8px 0;color:#a1a1aa;font-size:13px;width:35%;vertical-align:top;">${answer.label}</td>
        <td style="padding:8px 0;color:#18181b;font-size:14px;vertical-align:top;">${answer.value}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;">Your form <strong>${formTitle}</strong> just received a new response.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;">
      ${rows || `<tr><td style="padding:8px 0;color:#a1a1aa;font-size:14px;">The response contained no answers.</td></tr>`}
    </table>
    <a href="${responsesUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background-color:#6d28d9;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;">View responses</a>
  `;

  await sendEmail({
    to,
    subject: `New response on "${formTitle}"`,
    text: [
      `Your form "${formTitle}" just received a new response.`,
      "",
      ...answers.map((a) => `${a.label}: ${a.value}`),
      "",
      submittedAt ? `Submitted at: ${submittedAt}` : "",
      `View responses: ${responsesUrl}`,
    ].join("\n"),
    html: layout(`New response`, body),
  });
}