import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestServer, getData, getErrors, seedGroup, seedUser } from "./helpers.js";

let env: ReturnType<typeof createTestServer>;

beforeEach(async () => {
  env = createTestServer();
  await env.server.start();
});

afterEach(async () => {
  await env.server.stop();
});

const CREATE_CONVERSATION = /* GraphQL */ `
  mutation CreateChatConversation($input: CreateChatConversationInput!) {
    createChatConversation(input: $input) { id members { id } }
  }
`;

const SEND_MESSAGE = /* GraphQL */ `
  mutation SendChatMessage($input: SendChatMessageInput!) {
    sendChatMessage(input: $input) { id userId content }
  }
`;

describe("chat security", () => {
  it("requires authentication to create chat conversations", async () => {
    const owner = seedUser(env.store);
    const group = seedGroup(env.store, owner.id);

    const result = await env.execute(CREATE_CONVERSATION, {
      input: { groupId: group.id, memberIds: [owner.id], name: "Secure chat" },
    }, { userId: undefined });

    expect(getErrors(result)[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("uses the authenticated user for sent messages instead of trusting input.userId", async () => {
    const owner = seedUser(env.store);
    const other = seedUser(env.store);
    const group = await env.store.createGroup(
      { ownerId: owner.id, name: "Chat Group", description: "Group for chat tests" },
      [other.id]
    );

    const created = await env.execute(
      CREATE_CONVERSATION,
      { input: { groupId: group.id, memberIds: [other.id], name: "Secure chat" } },
      { userId: owner.id }
    );
    const conversationId = getData<{ createChatConversation: { id: string } }>(created).createChatConversation.id;

    const sent = await env.execute(
      SEND_MESSAGE,
      { input: { conversationId, userId: other.id, content: "This should be from the owner" } },
      { userId: owner.id }
    );

    expect(getData<{ sendChatMessage: { userId: string } }>(sent).sendChatMessage.userId).toBe(owner.id);
  });

  it("blocks non-members from reading conversation messages", async () => {
    const owner = seedUser(env.store);
    const intruder = seedUser(env.store);
    const group = seedGroup(env.store, owner.id);
    const conversation = await env.store.createConversation({
      groupId: group.id,
      name: "Private",
      members: [owner],
    });

    const result = await env.execute(
      `query ConversationMessages($conversationId: ID!) {
        conversationMessages(conversationId: $conversationId) { id }
      }`,
      { conversationId: conversation.id },
      { userId: intruder.id }
    );

    expect(getErrors(result)[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});
