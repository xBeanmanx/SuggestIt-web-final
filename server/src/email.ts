import dns from "dns/promises";
import net from "net";
import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

function logEmailFallback(message: EmailMessage, reason?: unknown): "console" {
  if (reason) {
    console.warn("[Email fallback] SMTP delivery failed:", reason instanceof Error ? reason.message : reason);
  }
  console.log(`[Email fallback] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
  return "console";
}

function readLine(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (data: Buffer) => {
      cleanup();
      resolve(data.toString("utf8"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.once("data", onData);
    socket.once("error", onError);
  });
}

async function command(socket: net.Socket, line: string): Promise<string> {
  socket.write(`${line}\r\n`);
  return readLine(socket);
}

export async function sendEmail(message: EmailMessage): Promise<"smtp" | "console"> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const from = process.env.SMTP_FROM ?? "no-reply@suggestit.local";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS ?? 10000);

  if (!host) {
    return logEmailFallback(message);
  }

  if (user || pass || secure) {
    try {
      const smtpHost = host;
      const smtpAddress = (await dns.lookup(smtpHost, { family: 4 })).address;
      const transporter = nodemailer.createTransport({
        host: smtpAddress,
        port,
        secure,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
        tls: { servername: smtpHost },
        auth: user && pass ? { user, pass } : undefined,
      });

      await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return "smtp";
    } catch (error) {
      if (process.env.SMTP_ALLOW_CONSOLE_FALLBACK === "false") throw error;
      return logEmailFallback(message, error);
    }
  }

  const socket = net.createConnection({ host, port });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  await readLine(socket);
  await command(socket, "HELO suggestit.local");
  await command(socket, `MAIL FROM:<${from}>`);
  await command(socket, `RCPT TO:<${message.to}>`);
  await command(socket, "DATA");
  socket.write([
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "",
    message.text,
    ".",
    "",
  ].join("\r\n"));
  await readLine(socket);
  await command(socket, "QUIT");
  socket.end();
  return "smtp";
}
