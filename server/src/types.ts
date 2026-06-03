// ============================================================
// SuggestIt Server  Domain Types
// ============================================================

export type GroupRole = "owner" | "admin" | "member";
export type AppRoleName = "ADMIN" | "USER";
export type VoteType = "up" | "down";
export type SuggestionStatus = "open" | "under_review" | "accepted" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatarUrl?: string;
  createdAt: string;
  role?: AppRoleName;
  permissions?: string[];
  passwordHash?: string;
}

export interface AuthPayload {
  accessToken: string;
  user: User;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  name: AppRoleName;
  description: string;
}

export interface Permission {
  id: string;
  code: string;
  description: string;
}

export interface ActionLog {
  id: string;
  userId: string;
  groupId?: string | null;
  role: AppRoleName;
  action: string;
  actionInformation: string;
  createdAt: string;
}

export interface ObservationEntry {
  id: string;
  userId: string;
  reason: string;
  severity: "low" | "medium" | "high";
  actionCount: number;
  createdAt: string;
  user?: User;
}

export interface GroupMember {
  userId: string;
  groupId: string;
  role: GroupRole;
  joinedAt: string;
  user: User;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
  memberCount: number;
  suggestionCount: number;
  members: GroupMember[];
}

export interface Suggestion {
  id: string;
  groupId: string;
  authorId: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: number;
  downvotes: number;
  /** Per-user vote  stored per userId in a separate votes map */
  currentUserVote?: VoteType | null;
  createdAt: string;
  updatedAt: string;
  isOwnSuggestion?: boolean;
}

export interface SuggestionVote {
  suggestionId: string;
  userId: string;
  vote: VoteType;
}

export interface AlchemyResult {
  id: string;
  groupId: string;
  title: string;
  description: string;
  sourceIds: [string, string];
  depth: number;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  currentUserVote?: VoteType | null;
}

export interface Context {
  store: IStore;
  userId?: string;
  role?: AppRoleName;
  permissions?: string[];
  refreshToken?: string;
  setRefreshTokenCookie?: (token: string, expiresAt: Date) => void;
  clearRefreshTokenCookie?: () => void;
}

export interface AlchemyVote {
  alchemyId: string;
  userId: string;
  vote: VoteType;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  user?: User;
  content: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  name: string | null;
  groupId: string;
  isGroupChat?: boolean;
  members: User[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

export interface StatisticsTotals {
  totalUsers: number;
  totalGroups: number;
  totalSuggestions: number;
  totalAlchemyResults: number;
  totalUpvotes: number;
  totalDownvotes: number;
  accepted: number;
  pending: number;
  rejected: number;
}

export interface StatisticsGroupSummary {
  groupId: string;
  name: string;
  memberCount: number;
  totalSuggestions: number;
  accepted: number;
  pending: number;
  totalUpvotes: number;
}

export interface StatisticsContributor {
  userId: string;
  name: string;
  suggestionCount: number;
  acceptedCount: number;
  totalUpvotes: number;
  acceptanceRate: number;
}

export interface StatisticsTopSuggestion {
  id: string;
  title: string;
  groupId: string;
  groupName: string;
  status: SuggestionStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  isOwnSuggestion: boolean;
}

export interface StatisticsSnapshot {
  scope: "user" | "admin";
  totals: StatisticsTotals;
  statusBreakdown: StatusBreakdown;
  groups: StatisticsGroupSummary[];
  contributors: StatisticsContributor[];
  topSuggestions: StatisticsTopSuggestion[];
}

//  IStore interface (adapter contract) 

export interface IStore {
  // Users
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: Omit<User, "id" | "createdAt" | "passwordHash"> & { password?: string; passwordHash?: string }): Promise<User>;
  validateUserPassword(username: string, password: string): Promise<User | undefined>;
  updateUserPassword(userId: string, password: string): Promise<void>;
  login(data: { email: string; name: string; requestedRole?: AppRoleName }): Promise<User>;
  setUserRole(userId: string, role: AppRoleName): Promise<User | undefined>;
  getRoles(): Promise<Role[]>;
  getPermissions(): Promise<Permission[]>;

  // Auth sessions
  createRefreshToken(record: RefreshTokenRecord): Promise<void>;
  getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeUserRefreshTokens(userId: string): Promise<void>;

  // Groups
  getGroups(): Promise<Group[]>;
  getGroupById(id: string): Promise<Group | undefined>;
  getGroupByInviteCode(code: string): Promise<Group | undefined>;
  createGroup(
    data: Omit<Group, "id" | "createdAt" | "inviteCode" | "memberCount" | "suggestionCount" | "members">,
    memberIds?: string[]
  ): Promise<Group>;
  updateGroup(id: string, changes: Partial<Pick<Group, "name" | "description">>): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<boolean>;
  joinGroup(groupId: string, userId: string): Promise<Group | undefined>;
  leaveGroup(groupId: string, userId: string): Promise<boolean>;

  // Suggestions
  getSuggestions(groupId: string): Promise<Suggestion[]>;
  getSuggestionById(id: string): Promise<Suggestion | undefined>;
  createSuggestion(
    data: Omit<Suggestion, "id" | "status" | "upvotes" | "downvotes" | "currentUserVote" | "createdAt" | "updatedAt" | "isOwnSuggestion">
  ): Promise<Suggestion>;
  updateSuggestion(id: string, changes: Partial<Pick<Suggestion, "title" | "description">>): Promise<Suggestion | undefined>;
  deleteSuggestion(id: string): Promise<boolean>;
  voteSuggestion(id: string, userId: string, vote: VoteType | null): Promise<Suggestion | undefined>;
  setSuggestionStatus(id: string, status: SuggestionStatus): Promise<Suggestion | undefined>;

  // Alchemy
  getAlchemyResults(groupId: string): Promise<AlchemyResult[]>;
  getAlchemyResultById(id: string): Promise<AlchemyResult | undefined>;
  createAlchemyResult(
    data: Omit<AlchemyResult, "id" | "createdAt" | "upvotes" | "downvotes" | "currentUserVote">
  ): Promise<AlchemyResult>;
  voteAlchemy(id: string, userId: string, vote: VoteType | null): Promise<AlchemyResult | undefined>;

  // Chat
  getConversations(groupId: string): Promise<ChatConversation[]>;
  getConversationById(id: string): Promise<ChatConversation | undefined>;
  createConversation(
    data: Omit<ChatConversation, "id" | "createdAt" | "updatedAt" | "messageCount" | "messages">
  ): Promise<ChatConversation>;
  ensureGroupChat(groupId: string): Promise<ChatConversation>;
  getConversationMessages(conversationId: string, limit?: number): Promise<ChatMessage[]>;
  sendChatMessage(
    data: Omit<ChatMessage, "id" | "createdAt">
  ): Promise<ChatMessage>;
  deleteChatMessage(messageId: string, userId: string): Promise<boolean>;

  // Utility
  recordAction(data: {
    userId: string;
    groupId?: string | null;
    action: string;
    actionInformation: string;
  }): Promise<ActionLog>;
  getActionLogs(): Promise<ActionLog[]>;
  getObservationList(): Promise<ObservationEntry[]>;
  createObservation(data: Omit<ObservationEntry, "id" | "createdAt" | "user">): Promise<ObservationEntry>;
  getRecentActionLogs(userId: string, limit?: number): Promise<ActionLog[]>;
  getTopContributors(options?: { optimized?: boolean }): Promise<TopContributor[]>;
  reset(): Promise<void>;
  counts(): Promise<{ users: number; groups: number; suggestions: number; alchemyResults: number }>;
}

//  Pagination 

export interface PaginatedSuggestions {
  items: Suggestion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

//  Stats 

export interface StatusBreakdown {
  open: number;
  under_review: number;
  accepted: number;
  rejected: number;
}

export interface GroupStats {
  groupId: string;
  totalSuggestions: number;
  statusBreakdown: StatusBreakdown;
  totalUpvotes: number;
  totalDownvotes: number;
  avgUpvotesPerSuggestion: number;
  mostActiveAuthorId?: string | null;
  alchemyCount: number;
}

export interface GlobalStats {
  totalUsers: number;
  totalGroups: number;
  totalSuggestions: number;
  totalAlchemyResults: number;
  overallUpvotes: number;
  overallDownvotes: number;
}

export interface TopContributor {
  userId: string;
  username: string;
  name: string;
  groupCount: number;
  suggestionCount: number;
  netScore: number;
}
