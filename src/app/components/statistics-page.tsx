import { useState, useEffect, useCallback } from "react";
import { BarChart3, Table as TableIcon, TrendingUp, Award, ThumbsUp, ThumbsDown, Users, Radio } from "lucide-react";
import { Button } from "./ui/button";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAppState } from "../../context/AppStateContext";
import { SuggestionGeneratorDemo } from "./demo/suggestion-generator-demo";
import { fetchGlobalStats, WS_ENDPOINT } from "../../api/graphql";
import type { Suggestion } from "../../types";

// ── Helpers ───────────────────────────────────────────────

function scoreOf(s: Suggestion) { return s.upvotes - s.downvotes; }

function starsFor(score: number) {
  if (score >= 20) return 5;
  if (score >= 12) return 4;
  if (score >= 6) return 3;
  if (score >= 2) return 2;
  return 1;
}

function getRank(index: number) {
  if (index === 0) return { badge: "🏆", label: "Gold" };
  if (index === 1) return { badge: "🥈", label: "Silver" };
  if (index === 2) return { badge: "🥉", label: "Bronze" };
  return { badge: "⭐", label: `#${index + 1}` };
}

// ── Stat Card ─────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
      <div className={`inline-flex p-2 rounded-lg ${color} text-white mb-2`}>{icon}</div>
      <div className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>{value}</div>
      <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>{label}</div>
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────

interface ServerGlobalStats {
  totalUsers: number;
  totalGroups: number;
  totalSuggestions: number;
  totalAlchemyResults: number;
  overallUpvotes: number;
  overallDownvotes: number;
}

export function StatisticsPage() {
  const { state, getSuggestionsForGroup } = useAppState();
  const [viewMode, setViewMode] = useState<"charts" | "table">("charts");
  const [serverStats, setServerStats] = useState<ServerGlobalStats | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);

  const refreshServerStats = useCallback(async () => {
    try {
      const stats = await fetchGlobalStats();
      setServerStats(stats as ServerGlobalStats);
      setIsLive(true);
      // Brief pulse to signal new data arrived
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 1500);
    } catch {
      // Server unreachable - keep showing local stats, drop live badge
      setIsLive(false);
    }
  }, []);

  // Fetch server stats on mount
  useEffect(() => {
    refreshServerStats();
  }, [refreshServerStats]);

  // WebSocket: re-fetch stats whenever the generator pushes a batch
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(WS_ENDPOINT);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              payload: { items?: { type: string }[] };
            };
            if (msg.type === "generator:batch") {
              const hasSuggestions = (msg.payload.items ?? []).some(
                (i) => i.type === "suggestion"
              );
              if (hasSuggestions) refreshServerStats();
            }
          } catch { /* ignore parse errors */ }
        };
        ws.onerror = () => {};
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 5000); };
      } catch {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, [refreshServerStats]);

  // Scope: only groups the current user belongs to
  const myGroups = state.groups.filter((g) =>
    g.members.some((m) => m.userId === state.currentUser.id)
  );

  // All suggestions visible to the current user
  const allSuggestions: Suggestion[] = myGroups.flatMap((g) => getSuggestionsForGroup(g.id));

  // ── Overview counts - prefer server stats when live ──────
  const total       = serverStats?.totalSuggestions     ?? allSuggestions.length;
  const accepted    = allSuggestions.filter((s) => s.status === "accepted").length;
  const pending     = allSuggestions.filter((s) => s.status === "open" || s.status === "under_review").length;
  const totalUpvotes = serverStats?.overallUpvotes      ?? allSuggestions.reduce((acc, s) => acc + s.upvotes, 0);
  const acceptanceRate = total > 0 ? ((accepted / total) * 100).toFixed(1) : "0.0";

  // ── Status distribution (pie) ─────────────────────────
  const statusData = [
    { name: "Accepted", value: accepted, color: "#a78bfa" },
    { name: "Pending", value: pending, color: "#6b7280" },
    { name: "Rejected", value: total - accepted - pending, color: "#4b5563" },
  ].filter((d) => d.value > 0);

  // ── Per-group breakdown ───────────────────────────────
  const groupBreakdown = myGroups.map((g) => {
    const sugs = getSuggestionsForGroup(g.id);
    return {
      name: g.name.length > 14 ? g.name.slice(0, 14) + "…" : g.name,
      fullName: g.name,
      suggestions: sugs.length,
      accepted: sugs.filter((s) => s.status === "accepted").length,
      upvotes: sugs.reduce((a, s) => a + s.upvotes, 0),
      members: g.memberCount,
    };
  }).sort((a, b) => b.suggestions - a.suggestions);

  // ── Per-member stats ──────────────────────────────────
  // Collect member IDs visible in any of the user's groups
  const memberMap: Record<string, { name: string; suggestions: number; accepted: number; upvotes: number }> = {};
  myGroups.forEach((g) => {
    g.members.forEach((m) => {
      if (!memberMap[m.userId]) {
        memberMap[m.userId] = { name: m.user.name, suggestions: 0, accepted: 0, upvotes: 0 };
      }
    });
  });
  // Tag own suggestions with authorId by matching isOwnSuggestion for current user
  // Since the domain intentionally hides authorId, we approximate:
  // - isOwnSuggestion === true → attributed to currentUser
  // - others → distribute across non-current members (best-effort for demo)
  allSuggestions.forEach((s) => {
    if (s.isOwnSuggestion) {
      const entry = memberMap[state.currentUser.id];
      if (entry) { entry.suggestions++; entry.upvotes += s.upvotes; if (s.status === "accepted") entry.accepted++; }
    }
  });

  const memberStats = Object.entries(memberMap)
    .map(([id, v]) => ({ id, ...v, rate: v.suggestions > 0 ? (v.accepted / v.suggestions) * 100 : 0 }))
    .filter((m) => m.suggestions > 0 || m.id === state.currentUser.id)
    .sort((a, b) => b.suggestions - a.suggestions);

  // ── Top suggestions (ranked table) ────────────────────
  const ranked = [...allSuggestions]
    .map((s) => ({ ...s, score: scoreOf(s), groupName: myGroups.find((g) => g.id === s.groupId)?.name ?? "" }))
    .sort((a, b) => b.score - a.score);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20" style={{ color: "var(--app-text-muted)" }}>
        <TrendingUp className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-lg font-medium mb-1" style={{ color: "var(--app-text-primary)" }}>No data yet</p>
        <p className="text-sm">Join or create a group and add some suggestions to see statistics.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6" style={{ color: "var(--app-purple-400)" }} />
          <h2 className="text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>Statistics Dashboard</h2>
          {isLive && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${isPulsing ? "scale-110" : "scale-100"}`}
              style={{ backgroundColor: "#14532d", color: "#4ade80", border: "1px solid #166534" }}
            >
              <Radio className={`w-3 h-3 ${isPulsing ? "animate-pulse" : ""}`} />
              Live
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setViewMode("charts")}
            style={{
              backgroundColor: viewMode === "charts" ? "var(--app-purple-600)" : "var(--app-bg-secondary)",
              color: viewMode === "charts" ? "#fff" : "var(--app-text-muted)",
              border: "1px solid var(--app-border-primary)",
            }}
          >
            <BarChart3 className="w-4 h-4 mr-2" /> Charts
          </Button>
          <Button
            size="sm"
            onClick={() => setViewMode("table")}
            style={{
              backgroundColor: viewMode === "table" ? "var(--app-purple-600)" : "var(--app-bg-secondary)",
              color: viewMode === "table" ? "#fff" : "var(--app-text-muted)",
              border: "1px solid var(--app-border-primary)",
            }}
          >
            <TableIcon className="w-4 h-4 mr-2" /> Table
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Total Suggestions" value={total} color="bg-purple-600" />
        <StatCard icon={<ThumbsUp className="w-5 h-5" />} label="Accepted" value={accepted} color="bg-purple-500" />
        <StatCard icon={<ThumbsDown className="w-5 h-5" />} label="Pending / Review" value={pending} color="bg-gray-600" />
        <StatCard icon={<Award className="w-5 h-5" />} label="Acceptance Rate" value={`${acceptanceRate}%`} color="bg-purple-700" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard icon={<ThumbsUp className="w-5 h-5" />} label="Total Upvotes Received" value={totalUpvotes} color="bg-indigo-600" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Groups You're In" value={myGroups.length} color="bg-violet-600" />
      </div>

      {/* ── Live Demo ──────────────────────────────────── */}
      <div className="mb-6">
        <SuggestionGeneratorDemo />
      </div>

      {/* ── Charts view ────────────────────────────────── */}
      {viewMode === "charts" && (
        <div className="space-y-6">
          {/* Status distribution */}
          <ChartCard title="Suggestion Status Distribution">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%" cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent = 0 }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((entry) => (  
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Suggestions per group */}
          {groupBreakdown.length > 0 && (
            <ChartCard title="Suggestions per Group">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={groupBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="name" stroke={AXIS_COLOR} tick={{ fontSize: 12 }} />
                  <YAxis stroke={AXIS_COLOR} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="suggestions" name="Total" fill="#a78bfa" />
                  <Bar dataKey="accepted" name="Accepted" fill="#6d28d9" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Upvotes per group */}
          {groupBreakdown.length > 0 && (
            <ChartCard title="Upvotes per Group">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={groupBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="name" stroke={AXIS_COLOR} tick={{ fontSize: 12 }} />
                  <YAxis stroke={AXIS_COLOR} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="upvotes" name="Upvotes" fill="#c084fc" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Your own submissions (isOwnSuggestion) */}
          {(() => {
            const ownSugs = allSuggestions.filter((s) => s.isOwnSuggestion);
            if (ownSugs.length === 0) return null;
            const ownAccepted = ownSugs.filter((s) => s.status === "accepted").length;
            const ownUpvotes = ownSugs.reduce((a, s) => a + s.upvotes, 0);
            return (
              <ChartCard title="Your Contributions">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Ideas Submitted", value: ownSugs.length, color: "var(--app-purple-400)" },
                    { label: "Accepted", value: ownAccepted, color: "#4ade80" },
                    { label: "Total Upvotes", value: ownUpvotes, color: "#c084fc" },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-4 rounded-lg" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                      <div className="text-2xl font-bold mb-1" style={{ color: item.color }}>{item.value}</div>
                      <div className="text-xs" style={{ color: "var(--app-text-muted)" }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            );
          })()}

          {/* Group member acceptance rates */}
          {memberStats.length > 1 && (
            <ChartCard title="Member Acceptance Rates (your groups)">
              <div className="space-y-3">
                {memberStats.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center gap-4 p-3 rounded-lg" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1" style={{ color: "var(--app-text-primary)" }}>
                        {m.name}
                        {m.id === state.currentUser.id && <span className="text-xs px-1.5 rounded" style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}>you</span>}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>
                        {m.accepted} accepted / {m.suggestions} submitted
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-bold" style={{ color: "var(--app-purple-400)" }}>{m.rate.toFixed(0)}%</div>
                      <div className="text-xs" style={{ color: "var(--app-text-muted)" }}>rate</div>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* ── Table view ─────────────────────────────────── */}
      {viewMode === "table" && (
        <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ backgroundColor: "var(--app-bg-tertiary)", borderBottom: "1px solid var(--app-border-primary)" }}>
                <tr>
                  {["Rank", "Suggestion", "Group", "👍", "👎", "Score", "Rating", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--app-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((item, index) => {
                  const rank = getRank(index);
                  const stars = starsFor(item.score);
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--app-border-primary)" }}>
                      <td className="px-4 py-3">
                        <span className="text-lg">{rank.badge}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }} title={item.title}>{item.title}</div>
                        {item.isOwnSuggestion && <span className="text-xs" style={{ color: "var(--app-purple-400)" }}>your idea</span>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{item.groupName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium" style={{ color: "var(--app-purple-400)" }}>{item.upvotes}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span style={{ color: "var(--app-text-muted)" }}>{item.downvotes}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold" style={{ color: item.score >= 0 ? "var(--app-purple-400)" : "#f87171" }}>{item.score > 0 ? "+" : ""}{item.score}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className="text-sm" style={{ color: i < stars ? "var(--app-purple-400)" : "var(--app-border-secondary)" }}>★</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  );
                })}
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
  const s = map[status] ?? map.open;
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
