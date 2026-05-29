// ============================================================
// SuggestIt Server Tests  Suggestions CRUD
// ============================================================

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestServer, getData, getErrors, seedUser, seedGroup, seedSuggestion } from "./helpers.js";

let env: ReturnType<typeof createTestServer>;

beforeEach(async () => {
  env = createTestServer();
  await env.server.start();
});

afterAll(async () => {
  await env.server.stop();
});

//  Fragments / Operations 

const SUGGESTION_FIELDS = `
  id groupId authorId title description status
  upvotes downvotes createdAt updatedAt
`;

const CREATE_SUGGESTION = /* GraphQL */ `
  mutation CreateSuggestion($input: CreateSuggestionInput!) {
    createSuggestion(input: $input) { ${SUGGESTION_FIELDS} }
  }
`;

const GET_SUGGESTIONS = /* GraphQL */ `
  query GetSuggestions($groupId: ID!, $page: Int, $pageSize: Int, $filter: SuggestionsFilter) {
    suggestions(groupId: $groupId, page: $page, pageSize: $pageSize, filter: $filter) {
      items { ${SUGGESTION_FIELDS} }
      total page pageSize totalPages hasNextPage hasPrevPage
    }
  }
`;

const GET_SUGGESTION = /* GraphQL */ `
  query GetSuggestion($id: ID!) { suggestion(id: $id) { ${SUGGESTION_FIELDS} } }
`;

const UPDATE_SUGGESTION = /* GraphQL */ `
  mutation UpdateSuggestion($id: ID!, $input: UpdateSuggestionInput!, $requesterId: ID!) {
    updateSuggestion(id: $id, input: $input, requesterId: $requesterId) { ${SUGGESTION_FIELDS} }
  }
`;

const DELETE_SUGGESTION = /* GraphQL */ `
  mutation DeleteSuggestion($id: ID!, $requesterId: ID!) {
    deleteSuggestion(id: $id, requesterId: $requesterId)
  }
`;

const VOTE_SUGGESTION = /* GraphQL */ `
  mutation VoteSuggestion($id: ID!, $userId: ID!, $vote: VoteType) {
    voteSuggestion(id: $id, userId: $userId, vote: $vote) { id status upvotes downvotes }
  }
`;

const SET_STATUS = /* GraphQL */ `
  mutation SetStatus($id: ID!, $status: SuggestionStatus!, $requesterId: ID!) {
    setSuggestionStatus(id: $id, status: $status, requesterId: $requesterId) { id status }
  }
`;

//  CREATE 

describe("createSuggestion", () => {
  it("creates a suggestion with valid data", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: {
        groupId: group.id,
        authorId: user.id,
        title: "A great suggestion title",
        description: "A detailed description of the suggestion idea.",
      },
    });
    const data = getData<{ createSuggestion: { id: string; status: string; upvotes: number } }>(result);
    expect(data.createSuggestion.id).toBeTruthy();
    expect(data.createSuggestion.status).toBe("open");
    expect(data.createSuggestion.upvotes).toBe(0);
  });

  it("increments the group suggestionCount", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    expect((await env.store.getGroupById(group.id))!.suggestionCount).toBe(0);

    await env.execute(CREATE_SUGGESTION, {
      input: {
        groupId: group.id, authorId: user.id,
        title: "Valid title here", description: "Valid long description here.",
      },
    });
    expect((await env.store.getGroupById(group.id))!.suggestionCount).toBe(1);
  });

  it("rejects a title shorter than 5 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "Hi", description: "A".repeat(20) },
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/5/);
  });

  it("rejects a title longer than 100 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "A".repeat(101), description: "A".repeat(20) },
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("accepts a title of exactly 5 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "Hello", description: "A".repeat(20) },
    });
    expect(getErrors(result)).toHaveLength(0);
  });

  it("accepts a title of exactly 100 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "A".repeat(100), description: "A".repeat(20) },
    });
    expect(getErrors(result)).toHaveLength(0);
  });

  it("rejects a description shorter than 10 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "Valid title", description: "Short" },
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/10/);
  });

  it("rejects a description longer than 1000 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "Valid title", description: "A".repeat(1001) },
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("accepts a description of exactly 10 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: user.id, title: "Valid title", description: "A".repeat(10) },
    });
    expect(getErrors(result)).toHaveLength(0);
  });

  it("returns NOT_FOUND for unknown group", async () => {
    const user = await seedUser(env.store);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: "ghost", authorId: user.id, title: "Valid title", description: "Valid description ok" },
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });

  it("uses the authenticated user instead of trusting input authorId", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(CREATE_SUGGESTION, {
      input: { groupId: group.id, authorId: "ghost", title: "Valid title", description: "Valid description ok" },
    }, { userId: user.id });
    const data = getData<{ createSuggestion: { authorId: string } }>(result);
    expect(data.createSuggestion.authorId).toBe(user.id);
  });
});

//  READ 

describe("suggestion / suggestions queries", () => {
  it("returns an empty page when no suggestions exist", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(GET_SUGGESTIONS, { groupId: group.id });
    const data = getData<{ suggestions: { items: unknown[]; total: number } }>(result);
    expect(data.suggestions.items).toHaveLength(0);
    expect(data.suggestions.total).toBe(0);
  });

  it("returns suggestions for a group", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    await seedSuggestion(env.store, group.id, user.id, { title: "First suggestion" });
    await seedSuggestion(env.store, group.id, user.id, { title: "Second suggestion" });

    const result = await env.execute(GET_SUGGESTIONS, { groupId: group.id });
    const data = getData<{ suggestions: { items: { title: string }[]; total: number } }>(result);
    expect(data.suggestions.total).toBe(2);
  });

  it("does not return suggestions from other groups", async () => {
    const user = await seedUser(env.store);
    const groupA = await seedGroup(env.store, user.id, { name: "Group A" });
    const groupB = await seedGroup(env.store, user.id, { name: "Group B" });
    await seedSuggestion(env.store, groupA.id, user.id);

    const result = await env.execute(GET_SUGGESTIONS, { groupId: groupB.id });
    const data = getData<{ suggestions: { total: number } }>(result);
    expect(data.suggestions.total).toBe(0);
  });

  it("fetches a single suggestion by id", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id, { title: "Specific title" });

    const result = await env.execute(GET_SUGGESTION, { id: s.id });
    const data = getData<{ suggestion: { title: string } }>(result);
    expect(data.suggestion.title).toBe("Specific title");
  });

  it("returns NOT_FOUND for unknown suggestion id", async () => {
    const result = await env.execute(GET_SUGGESTION, { id: "ghost" });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });

  it("filters suggestions by status", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id);
    const s2 = await seedSuggestion(env.store, group.id, user.id);
    await env.store.setSuggestionStatus(s2.id, "accepted");

    const result = await env.execute(GET_SUGGESTIONS, {
      groupId: group.id,
      filter: { status: "open" },
    });
    const data = getData<{ suggestions: { items: { id: string }[] } }>(result);
    expect(data.suggestions.items.every((i) => i.id === s1.id)).toBe(true);
    expect(data.suggestions.items.some((i) => i.id === s2.id)).toBe(false);
  });

  it("filters suggestions by authorId", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const other = await seedUser(env.store, { name: "Other" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, other.id);
    await seedSuggestion(env.store, group.id, owner.id, { title: "Owner suggestion" });
    await seedSuggestion(env.store, group.id, other.id, { title: "Other suggestion" });

    const result = await env.execute(GET_SUGGESTIONS, {
      groupId: group.id,
      filter: { authorId: owner.id },
    });
    const data = getData<{ suggestions: { items: { authorId: string }[] } }>(result);
    expect(data.suggestions.items.every((i) => i.authorId === owner.id)).toBe(true);
  });
});

//  UPDATE 

describe("updateSuggestion", () => {
  it("author can update their own suggestion", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id, { title: "Old title here" });

    const result = await env.execute(UPDATE_SUGGESTION, {
      id: s.id,
      input: { title: "Updated title here" },
      requesterId: user.id,
    });
    const data = getData<{ updateSuggestion: { title: string } }>(result);
    expect(data.updateSuggestion.title).toBe("Updated title here");
  });

  it("non-author is forbidden from updating", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const other = await seedUser(env.store, { name: "Other" });
    const group = await seedGroup(env.store, owner.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(UPDATE_SUGGESTION, {
      id: s.id,
      input: { title: "Sneaky update title" },
      requesterId: other.id,
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("FORBIDDEN");
  });

  it("rejects update with title shorter than 5 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id);

    const result = await env.execute(UPDATE_SUGGESTION, {
      id: s.id, input: { title: "Hi" }, requesterId: user.id,
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("rejects update with description shorter than 10 characters", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id);

    const result = await env.execute(UPDATE_SUGGESTION, {
      id: s.id, input: { description: "Short" }, requesterId: user.id,
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("updates the updatedAt timestamp", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id);
    const originalUpdatedAt = s.updatedAt;

    await new Promise((r) => setTimeout(r, 5));

    const result = await env.execute(UPDATE_SUGGESTION, {
      id: s.id, input: { title: "Updated title here" }, requesterId: user.id,
    });
    const data = getData<{ updateSuggestion: { updatedAt: string } }>(result);
    expect(data.updateSuggestion.updatedAt).not.toBe(originalUpdatedAt);
  });
});

//  DELETE 

describe("deleteSuggestion", () => {
  it("author can delete their own suggestion", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id);

    const result = await env.execute(DELETE_SUGGESTION, { id: s.id, requesterId: user.id });
    const data = getData<{ deleteSuggestion: boolean }>(result);
    expect(data.deleteSuggestion).toBe(true);
    expect(await env.store.getSuggestionById(s.id)).toBeUndefined();
  });

  it("group owner can delete any suggestion in their group", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const author = await seedUser(env.store, { name: "Author" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, author.id);
    const s = await seedSuggestion(env.store, group.id, author.id);

    const result = await env.execute(DELETE_SUGGESTION, { id: s.id, requesterId: owner.id });
    const data = getData<{ deleteSuggestion: boolean }>(result);
    expect(data.deleteSuggestion).toBe(true);
  });

  it("non-author non-owner is forbidden from deleting", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const author = await seedUser(env.store, { name: "Author" });
    const intruder = await seedUser(env.store, { name: "Intruder" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, author.id);
    const s = await seedSuggestion(env.store, group.id, author.id);

    const result = await env.execute(DELETE_SUGGESTION, { id: s.id, requesterId: intruder.id });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("FORBIDDEN");
  });

  it("decrements group suggestionCount on delete", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id);
    expect((await env.store.getGroupById(group.id))!.suggestionCount).toBe(1);

    await env.execute(DELETE_SUGGESTION, { id: s.id, requesterId: user.id });
    expect((await env.store.getGroupById(group.id))!.suggestionCount).toBe(0);
  });

  it("returns NOT_FOUND for unknown suggestion", async () => {
    const user = await seedUser(env.store);
    const result = await env.execute(DELETE_SUGGESTION, { id: "ghost", requesterId: user.id });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});

//  VOTING 

describe("voteSuggestion", () => {
  it("upvote increments upvotes", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const member = await seedUser(env.store, { name: "Member" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, member.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "up" });
    const data = getData<{ voteSuggestion: { upvotes: number; downvotes: number } }>(result);
    expect(data.voteSuggestion?.upvotes).toBe(1);
    expect(data.voteSuggestion?.downvotes).toBe(0);
  });

  it("downvote increments downvotes", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const member = await seedUser(env.store, { name: "Member" });
    const m2 = await seedUser(env.store, { name: "M2" });
    const m3 = await seedUser(env.store, { name: "M3" });
    const m4 = await seedUser(env.store, { name: "M4" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, member.id);
    await env.store.joinGroup(group.id, m2.id);
    await env.store.joinGroup(group.id, m3.id);
    await env.store.joinGroup(group.id, m4.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "down" });
    const data = getData<{ voteSuggestion: { downvotes: number } }>(result);
    expect(data.voteSuggestion?.downvotes).toBe(1);
  });

  it("voting the same way again toggles the vote off", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const member = await seedUser(env.store, { name: "Member" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, member.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "up" });
    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "up" });
    const data = getData<{ voteSuggestion: { upvotes: number } }>(result);
    expect(data.voteSuggestion?.upvotes).toBe(0);
  });

  it("changing vote updates both counts atomically", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const member = await seedUser(env.store, { name: "Member" });
    const m2 = await seedUser(env.store, { name: "M2" });
    const m3 = await seedUser(env.store, { name: "M3" });
    const m4 = await seedUser(env.store, { name: "M4" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, member.id);
    await env.store.joinGroup(group.id, m2.id);
    await env.store.joinGroup(group.id, m3.id);
    await env.store.joinGroup(group.id, m4.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "up" });
    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: owner.id, vote: "down" });
    const data = getData<{ voteSuggestion: { upvotes: number; downvotes: number } }>(result);
    expect(data.voteSuggestion?.upvotes).toBe(0);
    expect(data.voteSuggestion?.downvotes).toBe(1);
  });

  it("multiple users can each vote independently", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const u1 = await seedUser(env.store, { name: "U1" });
    const u2 = await seedUser(env.store, { name: "U2" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, u1.id);
    await env.store.joinGroup(group.id, u2.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    await env.execute(VOTE_SUGGESTION, { id: s.id, userId: u1.id, vote: "up" });
    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: u2.id, vote: "up" });
    const data = getData<{ voteSuggestion: { upvotes: number } }>(result);
    expect(data.voteSuggestion?.upvotes).toBe(2);
  });

  it("auto-deletes suggestion on majority downvote rejection", async () => {
    // Group has 3 members, rounded-down threshold = floor(3/2) = 1
    const owner = await seedUser(env.store, { name: "Owner" });
    const m1 = await seedUser(env.store, { name: "M1" });
    const m2 = await seedUser(env.store, { name: "M2" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, m1.id);
    await env.store.joinGroup(group.id, m2.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: m1.id, vote: "down" });
    const data = getData<{ voteSuggestion: null }>(result);
    expect(data.voteSuggestion).toBeNull();
    expect(await env.store.getSuggestionById(s.id)).toBeUndefined();
  });

  it("accepts suggestion on rounded-down upvote threshold", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const m1 = await seedUser(env.store, { name: "M1" });
    const m2 = await seedUser(env.store, { name: "M2" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, m1.id);
    await env.store.joinGroup(group.id, m2.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(VOTE_SUGGESTION, { id: s.id, userId: m1.id, vote: "up" });
    const data = getData<{ voteSuggestion: { status: string; upvotes: number } }>(result);
    expect(data.voteSuggestion.status).toBe("accepted");
    expect(data.voteSuggestion.upvotes).toBe(1);
  });
});

//  STATUS 

describe("setSuggestionStatus", () => {
  it("group owner can change status to accepted", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const group = await seedGroup(env.store, owner.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(SET_STATUS, {
      id: s.id, status: "accepted", requesterId: owner.id,
    });
    const data = getData<{ setSuggestionStatus: { status: string } }>(result);
    expect(data.setSuggestionStatus?.status).toBe("accepted");
  });

  it("group owner can change status to under_review", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const group = await seedGroup(env.store, owner.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(SET_STATUS, {
      id: s.id, status: "under_review", requesterId: owner.id,
    });
    const data = getData<{ setSuggestionStatus: { status: string } }>(result);
    expect(data.setSuggestionStatus?.status).toBe("under_review");
  });

  it("setting status to rejected removes the suggestion", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const group = await seedGroup(env.store, owner.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(SET_STATUS, {
      id: s.id, status: "rejected", requesterId: owner.id,
    });
    const data = getData<{ setSuggestionStatus: null }>(result);
    expect(data.setSuggestionStatus).toBeNull();
    expect(await env.store.getSuggestionById(s.id)).toBeUndefined();
  });

  it("non-owner member is forbidden from changing status", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const member = await seedUser(env.store, { name: "Member" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, member.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);

    const result = await env.execute(SET_STATUS, {
      id: s.id, status: "accepted", requesterId: member.id,
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("FORBIDDEN");
  });
});
