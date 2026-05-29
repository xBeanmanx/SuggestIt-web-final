import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { fetchConversations, fetchConversationMessages, getAccessToken, sendChatMessage, createChatConversation, WS_ENDPOINT, type ChatConversation, type ChatMessage } from "../../api/graphql";
import type { User } from "../../types";

interface ChatComponentProps {
  currentUser: User;
  groupId: string;
  groupMembers: User[];
}

export function ChatComponent({ currentUser, groupId, groupMembers }: ChatComponentProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [conversationName, setConversationName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const convs = await fetchConversations(groupId);
        setConversations(convs);
      } catch (error) {
        console.error("Failed to load conversations:", error);
      }
    };

    loadConversations();
  }, [groupId]);

  // Load messages when conversation changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedConversation) return;

      try {
        const msgs = await fetchConversationMessages(selectedConversation.id, 50);
        setMessages(msgs);
        scrollToBottom();
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };

    loadMessages();
  }, [selectedConversation]);

  // Setup WebSocket connection
  useEffect(() => {
    if (!selectedConversation) return;

    const token = getAccessToken();
    const wsUrl = `${WS_ENDPOINT}/chat${token ? `?token=${encodeURIComponent(token)}` : ""}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Chat WebSocket connected");
      ws.send(
        JSON.stringify({
          type: "chat:user-joined",
          payload: { conversationId: selectedConversation.id, userId: currentUser.id },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chat:message") {
          const newMessage = data.payload as ChatMessage;
          // Deduplicate: only add if message doesn't already exist
          setMessages((prev) => {
            if (prev.some(m => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });
          scrollToBottom();
        } else if (data.type === "chat:user-joined") {
          console.log(`User ${data.payload.userId} joined the conversation`);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Chat WebSocket disconnected");
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [selectedConversation, currentUser.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedConversation) return;

    setIsLoading(true);
    try {
      const newMessage = await sendChatMessage({
        conversationId: selectedConversation.id,
        userId: currentUser.id,
        content: messageInput.trim(),
      });

      // Add message locally for immediate feedback
      setMessages((prev) => [...prev, newMessage]);
      setMessageInput("");

      // Broadcast via WebSocket to sync with other devices
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat:message",
            payload: {
              conversationId: selectedConversation.id,
              messageId: newMessage.id,
              userId: currentUser.id,
              content: newMessage.content,
              createdAt: newMessage.createdAt,
            },
          })
        );
      }

      scrollToBottom();
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateConversation = async () => {
    if (selectedMembers.size === 0) return;

    setIsCreatingConversation(true);
    try {
      const newConversation = await createChatConversation({
        groupId,
        memberIds: Array.from(selectedMembers),
        name: conversationName || undefined,
      });

      setConversations((prev) => [...prev, newConversation]);
      setSelectedConversation(newConversation);
      setSelectedMembers(new Set());
      setConversationName("");
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedMembers(newSelected);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Conversations sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Chat</h2>
          <Button
            onClick={() => setIsCreatingConversation(!isCreatingConversation)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
          >
            {isCreatingConversation ? "Cancel" : "New Conversation"}
          </Button>
        </div>

        {isCreatingConversation ? (
          <div className="p-4 border-b border-gray-200">
            <input
              type="text"
              placeholder="Conversation name (optional)"
              value={conversationName}
              onChange={(e) => setConversationName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {groupMembers.map((member) => (
                <label key={member.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(member.id)}
                    onChange={() => toggleMemberSelection(member.id)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{member.name}</span>
                </label>
              ))}
            </div>
            <Button
              onClick={handleCreateConversation}
              disabled={selectedMembers.size === 0 || isCreatingConversation}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-sm"
            >
              Create
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No conversations yet. Create one to get started!
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition ${
                    selectedConversation?.id === conv.id ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">
                    {conv.name || `Chat with ${conv.members.map((m) => m.name).join(", ")}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {conv.messageCount} messages
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Chat area */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">
              {selectedConversation.name || `Chat with ${selectedConversation.members.map((m) => m.name).join(", ")}`}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {selectedConversation.members.length} member{selectedConversation.members.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                      <span className="text-white text-xs font-semibold">
                        {message.user?.name[0]?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        {message.user?.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{message.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                disabled={isLoading}
              />
              <Button
                type="submit"
                disabled={isLoading || !messageInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2"
              >
                {isLoading ? "..." : "Send"}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Select a conversation to start chatting
        </div>
      )}
    </div>
  );
}
