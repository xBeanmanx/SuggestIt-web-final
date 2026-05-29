import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const host = process.env.SMTP_HOST ?? "127.0.0.1";
const port = Number(process.env.SMTP_PORT ?? 1025);
const inboxDir = path.resolve("tools", "smtp-inbox");

fs.mkdirSync(inboxDir, { recursive: true });

const server = net.createServer((socket) => {
  let buffer = "";
  let dataMode = false;
  let message = "";

  const write = (line) => socket.write(`${line}\r\n`);

  write("220 simple-smtp-inbox ready");

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (dataMode) {
        if (line === ".") {
          dataMode = false;
          const file = path.join(inboxDir, `${Date.now()}.eml`);
          fs.writeFileSync(file, message, "utf8");
          console.log(`\n[SMTP inbox] saved ${file}\n${message}\n`);
          message = "";
          write("250 OK");
        } else {
          message += `${line}\n`;
        }
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith("HELO") || upper.startsWith("EHLO")) write("250 hello");
      else if (upper.startsWith("MAIL FROM")) write("250 OK");
      else if (upper.startsWith("RCPT TO")) write("250 OK");
      else if (upper === "DATA") {
        dataMode = true;
        write("354 End data with <CR><LF>.<CR><LF>");
      } else if (upper === "QUIT") {
        write("221 bye");
        socket.end();
      } else {
        write("250 OK");
      }
    }
  });
});

server.listen(port, host, () => {
  console.log(`Simple SMTP inbox listening on ${host}:${port}`);
  console.log(`Messages will be saved in ${inboxDir}`);
});
