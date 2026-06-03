// ============================================================
// SuggestIt - App State Context
//
// VOTING & REJECTION LOGIC:
//   A suggestion is automatically deleted when the downvote
//   count reaches a strict majority of the group's member count.
//   Threshold = Math.floor(memberCount / 2) + 1
//   e.g. 6 members → deleted when downvotes >= 4
//        5 members → deleted when downvotes >= 3
//
// BACKEND SWAP GUIDE:
//   Each function has a "// BACKEND:" comment showing the
//   Supabase equivalent. Signatures stay the same.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

import type {
  User,
  Group,
  GroupMember,
  Suggestion,
  AlchemyResult,
  VoteType,
  SuggestionStatus,
} from "../types";

import { seedAppData, generateId } from "../data/mockData";
import type { SuggestionFormData, GroupFormData } from "../utils/validation";
import {
  MUTATIONS,
  enqueueMutation,
  fetchGroups,
  fetchUsers,
  gqlFetch,
} from "../api/graphql";

// ── Helpers ────────────────────────────────────────────────

const SUGGESTION_MAX_AGE_DAYS = 30;

export function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > SUGGESTION_MAX_AGE_DAYS * 86_400_000;
}

/**
 * Returns the vote count required to decide a suggestion.
 * The assignment rule rounds down, with a minimum of one:
 * 1 member -> 1 vote, 3 members -> 1 vote, 5 members -> 2 votes.
 */
export function decisionThreshold(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount / 2));
}

export function hasMajorityRejection(downvotes: number, memberCount: number): boolean {
  if (memberCount <= 0) return false;
  return downvotes >= decisionThreshold(memberCount);
}

export function hasMajorityAcceptance(upvotes: number, memberCount: number): boolean {
  if (memberCount <= 0) return false;
  return upvotes >= decisionThreshold(memberCount);
}

export function getSuggestionsForGroupFromState(state: AppState, groupId: string) {
  return state.suggestions
    .filter((s) => s.groupId === groupId && !isExpired(s.createdAt))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ── Exported Context Methods ───────────────────────────────

export function createGroup(data: GroupFormData, memberIds: string[] | undefined, state: AppState, dispatch: (action: Action) => void): Group {
  // BACKEND: await supabase.from('groups').insert({...data, owner_id: currentUser.id})
  const id = generateId("group");
  const joinedAt = new Date().toISOString();

  const ownerMember: GroupMember = {
    userId: state.currentUser.id,
    groupId: id,
    role: "owner",
    joinedAt,
    user: state.currentUser,
  };

  const extraMembers: GroupMember[] = (memberIds ?? [])
    .filter((uid) => uid !== state.currentUser.id)
    .map((uid) => {
      const user = state.users.find((u) => u.id === uid);
      if (!user) return null;
      return {
        userId: uid,
        groupId: id,
        role: "member" as const,
        joinedAt,
        user,
      };
    })
    .filter((m): m is Exclude<typeof m, null> => m !== null);

  const members = [ownerMember, ...extraMembers];

  const group: Group = {
    id,
    ...data,
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    ownerId: state.currentUser.id,
    createdAt: joinedAt,
    memberCount: members.length,
    suggestionCount: 0,
    members,
  };
  dispatch({ type: "GROUP_CREATE", payload: group });
  return group;
}

export function updateGroup(id: string, changes: Partial<Group>, dispatch: (action: Action) => void) {
  dispatch({ type: "GROUP_UPDATE", payload: { id, changes } });
}

export function deleteGroup(id: string, dispatch: (action: Action) => void) {
  dispatch({ type: "GROUP_DELETE", payload: { id } });
}

export function joinGroupByCode(inviteCode: string, state: AppState, dispatch: (action: Action) => void): Group | null {
  const group = state.groups.find(
    (g) => g.inviteCode.toUpperCase() === inviteCode.toUpperCase()
  );
  if (!group) return null;
  dispatch({ type: "GROUP_JOIN", payload: { groupId: group.id, user: state.currentUser } });
  return group;
}

export function leaveGroup(groupId: string, state: AppState, dispatch: (action: Action) => void) {
  dispatch({ type: "GROUP_LEAVE", payload: { groupId, userId: state.currentUser.id } });
}

export function getGroupById(id: string, state: AppState): Group | undefined {
  return state.groups.find((g) => g.id === id);
}

export function createSuggestion(groupId: string, data: SuggestionFormData, dispatch: (action: Action) => void, authorId?: string): Suggestion {
  // BACKEND: await supabase.from('suggestions').insert({...data, group_id: groupId})
  const suggestion: Suggestion = {
    id: generateId("sug"),
    groupId,
    authorId: authorId || "unknown",
    ...data,
    status: "open",
    upvotes: 0,
    downvotes: 0,
    currentUserVote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isOwnSuggestion: true,
  };
  dispatch({ type: "SUGGESTION_CREATE", payload: suggestion });
  return suggestion;
}

export function updateSuggestion(id: string, changes: SuggestionFormData, dispatch: (action: Action) => void) {
  dispatch({ type: "SUGGESTION_UPDATE", payload: { id, changes } });
}

export function deleteSuggestionAction(id: string, dispatch: (action: Action) => void) {
  dispatch({ type: "SUGGESTION_DELETE", payload: { id } });
}

/**
 * Delete a suggestion with authorization check.
 * Only the suggestion author or group owner can delete it.
 */
export function deleteSuggestion(
  suggestionId: string,
  state: AppState,
  dispatch: (action: Action) => void
): boolean {
  const suggestion = state.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return false;

  const group = state.groups.find((g) => g.id === suggestion.groupId);
  if (!group) return false;

  // Check if current user is the group owner or suggestion creator
  const isGroupOwner = group.ownerId === state.currentUser.id;
  const isSuggestionAuthor = suggestion.authorId === state.currentUser.id;

  if (!isGroupOwner && !isSuggestionAuthor) {
    return false; // Not authorized
  }

  deleteSuggestionAction(suggestionId, dispatch);
  return true;
}

export function voteSuggestion(id: string, vote: VoteType | null, state: AppState, dispatch: (action: Action) => void) {
  // BACKEND: await supabase.rpc('cast_vote', { suggestion_id: id, vote_type: vote })
  const suggestion = state.suggestions.find((s) => s.id === id);
  if (!suggestion) return;

  const previousVote = suggestion.currentUserVote ?? null;
  // Toggle off: same vote cast again → remove it
  const resolvedVote = previousVote === vote ? null : vote;

  // Look up the group to get its current member count
  const group = state.groups.find((g) => g.id === suggestion.groupId);
  const memberCount = group?.memberCount ?? 1;

  dispatch({
    type: "SUGGESTION_VOTE",
    payload: { id, vote: resolvedVote, previousVote, memberCount },
  });
}

export function setSuggestionStatus(id: string, status: SuggestionStatus, dispatch: (action: Action) => void) {
  dispatch({ type: "SUGGESTION_STATUS", payload: { id, status } });
}

export function getSuggestionsForGroup(groupId: string, state: AppState): Suggestion[] {
  return getSuggestionsForGroupFromState(state, groupId);
}

export function combineIdeas(sourceId1: string, sourceId2: string, groupId: string, state: AppState, dispatch: (action: Action) => void): AlchemyResult {
  const allTitles: Record<string, string> = {};
  state.suggestions.forEach((s) => (allTitles[s.id] = s.title));
  state.alchemyResults.forEach((a) => (allTitles[a.id] = a.title));

  const parent1 = state.alchemyResults.find((a) => a.id === sourceId1);
  const depth = parent1 ? parent1.depth + 1 : 0;
  const title1 = allTitles[sourceId1] ?? "Idea A";
  const title2 = allTitles[sourceId2] ?? "Idea B";

  const result: AlchemyResult = {
    id: generateId("alch"),
    groupId,
    title: depth > 0 ? `[Evolved] ${title1} x ${title2}` : `${title1} + ${title2}`,
    description: `A synthesised concept combining "${title1}" with "${title2}". This hybrid idea merits deeper exploration by the group.`,
    sourceIds: [sourceId1, sourceId2],
    depth,
    createdAt: new Date().toISOString(),
    upvotes: 0,
    downvotes: 0,
    currentUserVote: null,
  };
  dispatch({ type: "ALCHEMY_CREATE", payload: result });
  return result;
}

export function voteAlchemy(id: string, vote: VoteType | null, state: AppState, dispatch: (action: Action) => void) {
  const result = state.alchemyResults.find((a) => a.id === id);
  const previousVote = result?.currentUserVote ?? null;
  const resolvedVote = previousVote === vote ? null : vote;
  dispatch({ type: "ALCHEMY_VOTE", payload: { id, vote: resolvedVote, previousVote } });
}

export function getAlchemyForGroup(groupId: string, state: AppState): AlchemyResult[] {
  return state.alchemyResults.filter((a) => a.groupId === groupId);
}

// ── State ──────────────────────────────────────────────────

interface AppState {
  currentUser: User;
  users: User[];
  groups: Group[];
  suggestions: Suggestion[];
  alchemyResults: AlchemyResult[];
}

// ── Actions ────────────────────────────────────────────────

type Action =
  | { type: "HYDRATE_SERVER_STATE"; payload: { users: User[]; groups: Group[] } }
  | { type: "GROUP_CREATE"; payload: Group }
  | { type: "GROUP_UPDATE"; payload: { id: string; changes: Partial<Group> } }
  | { type: "GROUP_DELETE"; payload: { id: string } }
  | { type: "GROUP_JOIN"; payload: { groupId: string; user: User } }
  | { type: "GROUP_LEAVE"; payload: { groupId: string; userId: string } }
  | { type: "SUGGESTION_CREATE"; payload: Suggestion }
  | { type: "SUGGESTION_UPDATE"; payload: { id: string; changes: Partial<Suggestion> } }
  | { type: "SUGGESTION_DELETE"; payload: { id: string } }
  | {
      type: "SUGGESTION_VOTE";
      payload: {
        id: string;
        vote: VoteType | null;
        previousVote: VoteType | null;
        memberCount: number;
      };
    }
  | { type: "SUGGESTION_STATUS"; payload: { id: string; status: SuggestionStatus } }
  | { type: "ALCHEMY_CREATE"; payload: AlchemyResult }
  | { type: "ALCHEMY_VOTE"; payload: { id: string; vote: VoteType | null; previousVote: VoteType | null } };

// ── Reducer ────────────────────────────────────────────────

function removeSuggestionFromState(state: AppState, id: string): AppState {
  return {
    ...state,
    suggestions: state.suggestions.filter((s) => s.id !== id),
    groups: state.groups.map((g) => {
      const hit = state.suggestions.find((s) => s.id === id && s.groupId === g.id);
      return hit ? { ...g, suggestionCount: Math.max(0, g.suggestionCount - 1) } : g;
    }),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE_SERVER_STATE": {
      const currentUser =
        action.payload.users.find((u) => u.id === state.currentUser.id) ??
        state.currentUser;

      return {
        ...state,
        currentUser,
        users: action.payload.users.length > 0 ? action.payload.users : state.users,
        groups: action.payload.groups,
      };
    }

    // ── Groups ──────────────────────────────────────────────

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

    // ── Suggestions ─────────────────────────────────────────

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
      return removeSuggestionFromState(state, action.payload.id);

    case "SUGGESTION_STATUS": {
      if (action.payload.status === "rejected") {
        return removeSuggestionFromState(state, action.payload.id);
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

      // Compute updated suggestion
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

      // Check if this vote decides the suggestion.
      const target = updated.find((s) => s.id === id);
      if (target && hasMajorityRejection(target.downvotes, memberCount)) {
        return removeSuggestionFromState(afterVote, id);
      }
      if (target && hasMajorityAcceptance(target.upvotes, memberCount)) {
        return {
          ...afterVote,
          suggestions: afterVote.suggestions.map((s) =>
            s.id === id ? { ...s, status: "accepted", updatedAt: new Date().toISOString() } : s
          ),
        };
      }

      return afterVote;
    }

    // ── Alchemy ─────────────────────────────────────────────

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

// ── Context shape ──────────────────────────────────────────

interface AppStateContextValue {
  state: AppState;
  createGroup: (data: GroupFormData, memberIds?: string[]) => Group;
  updateGroup: (id: string, changes: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  joinGroupByCode: (inviteCode: string) => Group | null;
  leaveGroup: (groupId: string) => void;
  getGroupById: (id: string) => Group | undefined;
  createSuggestion: (groupId: string, data: SuggestionFormData) => Suggestion;
  updateSuggestion: (id: string, changes: SuggestionFormData) => void;
  deleteSuggestion: (id: string) => boolean;
  voteSuggestion: (id: string, vote: VoteType | null) => void;
  setSuggestionStatus: (id: string, status: SuggestionStatus) => void;
  getSuggestionsForGroup: (groupId: string) => Suggestion[];
  combineIdeas: (sourceId1: string, sourceId2: string, groupId: string) => AlchemyResult;
  voteAlchemy: (id: string, vote: VoteType | null) => void;
  getAlchemyForGroup: (groupId: string) => AlchemyResult[];
}

// ── Provider ───────────────────────────────────────────────

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const seeded = seedAppData();
    return initialUser
      ? {
          ...seeded,
          currentUser: initialUser,
          users: seeded.users.some((user) => user.id === initialUser.id)
            ? seeded.users
            : [initialUser, ...seeded.users],
        }
      : seeded;
  });

  const syncServerState = useCallback(async () => {
    try {
      const [users, groups] = await Promise.all([
        fetchUsers(),
        fetchGroups(state.currentUser.id),
      ]);
      dispatch({ type: "HYDRATE_SERVER_STATE", payload: { users, groups } });
    } catch {
      // Keep seeded local state available while offline or during server restarts.
    }
  }, [state.currentUser.id]);

  useEffect(() => {
    syncServerState();
    window.addEventListener("online", syncServerState);
    
    // Poll for updates from other devices every 5 seconds
    const pollInterval = setInterval(syncServerState, 5000);
    
    return () => {
      window.removeEventListener("online", syncServerState);
      clearInterval(pollInterval);
    };
  }, [syncServerState]);

  const persistOrQueue = useCallback(
    async (query: string, variables: Record<string, unknown>): Promise<void> => {
      if (!navigator.onLine) {
        enqueueMutation(query, variables, state.currentUser.id);
        return;
      }

      try {
        const response = await gqlFetch(query, variables, state.currentUser.id);
        if (response.errors?.length) throw new Error(response.errors[0].message);
      } catch (error) {
        console.error("Mutation failed, queueing for retry:", error);
        enqueueMutation(query, variables, state.currentUser.id);
        throw error;
      }
    },
    [state.currentUser.id]
  );

  // ── Groups ───────────────────────────────────────────────

  const createGroupCallback = useCallback((data: GroupFormData, memberIds?: string[]): Group => {
    const group = createGroup(data, memberIds, state, dispatch);
    const inputMemberIds = [state.currentUser.id, ...(memberIds ?? [])].filter(
      (id, index, ids) => ids.indexOf(id) === index
    );
    persistOrQueue(MUTATIONS.CREATE_GROUP, {
      input: { ...data, memberIds: inputMemberIds },
    }).then(() => {
      syncServerState().catch(() => {
        console.warn("Failed to sync server state after creating group");
      });
    }).catch(() => {
      console.warn("Failed to persist group creation, will retry when online");
    });
    return group;
  }, [state, dispatch, persistOrQueue, syncServerState]);

  const updateGroupCallback = useCallback((id: string, changes: Partial<Group>) => {
    updateGroup(id, changes, dispatch);
    const input = {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
    };
    if (Object.keys(input).length > 0) {
      persistOrQueue(MUTATIONS.UPDATE_GROUP, { id, input }).then(syncServerState);
    }
  }, [dispatch, persistOrQueue, syncServerState]);

  const deleteGroupCallback = useCallback((id: string) => {
    deleteGroup(id, dispatch);
    persistOrQueue(MUTATIONS.DELETE_GROUP, { id }).then(syncServerState);
  }, [dispatch, persistOrQueue, syncServerState]);

  const joinGroupByCodeCallback = useCallback((inviteCode: string): Group | null => {
    const group = joinGroupByCode(inviteCode, state, dispatch);
    persistOrQueue(MUTATIONS.JOIN_GROUP, {
      inviteCode,
      userId: state.currentUser.id,
    }).then(syncServerState);
    return group;
  }, [state, dispatch, persistOrQueue, syncServerState]);

  const leaveGroupCallback = useCallback((groupId: string) => {
    leaveGroup(groupId, state, dispatch);
    persistOrQueue(MUTATIONS.LEAVE_GROUP, {
      groupId,
      userId: state.currentUser.id,
    }).then(syncServerState);
  }, [state, dispatch, persistOrQueue, syncServerState]);

  const getGroupByIdCallback = useCallback(
    (id: string) => getGroupById(id, state),
    [state]
  );

  // ── Suggestions ──────────────────────────────────────────

  const createSuggestionCallback = useCallback((groupId: string, data: SuggestionFormData): Suggestion => {
    const suggestion = createSuggestion(groupId, data, dispatch, state.currentUser.id);
    persistOrQueue(MUTATIONS.CREATE_SUGGESTION, {
      input: {
        groupId,
        authorId: state.currentUser.id,
        title: data.title,
        description: data.description,
      },
    }).then(() => {
      syncServerState().catch(() => {
        console.warn("Failed to sync server state after creating suggestion");
      });
    }).catch(() => {
      console.warn("Failed to persist suggestion creation, will retry when online");
    });
    return suggestion;
  }, [dispatch, persistOrQueue, state.currentUser.id, syncServerState]);

  const updateSuggestionCallback = useCallback((id: string, changes: SuggestionFormData) => {
    updateSuggestion(id, changes, dispatch);
    persistOrQueue(MUTATIONS.UPDATE_SUGGESTION, {
      id,
      input: changes,
      requesterId: state.currentUser.id,
    });
  }, [dispatch, persistOrQueue, state.currentUser.id]);

  const deleteSuggestionCallback = useCallback((id: string) => {
    deleteSuggestionAction(id, dispatch);
  }, [dispatch]);

  const deleteSuggestionWithAuthCallback = useCallback((suggestionId: string): boolean => {
    const deleted = deleteSuggestion(suggestionId, state, dispatch);
    if (deleted) {
      persistOrQueue(MUTATIONS.DELETE_SUGGESTION, {
        id: suggestionId,
        requesterId: state.currentUser.id,
      });
    }
    return deleted;
  }, [state, dispatch, persistOrQueue]);

  const voteSuggestionCallback = useCallback((id: string, vote: VoteType | null) => {
    voteSuggestion(id, vote, state, dispatch);
    persistOrQueue(MUTATIONS.VOTE_SUGGESTION, {
      id,
      userId: state.currentUser.id,
      vote,
    }).then(syncServerState).catch(() => {
      console.warn("Failed to persist vote, will retry when online");
    });
  }, [state, dispatch, persistOrQueue, syncServerState]);

  const setSuggestionStatusCallback = useCallback((id: string, status: SuggestionStatus) => {
    setSuggestionStatus(id, status, dispatch);
    persistOrQueue(MUTATIONS.SET_STATUS, {
      id,
      status,
      requesterId: state.currentUser.id,
    });
  }, [dispatch, persistOrQueue, state.currentUser.id]);

  const getSuggestionsForGroupCallback = useCallback(
    (groupId: string): Suggestion[] => getSuggestionsForGroup(groupId, state),
    [state]
  );

  // ── Alchemy ──────────────────────────────────────────────

  const combineIdeasCallback = useCallback((sourceId1: string, sourceId2: string, groupId: string): AlchemyResult => {
    const result = combineIdeas(sourceId1, sourceId2, groupId, state, dispatch);
    persistOrQueue(MUTATIONS.COMBINE_IDEAS, { sourceId1, sourceId2, groupId }).catch(() => {
      console.warn("Failed to persist alchemy result creation, will retry when online");
    });
    return result;
  }, [state, dispatch, persistOrQueue]);

  const voteAlchemyCallback = useCallback((id: string, vote: VoteType | null) => {
    voteAlchemy(id, vote, state, dispatch);
    persistOrQueue(MUTATIONS.VOTE_ALCHEMY, {
      id,
      userId: state.currentUser.id,
      vote,
    });
  }, [state, dispatch, persistOrQueue]);

  const getAlchemyForGroupCallback = useCallback(
    (groupId: string): AlchemyResult[] => getAlchemyForGroup(groupId, state),
    [state]
  );

  // ── Value ────────────────────────────────────────────────

  const value: AppStateContextValue = {
    state,
    createGroup: createGroupCallback,
    updateGroup: updateGroupCallback,
    deleteGroup: deleteGroupCallback,
    joinGroupByCode: joinGroupByCodeCallback,
    leaveGroup: leaveGroupCallback,
    getGroupById: getGroupByIdCallback,
    createSuggestion: createSuggestionCallback,
    updateSuggestion: updateSuggestionCallback,
    deleteSuggestion: deleteSuggestionWithAuthCallback,
    voteSuggestion: voteSuggestionCallback,
    setSuggestionStatus: setSuggestionStatusCallback,
    getSuggestionsForGroup: getSuggestionsForGroupCallback,
    combineIdeas: combineIdeasCallback,
    voteAlchemy: voteAlchemyCallback,
    getAlchemyForGroup: getAlchemyForGroupCallback,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
