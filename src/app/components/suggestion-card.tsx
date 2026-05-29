// suggestion-card.tsx
// ─────────────────────────────────────────────────────────────
// Fully connected to AppStateContext. Handles:
//   • upvote / downvote with toggle-off support
//   • visual active state for the current user's vote
//   • edit & delete for own suggestions
//   • vote progress bar relative to group member count
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, CheckCircle, Edit2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { decisionThreshold, useAppState } from "../../context/AppStateContext";
import type { Suggestion, VoteType } from "../../types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  /** Total members in the group - used to calculate vote % */
  totalMembers: number;
  /** Called when the user clicks Edit (parent opens edit dialog) */
  onEdit?: (s: Suggestion) => void;
  /** Called after voting so server-backed lists can refresh */
  onVoteChange?: () => void;
}

export function SuggestionCard({ suggestion, totalMembers, onEdit, onVoteChange }: SuggestionCardProps) {
  const { voteSuggestion, deleteSuggestion } = useAppState();
  const [visibleSuggestion, setVisibleSuggestion] = useState(suggestion);
  const [isRejected, setIsRejected] = useState(false);

  useEffect(() => {
    setVisibleSuggestion(suggestion);
    setIsRejected(false);
  }, [suggestion]);

  if (isRejected) return null;

  const authorLabel = visibleSuggestion.isOwnSuggestion ? "You" : "Group member";
  const initials = authorLabel
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const threshold = decisionThreshold(totalMembers);
  const upPct = totalMembers > 0 ? Math.round((visibleSuggestion.upvotes / totalMembers) * 100) : 0;
  const netScore = visibleSuggestion.upvotes - visibleSuggestion.downvotes;

  const handleVote = (type: VoteType) => {
    const previousVote = visibleSuggestion.currentUserVote ?? null;
    const resolvedVote = previousVote === type ? null : type;
    let upvotes = visibleSuggestion.upvotes;
    let downvotes = visibleSuggestion.downvotes;

    if (previousVote === "up") upvotes = Math.max(0, upvotes - 1);
    if (previousVote === "down") downvotes = Math.max(0, downvotes - 1);
    if (resolvedVote === "up") upvotes += 1;
    if (resolvedVote === "down") downvotes += 1;

    if (downvotes >= threshold) {
      setIsRejected(true);
    } else {
      setVisibleSuggestion((current) => ({
        ...current,
        upvotes,
        downvotes,
        currentUserVote: resolvedVote,
        status: upvotes >= threshold ? "accepted" : current.status,
      }));
    }

    voteSuggestion(visibleSuggestion.id, type);
    window.setTimeout(() => onVoteChange?.(), 250);
  };

  const statusMap: Record<string, { label: string; bg: string; color: string }> = {
    open:         { label: "OPEN",         bg: "var(--app-bg-tertiary)",  color: "var(--app-text-muted)" },
    under_review: { label: "UNDER REVIEW", bg: "#1c1917",                 color: "#fb923c" },
    accepted:     { label: "ACCEPTED",     bg: "#14532d",                 color: "#4ade80" },
    rejected:     { label: "REJECTED",     bg: "#450a0a",                 color: "#f87171" },
  };
  const badge = statusMap[visibleSuggestion.status] ?? statusMap.open;

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--app-bg-secondary)",
        borderColor: "var(--app-border-primary)",
        padding: "var(--spacing-lg)",
      }}
    >
      {/* ── Header row ── */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar style={{ width: "2.5rem", height: "2.5rem", flexShrink: 0 }}>
          <AvatarFallback
            style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--app-text-primary)" }}
            >
              {visibleSuggestion.title}
            </h3>

            {visibleSuggestion.status === "accepted" && (
              <CheckCircle
                style={{ width: "var(--icon-sm)", height: "var(--icon-sm)", color: "var(--app-purple-400)", flexShrink: 0 }}
              />
            )}

            {visibleSuggestion.isOwnSuggestion && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}
              >
                yours
              </span>
            )}
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--app-text-muted)" }}>{authorLabel}</p>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--app-text-secondary)",
              marginTop: "var(--spacing-sm)",
            }}
          >
            {visibleSuggestion.description}
          </p>
        </div>

        {/* Edit / Delete - own suggestions only */}
        {visibleSuggestion.isOwnSuggestion && (
          <div className="flex gap-1 flex-shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(visibleSuggestion)}
                className="p-1.5 rounded hover:opacity-80"
                title="Edit"
                style={{ color: "var(--app-text-muted)", backgroundColor: "var(--app-bg-tertiary)" }}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => deleteSuggestion(visibleSuggestion.id)}
              className="p-1.5 rounded hover:opacity-80"
              title="Delete"
              style={{ color: "#f87171", backgroundColor: "var(--app-bg-tertiary)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Vote progress ── */}
      <div className="mb-3">
        <Progress value={upPct} className="h-1.5" />
        <div className="flex justify-between mt-1">
          <span style={{ fontSize: "0.7rem", color: "var(--app-text-muted)" }}>
            {visibleSuggestion.upvotes}/{totalMembers} agreed
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--app-text-muted)" }}>
            {upPct}%
          </span>
        </div>
      </div>

      {/* ── Footer: votes + status ── */}
      <div className="flex items-center justify-between">
        {/* Vote buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => handleVote("up")}
            style={{
              color: visibleSuggestion.currentUserVote === "up" ? "var(--app-purple-400)" : "var(--app-text-muted)",
              backgroundColor: visibleSuggestion.currentUserVote === "up" ? "var(--app-purple-900)" : "transparent",
            }}
            title={visibleSuggestion.currentUserVote === "up" ? "Remove upvote" : "Upvote"}
          >
            <ThumbsUp
              className="w-4 h-4"
              fill={visibleSuggestion.currentUserVote === "up" ? "currentColor" : "none"}
            />
          </Button>

          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--app-purple-400)",
              minWidth: "1rem",
              textAlign: "center",
            }}
          >
            {visibleSuggestion.upvotes}
          </span>

          <span style={{ fontSize: "0.75rem", color: "var(--app-border-primary)" }}>|</span>

          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => handleVote("down")}
            style={{
              color: visibleSuggestion.currentUserVote === "down" ? "#f87171" : "var(--app-text-muted)",
              backgroundColor: visibleSuggestion.currentUserVote === "down" ? "#450a0a" : "transparent",
            }}
            title={visibleSuggestion.currentUserVote === "down" ? "Remove downvote" : "Downvote"}
          >
            <ThumbsDown
              className="w-4 h-4"
              fill={visibleSuggestion.currentUserVote === "down" ? "currentColor" : "none"}
            />
          </Button>

          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#f87171",
              minWidth: "1rem",
              textAlign: "center",
            }}
          >
            {visibleSuggestion.downvotes}
          </span>

          <span
            style={{
              fontSize: "0.75rem",
              color: netScore >= 0 ? "var(--app-purple-400)" : "#f87171",
              marginLeft: "0.25rem",
            }}
          >
            ({netScore > 0 ? `+${netScore}` : netScore})
          </span>
        </div>

        {/* Status badge */}
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
}
