import { useState } from "react";
import { Users, UserPlus, Minus, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useAppState } from "../../context/AppStateContext";
import { validateGroup, type GroupFormData } from "../../utils/validation";
import type { User } from "../../types";

// Deterministic avatar colour from user id
const AVATAR_COLORS = [
  "bg-purple-600", "bg-indigo-500", "bg-blue-500",
  "bg-pink-500", "bg-fuchsia-600", "bg-violet-500",
  "bg-sky-500", "bg-emerald-500",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Add Friend Dialog ─────────────────────────────────────

interface AddFriendDialogProps {
  open: boolean;
  onClose: () => void;
}

function AddFriendDialog({ open, onClose }: AddFriendDialogProps) {
  const { state } = useAppState();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<User | null | "not-found">(null);
  const [added, setAdded] = useState(false);

  const handleSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const found = state.users.find(
      (u) =>
        u.id !== state.currentUser.id &&
        (u.email.toLowerCase() === q ||
          u.id.toLowerCase() === q ||
          u.name.toLowerCase().includes(q))
    );
    setResult(found ?? "not-found");
    setAdded(false);
  };

  const handleClose = () => { setQuery(""); setResult(null); setAdded(false); onClose(); };
  const handleAdd = () => setAdded(true);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg border"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            style={{ color: "var(--app-text-primary)" }}
          >
            <UserPlus className="w-5 h-5" style={{ color: "var(--app-purple-400)" }} />
            Add Friend
          </DialogTitle>
          <DialogDescription style={{ color: "var(--app-text-muted)" }}>
            Search by name, email, or User ID
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Name, email or user ID…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setResult(null); setAdded(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            />
            <Button
              onClick={handleSearch}
              style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {result === "not-found" && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              No user found matching "{query}".
            </p>
          )}

          {result && result !== "not-found" && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg border"
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)" }}
            >
              <Avatar className="w-10 h-10">
                <AvatarFallback className={`${avatarColor(result.id)} text-white`}>
                  {initials(result.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: "var(--app-text-primary)" }}>
                  {result.name}
                </p>
                <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                  {result.email}
                </p>
              </div>
              {added ? (
                <span
                  className="text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: "#14532d", color: "#4ade80" }}
                >
                  Added 
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={handleAdd}
                  style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
                >
                  Add
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────

export function FriendsPage() {
  const { state, createGroup } = useAppState();
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [errors, setErrors] = useState<Partial<GroupFormData>>({});
  const [showAddFriendsDialog, setShowAddFriendsDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const otherUsers = state.users.filter((u) => u.id !== state.currentUser.id);

  const toggleFriend = (userId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const handleCreateGroup = () => {
    const data: GroupFormData = { name: groupName, description: groupDescription };
    const errs = validateGroup(data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const group = createGroup(data, Array.from(selectedFriends));
    const memberWord = group.memberCount === 1 ? "member" : "members";
    setSuccessMessage(`Group "${group.name}" created with ${group.memberCount} ${memberWord}! Invite code: ${group.inviteCode}`);
    setGroupName(""); setGroupDescription("");
    setSelectedFriends(new Set()); setErrors({});
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <div className="flex items-center gap-2" style={{ color: "var(--app-purple-400)" }}>
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">Friends &amp; Groups</span>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddFriendsDialog(true)}
          style={{ backgroundColor: "var(--app-purple-600)", color: "#fff" }}
        >
          <UserPlus className="w-4 h-4 mr-1" /> Find Friend
        </Button>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto px-4 py-6"
        style={{ backgroundColor: "var(--app-bg-primary)" }}
      >
        {successMessage && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{ backgroundColor: "#14532d", color: "#4ade80" }}
          >
            {successMessage}
          </div>
        )}

        {/* Create Group form */}
        <h3
          className="font-semibold mb-4"
          style={{ color: "var(--app-text-primary)" }}
        >
          Create New Group
        </h3>

        <div className="space-y-3 mb-4">
          <div>
            <Input
              placeholder="Group Name"
              value={groupName}
              maxLength={50}
              onChange={(e) => { setGroupName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
              style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)", color: "var(--app-text-primary)" }}
            />
            {errors.name && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.name}</p>
            )}
          </div>

          <div>
            <Input
              placeholder="Description"
              value={groupDescription}
              maxLength={300}
              onChange={(e) => { setGroupDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }}
              style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)", color: "var(--app-text-primary)" }}
            />
            {errors.description && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors.description}</p>
            )}
          </div>
        </div>

        {/* Friend list */}
        <p
          className="text-sm font-medium mb-3"
          style={{ color: "var(--app-text-secondary)" }}
        >
          Select Friends to Add ({selectedFriends.size} selected):
        </p>

        <div className="space-y-2 mb-4">
          {otherUsers.map((user) => (
            <FriendItem
              key={user.id}
              user={user}
              selected={selectedFriends.has(user.id)}
              onToggle={() => toggleFriend(user.id)}
            />
          ))}
        </div>

        <Button
          onClick={handleCreateGroup}
          disabled={!groupName}
          className="w-full"
          style={{
            backgroundColor: "var(--app-purple-600)",
            color: "#fff",
            opacity: !groupName ? 0.5 : 1,
          }}
        >
          Create Group
        </Button>
      </div>

      <AddFriendDialog
        open={showAddFriendsDialog}
        onClose={() => setShowAddFriendsDialog(false)}
      />
    </div>
  );
}

// ── Friend Item ───────────────────────────────────────────

interface FriendItemProps {
  user: User;
  selected: boolean;
  onToggle: () => void;
}

function FriendItem({ user, selected, onToggle }: FriendItemProps) {
  return (
    <div
      className="flex items-center gap-3 py-2 border-b cursor-pointer"
      style={{ borderColor: "var(--app-border-primary)" }}
      onClick={onToggle}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="flex-shrink-0"
      />

      <Avatar className="w-10 h-10 flex-shrink-0">
        <AvatarFallback className={`${avatarColor(user.id)} text-white`}>
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h4
          className="font-medium text-sm"
          style={{ color: "var(--app-text-primary)" }}
        >
          {user.name}
        </h4>
        <p
          className="text-xs truncate"
          style={{ color: "var(--app-text-muted)" }}
        >
          {user.email}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 flex-shrink-0"
        style={{ color: "var(--app-text-muted)" }}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        title={selected ? "Remove" : "Add"}
      >
        {selected
          ? <Minus className="w-4 h-4" style={{ color: "#f87171" }} />
          : <UserPlus className="w-4 h-4" />
        }
      </Button>
    </div>
  );
}
