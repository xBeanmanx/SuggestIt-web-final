import { useState } from "react";
import { RefreshCw, ChevronRight, Plus, Copy, Check, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { GroupDetailDialog } from "./group-detail-dialog";
import { useAppState } from "../../context/AppStateContext";
import { validateGroup, validateInviteCode, type GroupFormData } from "../../utils/validation";
import type { Group } from "../../types";

// ── Add / Join Group Dialog ───────────────────────────────

interface AddGroupDialogProps {
  open: boolean;
  onClose: () => void;
}

function AddGroupDialog({ open, onClose }: AddGroupDialogProps) {
  const { createGroup, joinGroupByCode } = useAppState();
  const [mode, setMode] = useState<"create" | "join">("create");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createErrors, setCreateErrors] = useState<Partial<GroupFormData & { _form?: string }>>({});

  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  const resetAll = () => {
    setName(""); setDescription("");
    setCreateErrors({}); setInviteCode("");
    setJoinError(null); setJoinSuccess(null);
    setMode("create");
  };

  const handleClose = () => { resetAll(); onClose(); };

  const handleCreate = () => {
    const data: GroupFormData = { name, description };
    const errors = validateGroup(data);
    if (Object.keys(errors).length > 0) { setCreateErrors(errors); return; }
    createGroup(data);
    handleClose();
  };

  const handleJoin = () => {
    const err = validateInviteCode(inviteCode);
    if (err) { setJoinError(err); return; }
    const group = joinGroupByCode(inviteCode.trim().toUpperCase());
    if (!group) {
      setJoinError("No group found with that invite code.");
    } else {
      setJoinSuccess(`Joined "${group.name}"!`);
      setTimeout(handleClose, 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md border"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--app-text-primary)" }}>
            {mode === "create" ? "Create New Group" : "Join a Group"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--app-text-muted)" }}>
            {mode === "create" ? "Set up a new suggestion group." : "Enter a 6-character invite code."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div
          className="flex rounded-lg overflow-hidden border mb-2"
          style={{ borderColor: "var(--app-border-primary)" }}
        >
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: mode === m ? "var(--app-purple-600)" : "var(--app-bg-tertiary)",
                color: mode === m ? "#fff" : "var(--app-text-muted)",
              }}
            >
              {m === "create" ? "Create" : "Join by Code"}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
            <div>
              <label
                className="block mb-1 text-sm font-medium"
                style={{ color: "var(--app-text-secondary)" }}
              >
                Group Name
              </label>
              <Input
                placeholder="e.g. Product Team"
                value={name}
                maxLength={50}
                onChange={(e) => { setName(e.target.value); setCreateErrors((p) => ({ ...p, name: undefined })); }}
                style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
              />
              {createErrors.name && (
                <p className="text-xs mt-1" style={{ color: "#f87171" }}>{createErrors.name}</p>
              )}
            </div>

            <div>
              <label
                className="block mb-1 text-sm font-medium"
                style={{ color: "var(--app-text-secondary)" }}
              >
                Description
              </label>
              <div className="flex justify-end mb-1">
                <span
                  className="text-xs"
                  style={{ color: description.length >= 280 ? "#f87171" : "var(--app-text-muted)" }}
                >
                  {description.length}/300
                </span>
              </div>
              <Textarea
                placeholder="What is this group for?"
                value={description}
                maxLength={300}
                onChange={(e) => { setDescription(e.target.value); setCreateErrors((p) => ({ ...p, description: undefined })); }}
                rows={3}
                style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
              />
              {createErrors.description && (
                <p className="text-xs mt-1" style={{ color: "#f87171" }}>{createErrors.description}</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)", backgroundColor: "var(--app-bg-tertiary)" }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="flex-1"
                style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
              >
                Create Group
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
            <div>
              <label
                className="block mb-1 text-sm font-medium"
                style={{ color: "var(--app-text-secondary)" }}
              >
                Invite Code
              </label>
              <Input
                placeholder="e.g. ABC123"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setJoinError(null); setJoinSuccess(null); }}
                maxLength={6}
                style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)", letterSpacing: "0.2em", textTransform: "uppercase" }}
              />
              {joinError && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{joinError}</p>}
              {joinSuccess && <p className="text-xs mt-1" style={{ color: "#4ade80" }}>{joinSuccess}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)", backgroundColor: "var(--app-bg-tertiary)" }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleJoin}
                className="flex-1"
                style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
              >
                Join Group
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────

export function GroupsPage() {
  const { state } = useAppState();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const myGroups = state.groups.filter((g) =>
    g.members.some((m) => m.userId === state.currentUser.id)
  );

  return (
    <div
      className="px-4 py-6"
      style={{ backgroundColor: "var(--app-bg-primary)" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--app-text-primary)" }}
        >
          Your Groups
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Group
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            style={{ color: "var(--app-text-muted)" }}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {myGroups.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--app-text-muted)" }}>
          <p className="text-lg mb-2">No groups yet</p>
          <p className="text-sm">Create a group or join one with an invite code.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onClick={() => setSelectedGroup(group)}
            />
          ))}
        </div>
      )}

      <AddGroupDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />

      {selectedGroup && (
        <GroupDetailDialog
          group={selectedGroup}
          open={!!selectedGroup}
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────

interface GroupCardProps {
  group: Group;
  onClick: () => void;
}

function GroupCard({ group, onClick }: GroupCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(group.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const createdDate = new Date(group.createdAt).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  // Derive initials from group name for the avatar
  const initials = group.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg p-4 flex items-center gap-4 transition-colors border text-left"
      style={{
        backgroundColor: "var(--app-bg-secondary)",
        borderColor: "var(--app-border-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-bg-tertiary)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--app-bg-secondary)")}
    >
      
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{
          backgroundColor: "var(--app-purple-900)",
          color: "var(--app-purple-300)",
          border: "1px solid var(--app-border-primary)",
        }}
      >
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className="font-semibold text-sm mb-0.5"
          style={{ color: "var(--app-text-primary)" }}
        >
          {group.name}
        </h3>
        <p
          className="text-xs truncate"
          style={{ color: "var(--app-text-muted)" }}
        >
          {group.description}
        </p>
        <div
          className="flex items-center gap-3 mt-1 text-xs"
          style={{ color: "var(--app-text-muted)" }}
        >
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>{group.suggestionCount} suggestion{group.suggestionCount !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{createdDate}</span>
        </div>
      </div>

      {/* Invite code copy button */}
      <button
        onClick={handleCopyCode}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors flex-shrink-0"
        style={{
          backgroundColor: "var(--app-bg-tertiary)",
          color: copied ? "#4ade80" : "var(--app-text-muted)",
          border: "1px solid var(--app-border-secondary)",
        }}
        title="Copy invite code"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {group.inviteCode}
      </button>

      <ChevronRight
        className="w-4 h-4 flex-shrink-0"
        style={{ color: "var(--app-text-muted)" }}
      />
    </button>
  );
}
