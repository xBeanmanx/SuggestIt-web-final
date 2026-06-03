// ============================================================
// SuggestIt Server Tests  Helpers & Test Utilities
// ============================================================

import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema";
import { resolvers } from "../resolvers";
import { AsyncMemoryStore } from "../store-factory";
import type { Context, User, Group, GroupMember, Suggestion } from "../types";

//  Test Server Setup 

export interface TestEnv {
  server: ApolloServer<Context>;
  store: AsyncMemoryStore;
  execute: (query: string, variables?: Record<string, unknown>, context?: Partial<Context>) => Promise<unknown>;
}

export function createTestServer(): TestEnv {
  const store = new AsyncMemoryStore();

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const inferUserId = async (query: string, variables?: Record<string, unknown>): Promise<string | undefined> => {
    const input = variables?.input as Record<string, unknown> | undefined;

    if (typeof variables?.userId === "string") return variables.userId;
    if (typeof variables?.requesterId === "string") return variables.requesterId;
    if (typeof input?.authorId === "string") return input.authorId;
    if (Array.isArray(input?.memberIds) && typeof input.memberIds[0] === "string") return input.memberIds[0];

    if (typeof variables?.id === "string") {
      if (query.includes("updateGroup") || query.includes("deleteGroup")) {
        const ownerId = (await store.getGroupById(variables.id))?.ownerId;
        if (ownerId) return ownerId;
      }
      if (query.includes("updateSuggestion") || query.includes("deleteSuggestion")) {
        const authorId = (await store.getSuggestionById(variables.id))?.authorId;
        if (authorId) return authorId;
      }
      if (query.includes("voteAlchemy")) {
        const alchemy = await store.getAlchemyResultById(variables.id);
        if (alchemy) return (await store.getGroupById(alchemy.groupId))?.ownerId;
      }
    }

    if (typeof variables?.groupId === "string") {
      const ownerId = (await store.getGroupById(variables.groupId))?.ownerId;
      if (ownerId) return ownerId;
    }

    const needsAuthenticatedFallback = [
      "createGroup",
      "updateGroup",
      "deleteGroup",
      "joinGroup",
      "leaveGroup",
      "createSuggestion",
      "updateSuggestion",
      "deleteSuggestion",
      "voteSuggestion",
      "setSuggestionStatus",
      "combineIdeas",
      "voteAlchemy",
    ].some((operation) => query.includes(operation));

    if (!needsAuthenticatedFallback) return undefined;

    const existingUser = (await store.getUsers())[0];
    if (existingUser) return existingUser.id;

    const fallbackUser = await store.createUser({
      username: "test_context_user",
      email: "test-context-user@test.local",
      name: "Test Context User",
      password: "password123",
      role: "USER",
      permissions: ["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS"],
    });
    return fallbackUser.id;
  };

  const execute = async (query: string, variables?: Record<string, unknown>, context?: Partial<Context>) => {
    const userId = context && "userId" in context ? context.userId : await inferUserId(query, variables);
    return server.executeOperation(
      { query, variables },
      {
        contextValue: { store, userId, ...context },
      }
    );
  };

  return { server, store, execute };
}

//  GraphQL Response Utilities 

export function getData<T = unknown>(result: unknown): T {
  const response = result as any;
  if (response?.body?.singleResult?.errors) {
    const errors = response.body.singleResult.errors;
    throw new Error(`GraphQL errors: ${JSON.stringify(errors, null, 2)}`);
  }
  return response?.body?.singleResult?.data ?? {};
}

export function getErrors(result: unknown): Array<{ message: string; extensions?: Record<string, unknown> }> {
  const response = result as any;
  return response?.body?.singleResult?.errors ?? [];
}

//  Seed Helpers 

function testId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(7)}`;
}

export function seedUser(
  store: AsyncMemoryStore,
  overrides?: Partial<Omit<User, "id" | "createdAt">>
): User {
  const user: User = {
    id: testId("user"),
    name: overrides?.name ?? `User-${Math.random().toString(36).slice(7)}`,
    email: overrides?.email ?? `user-${Math.random().toString(36).slice(7)}@test.local`,
    username: overrides?.username ?? `user_${Math.random().toString(36).slice(7)}`,
    avatarUrl: overrides?.avatarUrl,
    role: overrides?.role,
    permissions: overrides?.permissions,
    createdAt: new Date().toISOString(),
  };
  store._seedUser(user);
  return user;
}

export function seedGroup(
  store: AsyncMemoryStore,
  ownerId: string,
  overrides?: Partial<Omit<Group, "id" | "createdAt" | "inviteCode" | "memberCount" | "suggestionCount" | "members">>
): Group {
  const id = testId("group");
  const joinedAt = new Date().toISOString();
  const owner = (store as unknown as { users: Map<string, User> }).users.get(ownerId);
  if (!owner) throw new Error(`Owner user ${ownerId} not found`);

  const ownerMember: GroupMember = {
    userId: ownerId,
    groupId: id,
    role: "owner",
    joinedAt,
    user: owner,
  };

  const group: Group = {
    id,
    ownerId,
    name: overrides?.name ?? `Group-${Math.random().toString(36).slice(7)}`,
    description: overrides?.description ?? "Test group description",
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdAt: joinedAt,
    memberCount: 1,
    suggestionCount: 0,
    members: [ownerMember],
  };
  store._seedGroup(group);
  return group;
}

export function seedSuggestion(
  store: AsyncMemoryStore,
  groupId: string,
  authorId: string,
  overrides?: Partial<Omit<Suggestion, "id" | "status" | "upvotes" | "downvotes" | "currentUserVote" | "createdAt" | "updatedAt" | "isOwnSuggestion">>
): Suggestion {
  const now = new Date().toISOString();
  const suggestion: Suggestion = {
    id: testId("sug"),
    groupId,
    authorId,
    title: overrides?.title ?? `Suggestion-${Math.random().toString(36).slice(7)}`,
    description: overrides?.description ?? "This is a test suggestion description with enough characters.",
    status: "open",
    upvotes: 0,
    downvotes: 0,
    currentUserVote: null,
    createdAt: now,
    updatedAt: now,
  };
  store._seedSuggestion(suggestion);
  return suggestion;
}
