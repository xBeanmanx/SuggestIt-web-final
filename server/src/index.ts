// ============================================================
// SuggestIt Server  Entry Point
// Apollo Server 4 + Express middleware
// Silver: /generator endpoints + WebSocket push
// ============================================================

import { loadEnv } from "./load-env.js";

// Load environment variables from .env file first
loadEnv();

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import express from "express";
import type { Request } from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { createStore } from "./store-factory";
import type { IStore } from "./types";
import { createGeneratorRouter, attachWebSocketServer } from "./generator";
import { attachChatWebSocketServer } from "./chat-ws";
import { startActivityMonitor } from "./ai-monitor";
import { seedStore } from "./seed";
import {
  clearRefreshCookie,
  parseCookies,
  REFRESH_COOKIE_NAME,
  refreshCookie,
  verifyAccessToken,
} from "./auth";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isPrivateIpv4(hostname: string): boolean {
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true;

  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        isPrivateIpv4(url.hostname)
      )
    );
  } catch {
    return false;
  }
}

function getLanUrls(): string[] {
  const scheme = process.env.DISABLE_HTTPS === "true" ? "http" : "https";
  return Object.values(os.networkInterfaces())
    .flatMap((iface) => iface ?? [])
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => `${scheme}://${iface.address}:${PORT}`);
}

function createSecureServer(app: express.Express): http.Server | https.Server {
  if (process.env.DISABLE_HTTPS === "true") return http.createServer(app);

  const pfxPath = process.env.TLS_PFX_PATH ?? path.resolve(__dirname, "../certs/localhost.pfx");
  if (fs.existsSync(pfxPath)) {
    return https.createServer(
      {
        pfx: fs.readFileSync(pfxPath),
        passphrase: process.env.TLS_PFX_PASSPHRASE ?? "suggestit",
      },
      app
    );
  }

  const keyPath = process.env.TLS_KEY_PATH ?? path.resolve(__dirname, "../certs/localhost-key.pem");
  const certPath = process.env.TLS_CERT_PATH ?? path.resolve(__dirname, "../certs/localhost-cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return https.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      app
    );
  }

  throw new Error("HTTPS is required. Provide TLS_PFX_PATH or TLS_KEY_PATH/TLS_CERT_PATH, or set DISABLE_HTTPS=true for local debugging only.");
}

function createRateLimiter(maxRequests: number, windowMs: number): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxRequests) {
      res.status(429).json({ errors: [{ message: "Too many requests" }] });
      return;
    }
    next();
  };
}

async function bootstrap() {
  const store = await createStore();

  // Seed demo users on first startup if admin user with correct email doesn't exist
  const adminUser = await store.getUserByEmail("simonlacika1234@gmail.com");
  if (!adminUser) {
    console.log("Admin user with correct email not found. Seeding demo data...");
    await seedStore(store);
    console.log("Demo data seeded successfully!");
  }

  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use("/graphql", createRateLimiter(100, 60_000));
  app.use("/auth", createRateLimiter(10, 60_000));

  //  Health check 
  app.get("/health", async (_req, res) => {
    res.json({ status: "ok", counts: await store.counts() });
  });

  //  Silver: entity generator endpoints 
  app.use("/generator", createGeneratorRouter(store));

  //  Apollo / GraphQL 
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  // Simple GraphQL endpoint handler
  app.post("/graphql", async (req: Request, res) => {
    const { query, variables } = req.body;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
    let authContext: { userId?: string; role?: "ADMIN" | "USER"; permissions?: string[] } = {};

    if (bearerToken) {
      try {
        const payload = verifyAccessToken(bearerToken);
        authContext = {
          userId: payload.userId,
          role: payload.role,
          permissions: payload.permissions,
        };
      } catch {
        authContext = {};
      }
    }

    const cookies = parseCookies(req.headers.cookie);
    const result = await server.executeOperation(
      { query, variables },
      {
        contextValue: {
          ...authContext,
          refreshToken: cookies[REFRESH_COOKIE_NAME],
          store,
          setRefreshTokenCookie(token: string, expiresAt: Date) {
            res.setHeader("Set-Cookie", refreshCookie(token, expiresAt));
          },
          clearRefreshTokenCookie() {
            res.setHeader("Set-Cookie", clearRefreshCookie());
          },
        },
      }
    );

    if (result.body.kind === "single") {
      res.json(result.body.singleResult);
      return;
    }

    res.status(500).json({ errors: [{ message: "Incremental GraphQL responses are not supported." }] });
  });

  const clientDistPath = path.resolve(__dirname, "../../dist");
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (req, res, next) => {
      if (
        req.path.startsWith("/graphql") ||
        req.path.startsWith("/generator") ||
        req.path.startsWith("/health")
      ) {
        next();
        return;
      }

      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  const httpServer = createSecureServer(app);
  const scheme = process.env.DISABLE_HTTPS === "true" ? "http" : "https";
  const wsScheme = scheme === "https" ? "wss" : "ws";

  //  Silver: WebSocket server on ws://host/ws 
  attachWebSocketServer(httpServer);

  //  Chat: Real-time WebSocket on ws://host/ws/chat 
  const chatWss = attachChatWebSocketServer(httpServer, store);
  console.log("Chat WebSocket Server attached to path /ws/chat");
  startActivityMonitor(store);
  
  // Debug: Log all upgrade requests
  httpServer.on("upgrade", (req, socket, head) => {
    console.log(`[WebSocket Upgrade] ${req.url}`, req.headers.upgrade);
  });

  // Debug: Catch errors on socket
  httpServer.on("clientError", (err, socket) => {
    console.error(`[ClientError] ${err.message}`, { code: (err as NodeJS.ErrnoException).code });
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`SuggestIt server ready at ${scheme}://localhost:${PORT}/graphql`);
    for (const url of getLanUrls()) {
      console.log(`LAN GraphQL:              ${url}/graphql`);
      console.log(`LAN WebSocket:            ${url.replace(`${scheme}://`, `${wsScheme}://`)}/ws`);
      console.log(`LAN Chat WebSocket:       ${url.replace(`${scheme}://`, `${wsScheme}://`)}/ws/chat`);
    }
    console.log(`Health check:            ${scheme}://localhost:${PORT}/health`);
    console.log(`Generator start:     POST ${scheme}://localhost:${PORT}/generator/start`);
    console.log(`Generator stop:      POST ${scheme}://localhost:${PORT}/generator/stop`);
    console.log(`Generator status:     GET ${scheme}://localhost:${PORT}/generator/status`);
    console.log(`WebSocket:               ${wsScheme}://localhost:${PORT}/ws`);
    console.log(`Chat WebSocket:          ${wsScheme}://localhost:${PORT}/ws/chat`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
