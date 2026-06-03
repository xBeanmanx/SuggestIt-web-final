// ============================================================
// SuggestIt  GraphQL Schema
// Covers Bronze CRUD + pagination + stats
// Gold-ready: full GraphQL interface replaces REST
// ============================================================

export const typeDefs = /* GraphQL */ `
  #  Enums 

  enum GroupRole {
    owner
    admin
    member
  }

  enum VoteType {
    up
    down
  }

  enum SuggestionStatus {
    open
    under_review
    accepted
    rejected
  }

  enum AppRoleName {
    ADMIN
    USER
  }

  #  Core types 

  type User {
    id: ID!
    username: String!
    name: String!
    email: String!
    avatarUrl: String
    createdAt: String!
    role: AppRoleName
    permissions: [String!]!
  }

  type Role {
    id: ID!
    name: AppRoleName!
    description: String!
  }

  type Permission {
    id: ID!
    code: String!
    description: String!
  }

  type ActionLog {
    id: ID!
    userId: ID!
    groupId: ID
    role: AppRoleName!
    action: String!
    actionInformation: String!
    createdAt: String!
  }

  type ObservationEntry {
    id: ID!
    userId: ID!
    reason: String!
    severity: String!
    actionCount: Int!
    createdAt: String!
    user: User
  }

  type AuthPayload {
    accessToken: String!
    user: User!
  }

  type LoginChallenge {
    challengeId: String!
    email: String!
    expiresAt: String!
    delivery: String!
    demoCode: String
  }

  type GroupMember {
    userId: ID!
    groupId: ID!
    role: GroupRole!
    joinedAt: String!
    user: User!
  }

  type Group {
    id: ID!
    name: String!
    description: String!
    inviteCode: String!
    ownerId: ID!
    createdAt: String!
    memberCount: Int!
    suggestionCount: Int!
    members: [GroupMember!]!
  }

  type Suggestion {
    id: ID!
    groupId: ID!
    authorId: ID!
    title: String!
    description: String!
    status: SuggestionStatus!
    upvotes: Int!
    downvotes: Int!
    currentUserVote: VoteType
    createdAt: String!
    updatedAt: String!
    isOwnSuggestion: Boolean
  }

  type AlchemyResult {
    id: ID!
    groupId: ID!
    title: String!
    description: String!
    sourceIds: [ID!]!
    depth: Int!
    createdAt: String!
    upvotes: Int!
    downvotes: Int!
    currentUserVote: VoteType
  }

  #  Chat 

  type ChatMessage {
    id: ID!
    conversationId: ID!
    userId: ID!
    user: User!
    content: String!
    createdAt: String!
  }

  type ChatConversation {
    id: ID!
    name: String
    groupId: ID!
    isGroupChat: Boolean!
    members: [User!]!
    messageCount: Int!
    createdAt: String!
    updatedAt: String!
    messages: [ChatMessage!]
  }

  #  Pagination 

  type PaginatedSuggestions {
    items: [Suggestion!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPrevPage: Boolean!
  }

  #  Statistics 

  type StatusBreakdown {
    open: Int!
    under_review: Int!
    accepted: Int!
    rejected: Int!
  }

  type GroupStats {
    groupId: ID!
    totalSuggestions: Int!
    statusBreakdown: StatusBreakdown!
    totalUpvotes: Int!
    totalDownvotes: Int!
    avgUpvotesPerSuggestion: Float!
    mostActiveAuthorId: String
    alchemyCount: Int!
  }

  type GlobalStats {
    totalUsers: Int!
    totalGroups: Int!
    totalSuggestions: Int!
    totalAlchemyResults: Int!
    overallUpvotes: Int!
    overallDownvotes: Int!
  }

  type TopContributor {
    userId: ID!
    username: String!
    name: String!
    groupCount: Int!
    suggestionCount: Int!
    netScore: Int!
  }

  type StatisticsTotals {
    totalUsers: Int!
    totalGroups: Int!
    totalSuggestions: Int!
    totalAlchemyResults: Int!
    totalUpvotes: Int!
    totalDownvotes: Int!
    accepted: Int!
    pending: Int!
    rejected: Int!
  }

  type StatisticsGroupSummary {
    groupId: ID!
    name: String!
    memberCount: Int!
    totalSuggestions: Int!
    accepted: Int!
    pending: Int!
    totalUpvotes: Int!
  }

  type StatisticsContributor {
    userId: ID!
    name: String!
    suggestionCount: Int!
    acceptedCount: Int!
    totalUpvotes: Int!
    acceptanceRate: Float!
  }

  type StatisticsTopSuggestion {
    id: ID!
    title: String!
    groupId: ID!
    groupName: String!
    status: SuggestionStatus!
    upvotes: Int!
    downvotes: Int!
    score: Int!
    isOwnSuggestion: Boolean!
  }

  type StatisticsSnapshot {
    scope: String!
    totals: StatisticsTotals!
    statusBreakdown: StatusBreakdown!
    groups: [StatisticsGroupSummary!]!
    contributors: [StatisticsContributor!]!
    topSuggestions: [StatisticsTopSuggestion!]!
  }

  #  Inputs 

  input CreateGroupInput {
    name: String!
    description: String!
    memberIds: [ID!]
  }

  input UpdateGroupInput {
    name: String
    description: String
  }

  input CreateSuggestionInput {
    groupId: ID!
    authorId: ID!
    title: String!
    description: String!
  }

  input UpdateSuggestionInput {
    title: String
    description: String
  }

  input SuggestionsFilter {
    status: SuggestionStatus
    authorId: ID
  }

  input LoginInput {
    username: String!
    password: String!
  }

  input RegisterInput {
    username: String!
    email: String!
    password: String!
    name: String!
    requestedRole: AppRoleName
  }

  input CreateChatConversationInput {
    groupId: ID!
    memberIds: [ID!]!
    name: String
  }

  input SendChatMessageInput {
    conversationId: ID!
    userId: ID!
    content: String!
  }

  #  Queries 

  type Query {
    # Users
    users: [User!]!
    user(id: ID!): User
    getMe: User
    roles: [Role!]!
    permissions: [Permission!]!

    # Groups
    groups: [Group!]!
    group(id: ID!): Group
    groupByInviteCode(inviteCode: String!): Group

    # Suggestions  paginated (Gold: infinite scroll backed by this)
    suggestions(
      groupId: ID!
      page: Int
      pageSize: Int
      filter: SuggestionsFilter
    ): PaginatedSuggestions!

    suggestion(id: ID!): Suggestion

    # Chat
    conversations(groupId: ID!): [ChatConversation!]!
    conversation(id: ID!): ChatConversation
    conversationMessages(conversationId: ID!, limit: Int): [ChatMessage!]!

    # Alchemy (1-to-many: Group -> AlchemyResults)
    alchemyResults(groupId: ID!): [AlchemyResult!]!
    alchemyResult(id: ID!): AlchemyResult

    # Stats
    groupStats(groupId: ID!): GroupStats!
    globalStats: GlobalStats!
    statisticsSnapshot: StatisticsSnapshot!
    topContributors(optimized: Boolean): [TopContributor!]!

    # Gold: persisted security audit data
    actionLogs: [ActionLog!]!
    observationList: [ObservationEntry!]!
  }

  #  Mutations 

  type Mutation {
    # Auth
    login(input: LoginInput!): LoginChallenge!
    verifyLoginCode(challengeId: String!, code: String!): AuthPayload!
    register(input: RegisterInput!): AuthPayload!
    refreshToken: AuthPayload!
    logout: Boolean!
    requestMagicLink(email: String!): String!
    verifyMagicLink(token: String!): AuthPayload!
    requestPasswordReset(email: String!): String!
    resetPassword(token: String!, newPassword: String!): Boolean!
    setUserRole(userId: ID!, role: AppRoleName!): User!
    
    # Groups
    createGroup(input: CreateGroupInput!): Group!
    updateGroup(id: ID!, input: UpdateGroupInput!): Group!
    deleteGroup(id: ID!): Boolean!
    joinGroup(inviteCode: String!, userId: ID!): Group
    leaveGroup(groupId: ID!, userId: ID!): Boolean!

    # Suggestions
    createSuggestion(input: CreateSuggestionInput!): Suggestion!
    updateSuggestion(id: ID!, input: UpdateSuggestionInput!, requesterId: ID!): Suggestion!
    deleteSuggestion(id: ID!, requesterId: ID!): Boolean!
    voteSuggestion(id: ID!, userId: ID!, vote: VoteType): Suggestion

    # Chat
    createChatConversation(input: CreateChatConversationInput!): ChatConversation!
    ensureGroupChat(groupId: ID!): ChatConversation!
    sendChatMessage(input: SendChatMessageInput!): ChatMessage!
    deleteChatMessage(id: ID!, userId: ID!): Boolean!
    setSuggestionStatus(id: ID!, status: SuggestionStatus!, requesterId: ID!): Suggestion

    # Alchemy
    combineIdeas(sourceId1: ID!, sourceId2: ID!, groupId: ID!): AlchemyResult!
    voteAlchemy(id: ID!, userId: ID!, vote: VoteType): AlchemyResult
  }
`;
