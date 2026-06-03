// ============================================================
// Store Factory  MSSQL-backed persistence
// ============================================================

import { v4 as uuid } from "uuid";
import bcrypt from "bcrypt";
import type {
  User,
  Group,
  GroupMember,
  Suggestion,
  AlchemyResult,
  GroupRole,
  Role,
  Permission,
  ActionLog,
  ObservationEntry,
  AppRoleName,
  SuggestionStatus,
  VoteType,
  IStore,
  ChatMessage,
  ChatConversation,
  RefreshTokenRecord,
  TopContributor,
} from "./types.js";

function decisionThreshold(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount / 2));
}

/**
 * AsyncMemoryStore  in-memory store used by unit tests and explicit local runs.
 */
export class AsyncMemoryStore implements IStore {
  private users = new Map<string, User>();
  private groups = new Map<string, Group>();
  private suggestions = new Map<string, Suggestion>();
  private alchemyResults = new Map<string, AlchemyResult>();
  private suggestionVotes = new Map<string, Map<string, VoteType>>();
  private alchemyVotes = new Map<string, Map<string, VoteType>>();
  private conversations = new Map<string, ChatConversation>();
  private chatMessages = new Map<string, ChatMessage>();
  private conversationMessages = new Map<string, string[]>();  // conversationId -> messageIds[]
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private actionLogs: ActionLog[] = [];
  private observationList = new Map<string, ObservationEntry>();
  private roles: Role[] = [
    { id: "role_admin", name: "ADMIN", description: "Full administrative access" },
    { id: "role_user", name: "USER", description: "Restricted regular user access" },
  ];
  private permissions: Permission[] = [
    { id: "perm_read", code: "READ_DOMAIN", description: "Read users, groups, suggestions and statistics" },
    { id: "perm_write_own", code: "WRITE_OWN_SUGGESTIONS", description: "Create and update own suggestions" },
    { id: "perm_admin", code: "ADMINISTER_DOMAIN", description: "Manage groups, users and moderation" },
    { id: "perm_view_logs", code: "VIEW_SECURITY_LOGS", description: "View action logs and observation list" },
  ];

  async getUsers(): Promise<User[]> {
    return [...this.users.values()].map((user) => this.sanitizeUser(user));
  }

  async getUserById(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    return user ? this.sanitizeUser(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    const user = [...this.users.values()].find((user) => user.email.toLowerCase() === normalized);
    return user ? this.sanitizeUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalized = username.toLowerCase();
    const user = [...this.users.values()].find((user) => user.username?.toLowerCase() === normalized);
    return user ? this.sanitizeUser(user) : undefined;
  }

  async createUser(
    data: Omit<User, "id" | "createdAt" | "passwordHash"> & { password?: string; passwordHash?: string }
  ): Promise<User> {
    const role = data.role ?? "USER";
    const passwordHash =
      data.passwordHash ?? (data.password ? await bcrypt.hash(data.password, 10) : undefined);
    const user: User = {
      ...data,
      role,
      permissions: this.permissionsForRole(role),
      passwordHash,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    delete (user as { password?: string }).password;
    this.users.set(user.id, user);
    return this.sanitizeUser(user);
  }

  async validateUserPassword(username: string, password: string): Promise<User | undefined> {
    const normalized = username.toLowerCase();
    const user = [...this.users.values()].find((candidate) => candidate.username?.toLowerCase() === normalized);
    if (!user?.passwordHash) return undefined;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? this.sanitizeUser(user) : undefined;
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    this.users.set(userId, { ...user, passwordHash: await bcrypt.hash(password, 10) });
    await this.revokeUserRefreshTokens(userId);
  }

  async login(data: { email: string; name: string; requestedRole?: AppRoleName }): Promise<User> {
    const existing = await this.getUserByEmail(data.email);
    if (existing) return this.sanitizeUser(existing);

    const role = data.requestedRole ?? (this.users.size === 0 ? "ADMIN" : "USER");
    return this.createUser({
      name: data.name,
      email: data.email.toLowerCase(),
      username: data.email.split("@")[0],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(data.email)}`,
      role,
      permissions: this.permissionsForRole(role),
    });
  }

  async setUserRole(userId: string, role: AppRoleName): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updated = { ...user, role, permissions: this.permissionsForRole(role) };
    this.users.set(userId, updated);
    return this.sanitizeUser(updated);
  }

  async getRoles(): Promise<Role[]> {
    return this.roles;
  }

  async getPermissions(): Promise<Permission[]> {
    return this.permissions;
  }

  private permissionsForRole(role: AppRoleName): string[] {
    if (role === "ADMIN") return this.permissions.map((permission) => permission.code);
    return ["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS"];
  }

  private sanitizeUser(user: User): User {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  /** Internal: seed a user with a fixed id (for tests / mock data) */
  _seedUser(user: User): void {
    const role = user.role ?? (this.users.size === 0 ? "ADMIN" : "USER");
    this.users.set(user.id, { ...user, role, permissions: this.permissionsForRole(role) });
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.tokenHash, record);
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    return this.refreshTokens.get(tokenHash);
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    const record = this.refreshTokens.get(tokenHash);
    if (record) {
      this.refreshTokens.set(tokenHash, { ...record, revokedAt: new Date().toISOString() });
    }
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    for (const [tokenHash, record] of this.refreshTokens) {
      if (record.userId === userId && !record.revokedAt) {
        this.refreshTokens.set(tokenHash, { ...record, revokedAt: new Date().toISOString() });
      }
    }
  }

  /** Internal: seed a group with a fixed id (for tests / mock data) */
  _seedGroup(group: Group): void {
    this.groups.set(group.id, group);
  }

  /** Internal: seed a suggestion with a fixed id (for tests / mock data) */
  _seedSuggestion(suggestion: Suggestion): void {
    this.suggestions.set(suggestion.id, suggestion);

    const group = this.groups.get(suggestion.groupId);
    if (group) {
      this.groups.set(suggestion.groupId, {
        ...group,
        suggestionCount: group.suggestionCount + 1,
      });
    }
  }

  async getGroups(): Promise<Group[]> {
    return [...this.groups.values()];
  }

  async getGroupById(id: string): Promise<Group | undefined> {
    return this.groups.get(id);
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    const upper = code.toUpperCase();
    return [...this.groups.values()].find((g) => g.inviteCode.toUpperCase() === upper);
  }

  async createGroup(
    data: Omit<Group, "id" | "createdAt" | "inviteCode" | "memberCount" | "suggestionCount" | "members">,
    memberIds: string[] = []
  ): Promise<Group> {
    const id = uuid();
    const joinedAt = new Date().toISOString();

    const ownerUser = this.users.get(data.ownerId);
    if (!ownerUser) throw new Error(`Owner user ${data.ownerId} not found`);

    const ownerMember: GroupMember = {
      userId: data.ownerId,
      groupId: id,
      role: "owner" as GroupRole,
      joinedAt,
      user: ownerUser,
    };

    const extraMembers: GroupMember[] = memberIds
      .filter((uid) => uid !== data.ownerId)
      .map((uid) => {
        const user = this.users.get(uid);
        if (!user) return null;
        return { userId: uid, groupId: id, role: "member" as GroupRole, joinedAt, user };
      })
      .filter((m): m is GroupMember => m !== null);

    const members = [ownerMember, ...extraMembers];
    const group: Group = {
      ...data,
      id,
      inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
      memberCount: members.length,
      suggestionCount: 0,
      members,
    };

    this.groups.set(id, group);
    return group;
  }

  async updateGroup(
    id: string,
    changes: Partial<Pick<Group, "name" | "description">>
  ): Promise<Group | undefined> {
    const group = this.groups.get(id);
    if (!group) return undefined;
    const updated = { ...group, ...changes };
    this.groups.set(id, updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    if (!this.groups.has(id)) return false;
    this.groups.delete(id);
    for (const [sid, s] of this.suggestions) {
      if (s.groupId === id) {
        this.suggestions.delete(sid);
        this.suggestionVotes.delete(sid);
      }
    }
    for (const [aid, a] of this.alchemyResults) {
      if (a.groupId === id) {
        this.alchemyResults.delete(aid);
        this.alchemyVotes.delete(aid);
      }
    }
    return true;
  }

  async joinGroup(groupId: string, userId: string): Promise<Group | undefined> {
    const group = this.groups.get(groupId);
    const user = this.users.get(userId);
    if (!group || !user) return undefined;
    if (group.members.some((m) => m.userId === userId)) return group;

    const newMember: GroupMember = {
      userId,
      groupId,
      role: "member",
      joinedAt: new Date().toISOString(),
      user,
    };
    const updated: Group = {
      ...group,
      memberCount: group.memberCount + 1,
      members: [...group.members, newMember],
    };
    this.groups.set(groupId, updated);
    return updated;
  }

  async leaveGroup(groupId: string, userId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) return false;
    if (!group.members.some((m) => m.userId === userId)) return false;
    const updated: Group = {
      ...group,
      memberCount: Math.max(0, group.memberCount - 1),
      members: group.members.filter((m) => m.userId !== userId),
    };
    this.groups.set(groupId, updated);
    return true;
  }

  async getSuggestions(groupId: string): Promise<Suggestion[]> {
    return [...this.suggestions.values()].filter((s) => s.groupId === groupId);
  }

  async getSuggestionById(id: string): Promise<Suggestion | undefined> {
    return this.suggestions.get(id);
  }

  async createSuggestion(
    data: Omit<Suggestion, "id" | "status" | "upvotes" | "downvotes" | "currentUserVote" | "createdAt" | "updatedAt" | "isOwnSuggestion">
  ): Promise<Suggestion> {
    const now = new Date().toISOString();
    const suggestion: Suggestion = {
      ...data,
      id: uuid(),
      status: "open",
      upvotes: 0,
      downvotes: 0,
      currentUserVote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.suggestions.set(suggestion.id, suggestion);

    const group = this.groups.get(data.groupId);
    if (group) {
      this.groups.set(data.groupId, { ...group, suggestionCount: group.suggestionCount + 1 });
    }
    return suggestion;
  }

  async updateSuggestion(
    id: string,
    changes: Partial<Pick<Suggestion, "title" | "description">>
  ): Promise<Suggestion | undefined> {
    const s = this.suggestions.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...changes, updatedAt: new Date().toISOString() };
    this.suggestions.set(id, updated);
    return updated;
  }

  async deleteSuggestion(id: string): Promise<boolean> {
    const s = this.suggestions.get(id);
    if (!s) return false;
    this.suggestions.delete(id);
    this.suggestionVotes.delete(id);
    const group = this.groups.get(s.groupId);
    if (group) {
      this.groups.set(s.groupId, { ...group, suggestionCount: Math.max(0, group.suggestionCount - 1) });
    }
    return true;
  }

  async voteSuggestion(
    id: string,
    userId: string,
    vote: VoteType | null
  ): Promise<Suggestion | undefined> {
    const s = this.suggestions.get(id);
    if (!s) return undefined;

    if (!this.suggestionVotes.has(id)) this.suggestionVotes.set(id, new Map());
    const voteMap = this.suggestionVotes.get(id)!;
    const previousVote = voteMap.get(userId) ?? null;
    const resolvedVote: VoteType | null = previousVote === vote ? null : vote;

    if (resolvedVote === null) voteMap.delete(userId);
    else voteMap.set(userId, resolvedVote);

    let upvotes = 0;
    let downvotes = 0;
    for (const v of voteMap.values()) {
      if (v === "up") upvotes++;
      else downvotes++;
    }

    const updated: Suggestion = { ...s, upvotes, downvotes, updatedAt: new Date().toISOString() };
    this.suggestions.set(id, updated);

    const group = this.groups.get(s.groupId);
    if (group && updated.downvotes >= decisionThreshold(group.memberCount)) {
      await this.deleteSuggestion(id);
      return undefined;
    }
    if (group && updated.upvotes >= decisionThreshold(group.memberCount)) {
      const accepted: Suggestion = { ...updated, status: "accepted" };
      this.suggestions.set(id, accepted);
      return accepted;
    }
    return updated;
  }

  async setSuggestionStatus(
    id: string,
    status: SuggestionStatus
  ): Promise<Suggestion | undefined> {
    const s = this.suggestions.get(id);
    if (!s) return undefined;
    if (status === "rejected") {
      await this.deleteSuggestion(id);
      return undefined;
    }
    const updated = { ...s, status, updatedAt: new Date().toISOString() };
    this.suggestions.set(id, updated);
    return updated;
  }

  async getAlchemyResults(groupId: string): Promise<AlchemyResult[]> {
    return [...this.alchemyResults.values()].filter((a) => a.groupId === groupId);
  }

  async getAlchemyResultById(id: string): Promise<AlchemyResult | undefined> {
    return this.alchemyResults.get(id);
  }

  async createAlchemyResult(
    data: Omit<AlchemyResult, "id" | "createdAt" | "upvotes" | "downvotes" | "currentUserVote">
  ): Promise<AlchemyResult> {
    const result: AlchemyResult = {
      ...data,
      id: uuid(),
      upvotes: 0,
      downvotes: 0,
      currentUserVote: null,
      createdAt: new Date().toISOString(),
    };
    this.alchemyResults.set(result.id, result);
    return result;
  }

  async voteAlchemy(
    id: string,
    userId: string,
    vote: VoteType | null
  ): Promise<AlchemyResult | undefined> {
    const a = this.alchemyResults.get(id);
    if (!a) return undefined;

    if (!this.alchemyVotes.has(id)) this.alchemyVotes.set(id, new Map());
    const voteMap = this.alchemyVotes.get(id)!;
    const previousVote = voteMap.get(userId) ?? null;
    const resolvedVote: VoteType | null = previousVote === vote ? null : vote;

    if (resolvedVote === null) voteMap.delete(userId);
    else voteMap.set(userId, resolvedVote);

    let upvotes = 0;
    let downvotes = 0;
    for (const v of voteMap.values()) {
      if (v === "up") upvotes++;
      else downvotes++;
    }

    const updated: AlchemyResult = { ...a, upvotes, downvotes };
    this.alchemyResults.set(id, updated);
    return updated;
  }

  async recordAction(data: {
    userId: string;
    groupId?: string | null;
    action: string;
    actionInformation: string;
  }): Promise<ActionLog> {
    const user = await this.getUserById(data.userId);
    const log: ActionLog = {
      id: uuid(),
      userId: data.userId,
      groupId: data.groupId ?? null,
      role: user?.role ?? "USER",
      action: data.action,
      actionInformation: data.actionInformation,
      createdAt: new Date().toISOString(),
    };
    this.actionLogs.unshift(log);
    this.detectSuspiciousBehaviour(data.userId);
    return log;
  }

  private detectSuspiciousBehaviour(userId: string): void {
    const cutoff = Date.now() - 15 * 60_000;
    const actionCount = this.actionLogs.filter(
      (log) =>
        log.userId === userId &&
        ["DELETE_SUGGESTION", "DELETE_GROUP", "VOTE_DOWN"].includes(log.action) &&
        new Date(log.createdAt).getTime() >= cutoff
    ).length;

    if (actionCount < 3) return;

    this.observationList.set(userId, {
      id: this.observationList.get(userId)?.id ?? uuid(),
      userId,
      reason: "High-risk destructive or negative action burst in 15 minutes",
      severity: actionCount >= 5 ? "high" : "medium",
      actionCount,
      createdAt: this.observationList.get(userId)?.createdAt ?? new Date().toISOString(),
      user: this.users.get(userId),
    });
  }

  async getActionLogs(): Promise<ActionLog[]> {
    return this.actionLogs;
  }

  async getObservationList(): Promise<ObservationEntry[]> {
    return [...this.observationList.values()];
  }

  async createObservation(data: Omit<ObservationEntry, "id" | "createdAt" | "user">): Promise<ObservationEntry> {
    const entry: ObservationEntry = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      user: this.users.get(data.userId),
    };
    this.observationList.set(data.userId, entry);
    return entry;
  }

  async getRecentActionLogs(userId: string, limit = 25): Promise<ActionLog[]> {
    return this.actionLogs.filter((log) => log.userId === userId).slice(0, limit);
  }

  async getTopContributors(): Promise<TopContributor[]> {
    const contributors = new Map<string, TopContributor>();
    for (const user of this.users.values()) {
      contributors.set(user.id, {
        userId: user.id,
        username: user.username,
        name: user.name,
        groupCount: 0,
        suggestionCount: 0,
        netScore: 0,
      });
    }

    for (const group of this.groups.values()) {
      for (const member of group.members) {
        const stat = contributors.get(member.userId);
        if (stat) stat.groupCount += 1;
      }
    }

    for (const suggestion of this.suggestions.values()) {
      const stat = contributors.get(suggestion.authorId);
      if (stat) {
        stat.suggestionCount += 1;
        stat.netScore += suggestion.upvotes - suggestion.downvotes;
      }
    }

    return [...contributors.values()]
      .sort((a, b) => b.netScore - a.netScore || b.suggestionCount - a.suggestionCount)
      .slice(0, 20);
  }

  // ============ Chat Methods ============

  async getConversations(groupId: string): Promise<ChatConversation[]> {
    return [...this.conversations.values()].filter((conv) => conv.groupId === groupId);
  }

  async getConversationById(id: string): Promise<ChatConversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(
    data: Omit<ChatConversation, "id" | "createdAt" | "updatedAt" | "messageCount" | "messages">
  ): Promise<ChatConversation> {
    const conversation: ChatConversation = {
      ...data,
      id: uuid(),
      isGroupChat: Boolean(data.isGroupChat),
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(conversation.id, conversation);
    this.conversationMessages.set(conversation.id, []);
    return conversation;
  }

  async ensureGroupChat(groupId: string): Promise<ChatConversation> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    const members = group.members
      .map((member) => this.users.get(member.userId))
      .filter((user): user is User => Boolean(user))
      .map((user) => this.sanitizeUser(user));

    const existing = [...this.conversations.values()].find(
      (conversation) => conversation.groupId === groupId && conversation.isGroupChat
    );

    if (existing) {
      const updated = {
        ...existing,
        name: group.name,
        members,
        updatedAt: new Date().toISOString(),
      };
      this.conversations.set(existing.id, updated);
      return updated;
    }

    return this.createConversation({
      groupId,
      name: group.name,
      isGroupChat: true,
      members,
    });
  }

  async getConversationMessages(conversationId: string, limit?: number): Promise<ChatMessage[]> {
    const messageIds = this.conversationMessages.get(conversationId) || [];
    let messages = messageIds
      .map((id) => this.chatMessages.get(id))
      .filter((msg): msg is ChatMessage => msg !== undefined);

    if (limit) {
      messages = messages.slice(-limit);
    }

    // Enrich messages with user data
    return messages.map((msg) => ({
      ...msg,
      user: this.users.get(msg.userId),
    }));
  }

  async sendChatMessage(
    data: Omit<ChatMessage, "id" | "createdAt">
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    this.chatMessages.set(message.id, message);

    const messageIds = this.conversationMessages.get(data.conversationId) || [];
    messageIds.push(message.id);
    this.conversationMessages.set(data.conversationId, messageIds);

    // Update conversation messageCount
    const conversation = this.conversations.get(data.conversationId);
    if (conversation) {
      conversation.messageCount = messageIds.length;
      conversation.updatedAt = new Date().toISOString();
    }

    return message;
  }

  async deleteChatMessage(messageId: string, userId: string): Promise<boolean> {
    const message = this.chatMessages.get(messageId);
    if (!message || message.userId !== userId) {
      return false;
    }

    this.chatMessages.delete(messageId);
    const messageIds = this.conversationMessages.get(message.conversationId) || [];
    const index = messageIds.indexOf(messageId);
    if (index > -1) {
      messageIds.splice(index, 1);
    }

    // Update conversation messageCount
    const conversation = this.conversations.get(message.conversationId);
    if (conversation) {
      conversation.messageCount = messageIds.length;
      conversation.updatedAt = new Date().toISOString();
    }

    return true;
  }

  async reset(): Promise<void> {
    this.users.clear();
    this.groups.clear();
    this.suggestions.clear();
    this.alchemyResults.clear();
    this.suggestionVotes.clear();
    this.alchemyVotes.clear();
    this.conversations.clear();
    this.chatMessages.clear();
    this.conversationMessages.clear();
    this.actionLogs = [];
    this.observationList.clear();
    this.refreshTokens.clear();
  }

  async counts(): Promise<{ users: number; groups: number; suggestions: number; alchemyResults: number }> {
    return {
      users: this.users.size,
      groups: this.groups.size,
      suggestions: this.suggestions.size,
      alchemyResults: this.alchemyResults.size,
    };
  }
}

//  Store Factory 

export interface StoreFactoryConfig {
  useMssql?: boolean;
  mssqlServer?: string;
  mssqlDatabase?: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
}

function envBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

export async function createStore(config?: StoreFactoryConfig): Promise<IStore> {
  const useMssql = config?.useMssql ?? process.env.USE_DATABASE !== "false";

  console.log(`createStore: useMssql=${useMssql}`);

  if (useMssql) {
    try {
      const { MSSQLStore } = await import("./mssql-store.js");

      const rawServer = config?.mssqlServer ?? process.env.DB_SERVER ?? "BEANTOP\\SQLEXPRESS";

      // Support both "HOST\INSTANCE" and "HOST,PORT" formats
      let server: string;
      let instanceName: string | undefined;
      let port: number | undefined;

      if (rawServer.includes(",")) {
        const [host, portStr] = rawServer.split(",");
        server = host;
        port = parseInt(portStr, 10);
      } else {
        const [host, instance] = rawServer.split("\\");
        server = host;
        instanceName = instance;
      }

      const database = config?.mssqlDatabase ?? process.env.DB_DATABASE ?? "SuggestIt";
      const user = process.env.DB_USER_ID ?? "sa";
      const password = process.env.DB_PASSWORD ?? "";
      const encrypt = config?.options?.encrypt ?? envBoolean("DB_ENCRYPT", false);
      const trustServerCertificate =
        config?.options?.trustServerCertificate ?? envBoolean("DB_TRUST_SERVER_CERTIFICATE", true);

      console.log(`Connecting to ${server}\\${instanceName} -> ${database} as ${user}`);

      const mssqlStore = new MSSQLStore({
        server,
        port,
        instanceName,
        database,
        user,
        password,
        options: { encrypt, trustServerCertificate },
      });
      await mssqlStore.initialize();

      console.log(" Using MSSQL Store");
      return mssqlStore;
    } catch (error) {
      console.error("MSSQL connection failed:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  console.warn(" Using AsyncMemoryStore because USE_DATABASE=false. Data will not persist.");
  return new AsyncMemoryStore();
}
