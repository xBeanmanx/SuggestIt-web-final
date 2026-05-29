// ============================================================
// SuggestIt - GraphQL Client
//
// A lightweight fetch-based GraphQL client - no Apollo Client
// dependency required on the frontend.
//
// Features:
//   • Typed request/response helpers
//   • Offline detection + mutation queue (Silver requirement)
//   • WebSocket hook for live generator push events (Silver)
// ============================================================

import type {
  User,
  Group,
  Suggestion,
  AlchemyResult,
  ActionLog,
  ObservationEntry,
  SuggestionStatus,
  AuthPayload,
  LoginChallenge,
} from "../types";

// ── Config ────────────────────────────────────────────────────

function defaultServerBase(protocol: "http" | "ws"): string {
  if (typeof window === "undefined") {
    return protocol === "http" ? "http://localhost:4000" : "ws://localhost:4000";
  }

  if (!import.meta.env.DEV) {
    const scheme =
      protocol === "http"
        ? window.location.protocol === "https:" ? "https" : "http"
        : window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}`;
  }

  const scheme =
    protocol === "http"
      ? window.location.protocol === "https:" ? "https" : "http"
      : window.location.protocol === "https:" ? "wss" : "ws";

  return `${scheme}://${window.location.hostname}:4000`;
}

export const GQL_ENDPOINT =
  (import.meta.env.VITE_GQL_ENDPOINT as string | undefined) ??
  `${defaultServerBase("http")}/graphql`;

export const WS_ENDPOINT =
  (import.meta.env.VITE_WS_ENDPOINT as string | undefined) ??
  `${defaultServerBase("ws")}/ws`;

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Core fetch helper ─────────────────────────────────────────

export interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  userId?: string
): Promise<GqlResponse<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-user-id"] = userId;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Network error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<GqlResponse<T>>;
}

// ── Offline mutation queue ────────────────────────────────────
// Mutations issued while offline are stored in localStorage and
// replayed in order once connectivity is restored.

const QUEUE_KEY = "suggestit_offline_queue";

interface QueuedMutation {
  id: string;
  query: string;
  variables: Record<string, unknown>;
  userId?: string;
  enqueuedAt: string;
}

function loadQueue(): QueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedMutation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueueMutation(
  query: string,
  variables: Record<string, unknown>,
  userId?: string
): void {
  const q = loadQueue();
  q.push({
    id: crypto.randomUUID(),
    query,
    variables,
    userId,
    enqueuedAt: new Date().toISOString(),
  });
  saveQueue(q);
}

export async function flushOfflineQueue(): Promise<number> {
  const q = loadQueue();
  if (q.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedMutation[] = [];

  for (const item of q) {
    try {
      await gqlFetch(item.query, item.variables, item.userId);
      flushed++;
    } catch {
      // If still offline, keep the rest in the queue
      remaining.push(item);
      break;
    }
  }

  saveQueue(remaining);
  return flushed;
}

export function getQueueLength(): number {
  return loadQueue().length;
}

// ── Pagination types ──────────────────────────────────────────

export interface PaginatedSuggestions {
  items: Suggestion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ── Fragment strings ──────────────────────────────────────────

const SUGGESTION_FIELDS = `
  id groupId authorId title description status
  upvotes downvotes currentUserVote createdAt updatedAt isOwnSuggestion
`;

const GROUP_FIELDS = `
  id name description inviteCode ownerId createdAt memberCount suggestionCount
  members { userId role joinedAt user { id name email avatarUrl } }
`;

const ALCHEMY_FIELDS = `
  id groupId title description sourceIds depth createdAt upvotes downvotes currentUserVote
`;

// ── Queries ───────────────────────────────────────────────────

export const QUERIES = {
  SUGGESTIONS: /* GraphQL */ `
    query Suggestions(
      $groupId: ID!
      $page: Int
      $pageSize: Int
      $filter: SuggestionsFilter
    ) {
      suggestions(groupId: $groupId, page: $page, pageSize: $pageSize, filter: $filter) {
        items { ${SUGGESTION_FIELDS} }
        total page pageSize totalPages hasNextPage hasPrevPage
      }
    }
  `,

  SUGGESTION: /* GraphQL */ `
    query Suggestion($id: ID!) { suggestion(id: $id) { ${SUGGESTION_FIELDS} } }
  `,

  GROUPS: /* GraphQL */ `
    query Groups { groups { ${GROUP_FIELDS} } }
  `,

  GROUP: /* GraphQL */ `
    query Group($id: ID!) { group(id: $id) { ${GROUP_FIELDS} } }
  `,

  GROUP_BY_INVITE: /* GraphQL */ `
    query GroupByInviteCode($inviteCode: String!) {
      groupByInviteCode(inviteCode: $inviteCode) { ${GROUP_FIELDS} }
    }
  `,

  USERS: /* GraphQL */ `
    query Users { users { id username name email avatarUrl createdAt role permissions } }
  `,

  ALCHEMY_RESULTS: /* GraphQL */ `
    query AlchemyResults($groupId: ID!) {
      alchemyResults(groupId: $groupId) { ${ALCHEMY_FIELDS} }
    }
  `,

  GROUP_STATS: /* GraphQL */ `
    query GroupStats($groupId: ID!) {
      groupStats(groupId: $groupId) {
        groupId totalSuggestions
        statusBreakdown { open under_review accepted rejected }
        totalUpvotes totalDownvotes avgUpvotesPerSuggestion
        mostActiveAuthorId alchemyCount
      }
    }
  `,

  GLOBAL_STATS: /* GraphQL */ `
    query GlobalStats {
      globalStats {
        totalUsers totalGroups totalSuggestions totalAlchemyResults
        overallUpvotes overallDownvotes
      }
    }
  `,

  ACTION_LOGS: /* GraphQL */ `
    query ActionLogs {
      actionLogs {
        id userId groupId role action actionInformation createdAt
      }
    }
  `,

  OBSERVATION_LIST: /* GraphQL */ `
    query ObservationList {
      observationList {
        id userId reason severity actionCount createdAt
        user { id name email avatarUrl createdAt role permissions }
      }
    }
  `,

  CONVERSATIONS: /* GraphQL */ `
    query Conversations($groupId: ID!) {
      conversations(groupId: $groupId) {
        id name groupId createdAt updatedAt messageCount
        members { id name email avatarUrl }
      }
    }
  `,

  CONVERSATION: /* GraphQL */ `
    query Conversation($id: ID!) {
      conversation(id: $id) {
        id name groupId createdAt updatedAt messageCount
        members { id name email avatarUrl }
        messages { id conversationId userId content createdAt user { id name email avatarUrl } }
      }
    }
  `,

  CONVERSATION_MESSAGES: /* GraphQL */ `
    query ConversationMessages($conversationId: ID!, $limit: Int) {
      conversationMessages(conversationId: $conversationId, limit: $limit) {
        id conversationId userId content createdAt
        user { id name email avatarUrl }
      }
    }
  `,
} as const;

// ── Mutations ─────────────────────────────────────────────────

export const MUTATIONS = {
  LOGIN: /* GraphQL */ `
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        challengeId
        email
        expiresAt
        delivery
        demoCode
      }
    }
  `,

  VERIFY_LOGIN_CODE: /* GraphQL */ `
    mutation VerifyLoginCode($challengeId: String!, $code: String!) {
      verifyLoginCode(challengeId: $challengeId, code: $code) {
        accessToken
        user { id username name email avatarUrl createdAt role permissions }
      }
    }
  `,

  REGISTER: /* GraphQL */ `
    mutation Register($input: RegisterInput!) {
      register(input: $input) {
        accessToken
        user { id username name email avatarUrl createdAt role permissions }
      }
    }
  `,

  REFRESH_TOKEN: /* GraphQL */ `
    mutation RefreshToken {
      refreshToken {
        accessToken
        user { id username name email avatarUrl createdAt role permissions }
      }
    }
  `,

  LOGOUT: /* GraphQL */ `
    mutation Logout { logout }
  `,

  REQUEST_MAGIC_LINK: /* GraphQL */ `
    mutation RequestMagicLink($email: String!) { requestMagicLink(email: $email) }
  `,

  VERIFY_MAGIC_LINK: /* GraphQL */ `
    mutation VerifyMagicLink($token: String!) {
      verifyMagicLink(token: $token) {
        accessToken
        user { id username name email avatarUrl createdAt role permissions }
      }
    }
  `,

  REQUEST_PASSWORD_RESET: /* GraphQL */ `
    mutation RequestPasswordReset($email: String!) { requestPasswordReset(email: $email) }
  `,

  RESET_PASSWORD: /* GraphQL */ `
    mutation ResetPassword($token: String!, $newPassword: String!) {
      resetPassword(token: $token, newPassword: $newPassword)
    }
  `,

  SET_USER_ROLE: /* GraphQL */ `
    mutation SetUserRole($userId: ID!, $role: AppRoleName!) {
      setUserRole(userId: $userId, role: $role) {
        id username name email avatarUrl createdAt role permissions
      }
    }
  `,

  CREATE_SUGGESTION: /* GraphQL */ `
    mutation CreateSuggestion($input: CreateSuggestionInput!) {
      createSuggestion(input: $input) { ${SUGGESTION_FIELDS} }
    }
  `,

  UPDATE_SUGGESTION: /* GraphQL */ `
    mutation UpdateSuggestion($id: ID!, $input: UpdateSuggestionInput!, $requesterId: ID!) {
      updateSuggestion(id: $id, input: $input, requesterId: $requesterId) { ${SUGGESTION_FIELDS} }
    }
  `,

  DELETE_SUGGESTION: /* GraphQL */ `
    mutation DeleteSuggestion($id: ID!, $requesterId: ID!) {
      deleteSuggestion(id: $id, requesterId: $requesterId)
    }
  `,

  VOTE_SUGGESTION: /* GraphQL */ `
    mutation VoteSuggestion($id: ID!, $userId: ID!, $vote: VoteType) {
      voteSuggestion(id: $id, userId: $userId, vote: $vote) { ${SUGGESTION_FIELDS} }
    }
  `,

  SET_STATUS: /* GraphQL */ `
    mutation SetSuggestionStatus($id: ID!, $status: SuggestionStatus!, $requesterId: ID!) {
      setSuggestionStatus(id: $id, status: $status, requesterId: $requesterId) { ${SUGGESTION_FIELDS} }
    }
  `,

  CREATE_GROUP: /* GraphQL */ `
    mutation CreateGroup($input: CreateGroupInput!) {
      createGroup(input: $input) { ${GROUP_FIELDS} }
    }
  `,

  UPDATE_GROUP: /* GraphQL */ `
    mutation UpdateGroup($id: ID!, $input: UpdateGroupInput!) {
      updateGroup(id: $id, input: $input) { ${GROUP_FIELDS} }
    }
  `,

  DELETE_GROUP: /* GraphQL */ `
    mutation DeleteGroup($id: ID!) { deleteGroup(id: $id) }
  `,

  JOIN_GROUP: /* GraphQL */ `
    mutation JoinGroup($inviteCode: String!, $userId: ID!) {
      joinGroup(inviteCode: $inviteCode, userId: $userId) { ${GROUP_FIELDS} }
    }
  `,

  LEAVE_GROUP: /* GraphQL */ `
    mutation LeaveGroup($groupId: ID!, $userId: ID!) {
      leaveGroup(groupId: $groupId, userId: $userId)
    }
  `,

  COMBINE_IDEAS: /* GraphQL */ `
    mutation CombineIdeas($sourceId1: ID!, $sourceId2: ID!, $groupId: ID!) {
      combineIdeas(sourceId1: $sourceId1, sourceId2: $sourceId2, groupId: $groupId) {
        ${ALCHEMY_FIELDS}
      }
    }
  `,

  VOTE_ALCHEMY: /* GraphQL */ `
    mutation VoteAlchemy($id: ID!, $userId: ID!, $vote: VoteType) {
      voteAlchemy(id: $id, userId: $userId, vote: $vote) { ${ALCHEMY_FIELDS} }
    }
  `,

  CREATE_CHAT_CONVERSATION: /* GraphQL */ `
    mutation CreateChatConversation($input: CreateChatConversationInput!) {
      createChatConversation(input: $input) {
        id name groupId createdAt updatedAt messageCount
        members { id name email avatarUrl }
      }
    }
  `,

  SEND_CHAT_MESSAGE: /* GraphQL */ `
    mutation SendChatMessage($input: SendChatMessageInput!) {
      sendChatMessage(input: $input) {
        id conversationId userId content createdAt
        user { id name email avatarUrl }
      }
    }
  `,

  DELETE_CHAT_MESSAGE: /* GraphQL */ `
    mutation DeleteChatMessage($id: ID!, $userId: ID!) {
      deleteChatMessage(id: $id, userId: $userId)
    }
  `,
} as const;

// ── Typed API functions ───────────────────────────────────────

export async function fetchSuggestions(
  groupId: string,
  page: number,
  pageSize: number,
  userId?: string,
  filter?: { status?: SuggestionStatus; authorId?: string }
): Promise<PaginatedSuggestions> {
  const res = await gqlFetch<{ suggestions: PaginatedSuggestions }>(
    QUERIES.SUGGESTIONS,
    { groupId, page, pageSize, filter },
    userId
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.suggestions;
}

export async function fetchGroups(userId?: string): Promise<Group[]> {
  const res = await gqlFetch<{ groups: Group[] }>(QUERIES.GROUPS, {}, userId);
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.groups;
}

export async function fetchUsers(): Promise<User[]> {
  const res = await gqlFetch<{ users: User[] }>(QUERIES.USERS);
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.users;
}

export async function loginUser(input: {
  username: string;
  password: string;
}): Promise<LoginChallenge> {
  const res = await gqlFetch<{ login: LoginChallenge }>(MUTATIONS.LOGIN, { input });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.login;
}

export async function verifyLoginCode(challengeId: string, code: string): Promise<AuthPayload> {
  const res = await gqlFetch<{ verifyLoginCode: AuthPayload }>(
    MUTATIONS.VERIFY_LOGIN_CODE,
    { challengeId, code }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  setAccessToken(res.data!.verifyLoginCode.accessToken);
  return res.data!.verifyLoginCode;
}

export async function registerUser(input: {
  username: string;
  email: string;
  password: string;
  name: string;
}): Promise<AuthPayload> {
  const res = await gqlFetch<{ register: AuthPayload }>(MUTATIONS.REGISTER, { input });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  setAccessToken(res.data!.register.accessToken);
  return res.data!.register;
}

export async function refreshSession(): Promise<AuthPayload | null> {
  const res = await gqlFetch<{ refreshToken: AuthPayload }>(MUTATIONS.REFRESH_TOKEN);
  if (res.errors?.length) return null;
  setAccessToken(res.data!.refreshToken.accessToken);
  return res.data!.refreshToken;
}

export async function logoutUser(): Promise<void> {
  try {
    await gqlFetch<{ logout: boolean }>(MUTATIONS.LOGOUT);
  } finally {
    setAccessToken(null);
  }
}

export async function requestMagicLink(email: string): Promise<string> {
  const res = await gqlFetch<{ requestMagicLink: string }>(MUTATIONS.REQUEST_MAGIC_LINK, { email });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.requestMagicLink;
}

export async function verifyMagicLink(token: string): Promise<AuthPayload> {
  const res = await gqlFetch<{ verifyMagicLink: AuthPayload }>(MUTATIONS.VERIFY_MAGIC_LINK, { token });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  setAccessToken(res.data!.verifyMagicLink.accessToken);
  return res.data!.verifyMagicLink;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const res = await gqlFetch<{ requestPasswordReset: string }>(MUTATIONS.REQUEST_PASSWORD_RESET, { email });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.requestPasswordReset;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const res = await gqlFetch<{ resetPassword: boolean }>(MUTATIONS.RESET_PASSWORD, { token, newPassword });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.resetPassword;
}

export async function setUserRole(userId: string, role: "ADMIN" | "USER"): Promise<User> {
  const res = await gqlFetch<{ setUserRole: User }>(MUTATIONS.SET_USER_ROLE, { userId, role });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.setUserRole;
}

export async function fetchAlchemyResults(groupId: string, userId?: string): Promise<AlchemyResult[]> {
  const res = await gqlFetch<{ alchemyResults: AlchemyResult[] }>(
    QUERIES.ALCHEMY_RESULTS,
    { groupId },
    userId
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.alchemyResults;
}

export async function fetchGroupStats(groupId: string) {
  const res = await gqlFetch<{ groupStats: GroupStats }>(QUERIES.GROUP_STATS, { groupId });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.groupStats;
}

export async function fetchGlobalStats() {
  const res = await gqlFetch<{ globalStats: GlobalStats }>(QUERIES.GLOBAL_STATS);
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.globalStats;
}

export async function fetchActionLogs(): Promise<ActionLog[]> {
  const res = await gqlFetch<{ actionLogs: ActionLog[] }>(QUERIES.ACTION_LOGS);
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.actionLogs;
}

export async function fetchObservationList(): Promise<ObservationEntry[]> {
  const res = await gqlFetch<{ observationList: ObservationEntry[] }>(QUERIES.OBSERVATION_LIST);
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.observationList;
}

// ── Chat API functions ────────────────────────────────────────

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

export async function fetchConversations(groupId: string): Promise<ChatConversation[]> {
  const res = await gqlFetch<{ conversations: ChatConversation[] }>(
    QUERIES.CONVERSATIONS,
    { groupId }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.conversations;
}

export async function fetchConversation(id: string): Promise<ChatConversation | null> {
  const res = await gqlFetch<{ conversation: ChatConversation | null }>(
    QUERIES.CONVERSATION,
    { id }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.conversation;
}

export async function fetchConversationMessages(
  conversationId: string,
  limit?: number
): Promise<ChatMessage[]> {
  const res = await gqlFetch<{ conversationMessages: ChatMessage[] }>(
    QUERIES.CONVERSATION_MESSAGES,
    { conversationId, limit }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.conversationMessages;
}

export async function createChatConversation(input: {
  groupId: string;
  memberIds: string[];
  name?: string;
}): Promise<ChatConversation> {
  const res = await gqlFetch<{ createChatConversation: ChatConversation }>(
    MUTATIONS.CREATE_CHAT_CONVERSATION,
    { input }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.createChatConversation;
}

export async function sendChatMessage(input: {
  conversationId: string;
  userId: string;
  content: string;
}): Promise<ChatMessage> {
  const res = await gqlFetch<{ sendChatMessage: ChatMessage }>(
    MUTATIONS.SEND_CHAT_MESSAGE,
    { input }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.sendChatMessage;
}

export async function deleteChatMessage(id: string, userId: string): Promise<boolean> {
  const res = await gqlFetch<{ deleteChatMessage: boolean }>(
    MUTATIONS.DELETE_CHAT_MESSAGE,
    { id, userId }
  );
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data!.deleteChatMessage;
}

export interface GroupStats {
  groupId: string;
  totalSuggestions: number;
  statusBreakdown: { open: number; under_review: number; accepted: number; rejected: number };
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
