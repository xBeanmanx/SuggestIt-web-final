import net from "net";
import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
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

  if (!host) {
    console.log(`[Email fallback] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
    return "console";
  }

  if (user || pass || secure) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      family: 4,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return "smtp";
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
