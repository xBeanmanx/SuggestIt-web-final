import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { MessageCircle, RefreshCw, Send, Users, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useAppState } from "../../context/AppStateContext";
import {
  ensureGroupChat,
  fetchConversationMessages,
  getAccessToken,
  sendChatMessage,
  WS_ENDPOINT,
  type ChatConversation,
  type ChatMessage,
} from "../../api/graphql";
import type { Group } from "../../types";

interface GroupDetailDialogProps {
  group: Group;
  open: boolean;
  onClose: () => void;
}

export function GroupDetailDialog({ group, open, onClose }: GroupDetailDialogProps) {
  const { state } = useAppState();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }, []);

  const loadGroupChat = useCallback(async () => {
    if (!open) return;
    setIsLoading(true);
    setError(null);
    try {
      const nextConversation = await ensureGroupChat(group.id);
      setConversation(nextConversation);
      const nextMessages = await fetchConversationMessages(nextConversation.id);
      setMessages(nextMessages);
      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open group chat.");
      setConversation(null);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [group.id, open, scrollToBottom]);

  useEffect(() => {
    if (open) {
      loadGroupChat();
    } else {
      setConversation(null);
      setMessages([]);
      setMessageInput("");
      setError(null);
    }
  }, [loadGroupChat, open]);

  useEffect(() => {
    if (!open || !conversation) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let shouldReconnect = true;

    const connect = () => {
      const token = getAccessToken();
      const wsUrl = `${WS_ENDPOINT}/chat${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "chat:user-joined",
          payload: { conversationId: conversation.id, userId: state.currentUser.id },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { type: string; payload?: ChatMessage };
          if (data.type !== "chat:message" || !data.payload?.id) return;
          setMessages((prev) => {
            if (prev.some((message) => message.id === data.payload!.id)) return prev;
            return [...prev, data.payload!];
          });
          scrollToBottom();
        } catch {
          // Ignore malformed socket events.
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        if (shouldReconnect) {
          reconnectTimer = setTimeout(() => {
            loadGroupChat();
            connect();
          }, 3000);
        }
      };
    };

    connect();
    return () => {
      shouldReconnect = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [conversation, loadGroupChat, open, scrollToBottom, state.currentUser.id]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = messageInput.trim();
    if (!content || !conversation) return;

    setIsSending(true);
    setError(null);
    try {
      const message = await sendChatMessage({
        conversationId: conversation.id,
        userId: state.currentUser.id,
        content,
      });
      setMessages((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, message]);
      setMessageInput("");
      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setIsSending(false);
    }
  };

  const initials = group.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl h-[80vh] p-0 border flex flex-col"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <DialogHeader className="p-5 pb-4 border-b" style={{ borderColor: "var(--app-border-primary)" }}>
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)", border: "1px solid var(--app-border-primary)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl flex items-center gap-2" style={{ color: "var(--app-text-primary)" }}>
                <MessageCircle className="w-5 h-5" style={{ color: "var(--app-purple-400)" }} />
                {group.name}
              </DialogTitle>
              <DialogDescription className="mt-1" style={{ color: "var(--app-text-muted)" }}>
                {group.description}
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
                <Users className="w-3 h-3" />
                {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border px-3 py-2 text-sm flex items-center gap-2" style={{ borderColor: "#991b1b", backgroundColor: "#450a0a", color: "#fca5a5" }}>
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center" style={{ color: "var(--app-text-muted)" }}>
              <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              Opening chat...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center" style={{ color: "var(--app-text-muted)" }}>
              No messages yet.
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.userId === state.currentUser.id;
              const name = message.user?.name ?? (isOwn ? "You" : "Group member");
              return (
                <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[78%] rounded-lg px-3 py-2 border"
                    style={{
                      backgroundColor: isOwn ? "var(--app-purple-900)" : "var(--app-bg-tertiary)",
                      borderColor: "var(--app-border-primary)",
                      color: "var(--app-text-primary)",
                    }}
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: isOwn ? "var(--app-purple-300)" : "var(--app-text-secondary)" }}>
                        {isOwn ? "You" : name}
                      </span>
                      <span className="text-[0.65rem]" style={{ color: "var(--app-text-muted)" }}>
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-5 border-t" style={{ borderColor: "var(--app-border-primary)" }}>
          <div className="flex gap-2">
            <Input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder="Type a message..."
              disabled={isSending || !conversation}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            />
            <Button
              type="submit"
              disabled={isSending || !conversation || !messageInput.trim()}
              size="icon"
              style={{ backgroundColor: "var(--app-purple-600)", color: "#fff", flexShrink: 0 }}
            >
              {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
