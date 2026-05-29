// ============================================================
// SuggestIt - mockData & generateId Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateId,
  createMockUser,
  createMockUsers,
  MOCK_CURRENT_USER,
  seedAppData,
} from "../../src/data/mockData";

// ── generateId ─────────────────────────────────────────────

describe("generateId", () => {
  it("generates a string id", () => {
    expect(typeof generateId()).toBe("string");
  });

  it("includes the given prefix", () => {
    const id = generateId("group");
    expect(id.startsWith("group_")).toBe(true);
  });

  it("uses 'id' as default prefix", () => {
    const id = generateId();
    expect(id.startsWith("id_")).toBe(true);
  });

  it("generates unique ids on successive calls", () => {
    const a = generateId("x");
    const b = generateId("x");
    expect(a).not.toBe(b);
  });
});

// ── createMockUser ─────────────────────────────────────────

describe("createMockUser", () => {
  it("creates a user with required fields", () => {
    const user = createMockUser();
    expect(user.id).toBeTruthy();
    expect(user.name).toBeTruthy();
    expect(user.email).toBeTruthy();
    expect(user.createdAt).toBeTruthy();
  });

  it("applies overrides", () => {
    const user = createMockUser({ name: "Custom Name", email: "custom@test.com" });
    expect(user.name).toBe("Custom Name");
    expect(user.email).toBe("custom@test.com");
  });

  it("uses the override id when provided", () => {
    const user = createMockUser({ id: "my_custom_id" });
    expect(user.id).toBe("my_custom_id");
  });
});

// ── createMockUsers ────────────────────────────────────────

describe("createMockUsers", () => {
  it("creates the requested number of users", () => {
    const users = createMockUsers(4);
    expect(users).toHaveLength(4);
  });

  it("defaults to 8 users", () => {
    const users = createMockUsers();
    expect(users).toHaveLength(8);
  });

  it("every user has a unique id", () => {
    const users = createMockUsers(8);
    const ids = users.map((u) => u.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(8);
  });
});

// ── MOCK_CURRENT_USER ──────────────────────────────────────

describe("MOCK_CURRENT_USER", () => {
  it("has the expected fixed id", () => {
    expect(MOCK_CURRENT_USER.id).toBe("user_0001");
  });

  it("has a name", () => {
    expect(MOCK_CURRENT_USER.name).toBeTruthy();
  });
});

// ── seedAppData ────────────────────────────────────────────

describe("seedAppData", () => {
  let seed: ReturnType<typeof seedAppData>;

  beforeEach(() => {
    seed = seedAppData();
  });

  it("returns a currentUser", () => {
    expect(seed.currentUser).toBeDefined();
    expect(seed.currentUser.id).toBe("user_0001");
  });

  it("returns at least one group", () => {
    expect(seed.groups.length).toBeGreaterThan(0);
  });

  it("returns at least one user", () => {
    expect(seed.users.length).toBeGreaterThan(0);
  });

  it("returns suggestions", () => {
    expect(seed.suggestions.length).toBeGreaterThan(0);
  });

  it("every suggestion belongs to an existing group", () => {
    const groupIds = new Set(seed.groups.map((g) => g.id));
    for (const s of seed.suggestions) {
      expect(groupIds.has(s.groupId)).toBe(true);
    }
  });

  it("group.suggestionCount matches the actual suggestion count", () => {
    for (const g of seed.groups) {
      const actual = seed.suggestions.filter((s) => s.groupId === g.id).length;
      expect(g.suggestionCount).toBe(actual);
    }
  });

  it("every alchemy result has two sourceIds", () => {
    for (const a of seed.alchemyResults) {
      expect(a.sourceIds).toHaveLength(2);
    }
  });

  it("every group has at least one member (owner)", () => {
    for (const g of seed.groups) {
      expect(g.members.length).toBeGreaterThan(0);
      expect(g.members.some((m) => m.role === "owner")).toBe(true);
    }
  });
});
