// ============================================================
// SuggestIt - Domain Types
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  avatarUrl?: string;
  createdAt: string;
  role?: "ADMIN" | "USER";
  permissions?: string[];
}

export interface AuthPayload {
  accessToken: string;
  user: User;
}

export interface LoginChallenge {
  challengeId: string;
  email: string;
  expiresAt: string;
  delivery: string;
  demoCode?: string | null;
}

export type GroupRole = "owner" | "admin" | "member";

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

export type VoteType = "up" | "down";

export interface Vote {
  id: string;
  suggestionId: string;
  userId: string;
  type: VoteType;
  createdAt: string;
}

export type SuggestionStatus = "open" | "under_review" | "accepted" | "rejected";

export interface Suggestion {
  id: string;
  groupId: string;
  authorId: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: number;
  downvotes: number;
  currentUserVote?: VoteType | null;
  createdAt: string;
  updatedAt: string;
  isOwnSuggestion?: boolean;
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

export interface ActionLog {
  id: string;
  userId: string;
  groupId?: string | null;
  role: "ADMIN" | "USER";
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
  members: User[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

export type ValidationErrors<T> = Partial<Record<keyof T, string>>;
