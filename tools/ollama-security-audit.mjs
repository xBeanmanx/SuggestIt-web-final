import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const model = process.env.OLLAMA_MODEL ?? "suggestit-pentest";
const endpoint = process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434/api/generate";
const maxChars = Number(process.env.AUDIT_MAX_CHARS ?? 18000);

const defaultTargets = [
  "server/src/auth.ts",
  "server/src/index.ts",
  "server/src/schema.ts",
  "server/src/resolvers/queries.ts",
  "server/src/resolvers/mutations.ts",
  "server/src/validation.ts",
  "server/src/mssql-store.ts",
  "server/src/store-factory.ts",
  "server/src/chat-ws.ts",
  "server/src/email.ts",
  "src/api/graphql.ts",
  "src/app/context/auth-context.tsx",
  "src/app/components/login-page.tsx",
  "src/utils/validation.ts",
];

const focus = `
Review this file for defensive security flaws in the user's own SuggestIt app.

Look for:
- SQL injection or unsafe query construction.
- GraphQL authorization bypasses, missing requester checks, IDOR, role confusion.
- JWT, refresh token, cookie, inactivity/session, password-reset, or bcrypt mistakes.
- Validator/schema gaps, client-only validation, unsafe trust boundaries.
- XSS, unsafe rendering, unsafe local storage/cookie usage, CSRF.
- CORS, HTTPS/LAN exposure, rate limiting, request body limits, error leakage.
- WebSocket authentication/authorization and protocol handling mistakes.
- Network packet/protocol mishandling, TLS assumptions, downgrade risks, origin confusion.
- Denial-of-service risks from unbounded loops, pagination, expensive stats, large payloads, or generator/chat endpoints.
- Secrets, logging, privacy, dependency, and insecure default risks.

Return markdown with:
1. Findings, ordered by severity.
2. For each finding: severity, affected code, impact, safe local reproduction, and fix.
3. "No confirmed finding" if nothing concrete is visible.
`;

function chunkText(text, size) {
  if (text.length <= size) return [text];
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function generate(prompt) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      prompt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${body}`);
  }

  if (!response.body) return "";

  const decoder = new TextDecoder();
  let pending = "";
  let output = "";

  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      output += event.response ?? "";
      if (event.done) return output.trim();
    }
  }

  if (pending.trim()) {
    const event = JSON.parse(pending);
    output += event.response ?? "";
  }

  return output.trim();
}

async function auditFile(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const chunks = chunkText(source, maxChars);
  const reports = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkLabel = chunks.length > 1 ? ` chunk ${index + 1}/${chunks.length}` : "";
    const prompt = `${focus}

File: ${relativePath}${chunkLabel}

\`\`\`
${chunks[index]}
\`\`\`
`;
    console.log(`Auditing ${relativePath}${chunkLabel}...`);
    reports.push(await generate(prompt));
  }

  return `## ${relativePath}\n\n${reports.join("\n\n")}`;
}

async function main() {
  const requestedTargets = process.argv.slice(2);
  const targets = requestedTargets.length > 0 ? requestedTargets : defaultTargets;
  const existingTargets = [];

  for (const target of targets) {
    const absolutePath = path.resolve(root, target);
    if (await fileExists(absolutePath)) {
      existingTargets.push(target);
    } else {
      console.warn(`Skipping missing file: ${target}`);
    }
  }

  if (existingTargets.length === 0) {
    throw new Error("No audit targets found.");
  }

  const startedAt = new Date();
  const sections = [];

  for (const target of existingTargets) {
    sections.push(await auditFile(target));
  }

  const summaryPrompt = `${focus}

Create an executive summary and prioritized remediation plan from this security audit output.
Do not invent findings that are not supported by the report.

\`\`\`markdown
${sections.join("\n\n")}
\`\`\`
`;

  console.log("Creating summary...");
  const summary = await generate(summaryPrompt);

  const report = `# SuggestIt Ollama Security Audit

- Model: ${model}
- Started: ${startedAt.toISOString()}
- Finished: ${new Date().toISOString()}
- Files reviewed: ${existingTargets.length}

## Executive Summary

${summary}

${sections.join("\n\n")}
`;

  const reportsDir = path.resolve(root, "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `ollama-security-audit-${stamp}.md`);
  await fs.writeFile(reportPath, report, "utf8");

  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
