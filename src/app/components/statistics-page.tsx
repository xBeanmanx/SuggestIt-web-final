import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  Award,
  BarChart3,
  RefreshCw,
  Table as TableIcon,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "./ui/button";
import { fetchStatisticsSnapshot, WS_ENDPOINT, type StatisticsSnapshot } from "../../api/graphql";

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
      <div className={`inline-flex p-2 rounded-lg ${color} text-white mb-2`}>{icon}</div>
      <div className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>{value}</div>
      <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-6" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
      <h3 className="text-base font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>{title}</h3>
      {children}
    </div>
  );
}

const TOOLTIP_STYLE = { backgroundColor: "#1f2937", border: "1px solid #374151", color: "#fff" };
const AXIS_COLOR = "#6b7280";
const GRID_COLOR = "#374151";

export function StatisticsPage() {
  const [snapshot, setSnapshot] = useState<StatisticsSnapshot | null>(null);
  const [viewMode, setViewMode] = useState<"charts" | "table">("charts");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchStatisticsSnapshot();
      setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load statistics.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_ENDPOINT);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as { type: string };
            if (msg.type === "generator:batch") refresh();
          } catch {
            // Ignore malformed generator events.
          }
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [refresh]);

  const statusData = useMemo(() => {
    if (!snapshot) return [];
    return [
      { name: "Open", value: snapshot.statusBreakdown.open, color: "#8b5cf6" },
      { name: "Review", value: snapshot.statusBreakdown.under_review, color: "#f59e0b" },
      { name: "Accepted", value: snapshot.statusBreakdown.accepted, color: "#22c55e" },
      { name: "Rejected", value: snapshot.statusBreakdown.rejected, color: "#ef4444" },
    ].filter((item) => item.value > 0);
  }, [snapshot]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20" style={{ color: "var(--app-text-muted)" }}>
        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
        Loading statistics...
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20" style={{ color: "var(--app-text-muted)" }}>
        <WifiOff className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-lg font-medium mb-1" style={{ color: "var(--app-text-primary)" }}>Statistics unavailable</p>
        <p className="text-sm mb-4">{error ?? "The server did not return statistics."}</p>
        <Button onClick={refresh} style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}>Retry</Button>
      </div>
    );
  }

  const totals = snapshot.totals;
  const acceptanceRate = totals.totalSuggestions > 0
    ? ((totals.accepted / totals.totalSuggestions) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6" style={{ color: "var(--app-purple-400)" }} />
          <h2 className="text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>Statistics Dashboard</h2>
          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "var(--app-text-muted)", borderColor: "var(--app-border-primary)" }}>
            {snapshot.scope === "admin" ? "Global" : "Your groups"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setViewMode("charts")} style={{ backgroundColor: viewMode === "charts" ? "var(--app-purple-600)" : "var(--app-bg-secondary)", color: viewMode === "charts" ? "#fff" : "var(--app-text-muted)", border: "1px solid var(--app-border-primary)" }}>
            <BarChart3 className="w-4 h-4 mr-2" /> Charts
          </Button>
          <Button size="sm" onClick={() => setViewMode("table")} style={{ backgroundColor: viewMode === "table" ? "var(--app-purple-600)" : "var(--app-bg-secondary)", color: viewMode === "table" ? "#fff" : "var(--app-text-muted)", border: "1px solid var(--app-border-primary)" }}>
            <TableIcon className="w-4 h-4 mr-2" /> Table
          </Button>
          <Button size="icon" variant="outline" onClick={refresh} className="w-8 h-8" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)", color: "var(--app-text-muted)" }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "#991b1b", backgroundColor: "#450a0a", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Suggestions" value={totals.totalSuggestions} color="bg-purple-600" />
        <StatCard icon={<ThumbsUp className="w-5 h-5" />} label="Accepted" value={totals.accepted} color="bg-green-600" />
        <StatCard icon={<ThumbsDown className="w-5 h-5" />} label="Pending / Review" value={totals.pending} color="bg-gray-600" />
        <StatCard icon={<Award className="w-5 h-5" />} label="Acceptance Rate" value={`${acceptanceRate}%`} color="bg-indigo-600" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users className="w-5 h-5" />} label={snapshot.scope === "admin" ? "Users" : "Visible Members"} value={totals.totalUsers} color="bg-violet-600" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Groups" value={totals.totalGroups} color="bg-slate-600" />
        <StatCard icon={<ThumbsUp className="w-5 h-5" />} label="Total Upvotes" value={totals.totalUpvotes} color="bg-teal-600" />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Alchemy Results" value={totals.totalAlchemyResults} color="bg-fuchsia-600" />
      </div>

      {totals.totalSuggestions === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--app-text-muted)" }}>
          <p className="text-lg mb-2" style={{ color: "var(--app-text-primary)" }}>No statistics yet</p>
          <p className="text-sm">Suggestions will appear here once they exist in the database.</p>
        </div>
      ) : viewMode === "charts" ? (
        <div className="space-y-6">
          <ChartCard title="Suggestion Status Distribution">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent = 0 }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {snapshot.groups.length > 0 && (
            <ChartCard title="Suggestions per Group">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={snapshot.groups.slice(0, 10).map((group) => ({ ...group, label: group.name.length > 14 ? `${group.name.slice(0, 14)}...` : group.name }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fontSize: 12 }} />
                  <YAxis stroke={AXIS_COLOR} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="totalSuggestions" name="Total" fill="#a78bfa" />
                  <Bar dataKey="accepted" name="Accepted" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {snapshot.contributors.length > 0 && (
            <ChartCard title="Top Contributors">
              <div className="space-y-3">
                {snapshot.contributors.map((contributor) => (
                  <div key={contributor.userId} className="flex items-center justify-between gap-4 rounded-lg p-3" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>{contributor.name}</div>
                      <div className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                        {contributor.acceptedCount} accepted / {contributor.suggestionCount} submitted
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold" style={{ color: "var(--app-purple-400)" }}>{contributor.totalUpvotes}</div>
                      <div className="text-xs" style={{ color: "var(--app-text-muted)" }}>upvotes</div>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ backgroundColor: "var(--app-bg-tertiary)", borderBottom: "1px solid var(--app-border-primary)" }}>
                <tr>
                  {["Suggestion", "Group", "Up", "Down", "Score", "Status"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--app-text-muted)" }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.topSuggestions.map((suggestion) => (
                  <tr key={suggestion.id} style={{ borderBottom: "1px solid var(--app-border-primary)" }}>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }} title={suggestion.title}>{suggestion.title}</div>
                      {suggestion.isOwnSuggestion && <span className="text-xs" style={{ color: "var(--app-purple-400)" }}>your idea</span>}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{suggestion.groupName}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--app-purple-400)" }}>{suggestion.upvotes}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#f87171" }}>{suggestion.downvotes}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: suggestion.score >= 0 ? "var(--app-purple-400)" : "#f87171" }}>{suggestion.score > 0 ? `+${suggestion.score}` : suggestion.score}</td>
                    <td className="px-4 py-3"><StatusBadge status={suggestion.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open: { label: "Open", bg: "var(--app-bg-tertiary)", color: "var(--app-text-muted)" },
    under_review: { label: "Review", bg: "#1c1917", color: "#fb923c" },
    accepted: { label: "Accepted", bg: "#14532d", color: "#4ade80" },
    rejected: { label: "Rejected", bg: "#450a0a", color: "#f87171" },
  };
  const item = map[status] ?? map.open;
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: item.bg, color: item.color }}>
      {item.label}
    </span>
  );
}
