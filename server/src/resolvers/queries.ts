// ============================================================
// SuggestIt Server  Query Resolvers
// ============================================================

import { GraphQLError } from "graphql";
import { assertValid, paginationSchema } from "../validation.js";
import type {
  Context,
  GroupStats,
  GlobalStats,
  PaginatedSuggestions,
  SuggestionStatus,
} from "../types.js";

export type { Context };

function requireAuthenticatedUser(userId?: string): string {
  if (!userId) {
    throw new GraphQLError("Authentication is required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return userId;
}

function forbidden(msg: string): never {
  throw new GraphQLError(msg, { extensions: { code: "FORBIDDEN" } });
}

function requirePermission(context: Context, permission: string): void {
  if (context.role === "ADMIN" || context.permissions?.includes(permission)) return;
  forbidden("You do not have permission to access this resource");
}

export const queryResolvers = {
  //  Users 

  async users(_: unknown, __: unknown, context: Context) {
    requireAuthenticatedUser(context.userId);
    requirePermission(context, "READ_DOMAIN");
    const { store } = context;
    return store.getUsers();
  },

  async user(_: unknown, { id }: { id: string }, context: Context) {
    requireAuthenticatedUser(context.userId);
    requirePermission(context, "READ_DOMAIN");
    const { store } = context;
    const user = await store.getUserById(id);
    if (!user) throw new GraphQLError(`User ${id} not found`, { extensions: { code: "NOT_FOUND" } });
    return user;
  },

  async getMe(_: unknown, __: unknown, { store, userId }: Context) {
    if (!userId) return null;
    return (await store.getUserById(userId)) ?? null;
  },

  async roles(_: unknown, __: unknown, { store }: Context) {
    return store.getRoles();
  },

  async permissions(_: unknown, __: unknown, { store }: Context) {
    return store.getPermissions();
  },

  //  Groups 

  async groups(_: unknown, __: unknown, { store }: Context) {
    return store.getGroups();
  },

  async group(_: unknown, { id }: { id: string }, { store }: Context) {
    return (await store.getGroupById(id)) ?? null;
  },

  async groupByInviteCode(_: unknown, { inviteCode }: { inviteCode: string }, { store }: Context) {
    return (await store.getGroupByInviteCode(inviteCode)) ?? null;
  },

  //  Suggestions (paginated) 

  async suggestions(
    _: unknown,
    args: {
      groupId: string;
      page?: number;
      pageSize?: number;
      filter?: { status?: SuggestionStatus; authorId?: string };
    },
    { store }: Context
  ): Promise<PaginatedSuggestions> {
    const { page, pageSize } = assertValid(paginationSchema, {
      page: args.page ?? 1,
      pageSize: args.pageSize ?? 10,
    }) as { page: number; pageSize: number };

    let items = await store.getSuggestions(args.groupId);

    if (args.filter?.status) {
      items = items.filter((s) => s.status === args.filter!.status);
    }
    if (args.filter?.authorId) {
      items = items.filter((s) => s.authorId === args.filter!.authorId);
    }

    items = items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const pageItems = items.slice(offset, offset + pageSize);

    return {
      items: pageItems,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    };
  },

  async suggestion(_: unknown, { id }: { id: string }, { store }: Context) {
    const s = await store.getSuggestionById(id);
    if (!s) throw new GraphQLError(`Suggestion ${id} not found`, { extensions: { code: "NOT_FOUND" } });
    return s;
  },

  //  Alchemy 

  async alchemyResults(_: unknown, { groupId }: { groupId: string }, { store }: Context) {
    return store.getAlchemyResults(groupId);
  },

  async alchemyResult(_: unknown, { id }: { id: string }, { store }: Context) {
    const a = await store.getAlchemyResultById(id);
    if (!a) throw new GraphQLError(`AlchemyResult ${id} not found`, { extensions: { code: "NOT_FOUND" } });
    return a;
  },

  //  Stats 

  async groupStats(_: unknown, { groupId }: { groupId: string }, { store }: Context): Promise<GroupStats> {
    const group = await store.getGroupById(groupId);
    if (!group) throw new GraphQLError(`Group ${groupId} not found`, { extensions: { code: "NOT_FOUND" } });

    const suggestions = await store.getSuggestions(groupId);
    const alchemy = await store.getAlchemyResults(groupId);

    const statusBreakdown = { open: 0, under_review: 0, accepted: 0, rejected: 0 };
    let totalUpvotes = 0;
    let totalDownvotes = 0;
    const authorCounts = new Map<string, number>();

    for (const s of suggestions) {
      statusBreakdown[s.status] = (statusBreakdown[s.status] ?? 0) + 1;
      totalUpvotes += s.upvotes;
      totalDownvotes += s.downvotes;
      authorCounts.set(s.authorId, (authorCounts.get(s.authorId) ?? 0) + 1);
    }

    let mostActiveAuthorId: string | null = null;
    let maxCount = 0;
    for (const [authorId, count] of authorCounts) {
      if (count > maxCount) { maxCount = count; mostActiveAuthorId = authorId; }
    }

    return {
      groupId,
      totalSuggestions: suggestions.length,
      statusBreakdown,
      totalUpvotes,
      totalDownvotes,
      avgUpvotesPerSuggestion: suggestions.length > 0 ? totalUpvotes / suggestions.length : 0,
      mostActiveAuthorId,
      alchemyCount: alchemy.length,
    };
  },

  async globalStats(_: unknown, __: unknown, { store }: Context): Promise<GlobalStats> {
    const groups = await store.getGroups();
    const allSuggestions = (
      await Promise.all(groups.map((g) => store.getSuggestions(g.id)))
    ).flat();
    const allAlchemy = (
      await Promise.all(groups.map((g) => store.getAlchemyResults(g.id)))
    ).flat();
    const users = await store.getUsers();

    return {
      totalUsers: users.length,
      totalGroups: groups.length,
      totalSuggestions: allSuggestions.length,
      totalAlchemyResults: allAlchemy.length,
      overallUpvotes: allSuggestions.reduce((s, x) => s + x.upvotes, 0),
      overallDownvotes: allSuggestions.reduce((s, x) => s + x.downvotes, 0),
    };
  },

  async topContributors(_: unknown, { optimized }: { optimized?: boolean }, { store }: Context) {
    return store.getTopContributors({ optimized: Boolean(optimized) });
  },

  async actionLogs(_: unknown, __: unknown, context: Context) {
    requireAuthenticatedUser(context.userId);
    requirePermission(context, "VIEW_SECURITY_LOGS");
    const { store } = context;
    return store.getActionLogs();
  },

  async observationList(_: unknown, __: unknown, context: Context) {
    requireAuthenticatedUser(context.userId);
    requirePermission(context, "VIEW_SECURITY_LOGS");
    const { store } = context;
    return store.getObservationList();
  },

  //  Chat 

  async conversations(
    _: unknown,
    { groupId }: { groupId: string },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const group = await store.getGroupById(groupId);
    if (!group) throw new GraphQLError(`Group ${groupId} not found`, { extensions: { code: "NOT_FOUND" } });
    if (!group.members.some((member) => member.userId === requesterId)) {
      forbidden("You must be a group member to view conversations");
    }
    return store.getConversations(groupId);
  },

  async conversation(
    _: unknown,
    { id }: { id: string },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const conv = await store.getConversationById(id);
    if (!conv) return null;
    if (!conv.members.some((member) => member.id === requesterId)) {
      forbidden("You are not a member of this conversation");
    }

    const messages = await store.getConversationMessages(id);
    return { ...conv, messages };
  },

  async conversationMessages(
    _: unknown,
    { conversationId, limit }: { conversationId: string; limit?: number },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const conv = await store.getConversationById(conversationId);
    if (!conv) throw new GraphQLError(`ChatConversation ${conversationId} not found`, { extensions: { code: "NOT_FOUND" } });
    if (!conv.members.some((member) => member.id === requesterId)) {
      forbidden("You are not a member of this conversation");
    }
    return store.getConversationMessages(conversationId, limit);
  },
};
