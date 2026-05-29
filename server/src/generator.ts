// ============================================================
// SuggestIt Server  Silver: Async Entity Generator
//
// POST /generator/start    begins producing fake entities
// POST /generator/stop     halts the loop
// GET  /generator/status   current state
//
// On each batch the server broadcasts a WebSocket event so
// connected clients can refresh their views without polling.
// ============================================================

import { Router } from "express";
import { faker } from "@faker-js/faker";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IStore } from "./types.js";

//  Types 

export interface GeneratorConfig {
  intervalMs?: number;   // default 3000
  batchSize?: number;    // entities per tick, default 2
}

export interface GeneratorStatus {
  running: boolean;
  totalGenerated: number;
  intervalMs: number;
  batchSize: number;
}

//  Module state 

let timer: ReturnType<typeof setInterval> | null = null;
let totalGenerated = 0;
let currentConfig: Required<GeneratorConfig> = { intervalMs: 3000, batchSize: 2 };
let wss: WebSocketServer | null = null;

//  WebSocket server 

export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "generator:status", payload: getStatus() }));
  });

  return wss;
}

function broadcast(event: object): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

//  Generator logic 

function getStatus(): GeneratorStatus {
  return {
    running: timer !== null,
    totalGenerated,
    intervalMs: currentConfig.intervalMs,
    batchSize: currentConfig.batchSize,
  };
}

async function generateBatch(store: IStore): Promise<void> {
  const users = await store.getUsers();
  const groups = await store.getGroups();

  if (users.length === 0 || groups.length === 0) return;

  const created: { type: string; entity: object }[] = [];

  for (let i = 0; i < currentConfig.batchSize; i++) {
    const strategy = Math.random();

    if (strategy < 0.2) {
      // ~20%: create a new user
      const user = await store.createUser({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        username: `${faker.internet.username().toLowerCase()}_${faker.string.alphanumeric(6).toLowerCase()}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${faker.string.uuid()}`,
      });
      created.push({ type: "user", entity: user });

    } else if (strategy < 0.35) {
      // ~15%: create a new group
      const owner = users[Math.floor(Math.random() * users.length)];
      try {
        const group = await store.createGroup(
          {
            name: faker.company.catchPhrase().slice(0, 50),
            description: faker.company.buzzPhrase().slice(0, 300),
            ownerId: owner.id,
          },
          []
        );
        created.push({ type: "group", entity: group });
      } catch {
        // owner lookup failure  skip
      }

    } else {
      // ~65%: create a suggestion in a random group
      const group = groups[Math.floor(Math.random() * groups.length)];
      const author = users[Math.floor(Math.random() * users.length)];

      const title = faker.hacker.phrase().slice(0, 100);
      const description = faker.lorem.sentences(2).slice(0, 1000);

      if (title.length < 5 || description.length < 10) continue;

      const suggestion = await store.createSuggestion({
        groupId: group.id,
        authorId: author.id,
        title,
        description,
      });
      created.push({ type: "suggestion", entity: suggestion });
    }
  }

  if (created.length === 0) return;

  totalGenerated += created.length;

  broadcast({
    type: "generator:batch",
    payload: {
      items: created,
      totalGenerated,
      timestamp: new Date().toISOString(),
    },
  });
}

//  Express router 

export function createGeneratorRouter(store: IStore): Router {
  const router = Router();

  router.post("/start", async (req, res) => {
    try {
      if (timer !== null) {
        res.status(409).json({ error: "Generator already running", status: getStatus() });
        return;
      }

      const { intervalMs = 3000, batchSize = 2 } = req.body ?? {};

      if (typeof intervalMs !== "number" || intervalMs < 500) {
        res.status(400).json({ error: "intervalMs must be a number >= 500" });
        return;
      }
      if (typeof batchSize !== "number" || batchSize < 1 || batchSize > 20) {
        res.status(400).json({ error: "batchSize must be between 1 and 20" });
        return;
      }

      currentConfig = { intervalMs, batchSize };

      // setInterval fires the async batch; errors are swallowed to keep the loop alive
      timer = setInterval(() => { 
        generateBatch(store).catch((err) => {
          console.error("[Generator batch error]", err);
        }); 
      }, intervalMs);
      
      generateBatch(store).catch((err) => {
        console.error("[Generator initial batch error]", err);
      });

      broadcast({ type: "generator:started", payload: getStatus() });
      res.json({ message: "Generator started", status: getStatus() });
    } catch (error) {
      console.error("[Generator /start exception]", error);
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/stop", (_req, res) => {
    try {
      if (timer === null) {
        res.status(409).json({ error: "Generator is not running", status: getStatus() });
        return;
      }

      clearInterval(timer);
      timer = null;

      broadcast({ type: "generator:stopped", payload: getStatus() });
      res.json({ message: "Generator stopped", status: getStatus() });
    } catch (error) {
      console.error("[Generator /stop exception]", error);
      res.status(500).json({ error: String(error) });
    }
  });

  router.get("/status", (_req, res) => {
    try {
      res.json(getStatus());
    } catch (error) {
      console.error("[Generator /status exception]", error);
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
