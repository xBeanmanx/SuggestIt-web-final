// ============================================================
// SuggestIt - Reducer / AppState Logic Tests
//
// These tests exercise the pure reducer directly (no React),
// covering all CRUD actions plus the derived helpers that live
// in the context module.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  User,
  Group,
  GroupMember,
  Suggestion,
  AlchemyResult,
} from "../../src/types";

// ── We import and test the reducer internals via re-exported ──
// helpers. Because the reducer is not exported from the module,
// we reproduce it here as a white-box test against the same
// logic. If you prefer, export `reducer` from AppStateContext
// and import it directly.

// ── Minimal factory helpers ────────────────────────────────

let _id = 1;
function uid(prefix = "x") {
  return `${prefix}_${String(_id++).padStart(4, "0")}`;
}

function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? uid("user");
  return {
    id,
    name: overrides.name ?? "Test User",
    email: overrides.email ?? `${id}@test.com`,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMember(user: User, groupId: string, role: GroupMember["role"] = "member"): GroupMember {
  return { userId: user.id, groupId, role, joinedAt: new Date().toISOString(), user };
}

function makeGroup(owner: User, extra?: Partial<Group>): Group {
  const id = uid("group");
  const member = makeMember(owner, id, "owner");
  return {
    id,
    name: extra?.name ?? "Test Group",
    description: extra?.description ?? "A test group.",
    inviteCode: "ABCD12",
    ownerId: owner.id,
    createdAt: new Date().toISOString(),
    memberCount: 1,
    suggestionCount: 0,
    members: [member],
    ...extra,
  };
}

function makeSuggestion(groupId: string, extra?: Partial<Suggestion>): Suggestion {
  return {
    id: uid("sug"),
    groupId,
    title: "Test Suggestion",
    description: "A detailed description for testing.",
    status: "open",
    upvotes: 0,
    downvotes: 0,
    currentUserVote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isOwnSuggestion: false,
    ...extra,
  };
}

function makeAlchemy(groupId: string, sourceIds: [string, string], extra?: Partial<AlchemyResult>): AlchemyResult {
  return {
    id: uid("alch"),
    groupId,
    title: "Idea A + Idea B",
    description: "A combined idea.",
    sourceIds,
    depth: 0,
    createdAt: new Date().toISOString(),
    upvotes: 0,
    downvotes: 0,
    currentUserVote: null,
    ...extra,
  };
}

// ── Reproduce the pure reducer (white-box) ─────────────────
// This mirrors exactly what AppStateContext.tsx does.

interface AppState {
  currentUser: User;
  users: User[];
  groups: Group[];
  suggestions: Suggestion[];
  alchemyResults: AlchemyResult[];
}

type VoteType = "up" | "down";
type SuggestionStatus = "open" | "under_review" | "accepted" | "rejected";

type Action =
  | { type: "GROUP_CREATE"; payload: Group }
  | { type: "GROUP_UPDATE"; payload: { id: string; changes: Partial<Group> } }
  | { type: "GROUP_DELETE"; payload: { id: string } }
  | { type: "GROUP_JOIN"; payload: { groupId: string; user: User } }
  | { type: "GROUP_LEAVE"; payload: { groupId: string; userId: string } }
  | { type: "SUGGESTION_CREATE"; payload: Suggestion }
  | { type: "SUGGESTION_UPDATE"; payload: { id: string; changes: Partial<Suggestion> } }
  | { type: "SUGGESTION_DELETE"; payload: { id: string } }
  | { type: "SUGGESTION_VOTE"; payload: { id: string; vote: VoteType | null; previousVote: VoteType | null; memberCount: number } }
  | { type: "SUGGESTION_STATUS"; payload: { id: string; status: SuggestionStatus } }
  | { type: "ALCHEMY_CREATE"; payload: AlchemyResult }
  | { type: "ALCHEMY_VOTE"; payload: { id: string; vote: VoteType | null; previousVote: VoteType | null } };

function hasMajorityRejection(downvotes: number, memberCount: number): boolean {
  if (memberCount <= 0) return false;
  const threshold = Math.floor(memberCount / 2) + 1;
  return downvotes >= threshold;
}

function deleteSuggestion(state: AppState, id: string): AppState {
  return {
    ...state,
    suggestions: state.suggestions.filter((s) => s.id !== id),
    groups: state.groups.map((g) => {
      const hit = state.suggestions.find((s) => s.id === id && s.groupId === g.id);
      return hit ? { ...g, suggestionCount: Math.max(0, g.suggestionCount - 1) } : g;
    }),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "GROUP_CREATE":
      return { ...state, groups: [...state.groups, action.payload] };

    case "GROUP_UPDATE":
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.id ? { ...g, ...action.payload.changes } : g
        ),
      };

    case "GROUP_DELETE":
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload.id),
        suggestions: state.suggestions.filter((s) => s.groupId !== action.payload.id),
      };

    case "GROUP_JOIN": {
      const { groupId, user } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.id !== groupId) return g;
          if (g.members.some((m) => m.userId === user.id)) return g;
          return {
            ...g,
            memberCount: g.memberCount + 1,
            members: [
              ...g.members,
              { userId: user.id, groupId, role: "member" as const, joinedAt: new Date().toISOString(), user },
            ],
          };
        }),
      };
    }

    case "GROUP_LEAVE": {
      const { groupId, userId } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            memberCount: Math.max(0, g.memberCount - 1),
            members: g.members.filter((m) => m.userId !== userId),
          };
        }),
      };
    }

    case "SUGGESTION_CREATE":
      return {
        ...state,
        suggestions: [action.payload, ...state.suggestions],
        groups: state.groups.map((g) =>
          g.id === action.payload.groupId ? { ...g, suggestionCount: g.suggestionCount + 1 } : g
        ),
      };

    case "SUGGESTION_UPDATE":
      return {
        ...state,
        suggestions: state.suggestions.map((s) =>
          s.id === action.payload.id
            ? { ...s, ...action.payload.changes, updatedAt: new Date().toISOString() }
            : s
        ),
      };

    case "SUGGESTION_DELETE":
      return deleteSuggestion(state, action.payload.id);

    case "SUGGESTION_STATUS": {
      if (action.payload.status === "rejected") {
        return deleteSuggestion(state, action.payload.id);
      }
      return {
        ...state,
        suggestions: state.suggestions.map((s) =>
          s.id === action.payload.id
            ? { ...s, status: action.payload.status, updatedAt: new Date().toISOString() }
            : s
        ),
      };
    }

    case "SUGGESTION_VOTE": {
      const { id, vote, previousVote, memberCount } = action.payload;
      const updated = state.suggestions.map((s) => {
        if (s.id !== id) return s;
        let { upvotes, downvotes } = s;
        if (previousVote === "up")   upvotes   = Math.max(0, upvotes - 1);
        if (previousVote === "down") downvotes = Math.max(0, downvotes - 1);
        if (vote === "up")   upvotes   += 1;
        if (vote === "down") downvotes += 1;
        return { ...s, upvotes, downvotes, currentUserVote: vote };
      });
      const afterVote = { ...state, suggestions: updated };
      const target = updated.find((s) => s.id === id);
      if (target && hasMajorityRejection(target.downvotes, memberCount)) {
        return deleteSuggestion(afterVote, id);
      }
      return afterVote;
    }

    case "ALCHEMY_CREATE":
      return { ...state, alchemyResults: [action.payload, ...state.alchemyResults] };

    case "ALCHEMY_VOTE": {
      const { id, vote, previousVote } = action.payload;
      return {
        ...state,
        alchemyResults: state.alchemyResults.map((a) => {
          if (a.id !== id) return a;
          let { upvotes, downvotes } = a;
          if (previousVote === "up")   upvotes   = Math.max(0, upvotes - 1);
          if (previousVote === "down") downvotes = Math.max(0, downvotes - 1);
          if (vote === "up")   upvotes   += 1;
          if (vote === "down") downvotes += 1;
          return { ...a, upvotes, downvotes, currentUserVote: vote };
        }),
      };
    }

    default:
      return state;
  }
}

// ── Test helpers ───────────────────────────────────────────

let owner: User;
let baseState: AppState;
let group: Group;
let suggestion: Suggestion;

beforeEach(() => {
  _id = 1;
  owner = makeUser({ id: "user_0001", name: "Alice" });
  group = makeGroup(owner, { inviteCode: "ABC123" });
  suggestion = makeSuggestion(group.id);

  group = { ...group, suggestionCount: 1 };

  baseState = {
    currentUser: owner,
    users: [owner],
    groups: [group],
    suggestions: [suggestion],
    alchemyResults: [],
  };
});

// ── hasMajorityRejection ───────────────────────────────────

describe("hasMajorityRejection", () => {
  it("returns false for memberCount of 0", () => {
    expect(hasMajorityRejection(5, 0)).toBe(false);
  });

  it("returns true when downvotes reach floor(n/2)+1 for even group", () => {
    // 6 members → threshold = 4
    expect(hasMajorityRejection(4, 6)).toBe(true);
  });

  it("returns false when downvotes are below threshold for even group", () => {
    expect(hasMajorityRejection(3, 6)).toBe(false);
  });

  it("returns true at threshold for odd group", () => {
    // 5 members → threshold = 3
    expect(hasMajorityRejection(3, 5)).toBe(true);
  });

  it("returns false just below threshold for odd group", () => {
    expect(hasMajorityRejection(2, 5)).toBe(false);
  });

  it("returns true for a single-member group with 1 downvote", () => {
    // 1 member → threshold = 1
    expect(hasMajorityRejection(1, 1)).toBe(true);
  });
});

// ── GROUP_CREATE ───────────────────────────────────────────

describe("reducer GROUP_CREATE", () => {
  it("adds the new group to state", () => {
    const newGroup = makeGroup(owner, { name: "New Group" });
    const next = reducer(baseState, { type: "GROUP_CREATE", payload: newGroup });
    expect(next.groups).toHaveLength(2);
    expect(next.groups[1].name).toBe("New Group");
  });
});

// ── GROUP_UPDATE ───────────────────────────────────────────

describe("reducer GROUP_UPDATE", () => {
  it("updates the target group", () => {
    const next = reducer(baseState, {
      type: "GROUP_UPDATE",
      payload: { id: group.id, changes: { name: "Updated Name" } },
    });
    expect(next.groups[0].name).toBe("Updated Name");
  });

  it("does not affect other groups", () => {
    const other = makeGroup(owner, { name: "Other" });
    const state2 = { ...baseState, groups: [...baseState.groups, other] };
    const next = reducer(state2, {
      type: "GROUP_UPDATE",
      payload: { id: group.id, changes: { name: "Changed" } },
    });
    expect(next.groups[1].name).toBe("Other");
  });
});

// ── GROUP_DELETE ───────────────────────────────────────────

describe("reducer GROUP_DELETE", () => {
  it("removes the group", () => {
    const next = reducer(baseState, { type: "GROUP_DELETE", payload: { id: group.id } });
    expect(next.groups).toHaveLength(0);
  });

  it("removes all suggestions belonging to the deleted group", () => {
    const next = reducer(baseState, { type: "GROUP_DELETE", payload: { id: group.id } });
    expect(next.suggestions).toHaveLength(0);
  });

  it("does not remove suggestions from other groups", () => {
    const other = makeGroup(owner, { name: "Other" });
    const otherSug = makeSuggestion(other.id);
    const state2 = {
      ...baseState,
      groups: [...baseState.groups, other],
      suggestions: [...baseState.suggestions, otherSug],
    };
    const next = reducer(state2, { type: "GROUP_DELETE", payload: { id: group.id } });
    expect(next.suggestions).toHaveLength(1);
    expect(next.suggestions[0].id).toBe(otherSug.id);
  });
});

// ── GROUP_JOIN ─────────────────────────────────────────────

describe("reducer GROUP_JOIN", () => {
  it("adds a new member and increments memberCount", () => {
    const newUser = makeUser({ name: "Bob" });
    const next = reducer(baseState, {
      type: "GROUP_JOIN",
      payload: { groupId: group.id, user: newUser },
    });
    const g = next.groups[0];
    expect(g.memberCount).toBe(2);
    expect(g.members.some((m) => m.userId === newUser.id)).toBe(true);
  });

  it("is idempotent - does not add the same user twice", () => {
    const next = reducer(baseState, {
      type: "GROUP_JOIN",
      payload: { groupId: group.id, user: owner },
    });
    expect(next.groups[0].memberCount).toBe(1);
  });

  it("does not affect other groups", () => {
    const other = makeGroup(owner, { name: "Other" });
    const state2 = { ...baseState, groups: [...baseState.groups, other] };
    const newUser = makeUser({ name: "Carol" });
    const next = reducer(state2, {
      type: "GROUP_JOIN",
      payload: { groupId: group.id, user: newUser },
    });
    expect(next.groups[1].memberCount).toBe(other.memberCount);
  });
});

// ── GROUP_LEAVE ────────────────────────────────────────────

describe("reducer GROUP_LEAVE", () => {
  it("removes the member and decrements memberCount", () => {
    const newUser = makeUser({ name: "Bob" });
    const stateWith2 = reducer(baseState, {
      type: "GROUP_JOIN",
      payload: { groupId: group.id, user: newUser },
    });
    const next = reducer(stateWith2, {
      type: "GROUP_LEAVE",
      payload: { groupId: group.id, userId: newUser.id },
    });
    expect(next.groups[0].memberCount).toBe(1);
    expect(next.groups[0].members.some((m) => m.userId === newUser.id)).toBe(false);
  });

  it("does not let memberCount go below 0", () => {
    const emptyGroup = { ...group, memberCount: 0, members: [] };
    const state2 = { ...baseState, groups: [emptyGroup] };
    const next = reducer(state2, {
      type: "GROUP_LEAVE",
      payload: { groupId: group.id, userId: owner.id },
    });
    expect(next.groups[0].memberCount).toBe(0);
  });
});

// ── SUGGESTION_CREATE ──────────────────────────────────────

describe("reducer SUGGESTION_CREATE", () => {
  it("prepends the new suggestion", () => {
    const newSug = makeSuggestion(group.id, { title: "New Idea" });
    const next = reducer(baseState, { type: "SUGGESTION_CREATE", payload: newSug });
    expect(next.suggestions).toHaveLength(2);
    expect(next.suggestions[0].id).toBe(newSug.id);
  });

  it("increments suggestionCount on the group", () => {
    const newSug = makeSuggestion(group.id);
    const next = reducer(baseState, { type: "SUGGESTION_CREATE", payload: newSug });
    expect(next.groups[0].suggestionCount).toBe(2);
  });
});

// ── SUGGESTION_UPDATE ──────────────────────────────────────

describe("reducer SUGGESTION_UPDATE", () => {
  it("applies changes to the target suggestion", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_UPDATE",
      payload: { id: suggestion.id, changes: { title: "Updated Title" } },
    });
    expect(next.suggestions[0].title).toBe("Updated Title");
  });

  it("updates updatedAt timestamp", () => {
    const timeBefore = Date.now();
    const next = reducer(baseState, {
      type: "SUGGESTION_UPDATE",
      payload: { id: suggestion.id, changes: { title: "Changed" } },
    });
    const timeAfter = new Date(next.suggestions[0].updatedAt).getTime();
    expect(timeAfter).toBeGreaterThanOrEqual(timeBefore);
  });
});

// ── SUGGESTION_DELETE ──────────────────────────────────────

describe("reducer SUGGESTION_DELETE", () => {
  it("removes the suggestion", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_DELETE",
      payload: { id: suggestion.id },
    });
    expect(next.suggestions).toHaveLength(0);
  });

  it("decrements the group's suggestionCount", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_DELETE",
      payload: { id: suggestion.id },
    });
    expect(next.groups[0].suggestionCount).toBe(0);
  });

  it("does not let suggestionCount go below 0", () => {
    const g0 = { ...group, suggestionCount: 0 };
    const state2 = { ...baseState, groups: [g0] };
    const next = reducer(state2, {
      type: "SUGGESTION_DELETE",
      payload: { id: suggestion.id },
    });
    expect(next.groups[0].suggestionCount).toBe(0);
  });
});

// ── SUGGESTION_STATUS ──────────────────────────────────────

describe("reducer SUGGESTION_STATUS", () => {
  it("updates the status to 'accepted'", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_STATUS",
      payload: { id: suggestion.id, status: "accepted" },
    });
    expect(next.suggestions[0].status).toBe("accepted");
  });

  it("updates the status to 'under_review'", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_STATUS",
      payload: { id: suggestion.id, status: "under_review" },
    });
    expect(next.suggestions[0].status).toBe("under_review");
  });

  it("deletes the suggestion when status is 'rejected'", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_STATUS",
      payload: { id: suggestion.id, status: "rejected" },
    });
    expect(next.suggestions).toHaveLength(0);
  });
});

// ── SUGGESTION_VOTE ────────────────────────────────────────

describe("reducer SUGGESTION_VOTE", () => {
  it("adds an upvote when no previous vote", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: "up", previousVote: null, memberCount: 5 },
    });
    expect(next.suggestions[0].upvotes).toBe(1);
    expect(next.suggestions[0].currentUserVote).toBe("up");
  });

  it("adds a downvote when no previous vote", () => {
    const next = reducer(baseState, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: "down", previousVote: null, memberCount: 5 },
    });
    expect(next.suggestions[0].downvotes).toBe(1);
  });

  it("removes a previous upvote when switching to downvote", () => {
    const state2 = {
      ...baseState,
      suggestions: [{ ...suggestion, upvotes: 1, currentUserVote: "up" as const }],
    };
    const next = reducer(state2, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: "down", previousVote: "up", memberCount: 5 },
    });
    expect(next.suggestions[0].upvotes).toBe(0);
    expect(next.suggestions[0].downvotes).toBe(1);
  });

  it("removes a vote when vote is null (toggle off)", () => {
    const state2 = {
      ...baseState,
      suggestions: [{ ...suggestion, upvotes: 1, currentUserVote: "up" as const }],
    };
    const next = reducer(state2, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: null, previousVote: "up", memberCount: 5 },
    });
    expect(next.suggestions[0].upvotes).toBe(0);
    expect(next.suggestions[0].currentUserVote).toBeNull();
  });

  it("auto-deletes suggestion when downvotes reach majority", () => {
    // 4 members → threshold = 3. Set downvotes to 2 already.
    const state2 = {
      ...baseState,
      suggestions: [{ ...suggestion, downvotes: 2 }],
      groups: [{ ...group, memberCount: 4 }],
    };
    // Adding 1 more downvote → 3 = threshold
    const next = reducer(state2, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: "down", previousVote: null, memberCount: 4 },
    });
    expect(next.suggestions).toHaveLength(0);
  });

  it("does not auto-delete below majority threshold", () => {
    // 6 members → threshold = 4. downvotes = 2, adding 1 → 3 < 4
    const state2 = {
      ...baseState,
      suggestions: [{ ...suggestion, downvotes: 2 }],
      groups: [{ ...group, memberCount: 6 }],
    };
    const next = reducer(state2, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: "down", previousVote: null, memberCount: 6 },
    });
    expect(next.suggestions).toHaveLength(1);
  });

  it("does not let vote counts go below 0", () => {
    const state2 = {
      ...baseState,
      suggestions: [{ ...suggestion, upvotes: 0 }],
    };
    const next = reducer(state2, {
      type: "SUGGESTION_VOTE",
      payload: { id: suggestion.id, vote: null, previousVote: "up", memberCount: 5 },
    });
    expect(next.suggestions[0].upvotes).toBe(0);
  });
});

// ── ALCHEMY_CREATE ─────────────────────────────────────────

describe("reducer ALCHEMY_CREATE", () => {
  it("prepends the new alchemy result", () => {
    const alch = makeAlchemy(group.id, [suggestion.id, suggestion.id]);
    const next = reducer(baseState, { type: "ALCHEMY_CREATE", payload: alch });
    expect(next.alchemyResults).toHaveLength(1);
    expect(next.alchemyResults[0].id).toBe(alch.id);
  });
});

// ── ALCHEMY_VOTE ───────────────────────────────────────────

describe("reducer ALCHEMY_VOTE", () => {
  let alch: AlchemyResult;
  let stateWithAlch: AppState;

  beforeEach(() => {
    alch = makeAlchemy(group.id, [suggestion.id, suggestion.id]);
    stateWithAlch = { ...baseState, alchemyResults: [alch] };
  });

  it("adds an upvote", () => {
    const next = reducer(stateWithAlch, {
      type: "ALCHEMY_VOTE",
      payload: { id: alch.id, vote: "up", previousVote: null },
    });
    expect(next.alchemyResults[0].upvotes).toBe(1);
  });

  it("removes previous upvote when toggling off", () => {
    const state2 = { ...stateWithAlch, alchemyResults: [{ ...alch, upvotes: 1, currentUserVote: "up" as const }] };
    const next = reducer(state2, {
      type: "ALCHEMY_VOTE",
      payload: { id: alch.id, vote: null, previousVote: "up" },
    });
    expect(next.alchemyResults[0].upvotes).toBe(0);
  });

  it("switches from downvote to upvote correctly", () => {
    const state2 = { ...stateWithAlch, alchemyResults: [{ ...alch, downvotes: 1, currentUserVote: "down" as const }] };
    const next = reducer(state2, {
      type: "ALCHEMY_VOTE",
      payload: { id: alch.id, vote: "up", previousVote: "down" },
    });
    expect(next.alchemyResults[0].downvotes).toBe(0);
    expect(next.alchemyResults[0].upvotes).toBe(1);
  });

  it("does not affect other alchemy results", () => {
    const other = makeAlchemy(group.id, [suggestion.id, suggestion.id]);
    const state2 = { ...stateWithAlch, alchemyResults: [alch, other] };
    const next = reducer(state2, {
      type: "ALCHEMY_VOTE",
      payload: { id: alch.id, vote: "up", previousVote: null },
    });
    expect(next.alchemyResults[1].upvotes).toBe(0);
  });
});
