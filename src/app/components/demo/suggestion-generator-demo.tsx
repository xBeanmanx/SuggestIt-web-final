import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { WS_ENDPOINT } from "../../../api/graphql";

const API_BASE = WS_ENDPOINT.replace(/^ws/, "http").replace(/\/ws$/, "");

interface GeneratorStatus {
  running: boolean;
  totalGenerated: number;
  intervalMs: number;
  batchSize: number;
}

export function SuggestionGeneratorDemo() {
  const [status, setStatus] = useState<GeneratorStatus | null>(null);
  const [lastBatchSize, setLastBatchSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/generator/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus((await response.json()) as GeneratorStatus);
      setError(null);
    } catch {
      setError("Generator server endpoint is unavailable.");
    }
  };

  const startGenerator = async () => {
    try {
      const response = await fetch(`${API_BASE}/generator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMs: 3000, batchSize: 2 }),
      });
      if (!response.ok && response.status !== 409) throw new Error(`HTTP ${response.status}`);
      await refreshStatus();
    } catch {
      setError("Could not start the server generator.");
    }
  };

  const stopGenerator = async () => {
    try {
      const response = await fetch(`${API_BASE}/generator/stop`, { method: "POST" });
      if (!response.ok && response.status !== 409) throw new Error(`HTTP ${response.status}`);
      await refreshStatus();
    } catch {
      setError("Could not stop the server generator.");
    }
  };

  useEffect(() => {
    refreshStatus();

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(WS_ENDPOINT);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as {
          type: string;
          payload: GeneratorStatus & { items?: unknown[] };
        };

        if (message.type === "generator:status") {
          setStatus(message.payload);
        }
        if (message.type === "generator:started" || message.type === "generator:stopped") {
          setStatus(message.payload);
        }
        if (message.type === "generator:batch") {
          setLastBatchSize(message.payload.items?.length ?? 0);
          refreshStatus();
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const isRunning = status?.running ?? false;

  return (
    <div
      style={{
        padding: "24px",
        border: "2px solid var(--app-purple-400)",
        borderRadius: "8px",
        backgroundColor: "var(--app-bg-secondary)",
      }}
    >
      <h2 style={{ marginBottom: "16px", color: "var(--app-text-primary)" }}>
        Server Entity Generator
      </h2>

      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <Button
          onClick={startGenerator}
          disabled={isRunning}
          style={{
            backgroundColor: "var(--app-green-500)",
            color: "white",
            opacity: isRunning ? 0.6 : 1,
          }}
        >
          Start Generator
        </Button>

        <Button
          onClick={stopGenerator}
          disabled={!isRunning}
          style={{
            backgroundColor: "var(--app-red-500)",
            color: "white",
            opacity: !isRunning ? 0.6 : 1,
          }}
        >
          Stop Generator
        </Button>
      </div>

      <div
        style={{
          padding: "12px",
          backgroundColor: "var(--app-bg-primary)",
          borderRadius: "4px",
          border: "1px solid var(--app-border-primary)",
        }}
      >
        <p style={{ margin: 0, color: "var(--app-text-primary)" }}>
          <strong>Status:</strong> {isRunning ? "Running" : "Stopped"}
        </p>
        <p style={{ margin: "8px 0 0 0", color: "var(--app-text-primary)" }}>
          <strong>Total generated:</strong> {status?.totalGenerated ?? 0}
        </p>
        <p style={{ margin: "8px 0 0 0", color: "var(--app-text-primary)" }}>
          <strong>Last WebSocket batch:</strong> {lastBatchSize}
        </p>
        {error && (
          <p style={{ margin: "8px 0 0 0", color: "#f87171" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
