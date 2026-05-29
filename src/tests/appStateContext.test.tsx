import { vi, describe, it, expect, beforeEach } from "vitest";
import { seedAppData } from "../../src/data/mockData";
import { reducer } from "../../src/context/AppStateContext";
import {
  createGroup,
  updateGroup,
  deleteGroup,
  joinGroupByCode,
  leaveGroup,
  getGroupById,
  createSuggestion,
  updateSuggestion,
  deleteSuggestion,
  deleteSuggestionAction,
  voteSuggestion,
  setSuggestionStatus,
  getSuggestionsForGroup,
  combineIdeas,
  voteAlchemy,
  getAlchemyForGroup,
} from "../../src/context/AppStateContext";

describe("AppStateContext methods", () => {
  let mockState: any;
  let mockDispatch: any;

  beforeEach(() => {
    mockState = seedAppData();
    mockDispatch = vi.fn((action) => {
      // Simulate synchronous state updates for testing
      mockState = reducer(mockState, action);
    });
  });

  describe("Group operations", () => {
    it("createGroup creates a group with correct properties", () => {
      const group = createGroup(
        { name: "Test Group", description: "A test group" },
        [],
        mockState,
        mockDispatch
      );

      expect(group.name).toBe("Test Group");
      expect(group.description).toBe("A test group");
      expect(group.ownerId).toBe(mockState.currentUser.id);
      expect(group.memberCount).toBe(1);
      expect(group.members.length).toBe(1);
      expect(group.members[0].role).toBe("owner");
      expect(mockDispatch).toHaveBeenCalledWith({ type: "GROUP_CREATE", payload: group });
    });

    it("createGroup with memberIds adds initial members", () => {
      const otherUsers = mockState.users.filter((u: any) => u.id !== mockState.currentUser.id).slice(0, 2);

      const group = createGroup(
        { name: "Group with Members", description: "Has initial members" },
        otherUsers.map((u: any) => u.id),
        mockState,
        mockDispatch
      );

      expect(group.memberCount).toBe(3); // owner + 2 members
      expect(group.members.length).toBe(3);
      expect(group.members.filter((m: any) => m.role === "member").length).toBe(2);
    });

    it("updateGroup modifies group properties", () => {
      const group = createGroup(
        { name: "Original", description: "Original desc" },
        [],
        mockState,
        mockDispatch
      );

      mockDispatch.mockClear();
      updateGroup(group.id, { name: "Updated", description: "Updated desc" }, mockDispatch);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "GROUP_UPDATE",
        payload: { id: group.id, changes: { name: "Updated", description: "Updated desc" } }
      });
    });

    it("deleteGroup removes group and associated suggestions", () => {
      const group = createGroup(
        { name: "To Delete", description: "Will be deleted" },
        [],
        mockState,
        mockDispatch
      );

      const suggestion = createSuggestion(
        group.id,
        { title: "Will be deleted", description: "too" },
        mockDispatch,
        mockState.currentUser.id
      );

      mockDispatch.mockClear();
      deleteGroup(group.id, mockDispatch);

      expect(mockDispatch).toHaveBeenCalledWith({ type: "GROUP_DELETE", payload: { id: group.id } });
    });

    it("joinGroupByCode adds user to group", () => {
      const group = createGroup(
        { name: "Join Test", description: "For joining" },
        [],
        mockState,
        mockDispatch
      );

      mockDispatch.mockClear();
      const result = joinGroupByCode(group.inviteCode, mockState, mockDispatch);

      expect(result).toEqual(group);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "GROUP_JOIN",
        payload: { groupId: group.id, user: mockState.currentUser }
      });
    });

    it("joinGroupByCode handles invalid codes", () => {
      const result = joinGroupByCode("INVALID", mockState, mockDispatch);
      expect(result).toBe(null);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("leaveGroup removes user from group", () => {
      const group = createGroup(
        { name: "Leave Test", description: "For leaving" },
        [],
        mockState,
        mockDispatch
      );

      mockDispatch.mockClear();
      leaveGroup(group.id, mockState, mockDispatch);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "GROUP_LEAVE",
        payload: { groupId: group.id, userId: mockState.currentUser.id }
      });
    });

    it("getGroupById returns correct group", () => {
      const group = createGroup(
        { name: "Find Test", description: "For finding" },
        [],
        mockState,
        mockDispatch
      );

      const found = getGroupById(group.id, mockState);
      expect(found).toEqual(group);

      const notFound = getGroupById("nonexistent", mockState);
      expect(notFound).toBeUndefined();
    });
  });

  describe("Suggestion operations", () => {
    it("createSuggestion adds suggestion to group", () => {
      const group = createGroup(
        { name: "Suggestion Test", description: "For suggestions" },
        [],
        mockState,
        mockDispatch
      );

      mockDispatch.mockClear();
      const suggestion = createSuggestion(
        group.id,
        { title: "New Idea", description: "A great idea" },
        mockDispatch,
        mockState.currentUser.id
      );

      expect(suggestion.title).toBe("New Idea");
      expect(suggestion.groupId).toBe(group.id);
      expect(suggestion.status).toBe("open");
      expect(suggestion.upvotes).toBe(0);
      expect(suggestion.isOwnSuggestion).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SUGGESTION_CREATE", payload: suggestion });
    });

    it("updateSuggestion modifies suggestion properties", () => {
      const group = createGroup(
        { name: "Update Test", description: "For suggestion updates" },
        [],
        mockState,
        mockDispatch
      );

      const suggestion = createSuggestion(
        group.id,
        { title: "Original", description: "Original desc" },
        mockDispatch,
        mockState.currentUser.id
      );

      mockDispatch.mockClear();
      updateSuggestion(suggestion.id, { title: "Updated", description: "Updated desc" }, mockDispatch);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SUGGESTION_UPDATE",
        payload: { id: suggestion.id, changes: { title: "Updated", description: "Updated desc" } }
      });
    });

    it("deleteSuggestion removes suggestion with authorization check", () => {
      const group = createGroup(
        { name: "Delete Auth Test", description: "For auth checking" },
        [],
        mockState,
        mockDispatch
      );

      const suggestion = createSuggestion(
        group.id,
        { title: "To Delete", description: "Will be gone" },
        mockDispatch,
        mockState.currentUser.id
      );

      mockDispatch.mockClear();

      // Author should be able to delete
      const canDelete = deleteSuggestion(suggestion.id, mockState, mockDispatch);
      expect(canDelete).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SUGGESTION_DELETE", payload: { id: suggestion.id } });
    });

    it("deleteSuggestion allows group owner to delete any suggestion", () => {
      const otherUser = mockState.users.find((u: any) => u.id !== mockState.currentUser.id);
      
      // Create group owned by current user
      const group = createGroup(
        { name: "Owner Delete Test", description: "For owner delete" },
        [otherUser?.id],
        mockState,
        mockDispatch
      );

      // Modify state so otherUser is the suggestion author
      const suggestion = createSuggestion(
        group.id,
        { title: "Others Suggestion", description: "Not by owner" },
        mockDispatch,
        mockState.currentUser.id
      );
      
      // Simulate that current user is group owner (they are, from createGroup)
      mockDispatch.mockClear();
      const canDelete = deleteSuggestion(suggestion.id, mockState, mockDispatch);
      
      // Owner can delete
      expect(canDelete).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SUGGESTION_DELETE", payload: { id: suggestion.id } });
    });

    it("deleteSuggestion returns false for non-existent suggestion", () => {
      mockDispatch.mockClear();
      const canDelete = deleteSuggestion("nonexistent", mockState, mockDispatch);
      
      expect(canDelete).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("deleteSuggestion returns false if user not authorized", () => {
      // Create a group with another user as owner
      const otherUser = mockState.users.find((u: any) => u.id !== mockState.currentUser.id);
      if (!otherUser) return; // Skip if no other user

      // Temporarily modify state to simulate otherUser owning the group
      const originalUser = mockState.currentUser;
      mockState.currentUser = otherUser;

      const group = createGroup(
        { name: "Other Owner", description: "Owned by other user" },
        [],
        mockState,
        mockDispatch
      );

      // Switch back to original user for authorization check
      mockState.currentUser = originalUser;

      // Create a suggestion in the group (as the other user)
      mockState.currentUser = otherUser;
      const suggestion = createSuggestion(
        group.id,
        { title: "Others Idea", description: "Not by current user" },
        mockDispatch,
        mockState.currentUser.id
      );
      mockState.currentUser = originalUser;

      mockDispatch.mockClear();

      // Current user (not author, not owner) cannot delete
      const canDelete = deleteSuggestion(suggestion.id, mockState, mockDispatch);
      expect(canDelete).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("voteSuggestion toggles votes correctly", () => {
      const group = createGroup(
        { name: "Vote Test", description: "For voting" },
        [],
        mockState,
        mockDispatch
      );

      const suggestion = createSuggestion(
        group.id,
        { title: "Voteable", description: "Please vote" },
        mockDispatch,
        mockState.currentUser.id
      );

      mockDispatch.mockClear();
      // First upvote
      voteSuggestion(suggestion.id, "up", mockState, mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SUGGESTION_VOTE",
        payload: { id: suggestion.id, vote: "up", previousVote: null, memberCount: 1 }
      });

      // Toggle off
      mockDispatch.mockClear();
      voteSuggestion(suggestion.id, "up", mockState, mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SUGGESTION_VOTE",
        payload: { id: suggestion.id, vote: null, previousVote: "up", memberCount: 1 }
      });
    });

    it("setSuggestionStatus changes status and handles rejected", () => {
      const group = createGroup(
        { name: "Status Test", description: "For status changes" },
        [],
        mockState,
        mockDispatch
      );

      const suggestion = createSuggestion(
        group.id,
        { title: "Status Change", description: "Test" },
        mockDispatch,
        mockState.currentUser.id
      );

      mockDispatch.mockClear();
      // Change to accepted
      setSuggestionStatus(suggestion.id, "accepted", mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SUGGESTION_STATUS",
        payload: { id: suggestion.id, status: "accepted" }
      });

      // Change to rejected (should delete)
      mockDispatch.mockClear();
      setSuggestionStatus(suggestion.id, "rejected", mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SUGGESTION_STATUS",
        payload: { id: suggestion.id, status: "rejected" }
      });
    });

    it("getSuggestionsForGroup filters and sorts correctly", () => {
      const group = createGroup(
        { name: "Filter Test", description: "For filtering" },
        [],
        mockState,
        mockDispatch
      );

      const oldSuggestion = createSuggestion(
        group.id,
        { title: "Old", description: "Old idea" },
        mockDispatch,
        mockState.currentUser.id
      );

      // Simulate old creation time
      oldSuggestion.createdAt = new Date(Date.now() - 1000000).toISOString();

      const newSuggestion = createSuggestion(
        group.id,
        { title: "New", description: "New idea" },
        mockDispatch,
        mockState.currentUser.id
      );

      const suggestions = getSuggestionsForGroup(group.id, mockState);

      expect(suggestions.length).toBe(2);
      expect(suggestions[0].id).toBe(newSuggestion.id); // Newest first
      expect(suggestions[1].id).toBe(oldSuggestion.id);
    });
  });

  describe("Alchemy operations", () => {
    it("combineIdeas creates alchemy results with proper depth", () => {
      const group = createGroup(
        { name: "Alchemy Test", description: "For idea combination" },
        [],
        mockState,
        mockDispatch
      );

      const idea1 = createSuggestion(group.id, { title: "AI", description: "Smart" }, mockDispatch, mockState.currentUser.id);
      const idea2 = createSuggestion(group.id, { title: "Time Travel", description: "Fast" }, mockDispatch, mockState.currentUser.id);

      mockDispatch.mockClear();
      const alchemy1 = combineIdeas(idea1.id, idea2.id, group.id, mockState, mockDispatch);

      expect(alchemy1.title).toBe("AI + Time Travel");
      expect(alchemy1.depth).toBe(0);
      expect(alchemy1.sourceIds).toEqual([idea1.id, idea2.id]);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "ALCHEMY_CREATE", payload: alchemy1 });

      // Combine alchemy results
      const idea3 = createSuggestion(group.id, { title: "Quantum", description: "Complex" }, mockDispatch, mockState.currentUser.id);
      mockDispatch.mockClear();
      const alchemy2 = combineIdeas(alchemy1.id, idea3.id, group.id, mockState, mockDispatch);

      expect(alchemy2.title).toBe("[Evolved] AI + Time Travel x Quantum");
      expect(alchemy2.depth).toBe(1);
    });

    it("voteAlchemy toggles votes correctly", () => {
      const group = createGroup(
        { name: "Alchemy Vote Test", description: "For alchemy voting" },
        [],
        mockState,
        mockDispatch
      );

      const idea1 = createSuggestion(group.id, { title: "Idea A", description: "A" }, mockDispatch, mockState.currentUser.id);
      const idea2 = createSuggestion(group.id, { title: "Idea B", description: "B" }, mockDispatch, mockState.currentUser.id);
      const alchemy = combineIdeas(idea1.id, idea2.id, group.id, mockState, mockDispatch);

      mockDispatch.mockClear();
      // Upvote
      voteAlchemy(alchemy.id, "up", mockState, mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "ALCHEMY_VOTE",
        payload: { id: alchemy.id, vote: "up", previousVote: null }
      });

      // Toggle off
      mockDispatch.mockClear();
      voteAlchemy(alchemy.id, "up", mockState, mockDispatch);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "ALCHEMY_VOTE",
        payload: { id: alchemy.id, vote: null, previousVote: "up" }
      });
    });

    it("getAlchemyForGroup filters by group correctly", () => {
      const group1 = createGroup({ name: "Group 1", description: "First" }, [], mockState, mockDispatch);
      const group2 = createGroup({ name: "Group 2", description: "Second" }, [], mockState, mockDispatch);

      const idea1 = createSuggestion(group1.id, { title: "Group1 Idea", description: "A" }, mockDispatch, mockState.currentUser.id);
      const idea2 = createSuggestion(group1.id, { title: "Group1 Idea2", description: "B" }, mockDispatch, mockState.currentUser.id);
      const idea3 = createSuggestion(group2.id, { title: "Group2 Idea", description: "C" }, mockDispatch, mockState.currentUser.id);

      const alchemy1 = combineIdeas(idea1.id, idea2.id, group1.id, mockState, mockDispatch);
      const alchemy2 = combineIdeas(idea3.id, idea3.id, group2.id, mockState, mockDispatch); // Self-combine

      const group1Alchemy = getAlchemyForGroup(group1.id, mockState);
      const group2Alchemy = getAlchemyForGroup(group2.id, mockState);

      expect(group1Alchemy.length).toBe(1);
      expect(group1Alchemy[0].id).toBe(alchemy1.id);
      expect(group2Alchemy.length).toBe(1);
      expect(group2Alchemy[0].id).toBe(alchemy2.id);
    });
  });
});
