// suggestions-page.tsx - Gold edition
// • Infinite scroll backed by server-side GraphQL pagination
// • Next page prefetched automatically (minimum network usage)
// • WebSocket listener: live suggestions from the generator
// • Offline banner + fallback to in-memory data
import { useState, useEffect, useCallback } from "react";
import { Plus, Orbit, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { SuggestionCard } from "./suggestion-card";
import { GravityBoard } from "./gravity-board";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useAppState } from "../../context/AppStateContext";
import { validateSuggestion, type SuggestionFormData } from "../../utils/validation";
import { useInfiniteScroll, useServerSuggestions } from "../../hooks/useInfiniteScroll";
import { MUTATIONS, gqlFetch, WS_ENDPOINT } from "../../api/graphql";
import type { Suggestion } from "../../types";

// ── Add / Edit Suggestion Dialog ──────────────────────────────

interface SuggestionDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  userId: string;
  existing?: Suggestion;
  onSaved: () => void;
}

function SuggestionDialog({
  open, onClose, groupId, userId, existing, onSaved,
}: SuggestionDialogProps) {
  const { createSuggestion, updateSuggestion } = useAppState();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [errors, setErrors] = useState<Partial<SuggestionFormData>>({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  const handleSubmit = async () => {
    const data: SuggestionFormData = { title, description };
    const errs = validateSuggestion(data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      if (navigator.onLine) {
        if (isEdit) {
          await gqlFetch(MUTATIONS.UPDATE_SUGGESTION, { id: existing!.id, input: { title, description }, requesterId: userId }, userId);
        } else {
          await gqlFetch(MUTATIONS.CREATE_SUGGESTION, { input: { groupId, authorId: userId, title, description } }, userId);
        }
      } else {
        if (isEdit) {
          updateSuggestion(existing!.id, data);
        } else {
          createSuggestion(groupId, data);
        }
      }
      onSaved();
      handleClose();
    } catch {
      if (isEdit) updateSuggestion(existing!.id, data); else createSuggestion(groupId, data);
      onSaved();
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => { setTitle(existing?.title ?? ""); setDescription(existing?.description ?? ""); setErrors({}); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--app-text-primary)" }}>{isEdit ? "Edit Suggestion" : "Add New Suggestion"}</DialogTitle>
          <DialogDescription style={{ color: "var(--app-text-muted)" }}>{isEdit ? "Update your suggestion below." : "Share an idea with the group."}</DialogDescription>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium" style={{ color: "var(--app-text-secondary)" }}>Title</label>
              <span className="text-xs" style={{ color: title.length >= 95 ? "#f87171" : "var(--app-text-muted)" }}>{title.length}/100</span>
            </div>
            <Input placeholder="Enter suggestion title" value={title} maxLength={100}
              onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }} />
            {errors.title && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.title}</p>}
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium" style={{ color: "var(--app-text-secondary)" }}>Description</label>
              <span className="text-xs" style={{ color: description.length >= 950 ? "#f87171" : "var(--app-text-muted)" }}>{description.length}/1000</span>
            </div>
            <Textarea placeholder="Describe your suggestion (10–1000 chars)" value={description} maxLength={1000}
              onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }}
              rows={4}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }} />
            {errors.description && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.description}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} className="flex-1"
              style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)", backgroundColor: "var(--app-bg-tertiary)" }}>Cancel</Button>
            <Button onClick={handleSubmit} className="flex-1" disabled={saving}
              style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Suggestion"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border p-4 animate-pulse" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
      <div className="h-4 rounded w-3/4 mb-3" style={{ backgroundColor: "var(--app-bg-tertiary)" }} />
      <div className="h-3 rounded w-full mb-2" style={{ backgroundColor: "var(--app-bg-tertiary)" }} />
      <div className="h-3 rounded w-2/3" style={{ backgroundColor: "var(--app-bg-tertiary)" }} />
    </div>
  );
}

export function SuggestionsPage() {
  const { state, getSuggestionsForGroup } = useAppState();
  const currentUser = state.currentUser;
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Suggestion | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "gravity">("grid");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "accepted">("pending");
  const [liveCount, setLiveCount] = useState(0);

  const myGroups = state.groups.filter((g) => g.members.some((m) => m.userId === currentUser.id));
  const effectiveGroupId = selectedGroupId ?? myGroups[0]?.id ?? null;

  const offlineSuggestions = effectiveGroupId
    ? getSuggestionsForGroup(effectiveGroupId)
    : myGroups.flatMap((g) => getSuggestionsForGroup(g.id));

  const pendingFeed = useServerSuggestions({
    groupId: effectiveGroupId,
    userId: currentUser.id,
    filter: undefined,
    offlineFallback: offlineSuggestions.filter((s) => s.status !== "accepted"),
  });

  const acceptedFeed = useServerSuggestions({
    groupId: effectiveGroupId,
    userId: currentUser.id,
    filter: { status: "accepted" },
    offlineFallback: offlineSuggestions.filter((s) => s.status === "accepted"),
  });

  const pendingSentinel = useInfiniteScroll({ onLoadMore: pendingFeed.loadMore, hasMore: pendingFeed.hasNextPage });
  const acceptedSentinel = useInfiniteScroll({ onLoadMore: acceptedFeed.loadMore, hasMore: acceptedFeed.hasNextPage });

  // WebSocket live updates
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    const connect = () => {
      try {
        ws = new WebSocket(WS_ENDPOINT);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as { type: string; payload: { items?: { type: string }[] } };
            if (msg.type === "generator:batch") {
              const n = (msg.payload.items ?? []).filter((i) => i.type === "suggestion").length;
              if (n > 0) setLiveCount((c) => c + n);
            }
          } catch { /* ignore */ }
        };
        ws.onerror = () => {};
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 5000); };
      } catch { reconnectTimer = setTimeout(connect, 5000); }
    };
    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  const handleLiveRefresh = useCallback(() => {
    pendingFeed.refresh(); acceptedFeed.refresh(); setLiveCount(0);
  }, [pendingFeed, acceptedFeed]);

  const addGroupId = effectiveGroupId ?? "";
  const memberCountFor = (s: Suggestion) => state.groups.find((g) => g.id === s.groupId)?.memberCount ?? 1;
  const isOffline = pendingFeed.isOffline || acceptedFeed.isOffline;

  if (viewMode === "gravity") {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: "var(--app-bg-primary)" }}>
        <div className="flex-1 overflow-hidden"><GravityBoard onSwitchToGridView={() => setViewMode("grid")} /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {isOffline && (
        <div className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b" }}>
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Server unreachable - showing cached data. Mutations will sync when reconnected.</span>
        </div>
      )}

      {liveCount > 0 && (
        <button onClick={handleLiveRefresh}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-80"
          style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}>
          <RefreshCw className="w-4 h-4" />
          {liveCount} new suggestion{liveCount > 1 ? "s" : ""} - click to refresh
        </button>
      )}

      <div className="flex items-center justify-between" style={{ marginBottom: "var(--spacing-xl)" }}>
        <div className="flex items-center gap-2">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--app-text-primary)" }}>Suggestions</h2>
          {!isOffline && <Wifi className="w-4 h-4" style={{ color: "var(--app-text-muted)" }} />}
        </div>
        <div className="flex" style={{ gap: "var(--spacing-sm)" }}>
          <Button variant="outline" size="icon" onClick={() => setViewMode("gravity")} className="relative hover:opacity-90"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)", color: "var(--app-text-secondary)" }}>
            <Orbit style={{ width: "var(--icon-md)", height: "var(--icon-md)" }} />
            <span className="absolute -top-1 -right-1 rounded-full animate-pulse"
              style={{ width: "var(--spacing-sm)", height: "var(--spacing-sm)", backgroundColor: "var(--app-purple-600)" }} />
          </Button>
          <Button onClick={() => setShowAddDialog(true)} disabled={myGroups.length === 0} className="hover:opacity-90"
            style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}>
            <Plus className="w-4 h-4 mr-1" /> Add Idea
          </Button>
        </div>
      </div>

      {myGroups.length > 1 && (
        <div style={{ marginBottom: "var(--spacing-lg)" }}>
          <Select value={effectiveGroupId ?? ""} onValueChange={(v) => setSelectedGroupId(v)}>
            <SelectTrigger className="w-56 border" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)", color: "var(--app-text-primary)" }}>
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
              {myGroups.map((g) => <SelectItem key={g.id} value={g.id} style={{ color: "var(--app-text-primary)" }}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {myGroups.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--app-text-muted)" }}>
          <p className="text-lg mb-2">No groups yet</p>
          <p className="text-sm">Join or create a group first to see suggestions.</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "accepted")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 border"
            style={{ marginBottom: "var(--spacing-lg)", backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}>
            <TabsTrigger value="pending" style={{ color: "var(--app-text-muted)" }} className="data-[state=active]:text-white">
              Pending ({pendingFeed.total})
            </TabsTrigger>
            <TabsTrigger value="accepted" style={{ color: "var(--app-text-muted)" }} className="data-[state=active]:text-white">
              Accepted ({acceptedFeed.total})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
            {pendingFeed.isLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
              : pendingFeed.suggestions.length === 0 ? (
                <p className="text-center py-10 text-sm" style={{ color: "var(--app-text-muted)" }}>No pending suggestions.</p>
              ) : (
                <>
                  {pendingFeed.suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      totalMembers={memberCountFor(s)}
                      onEdit={setEditTarget}
                      onVoteChange={() => { pendingFeed.refresh(); acceptedFeed.refresh(); }}
                    />
                  ))}
                  <div ref={pendingSentinel} style={{ height: 1 }} />
                  {pendingFeed.isLoadingMore && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--app-purple-600)", borderTopColor: "transparent" }} /></div>}
                  {!pendingFeed.hasNextPage && pendingFeed.suggestions.length > 0 && (
                    <p className="text-center text-xs py-2" style={{ color: "var(--app-text-muted)" }}>All {pendingFeed.total} suggestions loaded</p>
                  )}
                </>
              )}
          </TabsContent>

          <TabsContent value="accepted" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
            {acceptedFeed.isLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
              : acceptedFeed.suggestions.length === 0 ? (
                <p className="text-center py-10 text-sm" style={{ color: "var(--app-text-muted)" }}>No accepted suggestions yet.</p>
              ) : (
                <>
                  {acceptedFeed.suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      totalMembers={memberCountFor(s)}
                      onEdit={setEditTarget}
                      onVoteChange={() => { pendingFeed.refresh(); acceptedFeed.refresh(); }}
                    />
                  ))}
                  <div ref={acceptedSentinel} style={{ height: 1 }} />
                  {acceptedFeed.isLoadingMore && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--app-purple-600)", borderTopColor: "transparent" }} /></div>}
                  {!acceptedFeed.hasNextPage && acceptedFeed.suggestions.length > 0 && (
                    <p className="text-center text-xs py-2" style={{ color: "var(--app-text-muted)" }}>All {acceptedFeed.total} suggestions loaded</p>
                  )}
                </>
              )}
          </TabsContent>
        </Tabs>
      )}

      <SuggestionDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} groupId={addGroupId} userId={currentUser.id}
        onSaved={() => { pendingFeed.refresh(); acceptedFeed.refresh(); }} />
      {editTarget && (
        <SuggestionDialog open={!!editTarget} onClose={() => setEditTarget(null)} groupId={editTarget.groupId} userId={currentUser.id}
          existing={editTarget} onSaved={() => { pendingFeed.refresh(); acceptedFeed.refresh(); }} />
      )}
    </div>
  );
}
