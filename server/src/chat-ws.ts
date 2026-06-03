// ============================================================
// SuggestIt Server - Chat WebSocket Handler
// Handles real-time chat events via WebSocket connections
// ============================================================

import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { IStore } from "./types.js";
import { verifyAccessToken } from "./auth.js";

export interface ChatWSMessage {
  type: "chat:message" | "chat:typing" | "chat:user-joined" | "chat:user-left" | "chat:sync";
  payload: Record<string, unknown>;
}

interface ClientConnection {
  ws: WebSocket;
  userId?: string;
  conversationIds: Set<string>;
}

let chatWss: WebSocketServer | null = null;
const clients = new Map<string, ClientConnection>();
const MAX_WS_MESSAGE_BYTES = 32 * 1024;

function extractAccessToken(reqUrl?: string): string | undefined {
  if (!reqUrl) return undefined;
  try {
    const url = new URL(reqUrl, "ws://localhost");
    return url.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

function rawDataSize(data: WebSocket.RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  return data.byteLength;
}

export function attachChatWebSocketServer(httpServer: Server, store: IStore): WebSocketServer {
  // Create WebSocket server without specifying path - we'll handle it in the upgrade event
  chatWss = new WebSocketServer({ noServer: true });

  // Debug: Log errors from WebSocket server
  chatWss.on("error", (error) => {
    console.error("[ChatWSS Error]", error.message);
  });

  // Handle upgrade requests for /ws/chat
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url ? new URL(req.url, "ws://localhost").pathname : "";
    if (pathname !== "/ws/chat") {
      return; // Let other handlers deal with it
    }
    
    console.log(`[Chat WebSocket] Handling upgrade for ${req.url}`);
    
    try {
      const token = extractAccessToken(req.url);
      const payload = token ? verifyAccessToken(token) : undefined;
      if (!payload?.userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      chatWss!.handleUpgrade(req, socket, head, (ws) => {
        (ws as WebSocket & { userId?: string }).userId = payload.userId;
        chatWss!.emit("connection", ws, req);
      });
    } catch (err) {
      console.error("[Chat WebSocket Upgrade Error]", err instanceof Error ? err.message : err);
      socket.destroy();
    }
  });

  chatWss.on("connection", (ws: WebSocket & { userId?: string }) => {
    const clientId = Math.random().toString(36).substring(7);
    const connection: ClientConnection = {
      ws,
      userId: ws.userId,
      conversationIds: new Set(),
    };
    clients.set(clientId, connection);

    // Send initial connection confirmation
    ws.send(
      JSON.stringify({
        type: "chat:connected",
        payload: { clientId },
      })
    );

    ws.on("message", (data) => {
      try {
        if (rawDataSize(data) > MAX_WS_MESSAGE_BYTES) {
          ws.close(1009, "Message too large");
          return;
        }
        const message = JSON.parse(data.toString()) as ChatWSMessage;
        handleChatMessage(store, clientId, message).catch((error) => {
          console.error("Failed to handle WebSocket message:", error);
        });
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      broadcastToClient(clientId, {
        type: "chat:user-left",
        payload: { clientId },
      });
      clients.delete(clientId);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  return chatWss;
}

async function canAccessConversation(store: IStore, conversationId: string, userId?: string): Promise<boolean> {
  if (!userId || typeof conversationId !== "string") return false;
  const conversation = await store.getConversationById(conversationId);
  return Boolean(conversation?.members.some((member) => member.id === userId));
}

function sendError(connection: ClientConnection, message: string): void {
  if (connection.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(JSON.stringify({ type: "chat:error", payload: { message } }));
  }
}

async function handleChatMessage(store: IStore, clientId: string, message: ChatWSMessage): Promise<void> {
  const connection = clients.get(clientId);
  if (!connection) return;

  switch (message.type) {
    case "chat:message": {
      const { conversationId, id, messageId, userId, content, createdAt, user } = message.payload as {
        conversationId: string;
        id?: string;
        messageId: string;
        userId: string;
        content: string;
        createdAt: string;
        user?: unknown;
      };
      if (!(await canAccessConversation(store, conversationId, connection.userId))) {
        sendError(connection, "Not authorized for this conversation");
        return;
      }
      connection.conversationIds.add(conversationId);
      broadcastToConversation(conversationId, {
        type: "chat:message",
        payload: { id: id ?? messageId, conversationId, userId: connection.userId, content, createdAt, user },
      });
      break;
    }

    case "chat:typing": {
      const { conversationId, userId } = message.payload as {
        conversationId: string;
        userId: string;
      };
      if (!(await canAccessConversation(store, conversationId, connection.userId))) {
        sendError(connection, "Not authorized for this conversation");
        return;
      }
      connection.conversationIds.add(conversationId);
      broadcastToConversation(conversationId, {
        type: "chat:typing",
        payload: { conversationId, userId: connection.userId },
      });
      break;
    }

    case "chat:user-joined": {
      const { conversationId, userId } = message.payload as {
        conversationId: string;
        userId: string;
      };
      if (!(await canAccessConversation(store, conversationId, connection.userId))) {
        sendError(connection, "Not authorized for this conversation");
        return;
      }
      connection.conversationIds.add(conversationId);
      broadcastToConversation(conversationId, {
        type: "chat:user-joined",
        payload: { conversationId, userId: connection.userId },
      });
      break;
    }

    case "chat:sync": {
      const { conversationId } = message.payload as {
        conversationId: string;
      };
      if (!(await canAccessConversation(store, conversationId, connection.userId))) {
        sendError(connection, "Not authorized for this conversation");
        return;
      }
      connection.ws.send(
        JSON.stringify({
          type: "chat:sync-ack",
          payload: { conversationId },
        })
      );
      break;
    }
  }
}

function broadcastToConversation(conversationId: string, message: ChatWSMessage): void {
  if (!chatWss) return;

  const msg = JSON.stringify(message);
  for (const [_clientId, connection] of clients.entries()) {
    if (connection.conversationIds.has(conversationId) && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(msg);
    }
  }
}

function broadcastToClient(clientId: string, message: ChatWSMessage): void {
  const connection = clients.get(clientId);
  if (connection && connection.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(JSON.stringify(message));
  }
}

export function broadcastChatMessage(conversationId: string, payload: Record<string, unknown>): void {
  broadcastToConversation(conversationId, {
    type: "chat:message",
    payload,
  });
}

export function getConnectedClients(): number {
  return clients.size;
}
