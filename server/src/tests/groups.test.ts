// ============================================================
// SuggestIt Server Tests  Groups CRUD
// ============================================================

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestServer, getData, getErrors, seedUser, seedGroup } from "./helpers.js";

let env: ReturnType<typeof createTestServer>;

beforeEach(async () => {
  env = createTestServer();
  await env.server.start();
});

afterAll(async () => {
  await env.server.stop();
});

//  Fragments / Operations 

const GROUP_FIELDS = `
  id name description inviteCode ownerId createdAt memberCount suggestionCount
  members { userId role user { id name } }
`;

const CREATE_GROUP = /* GraphQL */ `
  mutation CreateGroup($input: CreateGroupInput!) {
    createGroup(input: $input) { ${GROUP_FIELDS} }
  }
`;

const GET_GROUPS = /* GraphQL */ `
  query GetGroups { groups { ${GROUP_FIELDS} } }
`;

const GET_GROUP = /* GraphQL */ `
  query GetGroup($id: ID!) { group(id: $id) { ${GROUP_FIELDS} } }
`;

const GET_GROUP_BY_INVITE = /* GraphQL */ `
  query GetGroupByInviteCode($inviteCode: String!) {
    groupByInviteCode(inviteCode: $inviteCode) { ${GROUP_FIELDS} }
  }
`;

const UPDATE_GROUP = /* GraphQL */ `
  mutation UpdateGroup($id: ID!, $input: UpdateGroupInput!) {
    updateGroup(id: $id, input: $input) { ${GROUP_FIELDS} }
  }
`;

const DELETE_GROUP = /* GraphQL */ `
  mutation DeleteGroup($id: ID!) { deleteGroup(id: $id) }
`;

const JOIN_GROUP = /* GraphQL */ `
  mutation JoinGroup($inviteCode: String!, $userId: ID!) {
    joinGroup(inviteCode: $inviteCode, userId: $userId) { ${GROUP_FIELDS} }
  }
`;

const LEAVE_GROUP = /* GraphQL */ `
  mutation LeaveGroup($groupId: ID!, $userId: ID!) {
    leaveGroup(groupId: $groupId, userId: $userId)
  }
`;

//  CREATE 

describe("createGroup", () => {
  it("creates a group with valid data", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "My Group", description: "A test group", memberIds: [user.id] },
    });
    const data = getData<{ createGroup: { id: string; name: string; ownerId: string } }>(result);
    expect(data.createGroup.id).toBeTruthy();
    expect(data.createGroup.name).toBe("My Group");
    expect(data.createGroup.ownerId).toBe(user.id);
  });

  it("owner is automatically added as a member with role owner", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "Owner Test", description: "desc", memberIds: [user.id] },
    });
    const data = getData<{ createGroup: { members: { userId: string; role: string }[] } }>(result);
    const ownerMember = data.createGroup.members.find((m) => m.userId === user.id);
    expect(ownerMember).toBeDefined();
    expect(ownerMember?.role).toBe("owner");
  });

  it("memberCount reflects the initial members", async () => {
    const u1 = seedUser(env.store, { name: "U1" });
    const u2 = seedUser(env.store, { name: "U2" });
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "Multi Member", description: "desc", memberIds: [u1.id, u2.id] },
    });
    const data = getData<{ createGroup: { memberCount: number } }>(result);
    expect(data.createGroup.memberCount).toBe(2);
  });

  it("generates a 6-character invite code", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "Invite Test", description: "desc", memberIds: [user.id] },
    });
    const data = getData<{ createGroup: { inviteCode: string } }>(result);
    expect(data.createGroup.inviteCode).toHaveLength(6);
  });

  it("rejects a name shorter than 3 characters", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "AB", description: "desc", memberIds: [user.id] },
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("rejects a name longer than 50 characters", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "A".repeat(51), description: "desc", memberIds: [user.id] },
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("accepts a name of exactly 3 characters", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "ABC", description: "desc", memberIds: [user.id] },
    });
    expect(getErrors(result)).toHaveLength(0);
  });

  it("rejects a description longer than 300 characters", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "Valid Name", description: "D".repeat(301), memberIds: [user.id] },
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND when owner user does not exist", async () => {
    const result = await env.execute(CREATE_GROUP, {
      input: { name: "Ghost Group", description: "desc", memberIds: ["nonexistent-user"] },
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
  });
});

//  READ 

describe("groups / group queries", () => {
  it("returns empty array when no groups exist", async () => {
    const result = await env.execute(GET_GROUPS);
    const data = getData<{ groups: unknown[] }>(result);
    expect(data.groups).toHaveLength(0);
  });

  it("returns all created groups", async () => {
    const user = seedUser(env.store);
    seedGroup(env.store, user.id, { name: "Group One" });
    seedGroup(env.store, user.id, { name: "Group Two" });

    const result = await env.execute(GET_GROUPS);
    const data = getData<{ groups: { name: string }[] }>(result);
    expect(data.groups).toHaveLength(2);
  });

  it("fetches a single group by id", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id, { name: "Find Me" });

    const result = await env.execute(GET_GROUP, { id: group.id });
    const data = getData<{ group: { id: string; name: string } }>(result);
    expect(data.group.id).toBe(group.id);
    expect(data.group.name).toBe("Find Me");
  });

  it("returns null for an unknown group id", async () => {
    const result = await env.execute(GET_GROUP, { id: "ghost-id" });
    const data = getData<{ group: null }>(result);
    expect(data.group).toBeNull();
  });

  it("finds a group by invite code (case-insensitive)", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id);
    const lower = group.inviteCode.toLowerCase();

    const result = await env.execute(GET_GROUP_BY_INVITE, { inviteCode: lower });
    const data = getData<{ groupByInviteCode: { id: string } }>(result);
    expect(data.groupByInviteCode.id).toBe(group.id);
  });

  it("returns null for an invalid invite code", async () => {
    const result = await env.execute(GET_GROUP_BY_INVITE, { inviteCode: "XXXXXX" });
    const data = getData<{ groupByInviteCode: null }>(result);
    expect(data.groupByInviteCode).toBeNull();
  });
});

//  UPDATE 

describe("updateGroup", () => {
  it("updates name and description", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id, { name: "Old Name" });

    const result = await env.execute(UPDATE_GROUP, {
      id: group.id,
      input: { name: "New Name", description: "New description" },
    });
    const data = getData<{ updateGroup: { name: string; description: string } }>(result);
    expect(data.updateGroup.name).toBe("New Name");
    expect(data.updateGroup.description).toBe("New description");
  });

  it("partial update only changes the provided fields", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id, { name: "Keep Name", description: "Keep Desc" });

    const result = await env.execute(UPDATE_GROUP, {
      id: group.id,
      input: { name: "New Name Only" },
    });
    const data = getData<{ updateGroup: { name: string; description: string } }>(result);
    expect(data.updateGroup.name).toBe("New Name Only");
    expect(data.updateGroup.description).toBe("Keep Desc");
  });

  it("rejects an updated name shorter than 3 characters", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id);

    const result = await env.execute(UPDATE_GROUP, {
      id: group.id,
      input: { name: "AB" },
    });
    expect(getErrors(result).length).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND for unknown group id", async () => {
    const result = await env.execute(UPDATE_GROUP, {
      id: "ghost-id",
      input: { name: "Anything Valid" },
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});

//  DELETE 

describe("deleteGroup", () => {
  it("deletes an existing group and returns true", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id);

    const result = await env.execute(DELETE_GROUP, { id: group.id });
    const data = getData<{ deleteGroup: boolean }>(result);
    expect(data.deleteGroup).toBe(true);
    await expect(env.store.getGroupById(group.id)).resolves.toBeUndefined();
  });

  it("returns NOT_FOUND for unknown group id", async () => {
    const result = await env.execute(DELETE_GROUP, { id: "ghost-id" });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });

  it("cascades deletion to suggestions in the group", async () => {
    const user = seedUser(env.store);
    const group = seedGroup(env.store, user.id);
    env.store.createSuggestion({
      groupId: group.id,
      authorId: user.id,
      title: "To be deleted",
      description: "This suggestion will vanish with the group.",
    });
    await expect(env.store.getSuggestions(group.id)).resolves.toHaveLength(1);

    await env.execute(DELETE_GROUP, { id: group.id });
    await expect(env.store.getSuggestions(group.id)).resolves.toHaveLength(0);
  });
});

//  JOIN / LEAVE 

describe("joinGroup / leaveGroup", () => {
  it("joining increments memberCount", async () => {
    const owner = seedUser(env.store, { name: "Owner" });
    const joiner = seedUser(env.store, { name: "Joiner" });
    const group = seedGroup(env.store, owner.id);
    const initialCount = group.memberCount;

    const result = await env.execute(JOIN_GROUP, {
      inviteCode: group.inviteCode,
      userId: joiner.id,
    });
    const data = getData<{ joinGroup: { memberCount: number } }>(result);
    expect(data.joinGroup.memberCount).toBe(initialCount + 1);
  });

  it("joining with an invalid invite code returns null", async () => {
    const user = seedUser(env.store);
    const result = await env.execute(JOIN_GROUP, {
      inviteCode: "BADCOD",
      userId: user.id,
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("joining is idempotent  second join does not double memberCount", async () => {
    const owner = seedUser(env.store, { name: "Owner" });
    const joiner = seedUser(env.store, { name: "Joiner" });
    const group = seedGroup(env.store, owner.id);

    await env.execute(JOIN_GROUP, { inviteCode: group.inviteCode, userId: joiner.id });
    const result = await env.execute(JOIN_GROUP, { inviteCode: group.inviteCode, userId: joiner.id });
    const data = getData<{ joinGroup: { memberCount: number } }>(result);
    // owner + joiner = 2, not 3
    expect(data.joinGroup.memberCount).toBe(2);
  });

  it("leaving decrements memberCount", async () => {
    const owner = seedUser(env.store, { name: "Owner" });
    const member = seedUser(env.store, { name: "Member" });
    const group = seedGroup(env.store, owner.id);
    env.store.joinGroup(group.id, member.id);

    const result = await env.execute(LEAVE_GROUP, {
      groupId: group.id,
      userId: member.id,
    });
    const data = getData<{ leaveGroup: boolean }>(result);
    expect(data.leaveGroup).toBe(true);
    expect((await env.store.getGroupById(group.id))?.memberCount).toBe(1);
  });

  it("leaving a group you are not in returns false", async () => {
    const owner = seedUser(env.store, { name: "Owner" });
    const stranger = seedUser(env.store, { name: "Stranger" });
    const group = seedGroup(env.store, owner.id);

    const result = await env.execute(LEAVE_GROUP, {
      groupId: group.id,
      userId: stranger.id,
    });
    const data = getData<{ leaveGroup: boolean }>(result);
    expect(data.leaveGroup).toBe(false);
  });
});
