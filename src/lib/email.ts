import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "Reymen Solutions <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends a transactional email via Resend when RESEND_API_KEY is configured.
 * Without it (local dev, or this platform's demo/sandbox use), logs the
 * email to the console instead of failing — so flows like password reset
 * keep working end-to-end without a real provider wired up.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean }> {
  const resend = getClient();

  if (!resend) {
    console.log(
      `\n[email:dev-fallback] RESEND_API_KEY not set — would have sent:\n` +
        `  to: ${input.to}\n  subject: ${input.subject}\n  ---\n${input.text ?? stripHtml(input.html)}\n  ---\n`
    );
    return { sent: false };
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    console.error("[email] Resend send failed:", error);
    return { sent: false };
  }

  return { sent: true };
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
