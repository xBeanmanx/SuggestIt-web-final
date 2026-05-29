// ============================================================
// SuggestIt Server  Mutation Resolvers
// ============================================================

import { GraphQLError } from "graphql";
import {
  assertValid,
  createGroupSchema,
  updateGroupSchema,
  createSuggestionSchema,
  updateSuggestionSchema,
  loginSchema,
  registerSchema,
} from "../validation.js";
import type { AppRoleName, Context, SuggestionStatus, VoteType } from "../types.js";
import type { User } from "../types.js";
import {
  hashRefreshToken,
  consumeSignedFlowToken,
  createSignedFlowToken,
  consumeMfaChallenge,
  createMfaChallenge,
  issueRefreshToken,
  signAccessToken,
} from "../auth.js";
import { sendEmail } from "../email.js";

export type { Context };

//  Helpers 

function notFound(entity: string, id: string): never {
  throw new GraphQLError(`${entity} ${id} not found`, {
    extensions: { code: "NOT_FOUND" },
  });
}

function forbidden(msg: string): never {
  throw new GraphQLError(msg, { extensions: { code: "FORBIDDEN" } });
}

function requireAuthenticatedUser(userId?: string): string {
  if (!userId) {
    throw new GraphQLError("Authentication is required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return userId;
}

function hasPermission(context: Context, permission: string): boolean {
  return context.role === "ADMIN" || Boolean(context.permissions?.includes(permission));
}

async function requireGroupMember(store: Context["store"], groupId: string, userId: string) {
  const group = await store.getGroupById(groupId);
  if (!group) notFound("Group", groupId);
  const member = group.members.find((m) => m.userId === userId);
  if (!member) forbidden("You must be a group member to perform this action");
  return { group, member };
}

export const mutationResolvers = {
  async login(
    _: unknown,
    { input }: { input: { username: string; password: string } },
    { store }: Context
  ) {
    const validated = assertValid(loginSchema, input);
    const user = await store.validateUserPassword(validated.username, validated.password);

    if (!user) {
      throw new GraphQLError("Invalid username or password", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    const challenge = createMfaChallenge(user.id);
    const delivery = await sendEmail({
      to: user.email,
      subject: "Your SuggestIt login code",
      text: `Your SuggestIt login code is ${challenge.demoCode}. It expires at ${challenge.expiresAt.toISOString()}.`,
    });

    await store.recordAction({
      userId: user.id,
      action: "LOGIN_CODE_SENT",
      actionInformation: `Sent login verification code to ${user.email} via ${delivery}`,
    });

    return {
      challengeId: challenge.challengeId,
      email: user.email,
      expiresAt: challenge.expiresAt.toISOString(),
      delivery,
      demoCode: delivery === "console" ? challenge.demoCode : null,
    };
  },

  async verifyLoginCode(
    _: unknown,
    { challengeId, code }: { challengeId: string; code: string },
    { store, setRefreshTokenCookie }: Context
  ) {
    const userId = consumeMfaChallenge(challengeId, code);
    const user = userId ? await store.getUserById(userId) : undefined;
    if (!user) {
      throw new GraphQLError("Invalid or expired login code", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    await store.recordAction({
      userId: user.id,
      action: "LOGIN",
      actionInformation: `User ${user.email} verified email code and logged in as ${user.role ?? "USER"}`,
    });

    const refresh = await issueRefreshToken(store, user.id);
    setRefreshTokenCookie?.(refresh.token, refresh.expiresAt);
    return { accessToken: signAccessToken(user), user };
  },

  async register(
    _: unknown,
    { input }: { input: { username: string; email: string; password: string; name: string; requestedRole?: AppRoleName } },
    { store, setRefreshTokenCookie }: Context
  ) {
    const validated = assertValid(registerSchema, input);

    if (await store.getUserByUsername(validated.username)) {
      throw new GraphQLError("Username is already registered", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    if (await store.getUserByEmail(validated.email)) {
      throw new GraphQLError("Email is already registered", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const user = await store.createUser({
      username: validated.username.toLowerCase(),
      email: validated.email.toLowerCase(),
      password: validated.password,
      name: validated.name,
      role: "USER",
      permissions: [],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(validated.email)}`,
    });

    await store.recordAction({
      userId: user.id,
      action: "REGISTER",
      actionInformation: `User ${user.email} registered as ${user.role ?? "USER"}`,
    });

    const refresh = await issueRefreshToken(store, user.id);
    setRefreshTokenCookie?.(refresh.token, refresh.expiresAt);
    return { accessToken: signAccessToken(user), user };
  },

  async refreshToken(_: unknown, __: unknown, { store, refreshToken, setRefreshTokenCookie }: Context & { refreshToken?: string }) {
    if (!refreshToken) {
      throw new GraphQLError("Refresh token is missing", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const record = await store.getRefreshToken(tokenHash);
    if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new GraphQLError("Refresh token is invalid or expired", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    await store.revokeRefreshToken(tokenHash);
    const user = await store.getUserById(record.userId);
    if (!user) {
      throw new GraphQLError("Refresh token user no longer exists", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    const refresh = await issueRefreshToken(store, user.id);
    setRefreshTokenCookie?.(refresh.token, refresh.expiresAt);
    return { accessToken: signAccessToken(user), user };
  },

  async logout(_: unknown, __: unknown, { store, refreshToken, clearRefreshTokenCookie, userId }: Context & { refreshToken?: string }) {
    if (refreshToken) {
      await store.revokeRefreshToken(hashRefreshToken(refreshToken));
    } else if (userId) {
      await store.revokeUserRefreshTokens(userId);
    }
    clearRefreshTokenCookie?.();
    return true;
  },

  async requestMagicLink(_: unknown, { email }: { email: string }, { store }: Context) {
    const user = await store.getUserByEmail(email);
    if (user) {
      const token = createSignedFlowToken(user.id, "magic");
      await sendEmail({
        to: user.email,
        subject: "Your SuggestIt magic login link",
        text: `Use this link to sign in: /magic-login?token=${encodeURIComponent(token)}`,
      });
    }
    return "If the email exists, a login link was generated.";
  },

  async verifyMagicLink(
    _: unknown,
    { token }: { token: string },
    { store, setRefreshTokenCookie }: Context
  ) {
    const userId = consumeSignedFlowToken(token, "magic");
    const user = userId ? await store.getUserById(userId) : undefined;
    if (!user) {
      throw new GraphQLError("Magic link is invalid or expired", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    await store.recordAction({
      userId: user.id,
      action: "MAGIC_LINK_LOGIN",
      actionInformation: `User ${user.email} logged in with a magic link`,
    });
    const refresh = await issueRefreshToken(store, user.id);
    setRefreshTokenCookie?.(refresh.token, refresh.expiresAt);
    return { accessToken: signAccessToken(user), user };
  },

  async requestPasswordReset(_: unknown, { email }: { email: string }, { store }: Context) {
    const user = await store.getUserByEmail(email);
    if (!user) return "If the email exists, a reset link was generated.";
    const token = createSignedFlowToken(user.id, "password-reset");
    await sendEmail({
      to: user.email,
      subject: "Your SuggestIt password reset link",
      text: `Use this link to reset your password: /reset-password?token=${encodeURIComponent(token)}`,
    });
    return "If the email exists, a reset link was generated.";
  },

  async resetPassword(
    _: unknown,
    { token, newPassword }: { token: string; newPassword: string },
    { store, clearRefreshTokenCookie }: Context
  ) {
    if (newPassword.length < 8) {
      throw new GraphQLError("Password must be at least 8 characters", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    const userId = consumeSignedFlowToken(token, "password-reset");
    if (!userId) {
      throw new GraphQLError("Reset token is invalid or expired", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }
    await store.updateUserPassword(userId, newPassword);
    await store.revokeUserRefreshTokens(userId);
    clearRefreshTokenCookie?.();
    await store.recordAction({
      userId,
      action: "PASSWORD_RESET",
      actionInformation: "User reset their password",
    });
    return true;
  },

  async setUserRole(
    _: unknown,
    { userId, role }: { userId: string; role: AppRoleName },
    context: Context
  ) {
    const requesterId = requireAuthenticatedUser(context.userId);
    const { store } = context;
    if (!hasPermission(context, "ADMINISTER_DOMAIN")) {
      forbidden("Only administrators can assign application roles");
    }
    if (requesterId === userId && role !== "ADMIN") {
      forbidden("Administrators cannot remove their own admin role");
    }

    const updated = await store.setUserRole(userId, role);
    if (!updated) notFound("User", userId);

    await store.recordAction({
      userId: requesterId,
      action: "SET_USER_ROLE",
      actionInformation: `Set user ${updated.email} role to ${role}`,
    });
    return updated;
  },

  //  Groups 

  async createGroup(
    _: unknown,
    { input }: { input: { name: string; description: string; memberIds?: string[] } },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const validated = assertValid(createGroupSchema, input);
    const memberIds = Array.from(new Set([requesterId, ...(validated.memberIds ?? [])]));

    for (const memberId of memberIds) {
      if (!(await store.getUserById(memberId))) notFound("User", memberId);
    }

    const group = await store.createGroup(
      { name: validated.name, description: validated.description, ownerId: requesterId },
      memberIds
    );
    await store.recordAction({
      userId: requesterId,
      groupId: group.id,
      action: "CREATE_GROUP",
      actionInformation: `Created group ${group.name}`,
    });
    return group;
  },

  async updateGroup(
    _: unknown,
    { id, input }: { id: string; input: { name?: string; description?: string } },
    context: Context
  ) {
    const requesterId = requireAuthenticatedUser(context.userId);
    const { store } = context;
    const validated = assertValid(updateGroupSchema, input);
    const current = await store.getGroupById(id);
    if (!current) notFound("Group", id);
    const member = current.members.find((m) => m.userId === requesterId);
    if (!hasPermission(context, "ADMINISTER_DOMAIN") && member?.role !== "owner" && member?.role !== "admin") {
      forbidden("Only group owners and admins can update this group");
    }
    const group = await store.updateGroup(id, validated);
    if (!group) notFound("Group", id);
    await store.recordAction({
      userId: requesterId,
      groupId: id,
      action: "UPDATE_GROUP",
      actionInformation: `Updated group ${id}`,
    });
    return group;
  },

  async deleteGroup(_: unknown, { id }: { id: string }, context: Context) {
    const requesterId = requireAuthenticatedUser(context.userId);
    const { store } = context;
    const group = await store.getGroupById(id);
    if (!group) notFound("Group", id);
    if (!hasPermission(context, "ADMINISTER_DOMAIN") && group.ownerId !== requesterId) {
      forbidden("Only the group owner or an administrator can delete this group");
    }
    const ok = await store.deleteGroup(id);
    if (!ok) notFound("Group", id);
    await store.recordAction({
      userId: requesterId,
      groupId: null,
      action: "DELETE_GROUP",
      actionInformation: `Deleted group ${group.name}`,
    });
    return true;
  },

  async joinGroup(
    _: unknown,
    { inviteCode, userId }: { inviteCode: string; userId: string },
    { store, userId: authenticatedUserId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(authenticatedUserId);
    const group = await store.getGroupByInviteCode(inviteCode);
    if (!group) {
      throw new GraphQLError("Invalid invite code", {
        extensions: { code: "NOT_FOUND" },
      });
    }
    const user = await store.getUserById(requesterId);
    if (!user) notFound("User", requesterId);

    const joined = (await store.joinGroup(group.id, requesterId)) ?? null;
    if (joined) {
      await store.recordAction({
        userId: requesterId,
        groupId: group.id,
        action: "JOIN_GROUP",
        actionInformation: `Joined group ${group.name}`,
      });
    }
    return joined;
  },

  async leaveGroup(
    _: unknown,
    { groupId, userId }: { groupId: string; userId: string },
    { store, userId: authenticatedUserId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(authenticatedUserId);
    const group = await store.getGroupById(groupId);
    if (!group) notFound("Group", groupId);
    const left = await store.leaveGroup(groupId, requesterId);
    if (left) {
      await store.recordAction({
        userId: requesterId,
        groupId,
        action: "LEAVE_GROUP",
        actionInformation: `Left group ${groupId}`,
      });
    }
    return left;
  },

  //  Suggestions 

  async createSuggestion(
    _: unknown,
    { input }: { input: { groupId: string; authorId: string; title: string; description: string } },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const validated = assertValid(createSuggestionSchema, input);
    await requireGroupMember(store, validated.groupId, requesterId);

    const suggestion = await store.createSuggestion({
      groupId: validated.groupId,
      authorId: requesterId,
      title: validated.title,
      description: validated.description,
    });
    await store.recordAction({
      userId: requesterId,
      groupId: validated.groupId,
      action: "CREATE_SUGGESTION",
      actionInformation: `Created suggestion ${suggestion.title}`,
    });
    return suggestion;
  },

  async updateSuggestion(
    _: unknown,
    {
      id,
      input,
      requesterId,
    }: { id: string; input: { title?: string; description?: string }; requesterId: string },
    { store, userId }: Context
  ) {
    const authenticatedUserId = requireAuthenticatedUser(userId);
    const validated = assertValid(updateSuggestionSchema, input);

    const suggestion = await store.getSuggestionById(id);
    if (!suggestion) notFound("Suggestion", id);

    if (suggestion.authorId !== authenticatedUserId) {
      forbidden("Only the author can update this suggestion");
    }

    const updated = await store.updateSuggestion(id, validated);
    if (!updated) notFound("Suggestion", id);
    await store.recordAction({
      userId: authenticatedUserId,
      groupId: updated.groupId,
      action: "UPDATE_SUGGESTION",
      actionInformation: `Updated suggestion ${id}`,
    });
    return updated;
  },

  async deleteSuggestion(
    _: unknown,
    { id, requesterId }: { id: string; requesterId: string },
    context: Context
  ) {
    const authenticatedUserId = requireAuthenticatedUser(context.userId);
    const { store } = context;
    const suggestion = await store.getSuggestionById(id);
    if (!suggestion) notFound("Suggestion", id);

    const group = await store.getGroupById(suggestion.groupId);
    const isGroupOwner = group?.ownerId === authenticatedUserId;
    const isAuthor = suggestion.authorId === authenticatedUserId;

    if (!hasPermission(context, "ADMINISTER_DOMAIN") && !isGroupOwner && !isAuthor) {
      forbidden("Only the author or group owner can delete this suggestion");
    }

    const deleted = await store.deleteSuggestion(id);
    if (deleted) {
      await store.recordAction({
        userId: authenticatedUserId,
        groupId: suggestion.groupId,
        action: "DELETE_SUGGESTION",
        actionInformation: `Deleted suggestion ${id}`,
      });
    }
    return deleted;
  },

  async voteSuggestion(
    _: unknown,
    { id, userId, vote }: { id: string; userId: string; vote?: VoteType | null },
    { store, userId: authenticatedUserId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(authenticatedUserId);
    const suggestion = await store.getSuggestionById(id);
    if (!suggestion) notFound("Suggestion", id);
    await requireGroupMember(store, suggestion.groupId, requesterId);

    const result = (await store.voteSuggestion(id, requesterId, vote ?? null)) ?? null;
    await store.recordAction({
      userId: requesterId,
      groupId: result?.groupId ?? null,
      action: vote === "down" ? "VOTE_DOWN" : "VOTE_SUGGESTION",
      actionInformation: `Voted ${vote ?? "none"} on suggestion ${id}`,
    });
    return result;
  },

  async setSuggestionStatus(
    _: unknown,
    { id, status, requesterId }: { id: string; status: SuggestionStatus; requesterId: string },
    context: Context
  ) {
    const authenticatedUserId = requireAuthenticatedUser(context.userId);
    const { store } = context;
    const suggestion = await store.getSuggestionById(id);
    if (!suggestion) notFound("Suggestion", id);

    const group = await store.getGroupById(suggestion.groupId);
    if (!group) notFound("Group", suggestion.groupId);

    const member = group.members.find((m) => m.userId === authenticatedUserId);
    if (!hasPermission(context, "ADMINISTER_DOMAIN") && (!member || (member.role !== "owner" && member.role !== "admin"))) {
      forbidden("Only group owners and admins can change suggestion status");
    }

    const updated = (await store.setSuggestionStatus(id, status)) ?? null;
    await store.recordAction({
      userId: authenticatedUserId,
      groupId: suggestion.groupId,
      action: "SET_SUGGESTION_STATUS",
      actionInformation: `Set suggestion ${id} to ${status}`,
    });
    return updated;
  },

  //  Alchemy 

  async combineIdeas(
    _: unknown,
    {
      sourceId1,
      sourceId2,
      groupId,
    }: { sourceId1: string; sourceId2: string; groupId: string },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const { group } = await requireGroupMember(store, groupId, requesterId);

    const findTitle = async (id: string): Promise<string> => {
      const s = await store.getSuggestionById(id);
      if (s && s.groupId === groupId) return s.title;
      const a = await store.getAlchemyResultById(id);
      if (a && a.groupId === groupId) return a.title;
      throw new GraphQLError(`Source ${id} not found in suggestions or alchemy results`, {
        extensions: { code: "NOT_FOUND" },
      });
    };

    const title1 = await findTitle(sourceId1);
    const title2 = await findTitle(sourceId2);

    const parentAlchemy = await store.getAlchemyResultById(sourceId1);
    const depth = parentAlchemy ? parentAlchemy.depth + 1 : 0;

    const alchemy = await store.createAlchemyResult({
      groupId,
      title:
        depth > 0
          ? `[Evolved] ${title1} x ${title2}`
          : `${title1} + ${title2}`,
      description: `A synthesised concept combining "${title1}" with "${title2}". This hybrid idea merits deeper exploration by the group.`,
      sourceIds: [sourceId1, sourceId2],
      depth,
    });
    await store.recordAction({
      userId: requesterId,
      groupId,
      action: "CREATE_ALCHEMY",
      actionInformation: `Combined ${sourceId1} with ${sourceId2}`,
    });
    return alchemy;
  },

  async voteAlchemy(
    _: unknown,
    { id, userId, vote }: { id: string; userId: string; vote?: VoteType | null },
    { store, userId: authenticatedUserId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(authenticatedUserId);
    const alchemy = await store.getAlchemyResultById(id);
    if (!alchemy) notFound("AlchemyResult", id);
    await requireGroupMember(store, alchemy.groupId, requesterId);

    return (await store.voteAlchemy(id, requesterId, vote ?? null)) ?? null;
  },

  //  Chat 

  async createChatConversation(
    _: unknown,
    {
      input,
    }: {
      input: { groupId: string; memberIds: string[]; name?: string };
    },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const group = await store.getGroupById(input.groupId);
    if (!group) notFound("Group", input.groupId);
    if (!group.members.some((member) => member.userId === requesterId)) {
      forbidden("You must be a group member to create a chat conversation");
    }

    const uniqueMemberIds = Array.from(new Set([requesterId, ...input.memberIds]));
    if (uniqueMemberIds.some((id) => !group.members.some((member) => member.userId === id))) {
      forbidden("All chat members must belong to the group");
    }

    const members = await Promise.all(uniqueMemberIds.map((id) => store.getUserById(id)));
    if (members.some((m) => !m)) forbidden("One or more members not found");

    const conversation = await store.createConversation({
      groupId: input.groupId,
      name: input.name ?? null,
      members: members.filter((m): m is User => m !== undefined),
    });

    await store.recordAction({
      userId: requesterId,
      groupId: input.groupId,
      action: "CREATE_CONVERSATION",
      actionInformation: `Created chat conversation "${input.name || "Untitled"}"`,
    });

    return conversation;
  },

  async sendChatMessage(
    _: unknown,
    { input }: { input: { conversationId: string; userId: string; content: string } },
    { store, userId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(userId);
    const conversation = await store.getConversationById(input.conversationId);
    if (!conversation) notFound("ChatConversation", input.conversationId);
    if (!conversation.members.some((member) => member.id === requesterId)) {
      forbidden("You are not a member of this conversation");
    }

    const user = await store.getUserById(requesterId);
    if (!user) notFound("User", requesterId);

    const message = await store.sendChatMessage({
      conversationId: input.conversationId,
      userId: requesterId,
      content: input.content,
    });

    // Populate the user field on the message
    (message as any).user = user;

    await store.recordAction({
      userId: requesterId,
      groupId: conversation.groupId,
      action: "SEND_MESSAGE",
      actionInformation: `Sent message in conversation ${input.conversationId}`,
    });

    return message;
  },

  async deleteChatMessage(
    _: unknown,
    { id, userId }: { id: string; userId: string },
    { store, userId: authenticatedUserId }: Context
  ) {
    const requesterId = requireAuthenticatedUser(authenticatedUserId);
    if (!(await store.getUserById(requesterId))) notFound("User", requesterId);

    const success = await store.deleteChatMessage(id, requesterId);
    if (!success) forbidden("Cannot delete this message (not your message or not found)");

    await store.recordAction({
      userId: requesterId,
      action: "DELETE_MESSAGE",
      actionInformation: `Deleted message ${id}`,
    });

    return true;
  },
};
