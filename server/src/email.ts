export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailDelivery = "api" | "console";

function logEmailFallback(message: EmailMessage, reason?: unknown): "console" {
  if (reason) {
    console.warn("[Email fallback] API delivery failed:", reason instanceof Error ? reason.message : reason);
  }
  console.log(`[Email fallback] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
  return "console";
}

async function sendWithResend(message: EmailMessage, from: string): Promise<"api"> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API failed with ${response.status}: ${body}`);
  }

  return "api";
}

export async function sendEmail(message: EmailMessage): Promise<EmailDelivery> {
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  if (!process.env.RESEND_API_KEY) {
    return logEmailFallback(message);
  }

  try {
    return await sendWithResend(message, from);
  } catch (error) {
    if (process.env.EMAIL_ALLOW_CONSOLE_FALLBACK === "false") throw error;
    return logEmailFallback(message, error);
  }
}
