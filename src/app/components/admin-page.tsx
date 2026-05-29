// admin-page.tsx
// ─────────────────────────────────────────────────────────────
// Admin panel - uses AppStateContext for all data.
// Shows all users across all groups, allows removing non-owner
// members and promoting/demoting admins.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Activity, AlertTriangle, ChevronDown, Shield, Trash2, Lock, UserCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
//import { Input } from "./ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { useAppState } from "../../context/AppStateContext";
import { fetchActionLogs, fetchObservationList, setUserRole as setUserRoleApi } from "../../api/graphql";
import type { ActionLog, GroupMember, ObservationEntry } from "../../types";

// Deterministic colour from userId
const AVATAR_COLORS = [
  "bg-purple-600", "bg-indigo-500", "bg-blue-500",
  "bg-pink-500", "bg-fuchsia-600", "bg-violet-500",
  "bg-sky-500", "bg-emerald-500",
];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function AdminPage() {
  const navigate = useNavigate();
  const { state, updateGroup } = useAppState();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ member: GroupMember; groupId: string } | null>(null);
  const [observationList, setObservationList] = useState<ObservationEntry[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, "ADMIN" | "USER">>({});

  // Collect all groups where the current user is owner or admin
  const adminGroups = state.groups.filter((g) =>
    g.members.some(
      (m) => m.userId === state.currentUser.id && (m.role === "owner" || m.role === "admin")
    )
  );
  const canViewSecurity = state.currentUser.role === "ADMIN" || adminGroups.length > 0;
  
  // Check if user has access to admin panel
  const isUserAdmin = state.currentUser.role === "ADMIN";

  useEffect(() => {
    if (!canViewSecurity) return;

    let cancelled = false;
    Promise.all([fetchObservationList(), fetchActionLogs()])
      .then(([observations, logs]) => {
        if (cancelled) return;
        setObservationList(observations);
        setActionLogs(logs.slice(0, 8));
        setSecurityError(null);
      })
      .catch(() => {
        if (!cancelled) setSecurityError("Security data is unavailable while the server is unreachable.");
      });

    return () => {
      cancelled = true;
    };
  }, [canViewSecurity]);

  const promoteUser = async (userId: string) => {
    setPromotingUserId(userId);
    setRoleError(null);

    try {
      const updated = await setUserRoleApi(userId, "ADMIN");
      setRoleOverrides((current) => ({
        ...current,
        [updated.id]: updated.role ?? "ADMIN",
      }));
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : "Could not assign admin role.");
    } finally {
      setPromotingUserId(null);
    }
  };

  const usersWithRoles = state.users.map((user) => ({
    ...user,
    role: roleOverrides[user.id] ?? user.role ?? "USER",
  }));

  if (!isUserAdmin) {
    return (
      <div
        className="px-4 py-12 flex flex-col items-center justify-center min-h-96"
        style={{ backgroundColor: "var(--app-bg-primary)" }}
      >
        <Lock className="w-12 h-12 mb-4" style={{ color: "var(--app-purple-400)" }} />
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--app-text-primary)" }}>
          Access Denied
        </h2>
        <p className="mb-6 text-center" style={{ color: "var(--app-text-muted)" }}>
          Only administrators can access this panel.
        </p>
        <Button
          onClick={() => navigate("/")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Back to Home
        </Button>
      </div>
    );
  }

  const confirmRemove = () => {
    if (!memberToRemove) return;
    // Dispatch a GROUP_LEAVE for the target member
    // We reuse leaveGroup but need to target another user's id - do it via updateGroup patch
    const { member, groupId } = memberToRemove;
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const updatedMembers = group.members.filter((m) => m.userId !== member.userId);
    updateGroup(groupId, {
      members: updatedMembers,
      memberCount: updatedMembers.length,
    });
    setMemberToRemove(null);
  };

  return (
    <div
      className="px-4 py-6"
      style={{ backgroundColor: "var(--app-bg-primary)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5" style={{ color: "var(--app-purple-400)" }} />
        <h2 className="text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>
          Admin Panel
        </h2>
      </div>

      {canViewSecurity && (
        <div className="grid gap-4 mb-6 lg:grid-cols-2">
          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <h3 className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Observation List
              </h3>
            </div>
            {securityError ? (
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{securityError}</p>
            ) : observationList.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No suspicious users flagged.</p>
            ) : (
              <div className="space-y-3">
                {observationList.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>
                        {entry.user?.name ?? entry.userId}
                      </p>
                      <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                        {entry.reason}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        color: entry.severity === "high" ? "#fca5a5" : "#fcd34d",
                        backgroundColor: entry.severity === "high" ? "#450a0a" : "#422006",
                      }}
                    >
                      {entry.severity} · {entry.actionCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4" style={{ color: "var(--app-purple-400)" }} />
              <h3 className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Recent Action Logs
              </h3>
            </div>
            {actionLogs.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No logged actions yet.</p>
            ) : (
              <div className="space-y-2">
                {actionLogs.map((log) => (
                  <div key={log.id} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium" style={{ color: "var(--app-text-primary)" }}>{log.action}</span>
                      <span style={{ color: "var(--app-text-muted)" }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="truncate" style={{ color: "var(--app-text-muted)" }}>
                      {log.actionInformation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="rounded-lg border p-4 mb-6"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="w-4 h-4" style={{ color: "var(--app-purple-400)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
            User Roles
          </h3>
        </div>
        {roleError && (
          <p className="text-sm mb-3" style={{ color: "#f87171" }}>
            {roleError}
          </p>
        )}
        <div className="divide-y" style={{ borderColor: "var(--app-border-primary)" }}>
          {usersWithRoles.map((user) => {
            const isSelf = user.id === state.currentUser.id;
            const isAdmin = user.role === "ADMIN";

            return (
              <div key={user.id} className="py-3 flex items-center gap-3">
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarFallback className={`${avatarColor(user.id)} text-white`}>
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>
                    {user.name}
                    {isSelf && (
                      <span className="ml-1 text-xs" style={{ color: "var(--app-text-muted)" }}>(you)</span>
                    )}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--app-text-muted)" }}>
                    {user.email}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: isAdmin ? "var(--app-purple-900)" : "var(--app-bg-tertiary)",
                    color: isAdmin ? "var(--app-purple-300)" : "var(--app-text-muted)",
                  }}
                >
                  {user.role}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isAdmin || promotingUserId === user.id}
                  onClick={() => promoteUser(user.id)}
                  style={{ borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  {promotingUserId === user.id ? "Assigning" : "Make admin"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {adminGroups.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--app-text-muted)" }}>
          <p className="text-lg mb-2">No group admin access</p>
          <p className="text-sm">You are not an owner or admin in any group.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {adminGroups.map((group) => {
            const isExpanded = expandedGroup === group.id;
            const currentUserRole = group.members.find((m) => m.userId === state.currentUser.id)?.role;

            return (
              <div
                key={group.id}
                className="rounded-lg border overflow-hidden"
                style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
              >
                {/* Group header row */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  style={{ backgroundColor: "var(--app-bg-tertiary)" }}
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}
                    >
                      {group.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <span className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>
                        {group.name}
                      </span>
                      <span className="text-xs ml-2" style={{ color: "var(--app-text-muted)" }}>
                        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}
                    >
                      {currentUserRole}
                    </span>
                    <ChevronDown
                      className="w-4 h-4 transition-transform"
                      style={{
                        color: "var(--app-text-muted)",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </div>
                </button>

                {/* Member list */}
                {isExpanded && (
                  <div className="divide-y" style={{ borderColor: "var(--app-border-primary)" }}>
                    {/* Column header */}
                    <div
                      className="px-4 py-2 flex items-center text-xs font-semibold"
                      style={{ color: "var(--app-text-muted)", backgroundColor: "var(--app-bg-secondary)" }}
                    >
                      <div className="flex-1">Member</div>
                      <div className="w-24 text-center">Role</div>
                      <div className="w-16 text-center">Action</div>
                    </div>

                    {group.members.map((member) => {
                      const isSelf = member.userId === state.currentUser.id;
                      const isOwner = member.role === "owner";
                      const canRemove = !isSelf && !isOwner && currentUserRole === "owner";

                      return (
                        <div
                          key={member.userId}
                          className="px-4 py-3 flex items-center"
                          style={{ borderColor: "var(--app-border-primary)" }}
                        >
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                            <Avatar className="w-9 h-9 flex-shrink-0">
                              <AvatarFallback className={`${avatarColor(member.userId)} text-white`}>
                                {initials(member.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>
                                {member.user.name}
                                {isSelf && (
                                  <span className="ml-1 text-xs" style={{ color: "var(--app-text-muted)" }}>(you)</span>
                                )}
                              </div>
                              <div className="text-xs truncate" style={{ color: "var(--app-text-muted)" }}>
                                {member.user.email}
                              </div>
                            </div>
                          </div>

                          <div className="w-24 text-center">
                            {isOwner ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: "var(--app-purple-900)", color: "var(--app-purple-300)" }}
                              >
                                <Shield className="w-3 h-3" /> Owner
                              </span>
                            ) : member.role === "admin" ? (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-purple-400)" }}
                              >
                                Admin
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Member</span>
                            )}
                          </div>

                          <div className="w-16 text-center">
                            {canRemove && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8"
                                onClick={() => setMemberToRemove({ member, groupId: group.id })}
                                title="Remove member"
                                style={{ color: "#f87171" }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm remove dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent
          style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border-primary)" }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--app-text-primary)" }}>Remove Member</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--app-text-muted)" }}>
              Remove <strong>{memberToRemove?.member.user.name}</strong> from this group? They will lose access to all suggestions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border-secondary)", color: "var(--app-text-primary)" }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              style={{ backgroundColor: "#450a0a", color: "#f87171" }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
