// ============================================================
// SuggestIt Server Tests  Stats & Alchemy
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

//  Operations 

const GROUP_STATS = /* GraphQL */ `
  query GroupStats($groupId: ID!) {
    groupStats(groupId: $groupId) {
      groupId totalSuggestions
      statusBreakdown { open under_review accepted rejected }
      totalUpvotes totalDownvotes avgUpvotesPerSuggestion
      mostActiveAuthorId alchemyCount
    }
  }
`;

const GLOBAL_STATS = /* GraphQL */ `
  query GlobalStats {
    globalStats {
      totalUsers totalGroups totalSuggestions totalAlchemyResults
      overallUpvotes overallDownvotes
    }
  }
`;

const COMBINE_IDEAS = /* GraphQL */ `
  mutation CombineIdeas($sourceId1: ID!, $sourceId2: ID!, $groupId: ID!) {
    combineIdeas(sourceId1: $sourceId1, sourceId2: $sourceId2, groupId: $groupId) {
      id groupId title description sourceIds depth upvotes downvotes
    }
  }
`;

const VOTE_ALCHEMY = /* GraphQL */ `
  mutation VoteAlchemy($id: ID!, $userId: ID!, $vote: VoteType) {
    voteAlchemy(id: $id, userId: $userId, vote: $vote) { id upvotes downvotes }
  }
`;

const GET_ALCHEMY_RESULTS = /* GraphQL */ `
  query AlchemyResults($groupId: ID!) {
    alchemyResults(groupId: $groupId) { id title depth sourceIds }
  }
`;

const GET_ALCHEMY_RESULT = /* GraphQL */ `
  query AlchemyResult($id: ID!) {
    alchemyResult(id: $id) { id title groupId }
  }
`;

//  Group Stats 

describe("groupStats", () => {
  it("returns zero stats for a group with no suggestions", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{ groupStats: { totalSuggestions: number; alchemyCount: number } }>(result);
    expect(data.groupStats.totalSuggestions).toBe(0);
    expect(data.groupStats.alchemyCount).toBe(0);
  });

  it("counts suggestions correctly", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    await seedSuggestion(env.store, group.id, user.id);
    await seedSuggestion(env.store, group.id, user.id);

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{ groupStats: { totalSuggestions: number } }>(result);
    expect(data.groupStats.totalSuggestions).toBe(2);
  });

  it("status breakdown reflects actual statuses", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id); // open
    const s2 = await seedSuggestion(env.store, group.id, user.id);
    await env.store.setSuggestionStatus(s2.id, "accepted");
    const s3 = await seedSuggestion(env.store, group.id, user.id);
    await env.store.setSuggestionStatus(s3.id, "under_review");

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{
      groupStats: { statusBreakdown: { open: number; accepted: number; under_review: number } };
    }>(result);
    expect(data.groupStats.statusBreakdown.open).toBe(1);
    expect(data.groupStats.statusBreakdown.accepted).toBe(1);
    expect(data.groupStats.statusBreakdown.under_review).toBe(1);
  });

  it("tallies upvotes from votes", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const voter = await seedUser(env.store, { name: "Voter" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, voter.id);
    const s = await seedSuggestion(env.store, group.id, owner.id);
    await env.store.voteSuggestion(s.id, owner.id, "up");
    await env.store.voteSuggestion(s.id, voter.id, "up");

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{ groupStats: { totalUpvotes: number } }>(result);
    expect(data.groupStats.totalUpvotes).toBe(2);
  });

  it("calculates avgUpvotesPerSuggestion correctly", async () => {
    const user = await seedUser(env.store);
    const voter = await seedUser(env.store, { name: "Voter" });
    const group = await seedGroup(env.store, user.id);
    await env.store.joinGroup(group.id, voter.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id);
    const s2 = await seedSuggestion(env.store, group.id, user.id);
    await env.store.voteSuggestion(s1.id, user.id, "up");
    await env.store.voteSuggestion(s1.id, voter.id, "up");
    // s2 has 0 votes  avg = 2/2 = 1

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{ groupStats: { avgUpvotesPerSuggestion: number } }>(result);
    expect(data.groupStats.avgUpvotesPerSuggestion).toBe(1);
  });

  it("identifies the most active author", async () => {
    const owner = await seedUser(env.store, { name: "Owner" });
    const prolific = await seedUser(env.store, { name: "Prolific" });
    const group = await seedGroup(env.store, owner.id);
    await env.store.joinGroup(group.id, prolific.id);

    await seedSuggestion(env.store, group.id, owner.id);
    await seedSuggestion(env.store, group.id, prolific.id);
    await seedSuggestion(env.store, group.id, prolific.id);

    const result = await env.execute(GROUP_STATS, { groupId: group.id });
    const data = getData<{ groupStats: { mostActiveAuthorId: string } }>(result);
    expect(data.groupStats.mostActiveAuthorId).toBe(prolific.id);
  });

  it("returns NOT_FOUND for unknown group", async () => {
    const result = await env.execute(GROUP_STATS, { groupId: "ghost-id" });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});

//  Global Stats 

describe("globalStats", () => {
  it("returns zeroes when store is empty", async () => {
    const result = await env.execute(GLOBAL_STATS);
    const data = getData<{
      globalStats: { totalUsers: number; totalGroups: number; totalSuggestions: number };
    }>(result);
    expect(data.globalStats.totalUsers).toBe(0);
    expect(data.globalStats.totalGroups).toBe(0);
    expect(data.globalStats.totalSuggestions).toBe(0);
  });

  it("counts users, groups and suggestions across all groups", async () => {
    const u1 = await seedUser(env.store, { name: "U1" });
    const u2 = await seedUser(env.store, { name: "U2" });
    const g1 = await seedGroup(env.store, u1.id);
    const g2 = await seedGroup(env.store, u2.id);
    await seedSuggestion(env.store, g1.id, u1.id);
    await seedSuggestion(env.store, g2.id, u2.id);

    const result = await env.execute(GLOBAL_STATS);
    const data = getData<{
      globalStats: { totalUsers: number; totalGroups: number; totalSuggestions: number };
    }>(result);
    expect(data.globalStats.totalUsers).toBe(2);
    expect(data.globalStats.totalGroups).toBe(2);
    expect(data.globalStats.totalSuggestions).toBe(2);
  });

  it("accumulates overallUpvotes across all groups", async () => {
    const user = await seedUser(env.store);
    const voter = await seedUser(env.store, { name: "Voter" });
    const g1 = await seedGroup(env.store, user.id);
    const g2 = await seedGroup(env.store, user.id);
    await env.store.joinGroup(g1.id, voter.id);
    await env.store.joinGroup(g2.id, voter.id);
    const s1 = await seedSuggestion(env.store, g1.id, user.id);
    const s2 = await seedSuggestion(env.store, g2.id, user.id);
    await env.store.voteSuggestion(s1.id, voter.id, "up");
    await env.store.voteSuggestion(s2.id, voter.id, "up");

    const result = await env.execute(GLOBAL_STATS);
    const data = getData<{ globalStats: { overallUpvotes: number } }>(result);
    expect(data.globalStats.overallUpvotes).toBe(2);
  });
});

//  Alchemy (1-to-many: Group  AlchemyResults) 

describe("combineIdeas", () => {
  it("creates an alchemy result from two suggestions", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "Idea Alpha" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Idea Beta" });

    const result = await env.execute(COMBINE_IDEAS, {
      sourceId1: s1.id,
      sourceId2: s2.id,
      groupId: group.id,
    });
    const data = getData<{
      combineIdeas: { id: string; title: string; sourceIds: string[]; depth: number };
    }>(result);
    expect(data.combineIdeas.id).toBeTruthy();
    expect(data.combineIdeas.title).toContain("Idea Alpha");
    expect(data.combineIdeas.title).toContain("Idea Beta");
    expect(data.combineIdeas.sourceIds).toEqual(expect.arrayContaining([s1.id, s2.id]));
    expect(data.combineIdeas.depth).toBe(0);
  });

  it("chaining alchemy increments depth", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "Alpha" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Beta" });

    const r1 = await env.execute(COMBINE_IDEAS, {
      sourceId1: s1.id, sourceId2: s2.id, groupId: group.id,
    });
    const alch1 = getData<{ combineIdeas: { id: string } }>(r1).combineIdeas;

    const s3 = await seedSuggestion(env.store, group.id, user.id, { title: "Gamma" });
    const r2 = await env.execute(COMBINE_IDEAS, {
      sourceId1: alch1.id, sourceId2: s3.id, groupId: group.id,
    });
    const data = getData<{ combineIdeas: { depth: number; title: string } }>(r2);
    expect(data.combineIdeas.depth).toBe(1);
    expect(data.combineIdeas.title).toContain("[Evolved]");
  });

  it("returns NOT_FOUND when source suggestion does not exist", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s = await seedSuggestion(env.store, group.id, user.id, { title: "Real" });

    const result = await env.execute(COMBINE_IDEAS, {
      sourceId1: s.id, sourceId2: "ghost-id", groupId: group.id,
    });
    const errors = getErrors(result);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND when group does not exist", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "X" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Y" });

    const result = await env.execute(COMBINE_IDEAS, {
      sourceId1: s1.id, sourceId2: s2.id, groupId: "ghost-group",
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});

describe("alchemyResults / alchemyResult queries", () => {
  it("returns all alchemy results for a group", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "A" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "B" });
    const s3 = await seedSuggestion(env.store, group.id, user.id, { title: "C" });

    await env.execute(COMBINE_IDEAS, { sourceId1: s1.id, sourceId2: s2.id, groupId: group.id });
    await env.execute(COMBINE_IDEAS, { sourceId1: s2.id, sourceId2: s3.id, groupId: group.id });

    const result = await env.execute(GET_ALCHEMY_RESULTS, { groupId: group.id });
    const data = getData<{ alchemyResults: unknown[] }>(result);
    expect(data.alchemyResults).toHaveLength(2);
  });

  it("returns an empty array for a group with no alchemy", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);

    const result = await env.execute(GET_ALCHEMY_RESULTS, { groupId: group.id });
    const data = getData<{ alchemyResults: unknown[] }>(result);
    expect(data.alchemyResults).toHaveLength(0);
  });

  it("fetches a single alchemy result by id", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "P" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Q" });
    const created = await env.store.createAlchemyResult({
      groupId: group.id, title: "P + Q", description: "Combined.",
      sourceIds: [s1.id, s2.id], depth: 0,
    });

    const result = await env.execute(GET_ALCHEMY_RESULT, { id: created.id });
    const data = getData<{ alchemyResult: { id: string; title: string } }>(result);
    expect(data.alchemyResult.id).toBe(created.id);
    expect(data.alchemyResult.title).toBe("P + Q");
  });

  it("returns NOT_FOUND for unknown alchemy id", async () => {
    const result = await env.execute(GET_ALCHEMY_RESULT, { id: "ghost" });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});

describe("voteAlchemy", () => {
  it("upvote increments alchemy upvotes", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "X" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Y" });
    const alchemy = await env.store.createAlchemyResult({
      groupId: group.id, title: "X + Y", description: "Combined.",
      sourceIds: [s1.id, s2.id], depth: 0,
    });

    const result = await env.execute(VOTE_ALCHEMY, {
      id: alchemy.id, userId: user.id, vote: "up",
    });
    const data = getData<{ voteAlchemy: { upvotes: number } }>(result);
    expect(data.voteAlchemy.upvotes).toBe(1);
  });

  it("voting the same way toggles off", async () => {
    const user = await seedUser(env.store);
    const group = await seedGroup(env.store, user.id);
    const s1 = await seedSuggestion(env.store, group.id, user.id, { title: "X" });
    const s2 = await seedSuggestion(env.store, group.id, user.id, { title: "Y" });
    const alchemy = await env.store.createAlchemyResult({
      groupId: group.id, title: "X + Y", description: "Combined.",
      sourceIds: [s1.id, s2.id], depth: 0,
    });

    await env.execute(VOTE_ALCHEMY, { id: alchemy.id, userId: user.id, vote: "up" });
    const result = await env.execute(VOTE_ALCHEMY, { id: alchemy.id, userId: user.id, vote: "up" });
    const data = getData<{ voteAlchemy: { upvotes: number } }>(result);
    expect(data.voteAlchemy.upvotes).toBe(0);
  });

  it("returns NOT_FOUND for unknown alchemy id", async () => {
    const user = await seedUser(env.store);
    const result = await env.execute(VOTE_ALCHEMY, {
      id: "ghost", userId: user.id, vote: "up",
    });
    const errors = getErrors(result);
    expect(errors[0].extensions?.code).toBe("NOT_FOUND");
  });
});
